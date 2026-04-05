# BuddyOS — Nutrition Agent Design Spec

**Date:** 2026-04-05
**Scope:** Nutrition Agent (log pasti, stima nutrienti, piano nutrizionale, alert carenze)
**Status:** Approved

---

## 1. Overview

Il Nutrition Agent aggiunge a BuddyOS la capacità di:
1. **Log pasti in linguaggio naturale** — "ho mangiato pollo e riso" → Claude Haiku stima i nutrienti
2. **Tracking macro + micronutrienti** — calorie, proteine, carbs, grassi + ferro, B12, D, fibre, zuccheri, sodio, colesterolo, vit.C, calcio
3. **Piano nutrizionale personalizzato** — target giornalieri, alimenti consigliati, abbinamenti, tipo dieta, allergie
4. **Alert carenze** — se sotto target giornaliero → suggerimento cosa mangiare
5. **Riepilogo settimanale** — automatico domenica + su richiesta

Il sistema esistente (orchestrator, SSE streaming, sessioni, memory agent, coaching agent) rimane invariato.

---

## 2. Nuovi Componenti

### File da creare

```
backend/agents/nutrition.py          # logica principale nutrition agent
backend/services/nutrition_estimator.py  # stima nutrienti via Claude Haiku
scripts/load_nutrition_plan.py       # CLI: Excel/CSV → Supabase nutrition_plan
tests/test_nutrition_agent.py
tests/test_nutrition_estimator.py
```

### File da modificare

- `backend/services/supabase.py` — aggiunte: `save_nutrition_log`, `get_weekly_nutrition`, `get_nutrition_plan`, `save_nutrition_plan`, `upsert_nutrition_targets`
- `backend/services/claude.py` — aggiunto system prompt `nutrition` + intent `log_nutrition` già presente nel prompt
- `backend/orchestrator.py` — routing verso `NutritionAgent` quando intent contiene `log_nutrition`
- `docs/sql/schema.sql` — aggiunte tabelle `nutrition_logs` e `nutrition_plan`

---

## 3. Database Schema

```sql
-- Log giornaliero pasti
CREATE TABLE IF NOT EXISTS nutrition_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date             DATE NOT NULL DEFAULT CURRENT_DATE,
  meal_description TEXT NOT NULL,
  nutrients        JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Piano nutrizionale personalizzato
CREATE TABLE IF NOT EXISTS nutrition_plan (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diet_type    TEXT NOT NULL DEFAULT 'omnivore',   -- 'omnivore' | 'vegetarian' | 'vegan' | 'other'
  allergies    TEXT[] NOT NULL DEFAULT '{}',        -- es. ['latticini', 'glutine']
  targets      JSONB NOT NULL DEFAULT '{}',         -- {calories: 2200, protein_g: 150, iron_mg: 18, ...}
  foods        JSONB NOT NULL DEFAULT '{}',         -- {iron: [{food: 'spinaci', qty: '200g'}, ...], ...}
  notes        TEXT,
  source       TEXT NOT NULL DEFAULT 'generated',  -- 'generated' | 'imported'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nutrition_logs_date ON nutrition_logs(date DESC);
```

### Struttura `nutrients` JSONB (in nutrition_logs)

```json
{
  "calories_kcal": 480,
  "protein_g": 42,
  "carbs_g": 55,
  "fat_g": 8,
  "fiber_g": 3,
  "sugar_g": 2,
  "sodium_mg": 320,
  "cholesterol_mg": 85,
  "iron_mg": 3.2,
  "vitamin_b12_ug": 1.1,
  "vitamin_d_ug": 0.0,
  "vitamin_c_mg": 4,
  "calcium_mg": 28
}
```

### Struttura `targets` JSONB (in nutrition_plan)

```json
{
  "calories_kcal": 2200,
  "protein_g": 150,
  "carbs_g": 220,
  "fat_g": 70,
  "fiber_g": 30,
  "sugar_g": 50,
  "sodium_mg": 2300,
  "cholesterol_mg": 300,
  "iron_mg": 18,
  "vitamin_b12_ug": 2.4,
  "vitamin_d_ug": 15,
  "vitamin_c_mg": 90,
  "calcium_mg": 1000
}
```

### Struttura `foods` JSONB (in nutrition_plan)

```json
{
  "iron": [
    {"food": "spinaci cotti", "qty": "200g"},
    {"food": "lenticchie", "qty": "150g"},
    {"food": "carne rossa", "freq": "2x/settimana"}
  ],
  "vitamin_b12": [
    {"food": "uova", "qty": "2"},
    {"food": "salmone", "qty": "100g"}
  ],
  "vitamin_d": [
    {"food": "salmone", "qty": "100g"},
    {"food": "uova", "qty": "2"}
  ]
}
```

---

## 4. Nutrition Estimator — `backend/services/nutrition_estimator.py`

```python
async def estimate_nutrients(meal_description: str, diet_type: str, allergies: list[str]) -> dict:
    """Stima i nutrienti di un pasto in linguaggio naturale via Claude Haiku.
    Restituisce un dict con tutti i campi nutrients.
    Tiene conto di diet_type e allergies per la stima.
    """
```

- Usa Claude Haiku con un prompt strutturato che chiede JSON con tutti i 13 campi nutrients
- Include `diet_type` e `allergies` nel prompt per contestualizzare la stima
- Se Claude non riesce a stimare un valore → usa `0` (non blocca il flusso)
- Risposta sempre JSON valida (usa `_strip_markdown` già esistente in claude.py)

**Prompt struttura:**
```
Stima i nutrienti del seguente pasto. Dieta: {diet_type}. Allergie: {allergies}.
Restituisci SOLO JSON valido con questi campi (usa 0 se non stimabile):
{calories_kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg,
 cholesterol_mg, iron_mg, vitamin_b12_ug, vitamin_d_ug, vitamin_c_mg, calcium_mg}

Pasto: {meal_description}
```

---

## 5. Supabase Service — funzioni aggiuntive

```python
async def save_nutrition_log(date: str, meal_description: str, nutrients: dict) -> None:
    """Salva un log pasto per la data specificata (formato ISO: '2026-04-05')."""

async def get_weekly_nutrition(week_start: str) -> list[dict]:
    """Restituisce tutti i log dalla data week_start (ISO) a +6 giorni."""

async def get_nutrition_plan() -> dict | None:
    """Restituisce il piano nutrizionale attivo (l'unico record in nutrition_plan)."""

async def save_nutrition_plan(diet_type: str, allergies: list[str], targets: dict, foods: dict, notes: str, source: str) -> None:
    """Salva (upsert) il piano nutrizionale. Sovrascrive il record esistente."""

async def upsert_nutrition_targets(targets: dict) -> None:
    """Aggiorna solo i campi targets nel piano esistente (merge, non sovrascrittura)."""
```

---

## 6. Nutrition Agent — `backend/agents/nutrition.py`

### Funzioni principali

```python
async def log_meal(text: str) -> str:
    """
    1. Carica il piano nutrizionale (diet_type, allergies, targets)
    2. Stima nutrienti via estimate_nutrients()
    3. Salva in nutrition_logs
    4. Calcola totali giornalieri di oggi
    5. Confronta con targets → identifica carenze (< 60% del target giornaliero)
    6. Restituisce stringa di contesto per Claude (risposta telegrafica)
    """

async def get_weekly_summary(week_start: str | None = None) -> str:
    """
    Calcola media settimanale nutrienti vs target.
    Restituisce stringa formattata con carenze evidenziate.
    week_start: ISO date, default lunedì della settimana corrente.
    """

async def generate_plan(objectives: str) -> str:
    """
    Usa Claude Sonnet per generare un piano nutrizionale personalizzato
    in base agli obiettivi dell'utente (testo libero).
    Salva il risultato in nutrition_plan.
    Restituisce conferma.
    """
```

### Output esempio (contesto per Claude — risposta telegrafica)

```
Log: pollo + riso
~480kcal · 42g prot · 55g carbs · 8g grassi
Ferro oggi: 3/18mg — BASSO
B12 oggi: 1.1/2.4µg — BASSO
→ aggiungi: spinaci 200g o lenticchie a cena
```

---

## 7. Orchestrator — modifiche

### Routing

```python
# In process():
if "log_nutrition" in intent_result.intent:
    from backend.agents.nutrition import log_meal
    extra_system = await log_meal(text)
```

Il tone per `log_nutrition` sarà `neutral` (risposta informativa). Il system prompt `nutrition` viene iniettato via `extra_system` come già fatto per il coaching agent.

### System prompt nutrition

```python
_SYSTEM_PROMPTS["nutrition"] = (
    "Sei BuddyAI. Rispondi in italiano stile telegrafico: niente articoli, solo dati essenziali. "
    "Usa il contesto nutrition fornito. Segnala carenze in modo diretto. "
    "Suggerisci cibo specifico se sotto target."
)
```

---

## 8. Script CLI — `scripts/load_nutrition_plan.py`

Alternativa al "genera via Claude": importa un piano da CSV/Excel.

**Formato CSV atteso:**
```
nutrient,daily_target,unit,foods,notes
calories_kcal,2200,kcal,,
protein_g,150,g,,
iron_mg,18,mg,"spinaci 200g; lenticchie 150g",priorità alta
```

**Uso:**
```bash
python scripts/load_nutrition_plan.py nutrition_plan.csv --diet vegetarian --allergies "latticini,glutine"
```

---

## 9. Riepilogo Settimanale Automatico

Il riepilogo domenicale è **fuori scope MVP** — richiede cron jobs (Blocco 3: Proactive Engine).

**MVP:** solo su richiesta. L'utente dice "com'ho mangiato questa settimana?" → intent `log_nutrition` + keyword "settimana" → `get_weekly_summary()`.

Keyword detection nel nutrition agent (non nel classifier): se il testo contiene "settimana", "riepilogo", "summary" → chiama `get_weekly_summary()` invece di `log_meal()`.

---

## 10. Testing

- **`test_nutrition_estimator.py`**: testa `estimate_nutrients` con mock Claude (verifica JSON output, gestione 0 per valori non stimabili)
- **`test_nutrition_agent.py`**: testa `log_meal` con mock supabase + estimator; testa `get_weekly_summary` con dati mock; testa `generate_plan` con mock Sonnet

---

## 11. Fuori Scope (MVP)

- Riepilogo domenicale automatico (→ Blocco 3 Proactive Engine)
- Import da foto cibo (computer vision)
- Integrazione database alimenti esterno (USDA, OpenFoodFacts)
- Tracking peso corporeo
- Calcolo TDEE automatico da attività fisica
