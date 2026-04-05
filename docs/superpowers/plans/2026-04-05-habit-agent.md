# Habit & Limit Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Habit & Limit Agent that lets users log habits and limits via natural language, tracks weekly progress, and surfaces alerts (BASSO/ATTENZIONE/SUPERATO) in ultra-compact style.

**Architecture:** Intent `habit_update` → Orchestrator calls `process_habit(text)` → loads `habit_definitions` → Claude Haiku extracts actions (log or create) → saves to `habit_logs` → computes weekly totals from `get_weekly_habit_logs` (FK join) → returns compact alert string injected as `extra_system` into Claude Sonnet. Weekly summary triggered by keywords ("settimana", "riepilogo"). New habits created via same flow.

**Tech Stack:** FastAPI, Claude Haiku (`claude-haiku-4-5-20251001`) for extraction, Supabase (asyncio.to_thread + FK embedded select), pytest-asyncio (asyncio_mode=auto), unittest.mock

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `docs/sql/schema.sql` | Modify | Add `habit_definitions` + `habit_logs` tables |
| `backend/services/supabase.py` | Modify | Add 4 new async DB functions |
| `tests/test_supabase_service.py` | Modify | Tests for 4 new functions |
| `backend/services/habit_extractor.py` | Create | Claude Haiku extracts habit+value or create action |
| `tests/test_habit_extractor.py` | Create | Mock Haiku tests |
| `backend/agents/habit.py` | Create | process_habit, get_weekly_summary |
| `tests/test_habit_agent.py` | Create | Mocked agent tests |
| `backend/services/claude.py` | Modify | Add `habit` system prompt to `_SYSTEM_PROMPTS` |
| `backend/orchestrator.py` | Modify | Add `habit_update` routing |

---

### Task 1: DB Schema — New Tables

**Files:**
- Modify: `docs/sql/schema.sql`

- [ ] **Step 1: Append new tables to schema.sql**

Add to end of `docs/sql/schema.sql`:

```sql
-- Definizioni habit e limit configurati dall'utente
CREATE TABLE IF NOT EXISTS habit_definitions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  habit_type TEXT NOT NULL DEFAULT 'habit',  -- 'habit' | 'limit'
  unit       TEXT NOT NULL DEFAULT '',
  target     FLOAT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Log giornaliero di ogni entry
CREATE TABLE IF NOT EXISTS habit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id    UUID NOT NULL REFERENCES habit_definitions(id) ON DELETE CASCADE,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  value       FLOAT NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON habit_logs(date DESC);
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_id ON habit_logs(habit_id);
```

- [ ] **Step 2: Run on Supabase**

Go to Supabase → SQL Editor → paste the new SQL block → Run.
Expected: tables `habit_definitions` and `habit_logs` appear in Table Editor.

- [ ] **Step 3: Commit**

```bash
git add docs/sql/schema.sql
git commit -m "feat: add habit_definitions and habit_logs DB tables"
```

---

### Task 2: Supabase Service — 4 New Functions

**Files:**
- Modify: `backend/services/supabase.py`
- Modify: `tests/test_supabase_service.py`

- [ ] **Step 1: Write 4 failing tests**

Add to `tests/test_supabase_service.py`:

```python
async def test_get_habit_definitions_returns_list(mock_supabase):
    mock_supabase.table.return_value.select.return_value.order.return_value.execute.return_value.data = [
        {"id": "def-uuid", "name": "lettura", "habit_type": "habit", "unit": "min", "target": 420.0}
    ]
    from backend.services.supabase import get_habit_definitions
    result = await get_habit_definitions()
    assert isinstance(result, list)
    assert result[0]["name"] == "lettura"


async def test_save_habit_definition_calls_insert(mock_supabase):
    mock_supabase.table.return_value.insert.return_value.execute.return_value.data = [
        {"id": "new-uuid", "name": "meditazione", "habit_type": "habit", "unit": "min", "target": 140.0}
    ]
    from backend.services.supabase import save_habit_definition
    result = await save_habit_definition("meditazione", "habit", "min", 140.0)
    mock_supabase.table.assert_called_with("habit_definitions")
    mock_supabase.table.return_value.insert.assert_called_once()
    assert result["id"] == "new-uuid"


async def test_save_habit_log_calls_insert(mock_supabase):
    mock_supabase.table.return_value.insert.return_value.execute = MagicMock()
    from backend.services.supabase import save_habit_log
    await save_habit_log("def-uuid", "2026-04-05", 30.0, "ho letto mezz'ora")
    mock_supabase.table.assert_called_with("habit_logs")
    mock_supabase.table.return_value.insert.assert_called_once()


async def test_get_weekly_habit_logs_returns_list(mock_supabase):
    mock_supabase.table.return_value.select.return_value.gte.return_value.lte.return_value.order.return_value.execute.return_value.data = [
        {
            "id": "log-uuid", "habit_id": "def-uuid", "date": "2026-04-05",
            "value": 30.0, "description": "ho letto",
            "habit_definitions": {"name": "lettura", "habit_type": "habit", "unit": "min", "target": 420.0}
        }
    ]
    from backend.services.supabase import get_weekly_habit_logs
    result = await get_weekly_habit_logs("2026-03-31")
    assert isinstance(result, list)
    assert result[0]["habit_definitions"]["name"] == "lettura"
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd c:/Users/Jump.Jpc/Documents/Scripts/ClaudeCode/BuddyAI && python -m pytest tests/test_supabase_service.py::test_get_habit_definitions_returns_list tests/test_supabase_service.py::test_save_habit_definition_calls_insert tests/test_supabase_service.py::test_save_habit_log_calls_insert tests/test_supabase_service.py::test_get_weekly_habit_logs_returns_list -v
```

Expected: FAIL with `ImportError: cannot import name 'get_habit_definitions'`.

- [ ] **Step 3: Implement the 4 new functions**

Add to `backend/services/supabase.py` (after the existing nutrition functions):

```python
async def get_habit_definitions() -> list[dict]:
    """Restituisce tutte le habit/limit definite dall'utente."""
    result = await asyncio.to_thread(
        lambda: supabase.table("habit_definitions")
            .select("*")
            .order("created_at")
            .execute()
    )
    return result.data


async def save_habit_definition(name: str, habit_type: str, unit: str, target: float) -> dict:
    """Crea una nuova habit/limit. Restituisce il record creato (con id)."""
    result = await asyncio.to_thread(
        lambda: supabase.table("habit_definitions")
            .insert({"name": name, "habit_type": habit_type, "unit": unit, "target": target})
            .execute()
    )
    return result.data[0]


async def save_habit_log(habit_id: str, date: str, value: float, description: str) -> None:
    """Salva un log per la data specificata."""
    await asyncio.to_thread(
        lambda: supabase.table("habit_logs").insert({
            "habit_id": habit_id,
            "date": date,
            "value": value,
            "description": description,
        }).execute()
    )


async def get_weekly_habit_logs(week_start: str) -> list[dict]:
    """Restituisce tutti i log dalla data week_start a +6 giorni,
    con join su habit_definitions (name, habit_type, unit, target)."""
    week_end = (datetime.date.fromisoformat(week_start) + datetime.timedelta(days=6)).isoformat()
    result = await asyncio.to_thread(
        lambda: supabase.table("habit_logs")
            .select("*, habit_definitions(name, habit_type, unit, target)")
            .gte("date", week_start)
            .lte("date", week_end)
            .order("date")
            .execute()
    )
    return result.data
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd c:/Users/Jump.Jpc/Documents/Scripts/ClaudeCode/BuddyAI && python -m pytest tests/test_supabase_service.py -v
```

Expected: all tests PASS (existing + 4 new).

- [ ] **Step 5: Run full suite**

```bash
cd c:/Users/Jump.Jpc/Documents/Scripts/ClaudeCode/BuddyAI && python -m pytest tests/ -v --tb=short
```

Expected: all 65 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/services/supabase.py tests/test_supabase_service.py
git commit -m "feat: add habit supabase functions — get/save habit_definitions, save_habit_log, get_weekly_habit_logs"
```

---

### Task 3: Habit Extractor Service

**Files:**
- Create: `backend/services/habit_extractor.py`
- Create: `tests/test_habit_extractor.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_habit_extractor.py`:

```python
from unittest.mock import AsyncMock, patch, MagicMock
import pytest


@pytest.fixture
def mock_anthropic_client():
    with patch("backend.services.habit_extractor.client") as mock:
        yield mock


async def test_extract_habits_returns_log_actions(mock_anthropic_client):
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text='[{"action": "log", "name": "lettura", "value": 30}]')]
    mock_anthropic_client.messages.create = AsyncMock(return_value=mock_response)
    from backend.services.habit_extractor import extract_habits
    result = await extract_habits("ho letto 30 minuti", ["lettura", "alcol"])
    assert result == [{"action": "log", "name": "lettura", "value": 30}]


async def test_extract_habits_returns_create_action(mock_anthropic_client):
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text='[{"action": "create", "name": "meditazione", "habit_type": "habit", "unit": "min", "target": 20}]')]
    mock_anthropic_client.messages.create = AsyncMock(return_value=mock_response)
    from backend.services.habit_extractor import extract_habits
    result = await extract_habits("aggiungi habit meditazione 20 minuti al giorno", [])
    assert result[0]["action"] == "create"
    assert result[0]["name"] == "meditazione"


async def test_extract_habits_uses_known_habits_in_prompt(mock_anthropic_client):
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text='[]')]
    mock_anthropic_client.messages.create = AsyncMock(return_value=mock_response)
    from backend.services.habit_extractor import extract_habits
    await extract_habits("ho bevuto acqua", ["lettura", "alcol", "acqua"])
    call_args = mock_anthropic_client.messages.create.call_args
    prompt_text = call_args.kwargs["messages"][0]["content"]
    assert "lettura" in prompt_text
    assert "acqua" in prompt_text


async def test_extract_habits_returns_empty_on_error(mock_anthropic_client):
    mock_anthropic_client.messages.create = AsyncMock(side_effect=Exception("API error"))
    from backend.services.habit_extractor import extract_habits
    result = await extract_habits("testo qualsiasi", ["lettura"])
    assert result == []


async def test_extract_habits_returns_empty_on_malformed_json(mock_anthropic_client):
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text="non sono json")]
    mock_anthropic_client.messages.create = AsyncMock(return_value=mock_response)
    from backend.services.habit_extractor import extract_habits
    result = await extract_habits("testo qualsiasi", ["lettura"])
    assert result == []
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd c:/Users/Jump.Jpc/Documents/Scripts/ClaudeCode/BuddyAI && python -m pytest tests/test_habit_extractor.py -v
```

Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement the extractor**

Create `backend/services/habit_extractor.py`:

```python
import json
from backend.services.claude import client, HAIKU_MODEL, _strip_markdown

_EXTRACTION_PROMPT = """Habit definite: {known_habits}
Analizza il testo e restituisci SOLO JSON valido — lista di azioni:
- Se l'utente logga un'attivita esistente: {{"action": "log", "name": "<habit>", "value": <numero>}}
- Se l'utente vuole creare una nuova habit/limit: {{"action": "create", "name": "<nome>", "habit_type": "habit"|"limit", "unit": "<unita>", "target": <numero>}}
In caso di errore o testo non riconoscibile: []

Testo: {text}"""


async def extract_habits(text: str, known_habits: list[str]) -> list[dict]:
    """Estrae habit e valori dal testo in linguaggio naturale via Claude Haiku.
    Restituisce lista di dict con action 'log' o 'create'.
    In caso di errore restituisce [] (non blocca il flusso).
    """
    prompt = _EXTRACTION_PROMPT.format(
        known_habits=", ".join(known_habits) if known_habits else "nessuna",
        text=text,
    )
    try:
        response = await client.messages.create(
            model=HAIKU_MODEL,
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = _strip_markdown(response.content[0].text)
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except Exception:
        return []
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd c:/Users/Jump.Jpc/Documents/Scripts/ClaudeCode/BuddyAI && python -m pytest tests/test_habit_extractor.py -v
```

Expected: 5 tests PASS.

- [ ] **Step 5: Run full suite**

```bash
cd c:/Users/Jump.Jpc/Documents/Scripts/ClaudeCode/BuddyAI && python -m pytest tests/ -v --tb=short
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/services/habit_extractor.py tests/test_habit_extractor.py
git commit -m "feat: add habit extractor — Claude Haiku extracts habit log/create actions"
```

---

### Task 4: Habit Agent

**Files:**
- Create: `backend/agents/habit.py`
- Create: `tests/test_habit_agent.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_habit_agent.py`:

```python
import datetime
from unittest.mock import AsyncMock, patch, MagicMock
import pytest

MOCK_DEFS = [
    {"id": "def-lettura", "name": "lettura", "habit_type": "habit", "unit": "min", "target": 420.0},
    {"id": "def-alcol", "name": "alcol", "habit_type": "limit", "unit": "unita", "target": 7.0},
]

MOCK_LOG_LETTURA = {
    "id": "log-1", "habit_id": "def-lettura", "date": "2026-04-05",
    "value": 150.0, "description": "ho letto",
    "habit_definitions": {"name": "lettura", "habit_type": "habit", "unit": "min", "target": 420.0},
}

MOCK_LOG_ALCOL_ATTENZIONE = {
    "id": "log-2", "habit_id": "def-alcol", "date": "2026-04-05",
    "value": 5.5, "description": "birre",
    "habit_definitions": {"name": "alcol", "habit_type": "limit", "unit": "unita", "target": 7.0},
}

MOCK_LOG_ALCOL_SUPERATO = {
    "id": "log-3", "habit_id": "def-alcol", "date": "2026-04-05",
    "value": 8.0, "description": "troppe birre",
    "habit_definitions": {"name": "alcol", "habit_type": "limit", "unit": "unita", "target": 7.0},
}


@pytest.fixture
def mock_habit_deps():
    with patch("backend.agents.habit.get_habit_definitions") as mock_defs, \
         patch("backend.agents.habit.save_habit_definition") as mock_save_def, \
         patch("backend.agents.habit.save_habit_log") as mock_save_log, \
         patch("backend.agents.habit.get_weekly_habit_logs") as mock_weekly, \
         patch("backend.agents.habit.extract_habits") as mock_extract:
        mock_defs.return_value = MOCK_DEFS
        mock_save_def.return_value = {"id": "new-uuid", "name": "meditazione", "habit_type": "habit", "unit": "min", "target": 20.0}
        mock_save_log.return_value = None
        mock_weekly.return_value = [MOCK_LOG_LETTURA]
        mock_extract.return_value = [{"action": "log", "name": "lettura", "value": 30.0}]
        yield mock_defs, mock_save_def, mock_save_log, mock_weekly, mock_extract


async def test_process_habit_logs_single(mock_habit_deps):
    from backend.agents.habit import process_habit
    result = await process_habit("ho letto 30 minuti")
    assert "lettura" in result
    assert "150" in result or "30" in result


async def test_process_habit_saves_to_db(mock_habit_deps):
    mock_defs, mock_save_def, mock_save_log, mock_weekly, mock_extract = mock_habit_deps
    from backend.agents.habit import process_habit
    await process_habit("ho letto 30 minuti")
    mock_save_log.assert_called_once()


async def test_process_habit_creates_new_habit(mock_habit_deps):
    mock_defs, mock_save_def, mock_save_log, mock_weekly, mock_extract = mock_habit_deps
    mock_extract.return_value = [{"action": "create", "name": "meditazione", "habit_type": "habit", "unit": "min", "target": 20.0}]
    from backend.agents.habit import process_habit
    result = await process_habit("aggiungi habit meditazione 20 minuti")
    mock_save_def.assert_called_once()
    assert "meditazione" in result.lower() or "creata" in result.lower()


async def test_process_habit_alert_basso(mock_habit_deps):
    mock_defs, mock_save_def, mock_save_log, mock_weekly, mock_extract = mock_habit_deps
    # lettura: 150/420 = 36% → BASSO
    mock_weekly.return_value = [MOCK_LOG_LETTURA]
    from backend.agents.habit import process_habit
    result = await process_habit("ho letto 30 min")
    assert "BASSO" in result


async def test_process_habit_alert_attenzione(mock_habit_deps):
    mock_defs, mock_save_def, mock_save_log, mock_weekly, mock_extract = mock_habit_deps
    # alcol: 5.5/7 = 79% → ATTENZIONE
    mock_extract.return_value = [{"action": "log", "name": "alcol", "value": 5.5}]
    mock_weekly.return_value = [MOCK_LOG_ALCOL_ATTENZIONE]
    from backend.agents.habit import process_habit
    result = await process_habit("ho bevuto 5 birre")
    assert "ATTENZIONE" in result


async def test_process_habit_alert_superato(mock_habit_deps):
    mock_defs, mock_save_def, mock_save_log, mock_weekly, mock_extract = mock_habit_deps
    # alcol: 8/7 = 114% → SUPERATO
    mock_extract.return_value = [{"action": "log", "name": "alcol", "value": 8.0}]
    mock_weekly.return_value = [MOCK_LOG_ALCOL_SUPERATO]
    from backend.agents.habit import process_habit
    result = await process_habit("ho bevuto 8 unita")
    assert "SUPERATO" in result


async def test_process_habit_weekly_on_keyword(mock_habit_deps):
    from backend.agents.habit import process_habit
    result = await process_habit("com'è andata questa settimana?")
    assert "settimana" in result.lower() or "lettura" in result.lower()


async def test_get_weekly_summary_empty_logs(mock_habit_deps):
    mock_defs, mock_save_def, mock_save_log, mock_weekly, mock_extract = mock_habit_deps
    mock_weekly.return_value = []
    from backend.agents.habit import get_weekly_summary
    result = await get_weekly_summary("2026-03-31")
    assert "nessun" in result.lower() or "0" in result


async def test_get_weekly_summary_returns_compact_string(mock_habit_deps):
    mock_defs, mock_save_def, mock_save_log, mock_weekly, mock_extract = mock_habit_deps
    mock_weekly.return_value = [MOCK_LOG_LETTURA]
    from backend.agents.habit import get_weekly_summary
    result = await get_weekly_summary("2026-03-31")
    assert isinstance(result, str)
    assert "lettura" in result.lower() or "settimana" in result.lower()
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd c:/Users/Jump.Jpc/Documents/Scripts/ClaudeCode/BuddyAI && python -m pytest tests/test_habit_agent.py -v
```

Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement the habit agent**

Create `backend/agents/habit.py`:

```python
import datetime
from backend.services.supabase import (
    get_habit_definitions,
    save_habit_definition,
    save_habit_log,
    get_weekly_habit_logs,
)
from backend.services.habit_extractor import extract_habits

_WEEKLY_KEYWORDS = {"settimana", "riepilogo", "summary", "settimanale", "questa settimana"}

_HABIT_THRESHOLD = 0.6   # habit < 60% → BASSO
_LIMIT_WARN = 0.7        # limit > 70% → ATTENZIONE
_LIMIT_MAX = 1.0         # limit > 100% → SUPERATO


def _is_weekly_request(text: str) -> bool:
    return any(kw in text.lower() for kw in _WEEKLY_KEYWORDS)


def _format_alert(name: str, total: float, target: float, habit_type: str, unit: str) -> str:
    """Restituisce stringa compatta con alert. Es: 'lettura 150/420min — BASSO'"""
    ratio = total / target if target else 0
    display = f"{name} {total}/{target}{unit}"
    if habit_type == "habit":
        return f"{display} — BASSO" if ratio < _HABIT_THRESHOLD else f"{display} ok"
    # limit
    if ratio > _LIMIT_MAX:
        return f"{display} — SUPERATO"
    if ratio > _LIMIT_WARN:
        return f"{display} — ATTENZIONE"
    return f"{display} ok"


async def process_habit(text: str) -> str:
    """Entry point principale. Log o creazione habit, poi progress settimanale."""
    if _is_weekly_request(text):
        return await get_weekly_summary()

    definitions = await get_habit_definitions()
    known_names = [d["name"] for d in definitions]
    defs_by_name = {d["name"]: d for d in definitions}

    actions = await extract_habits(text, known_names)
    if not actions:
        return "Nessuna habit riconosciuta."

    today = datetime.date.today().isoformat()
    confirmations: list[str] = []

    for action in actions:
        if action.get("action") == "create":
            new_def = await save_habit_definition(
                name=action["name"],
                habit_type=action.get("habit_type", "habit"),
                unit=action.get("unit", ""),
                target=float(action.get("target", 0)),
            )
            defs_by_name[action["name"]] = new_def
            confirmations.append(
                f"Habit creata: {action['name']} ({action.get('habit_type', 'habit')}, "
                f"{action.get('target', 0)}{action.get('unit', '')}/settimana)."
            )

        elif action.get("action") == "log":
            name = action.get("name", "")
            habit_def = defs_by_name.get(name)
            if habit_def:
                await save_habit_log(
                    habit_id=habit_def["id"],
                    date=today,
                    value=float(action.get("value", 0)),
                    description=text,
                )

    # Compute weekly progress
    today_date = datetime.date.today()
    week_start = (today_date - datetime.timedelta(days=today_date.weekday())).isoformat()
    logs = await get_weekly_habit_logs(week_start)

    totals: dict[str, float] = {}
    for log in logs:
        hdef = log.get("habit_definitions") or {}
        hname = hdef.get("name", "")
        if hname:
            totals[hname] = totals.get(hname, 0) + (log.get("value") or 0)

    parts: list[str] = []
    for name, total in totals.items():
        hdef = defs_by_name.get(name, {})
        if hdef:
            parts.append(_format_alert(name, total, hdef["target"], hdef["habit_type"], hdef["unit"]))

    progress = " · ".join(parts) if parts else ""
    if confirmations:
        return "\n".join(confirmations) + ("\n" + progress if progress else "")
    return progress or "Log salvato."


async def get_weekly_summary(week_start: str | None = None) -> str:
    """Calcola totali settimanali per ogni habit vs target."""
    if week_start is None:
        today = datetime.date.today()
        week_start = (today - datetime.timedelta(days=today.weekday())).isoformat()

    definitions = await get_habit_definitions()
    if not definitions:
        return "Nessuna habit configurata."

    logs = await get_weekly_habit_logs(week_start)
    if not logs:
        return "Nessun log questa settimana."

    defs_by_name = {d["name"]: d for d in definitions}
    totals: dict[str, float] = {}
    for log in logs:
        hdef = log.get("habit_definitions") or {}
        hname = hdef.get("name", "")
        if hname:
            totals[hname] = totals.get(hname, 0) + (log.get("value") or 0)

    parts: list[str] = []
    for name, hdef in defs_by_name.items():
        total = totals.get(name, 0)
        parts.append(_format_alert(name, total, hdef["target"], hdef["habit_type"], hdef["unit"]))

    return "Settimana: " + " · ".join(parts)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd c:/Users/Jump.Jpc/Documents/Scripts/ClaudeCode/BuddyAI && python -m pytest tests/test_habit_agent.py -v
```

Expected: all 9 tests PASS.

- [ ] **Step 5: Run full suite**

```bash
cd c:/Users/Jump.Jpc/Documents/Scripts/ClaudeCode/BuddyAI && python -m pytest tests/ -v --tb=short
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/agents/habit.py tests/test_habit_agent.py
git commit -m "feat: add habit agent — process_habit, get_weekly_summary, alerts BASSO/ATTENZIONE/SUPERATO"
```

---

### Task 5: Orchestrator + Claude Routing

**Files:**
- Modify: `backend/services/claude.py`
- Modify: `backend/orchestrator.py`

- [ ] **Step 1: Add `habit` system prompt to claude.py**

In `backend/services/claude.py`, add to `_SYSTEM_PROMPTS`:

```python
_SYSTEM_PROMPTS = {
    "neutral": "Sei BuddyAI, un companion personale. Rispondi in modo chiaro e utile in italiano.",
    "motivational": "Sei BuddyAI, un companion personale. Rispondi con energia e motivazione in italiano. Riconosci i progressi dell'utente.",
    "supportive": "Sei BuddyAI, un companion personale. Rispondi con empatia e supporto in italiano. Non giudicare, aiuta l'utente a trovare una soluzione.",
    "nutrition": (
        "Sei BuddyAI. Rispondi in italiano stile telegrafico: niente articoli, solo dati essenziali. "
        "Usa il contesto nutrition fornito. Segnala carenze in modo diretto. "
        "Suggerisci cibo specifico se sotto target."
    ),
    "habit": (
        "Sei BuddyAI. Rispondi in italiano ultra-compatto. "
        "Usa il contesto habit fornito. Segnala ATTENZIONE/SUPERATO/BASSO in modo diretto. "
        "Per nuove habit create, conferma con nome e target."
    ),
}
```

- [ ] **Step 2: Add habit_update routing to orchestrator.py**

In `backend/orchestrator.py`, add the habit routing block after the nutrition block (step 4b), before step 5:

```python
    # 4c. Build habit context if requested
    if "habit_update" in intent_result.intent:
        from backend.agents.habit import process_habit  # noqa: PLC0415
        extra_system = await process_habit(text)
        intent_result = IntentResult(intent=intent_result.intent, tone="habit")
```

The full updated `process()` in `backend/orchestrator.py` after the change:

```python
async def process(text: str) -> AsyncIterator[str]:
    from backend.agents.memory import process as memory_process  # noqa: PLC0415

    # 1. Classify intent
    intent_result: IntentResult = await classify_intent(text)
    model = select_model(intent_result.intent)

    # 2. Retrieve today's session
    session = await get_today_session()
    session_id = session["id"] if session else None
    history: list[dict] = session["messages"] if session else []

    # 3. Save memory in background
    _bg_task = asyncio.create_task(memory_process(text))  # noqa: F841

    # 4. Build training context if requested
    extra_system = ""
    if "training_request" in intent_result.intent:
        from backend.agents.coaching import build_training_context, select_block  # noqa: PLC0415
        block = select_block(text, datetime.date.today().month)
        extra_system = await build_training_context(block)

    # 4b. Build nutrition context if requested (and not also a training request)
    if "log_nutrition" in intent_result.intent and "training_request" not in intent_result.intent:
        from backend.agents.nutrition import log_meal  # noqa: PLC0415
        extra_system = await log_meal(text)
        intent_result = IntentResult(intent=intent_result.intent, tone="nutrition")

    # 4c. Build habit context if requested
    if "habit_update" in intent_result.intent:
        from backend.agents.habit import process_habit  # noqa: PLC0415
        extra_system = await process_habit(text)
        intent_result = IntentResult(intent=intent_result.intent, tone="habit")

    # 5. Build message history
    messages = (history + [{"role": "user", "content": text}])[-20:]

    # 6. Stream response
    full_response = ""
    async for token in stream_response(messages, model, intent_result.tone, extra_system=extra_system):
        full_response += token
        yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

    # 7. Update session
    updated_messages = (messages + [{"role": "assistant", "content": full_response}])[-20:]
    await upsert_session(session_id, updated_messages)

    yield f"data: {json.dumps({'type': 'done', 'memory_saved': True})}\n\n"
```

- [ ] **Step 3: Run full test suite**

```bash
cd c:/Users/Jump.Jpc/Documents/Scripts/ClaudeCode/BuddyAI && python -m pytest tests/ -v --tb=short
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/services/claude.py backend/orchestrator.py
git commit -m "feat: add habit_update routing to orchestrator + habit system prompt"
```

---

### Task 6: End-to-End Smoke Test + Merge

- [ ] **Step 1: Run full test suite**

```bash
cd c:/Users/Jump.Jpc/Documents/Scripts/ClaudeCode/BuddyAI && python -m pytest tests/ -v --tb=short
```

Expected: all tests PASS (65 existing + ~18 new ≈ 83 total).

- [ ] **Step 2: Merge to master**

```bash
cd c:/Users/Jump.Jpc/Documents/Scripts/ClaudeCode/BuddyAI && git checkout master && git merge feature/habit-agent && git branch -d feature/habit-agent
```
