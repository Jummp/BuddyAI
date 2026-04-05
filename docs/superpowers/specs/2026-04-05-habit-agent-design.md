# BuddyOS — Habit & Limit Agent Design Spec

**Date:** 2026-04-05
**Scope:** Habit & Limit Agent (log abitudini, limiti settimanali, progress + alert)
**Status:** Approved

---

## 1. Overview

Il Habit Agent aggiunge a BuddyOS la capacità di:

1. **Habit personalizzate** — l'utente crea le sue abitudini via chat (lettura, acqua, meditazione, ecc.)
2. **Limiti settimanali** — configurabili via chat (alcol, schermo, caffè, ecc.)
3. **Log in linguaggio naturale** — "ho letto 30 minuti e bevuto 2 birre" → Claude Haiku estrae habit + valore
4. **Progress tracking** — reset ogni lunedì, totali settimanali vs target
5. **Alert** — BASSO se habit < 60% a fine settimana, ATTENZIONE se limit > 70%, SUPERATO se limit > 100%
6. **Risposta ultra-compatta** — `Lettura 150/420min · Alcol 5/7 — ATTENZIONE · Acqua BASSO`

Il sistema esistente (orchestrator, SSE streaming, sessioni, memory agent, coaching agent, nutrition agent) rimane invariato.

---

## 2. Nuovi Componenti

### File da creare

```
backend/agents/habit.py              # logica principale habit agent
backend/services/habit_extractor.py  # estrazione habit+valore via Claude Haiku
tests/test_habit_agent.py
tests/test_habit_extractor.py
```

### File da modificare

- `backend/services/supabase.py` — aggiunte: `get_habit_definitions`, `save_habit_definition`, `save_habit_log`, `get_weekly_habit_logs`
- `backend/services/claude.py` — system prompt `habit`
- `backend/orchestrator.py` — routing `habit_update` → `HabitAgent`
- `docs/sql/schema.sql` — aggiunte tabelle `habit_definitions` e `habit_logs`

---

## 3. Database Schema

```sql
-- Definizioni habit e limit configurati dall'utente
CREATE TABLE IF NOT EXISTS habit_definitions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,           -- es. 'lettura', 'alcol', 'acqua'
  habit_type TEXT NOT NULL DEFAULT 'habit',  -- 'habit' | 'limit'
  unit       TEXT NOT NULL DEFAULT '',       -- es. 'min', 'unità', 'ml'
  target     FLOAT NOT NULL DEFAULT 0,       -- habit: min da raggiungere; limit: max da non superare
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Log giornaliero di ogni entry
CREATE TABLE IF NOT EXISTS habit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id    UUID NOT NULL REFERENCES habit_definitions(id) ON DELETE CASCADE,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  value       FLOAT NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',      -- testo originale del log
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON habit_logs(date DESC);
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_id ON habit_logs(habit_id);
```

### Esempi `habit_definitions`

| name | habit_type | unit | target |
|---|---|---|---|
| lettura | habit | min | 420 |
| alcol | limit | unità | 7 |
| acqua | habit | ml | 14000 |
| meditazione | habit | min | 140 |

---

## 4. Habit Extractor — `backend/services/habit_extractor.py`

```python
async def extract_habits(text: str, known_habits: list[str]) -> list[dict]:
    """Estrae habit e valori dal testo in linguaggio naturale via Claude Haiku.
    Restituisce lista di dict: [{"action": "log"|"create", "name": str, "value": float, ...}]
    In caso di errore restituisce [].
    """
```

Il prompt include la lista delle habit già definite (`known_habits`) per permettere al modello di riconoscere nomi esistenti e distinguere tra log e creazione.

**Output JSON atteso:**

```json
[
  {"action": "log", "name": "lettura", "value": 30},
  {"action": "log", "name": "alcol", "value": 2}
]
```

**Per creazione nuova habit:**

```json
[
  {"action": "create", "name": "meditazione", "habit_type": "habit", "unit": "min", "target": 20}
]
```

**Prompt struttura:**

```
Habit definite: {known_habits}
Analizza il testo e restituisci SOLO JSON valido — lista di azioni:
- Se l'utente logga un'attività esistente: {"action": "log", "name": "<habit>", "value": <numero>}
- Se l'utente vuole creare una nuova habit/limit: {"action": "create", "name": ..., "habit_type": "habit"|"limit", "unit": ..., "target": <numero>}
In caso di errore o testo non riconoscibile: []

Testo: {text}
```

---

## 5. Supabase Service — funzioni aggiuntive

```python
async def get_habit_definitions() -> list[dict]:
    """Restituisce tutte le habit/limit definite dall'utente."""

async def save_habit_definition(name: str, habit_type: str, unit: str, target: float) -> dict:
    """Crea una nuova habit/limit. Restituisce il record creato (con id)."""

async def save_habit_log(habit_id: str, date: str, value: float, description: str) -> None:
    """Salva un log per la data specificata."""

async def get_weekly_habit_logs(week_start: str) -> list[dict]:
    """Restituisce tutti i log dalla data week_start (ISO) a +6 giorni,
    con join su habit_definitions per includere name, habit_type, unit, target."""
```

---

## 6. Habit Agent — `backend/agents/habit.py`

### Funzioni principali

```python
async def process_habit(text: str) -> str:
    """
    Entry point principale.
    1. Carica habit_definitions
    2. Estrae azioni dal testo via extract_habits()
    3. Per ogni azione:
       - 'create' → save_habit_definition() + conferma
       - 'log' → save_habit_log() → calcola progress settimanale
    4. Se keyword settimana → chiama get_weekly_summary()
    5. Restituisce stringa compatta per Claude
    """

async def get_weekly_summary(week_start: str | None = None) -> str:
    """
    Calcola totali settimanali per ogni habit vs target.
    week_start: ISO date, default lunedì corrente.
    Restituisce stringa compatta con alert.
    """
```

### Alert thresholds

| Condizione | Label |
|---|---|
| habit: totale_settimana < 60% × target | BASSO |
| limit: totale_settimana > 70% × target | ATTENZIONE |
| limit: totale_settimana > 100% × target | SUPERATO |

### Output formato

```
Lettura 150/420min · Alcol 5/7 — ATTENZIONE · Acqua BASSO
```

Per creazione nuova habit:
```
Habit creata: meditazione (habit, 20min/giorno).
```

Per riepilogo settimanale:
```
Settimana: Lettura 300/420min · Alcol 7/7 — SUPERATO · Acqua ok
```

---

## 7. Orchestrator — modifiche

```python
# In process():
if "habit_update" in intent_result.intent:
    from backend.agents.habit import process_habit  # noqa: PLC0415
    extra_system = await process_habit(text)
    intent_result = IntentResult(intent=intent_result.intent, tone="habit")
```

### System prompt habit

```python
_SYSTEM_PROMPTS["habit"] = (
    "Sei BuddyAI. Rispondi in italiano ultra-compatto. "
    "Usa il contesto habit fornito. Segnala ATTENZIONE/SUPERATO/BASSO in modo diretto. "
    "Per nuove habit create, conferma con nome e target."
)
```

---

## 8. Keyword detection riepilogo settimanale

Come nel Nutrition Agent, la detection avviene dentro `process_habit()`:

```python
_WEEKLY_KEYWORDS = {"settimana", "riepilogo", "summary", "settimanale", "questa settimana"}
```

Se il testo contiene una di queste keyword → `get_weekly_summary()` invece di log.

---

## 9. Testing

- **`test_habit_extractor.py`**: mock Claude Haiku — verifica estrazione log, estrazione creazione, lista vuota su errore
- **`test_habit_agent.py`**: mock supabase + extractor — verifica log singolo, log multiplo, creazione habit, alert ATTENZIONE/BASSO/SUPERATO, weekly summary su keyword, weekly summary vuoto

---

## 10. Fuori Scope (MVP)

- Notifiche push / proactive alerts (→ Blocco 3 Proactive Engine)
- Storico multi-settimana / grafici
- Habit con frequenza personalizzata (es. "3x a settimana")
- Habit collegate al Training Agent (es. auto-log allenamento)
- Eliminazione/modifica habit via chat
