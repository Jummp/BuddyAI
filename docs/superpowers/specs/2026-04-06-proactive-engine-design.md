# BuddyOS — Proactive Engine Design Spec

**Date:** 2026-04-06
**Scope:** Proactive Engine (check-in mattutino, reminder allenamento adattivo, reminder habit) + delivery via Expo Push Notifications
**Status:** Approved

---

## 1. Overview

Il Proactive Engine aggiunge a BuddyOS la capacità di **iniziare la conversazione** senza che l'utente scriva per primo.

Tre tipi di trigger:

1. **Check-in mattutino** — BuddyAI manda una notifica push a orario fisso; l'utente apre la chat e trova un prompt di check-in; la risposta viene salvata dal Memory Agent
2. **Reminder allenamento adattivo** — notifica al mattino; se il training non risulta completato entro N ore → ri-notifica automatica
3. **Reminder habit** — ogni habit può avere un orario di reminder configurato dall'utente

Il sistema esistente (orchestrator, SSE streaming, sessioni, Memory Agent, Coaching Agent, Nutrition Agent, Habit Agent) rimane invariato.

---

## 2. Architettura

```
FastAPI (lifespan) → APScheduler
                        ├── job: morning_checkin    (daily, ora configurabile)
                        ├── job: training_reminder  (daily, ora configurabile + adaptive re-check)
                        └── job: habit_reminders    (per-habit, ora configurabile)

Jobs → backend/services/push.py → Expo Push API → telefono utente
```

Quando l'utente tocca la notifica → apre la chat nell'app Expo → il contesto del check-in è nel system prompt.

---

## 3. Nuovi Componenti

### File da creare

```
backend/services/push.py           # invio push via Expo Push API
backend/services/scheduler.py      # APScheduler setup + registrazione job
backend/jobs/morning_checkin.py    # job check-in mattutino
backend/jobs/training_reminder.py  # job reminder allenamento + adaptive
backend/jobs/habit_reminder.py     # job reminder habit
backend/api/push.py                # endpoint registrazione token + training complete
tests/test_push_service.py
tests/test_jobs.py
```

### File da modificare

- `backend/services/supabase.py` — aggiunte: `save_push_token`, `get_push_token`, `log_training_complete`, `get_training_log_today`
- `backend/main.py` — avvio scheduler nel lifespan FastAPI
- `backend/api/router.py` — include push router
- `docs/sql/schema.sql` — aggiunte tabelle `push_tokens`, `training_logs`; colonna `reminder_time` su `habit_definitions`

---

## 4. Database Schema

```sql
-- Token Expo Push per invio notifiche
CREATE TABLE IF NOT EXISTS push_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Log completamento allenamento giornaliero (per adaptive reminder)
CREATE TABLE IF NOT EXISTS training_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date       DATE NOT NULL UNIQUE DEFAULT CURRENT_DATE,
  completed  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_logs_date ON training_logs(date DESC);
```

### Modifica `habit_definitions`

```sql
ALTER TABLE habit_definitions
  ADD COLUMN IF NOT EXISTS reminder_time TIME DEFAULT NULL;
-- NULL = nessun reminder impostato
-- es. '08:30' = reminder alle 08:30
```

---

## 5. Push Service — `backend/services/push.py`

```python
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

async def send_push(title: str, body: str, data: dict | None = None) -> None:
    """Invia una notifica push via Expo Push API.
    Recupera il token dal DB. Se nessun token → no-op silenzioso.
    """
```

Payload Expo:
```json
{
  "to": "<ExponentPushToken[...]>",
  "title": "BuddyAI",
  "body": "<messaggio>",
  "data": {"type": "checkin|training|habit", "habit_name": "..."}
}
```

`data` viene passato all'app per sapere quale schermata aprire al tap.

---

## 6. Supabase — funzioni aggiuntive

```python
async def save_push_token(token: str) -> None:
    """Salva o aggiorna il token Expo push."""

async def get_push_token() -> str | None:
    """Restituisce il token più recente, o None se non registrato."""

async def log_training_complete(date: str) -> None:
    """Segna l'allenamento come completato per la data."""

async def get_training_log_today() -> bool:
    """Restituisce True se l'allenamento è stato completato oggi."""
```

---

## 7. Job: Check-in Mattutino — `backend/jobs/morning_checkin.py`

```python
CHECKIN_MESSAGES = [
    "Buongiorno! Come ti senti oggi?",
    "Buongiorno! Cosa hai in testa stamattina?",
    "Buongiorno! Hai dormito bene? Cosa ti aspetti da oggi?",
]

async def run() -> None:
    """Invia notifica push check-in mattutino.
    Sceglie un messaggio casuale dalla lista.
    """
```

- Notifica push con `data={"type": "checkin"}`
- L'app apre la chat con il messaggio di check-in pre-caricato
- La risposta dell'utente passa per l'orchestrator normale → Memory Agent salva

**Orario default:** 08:00 (configurabile in `.env` → `CHECKIN_TIME=08:00`)

---

## 8. Job: Reminder Allenamento — `backend/jobs/training_reminder.py`

```python
async def run() -> None:
    """
    1. Controlla se oggi è giorno di allenamento (training_exercises ha dati)
    2. Se sì → invia notifica push reminder
    3. Schedula re-check dopo TRAINING_REMINDER_HOURS ore
    """

async def adaptive_recheck() -> None:
    """
    Eseguito N ore dopo il primo reminder.
    Se get_training_log_today() == False → invia secondo reminder.
    """
```

- **Primo reminder:** mattino (`TRAINING_REMINDER_TIME=09:00`)
- **Re-check:** dopo `TRAINING_REMINDER_HOURS=4` ore
- **Secondo reminder body:** "Non hai ancora fatto l'allenamento. Dai, ce la fai!"
- Se completato → nessun secondo reminder

**Nota:** "oggi è giorno di allenamento" = sempre (il piano è A/B/C rotation giornaliero). Fuori scope MVP: skip days.

---

## 9. Job: Reminder Habit — `backend/jobs/habit_reminder.py`

```python
async def run() -> None:
    """
    Legge tutte le habit_definitions con reminder_time = ora corrente (±1 min).
    Per ognuna → invia push personalizzata.
    """
```

- Eseguito ogni minuto da APScheduler
- Confronta `reminder_time` di ogni habit con l'ora corrente
- Body: "Ricordati: {habit.name}!" con `data={"type": "habit", "habit_name": habit.name}`

---

## 10. Scheduler — `backend/services/scheduler.py`

```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler

scheduler = AsyncIOScheduler()

def setup_scheduler() -> AsyncIOScheduler:
    """Registra tutti i job e restituisce lo scheduler."""
    scheduler.add_job(morning_checkin.run, "cron", hour=8, minute=0, id="morning_checkin")
    scheduler.add_job(training_reminder.run, "cron", hour=9, minute=0, id="training_reminder")
    scheduler.add_job(habit_reminder.run, "cron", minute="*", id="habit_reminder")
    return scheduler
```

Orari overridabili da `.env`:
```
CHECKIN_TIME=08:00
TRAINING_REMINDER_TIME=09:00
TRAINING_REMINDER_HOURS=4
```

---

## 11. API Endpoints — `backend/api/push.py`

```
POST /push/token        body: {"token": "ExponentPushToken[...]"}
                        → salva token in DB

POST /training/complete body: {}
                        → log_training_complete(today)
                        → risposta: {"date": "2026-04-06", "completed": true}

GET  /training/today    → {"completed": true|false}
```

`POST /training/complete` viene chiamato dall'app quando l'utente tocca "Allenamento completato" nella schermata Training.

---

## 12. Integrazione FastAPI — `backend/main.py`

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = setup_scheduler()
    scheduler.start()
    yield
    scheduler.shutdown()
```

---

## 13. Testing

- **`test_push_service.py`**: mock httpx — verifica payload Expo, no-op se token assente
- **`test_jobs.py`**: mock supabase + push service:
  - `test_morning_checkin_sends_push`
  - `test_training_reminder_sends_push`
  - `test_adaptive_recheck_sends_if_not_completed`
  - `test_adaptive_recheck_skips_if_completed`
  - `test_habit_reminder_sends_for_matching_time`
  - `test_habit_reminder_skips_no_reminder`

---

## 14. Dipendenze da aggiungere

```
apscheduler>=3.10
httpx>=0.27          # già presente? verificare requirements.txt
```

---

## 15. Fuori Scope (MVP)

- Timezone utente (tutto in UTC+offset fisso)
- Notifiche multiple utenti
- Pausa notifiche (es. weekend, vacanze)
- Adaptive reminder per habit (solo training per ora)
- Rich notifications (immagini, action buttons)
- Storico notifiche inviate
