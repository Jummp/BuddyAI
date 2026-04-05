# BuddyOS — Coaching Agent Design Spec

**Date:** 2026-04-05  
**Scope:** Coaching Agent (training plan + video + behavioral coaching)  
**Status:** Approved

---

## 1. Overview

Il Coaching Agent estende il Core Engine con tre capacità nuove:
1. **Training plan strutturato** — legge Jump.xlsx, lo carica su Supabase, lo usa durante le sessioni
2. **Video per esercizi** — cerca su YouTube Data API, mette in cache i link trovati
3. **Coaching comportamentale** — guida l'utente sul blocco giusto in base al mese/progressione

Il sistema esistente (orchestrator, SSE streaming, sessioni, memory agent) rimane invariato.

---

## 2. Nuovi Componenti

### File da creare

```
backend/agents/coaching.py       # logica principale coaching
backend/services/youtube.py      # YouTube Data API v3
scripts/load_training.py         # CLI: Excel → Supabase (eseguire una volta)
tests/test_coaching_agent.py
tests/test_youtube_service.py
```

### Modifica file esistenti

- `backend/services/supabase.py` — aggiunte: `get_block_exercises`, `get_video_link`, `save_video_link`
- `backend/services/claude.py` — aggiunto intent `training_request` nel prompt
- `backend/orchestrator.py` — routing verso `CoachingAgent` quando intent è `training_request`
- `backend/config.py` — aggiunto campo `youtube_api_key`
- `requirements.txt` — aggiunto `openpyxl`, `google-api-python-client`
- `docs/sql/schema.sql` — aggiunte tabelle `training_exercises` e `training_links`

---

## 3. Database Schema

```sql
-- Esercizi dal piano di allenamento (popolato da load_training.py)
CREATE TABLE IF NOT EXISTS training_exercises (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block         CHAR(1) NOT NULL,         -- 'A', 'B', 'C'
  drill_id      TEXT,                      -- es. '1.a', '2', '3'
  exercise_name TEXT NOT NULL,
  sets          TEXT,                      -- es. '4', '3'
  reps          TEXT,                      -- es. '8', '8&8', '30"'
  rest          TEXT,                      -- es. '60"', '30"', '/'
  month_focus   TEXT,                      -- es. 'Month 1', 'Month 2'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Link video per esercizio (cache YouTube + link manuali)
CREATE TABLE IF NOT EXISTS training_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_name TEXT NOT NULL UNIQUE,
  url           TEXT NOT NULL,
  title         TEXT,
  source        TEXT NOT NULL DEFAULT 'youtube',  -- 'youtube' | 'manual'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_exercises_block ON training_exercises(block);
CREATE INDEX IF NOT EXISTS idx_training_links_exercise ON training_links(exercise_name);
```

---

## 4. Script CLI — `scripts/load_training.py`

Eseguito **una volta sola** (o quando aggiorni il piano). Legge Jump.xlsx e popola `training_exercises`.

**Uso:**
```bash
python scripts/load_training.py Jump.xlsx
```

**Logica:**
1. Legge il foglio "Weekly Structure" con openpyxl
2. Identifica i 3 blocchi (A, B, C) tramite header row
3. Per ogni esercizio estrae: `block`, `drill_id`, `exercise_name`, `sets`, `reps`, `rest`
4. Determina `month_focus` dalla colonna Progressions (Month 1→6)
5. Fa upsert su `training_exercises` (non duplica se eseguito più volte)

---

## 5. YouTube Service — `backend/services/youtube.py`

```python
async def search_video(exercise_name: str) -> dict | None:
    """Cerca il miglior video tutorial per l'esercizio su YouTube.
    Restituisce {'url': ..., 'title': ...} oppure None se nessun risultato.
    Query usata: '{exercise_name} tutorial form'
    """
```

- Usa `googleapiclient.discovery` per chiamare `youtube.search().list()`
- Parametri: `q=f"{exercise_name} tutorial form"`, `type=video`, `maxResults=1`, `videoDuration=medium`
- Costruisce URL: `https://www.youtube.com/watch?v={video_id}`
- In caso di quota esaurita o errore → restituisce `None` (non blocca il flusso)

---

## 6. Supabase Service — funzioni aggiuntive

```python
async def get_block_exercises(block: str) -> list[dict]:
    """Restituisce tutti gli esercizi del blocco (A, B, o C) ordinati per drill_id."""

async def get_video_link(exercise_name: str) -> dict | None:
    """Cerca in training_links un link per l'esercizio. Case-insensitive."""

async def save_video_link(exercise_name: str, url: str, title: str, source: str) -> None:
    """Salva un link video. Usa upsert per non duplicare."""
```

---

## 7. Coaching Agent — `backend/agents/coaching.py`

### Funzioni principali

```python
def select_block(user_input: str, current_month: int) -> str:
    """Determina il blocco da fare.
    - Se l'utente specifica ('blocco A', 'block B') → usa quello
    - Altrimenti → ruota A→B→C in base al giorno della settimana
      (Lun/Gio=A, Mar/Ven=B, Mer/Sab=C, Dom=riposo/C)
    Restituisce: 'A', 'B', 'C', o 'rest'
    """

async def build_training_context(block: str) -> str:
    """Costruisce il contesto da passare a Claude Sonnet.
    1. Recupera esercizi del blocco da Supabase
    2. Per ogni esercizio cerca video (DB → YouTube API → None)
    3. Formatta come testo strutturato con link
    Restituisce stringa da iniettare nel prompt di Claude.
    """
```

### Output esempio (contesto per Claude)

```
BLOCCO A — Posterior Chain & Core

1.a Romanian Deadlift KB — 4 serie × 8 reps — rest /
    📹 https://youtube.com/watch?v=xxx (KB RDL Tutorial)
1.b TRX Row — 4 serie × 10 reps — rest 60"
    📹 https://youtube.com/watch?v=yyy (TRX Row Form)
2. Side Plank — 3 serie × 30"+30" — rest 30"
    📹 nessun video disponibile
...

Mese corrente: Month 2 — Base strength
Focus: aumentare leggermente il carico, aggiungi una serie extra agli esercizi principali.
```

---

## 8. Orchestrator — modifiche

### Nuovo intent

Aggiunto al prompt di `classify_intent`:
```
- training_request: l'utente vuole allenarsi, chiede cosa fare oggi,
  menziona un blocco specifico, o chiede del suo piano di allenamento
```

### Routing

```python
# In process():
if "training_request" in intent_result.intent:
    training_context = await build_training_context(
        select_block(text, current_month())
    )
    # Inietta training_context nel system prompt di Claude
```

---

## 9. Config — modifiche

Aggiunto a `Settings`:
```python
youtube_api_key: str
```

Aggiunto a `.env.example`:
```
YOUTUBE_API_KEY=your_youtube_data_api_v3_key
```

---

## 10. Testing

- **`test_coaching_agent.py`**: testa `select_block` (funzione pura) con vari input e giorni
- **`test_youtube_service.py`**: testa `search_video` con mock googleapiclient
- **`test_coaching_agent.py`**: testa `build_training_context` con mock Supabase + YouTube

---

## 11. Fuori Scope (MVP)

- Tracking completamento sessione (esercizi fatti ✅/❌)
- Progressione automatica (passaggio Month 1 → Month 2)
- Notifiche push "oggi tocca il blocco A"
- Upload Excel via endpoint HTTP (solo CLI per ora)
- Video manuali via chat ("salva questo link per squat")
