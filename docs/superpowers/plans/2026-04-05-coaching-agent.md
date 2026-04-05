# Coaching Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Coaching Agent that reads Jump.xlsx exercises from Supabase and responds to `training_request` intents with the user's training block + YouTube video links.

**Architecture:** New intent `training_request` → Orchestrator calls `CoachingAgent.build_training_context(block)` → fetches exercises from Supabase, resolves video links (DB cache → YouTube API) → injects context into Claude Sonnet system prompt → SSE stream. All existing components (memory agent, sessions, voice) unchanged.

**Tech Stack:** FastAPI, Claude Sonnet (`claude-sonnet-4-6`), Supabase (supabase-py async via asyncio.to_thread), google-api-python-client (YouTube Data API v3 sync), openpyxl, pytest-asyncio, unittest.mock

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `backend/config.py` | Modify | Add `youtube_api_key: str` field |
| `requirements.txt` | Modify | Add `openpyxl`, `google-api-python-client` |
| `tests/conftest.py` | Modify | Add dummy `YOUTUBE_API_KEY` env var |
| `docs/sql/schema.sql` | Modify | Add `training_exercises` + `training_links` tables |
| `backend/services/supabase.py` | Modify | Add `get_block_exercises`, `get_video_link`, `save_video_link` |
| `tests/test_supabase_service.py` | Modify | Add tests for the 3 new functions |
| `backend/services/youtube.py` | Create | `search_video(exercise_name)` via YouTube Data API v3 |
| `tests/test_youtube_service.py` | Create | Mock googleapiclient tests |
| `backend/agents/coaching.py` | Create | `select_block`, `build_training_context` |
| `tests/test_coaching_agent.py` | Create | Pure + mocked tests for coaching agent |
| `backend/services/claude.py` | Modify | Add `training_request` intent + `extra_system` param to `stream_response` |
| `backend/orchestrator.py` | Modify | Add routing for `training_request` intent |
| `scripts/load_training.py` | Create | CLI: parse Jump.xlsx → upsert Supabase |

---

### Task 1: Config + Requirements + Conftest

**Files:**
- Modify: `backend/config.py`
- Modify: `requirements.txt`
- Modify: `tests/conftest.py`

- [ ] **Step 1: Add youtube_api_key to config**

Edit `backend/config.py`:
```python
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    anthropic_api_key: str
    openai_api_key: str
    supabase_url: str
    supabase_key: str
    youtube_api_key: str


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 2: Add new dependencies to requirements.txt**

Edit `requirements.txt` — add two lines at the end:
```
openpyxl>=3.1
google-api-python-client>=2.100
```

- [ ] **Step 3: Add dummy YOUTUBE_API_KEY to conftest**

Edit `tests/conftest.py` — add one line at the end:
```python
os.environ.setdefault("YOUTUBE_API_KEY", "test-youtube-key")
```

- [ ] **Step 4: Install new dependencies**

```bash
pip install openpyxl google-api-python-client
```

Expected: installs without error.

- [ ] **Step 5: Verify existing tests still pass**

```bash
pytest tests/ -v --tb=short
```

Expected: all 25 tests PASS (config picks up dummy env vars).

- [ ] **Step 6: Commit**

```bash
git add backend/config.py requirements.txt tests/conftest.py
git commit -m "feat: add youtube_api_key config + openpyxl/google-api-python-client deps"
```

---

### Task 2: DB Schema — New Tables

**Files:**
- Modify: `docs/sql/schema.sql`

- [ ] **Step 1: Add training tables to schema.sql**

Append to `docs/sql/schema.sql`:
```sql
-- Esercizi dal piano di allenamento (popolato da load_training.py)
CREATE TABLE IF NOT EXISTS training_exercises (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block         CHAR(1) NOT NULL,
  drill_id      TEXT,
  exercise_name TEXT NOT NULL,
  sets          TEXT,
  reps          TEXT,
  rest          TEXT,
  month_focus   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(block, exercise_name)
);

-- Link video per esercizio (cache YouTube + link manuali)
CREATE TABLE IF NOT EXISTS training_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_name TEXT NOT NULL UNIQUE,
  url           TEXT NOT NULL,
  title         TEXT,
  source        TEXT NOT NULL DEFAULT 'youtube',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_exercises_block ON training_exercises(block);
CREATE INDEX IF NOT EXISTS idx_training_links_exercise ON training_links(exercise_name);
```

- [ ] **Step 2: Run on Supabase**

Go to https://app.supabase.com → SQL Editor → paste the new SQL block → Run.

Expected: tables `training_exercises` and `training_links` appear in Table Editor.

- [ ] **Step 3: Commit**

```bash
git add docs/sql/schema.sql
git commit -m "feat: add training_exercises and training_links DB tables"
```

---

### Task 3: Supabase Service — 3 New Functions

**Files:**
- Modify: `backend/services/supabase.py`
- Modify: `tests/test_supabase_service.py`

- [ ] **Step 1: Write the 3 failing tests**

Add to `tests/test_supabase_service.py`:
```python
async def test_get_block_exercises_returns_list(mock_supabase):
    mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = [
        {"id": "uuid-1", "block": "A", "drill_id": "1.a", "exercise_name": "Romanian Deadlift KB", "sets": "4", "reps": "8", "rest": "/", "month_focus": None}
    ]
    from backend.services.supabase import get_block_exercises
    result = await get_block_exercises("A")
    assert isinstance(result, list)
    assert result[0]["exercise_name"] == "Romanian Deadlift KB"
    mock_supabase.table.assert_called_with("training_exercises")


async def test_get_video_link_returns_none_when_missing(mock_supabase):
    mock_supabase.table.return_value.select.return_value.ilike.return_value.limit.return_value.execute.return_value.data = []
    from backend.services.supabase import get_video_link
    result = await get_video_link("Romanian Deadlift KB")
    assert result is None


async def test_get_video_link_returns_dict_when_found(mock_supabase):
    mock_supabase.table.return_value.select.return_value.ilike.return_value.limit.return_value.execute.return_value.data = [
        {"exercise_name": "Romanian Deadlift KB", "url": "https://youtube.com/watch?v=abc", "title": "KB RDL Tutorial"}
    ]
    from backend.services.supabase import get_video_link
    result = await get_video_link("Romanian Deadlift KB")
    assert result == {"url": "https://youtube.com/watch?v=abc", "title": "KB RDL Tutorial"}


async def test_save_video_link_calls_upsert(mock_supabase):
    mock_supabase.table.return_value.upsert.return_value.execute = MagicMock()
    from backend.services.supabase import save_video_link
    await save_video_link("Romanian Deadlift KB", "https://youtube.com/watch?v=abc", "KB RDL Tutorial", "youtube")
    mock_supabase.table.assert_called_with("training_links")
    mock_supabase.table.return_value.upsert.assert_called_once()
```

- [ ] **Step 2: Run to verify tests fail**

```bash
pytest tests/test_supabase_service.py::test_get_block_exercises_returns_list tests/test_supabase_service.py::test_get_video_link_returns_none_when_missing tests/test_supabase_service.py::test_get_video_link_returns_dict_when_found tests/test_supabase_service.py::test_save_video_link_calls_upsert -v
```

Expected: FAIL with `ImportError: cannot import name 'get_block_exercises'`.

- [ ] **Step 3: Implement the 3 new functions in supabase.py**

Add to `backend/services/supabase.py`:
```python
async def get_block_exercises(block: str) -> list[dict]:
    """Restituisce tutti gli esercizi del blocco (A, B, o C) ordinati per drill_id."""
    result = await asyncio.to_thread(
        lambda: supabase.table("training_exercises")
            .select("*")
            .eq("block", block)
            .order("drill_id")
            .execute()
    )
    return result.data


async def get_video_link(exercise_name: str) -> dict | None:
    """Cerca in training_links un link per l'esercizio. Case-insensitive."""
    result = await asyncio.to_thread(
        lambda: supabase.table("training_links")
            .select("exercise_name,url,title")
            .ilike("exercise_name", exercise_name)
            .limit(1)
            .execute()
    )
    if not result.data:
        return None
    row = result.data[0]
    return {"url": row["url"], "title": row["title"]}


async def save_video_link(exercise_name: str, url: str, title: str, source: str) -> None:
    """Salva un link video. Usa upsert per non duplicare."""
    await asyncio.to_thread(
        lambda: supabase.table("training_links")
            .upsert(
                {"exercise_name": exercise_name, "url": url, "title": title, "source": source},
                on_conflict="exercise_name",
            )
            .execute()
    )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_supabase_service.py -v
```

Expected: all tests PASS (including the 4 new ones).

- [ ] **Step 5: Commit**

```bash
git add backend/services/supabase.py tests/test_supabase_service.py
git commit -m "feat: add get_block_exercises, get_video_link, save_video_link to supabase service"
```

---

### Task 4: YouTube Service

**Files:**
- Create: `backend/services/youtube.py`
- Create: `tests/test_youtube_service.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_youtube_service.py`:
```python
from unittest.mock import patch, MagicMock
import pytest


@pytest.fixture
def mock_build():
    with patch("backend.services.youtube.build") as mock:
        yield mock


async def test_search_video_returns_url_and_title(mock_build):
    mock_yt = MagicMock()
    mock_build.return_value = mock_yt
    mock_yt.search.return_value.list.return_value.execute.return_value = {
        "items": [
            {
                "id": {"videoId": "abc123"},
                "snippet": {"title": "KB RDL Tutorial Form"},
            }
        ]
    }
    from backend.services.youtube import search_video
    result = await search_video("Romanian Deadlift KB")
    assert result == {
        "url": "https://www.youtube.com/watch?v=abc123",
        "title": "KB RDL Tutorial Form",
    }
    mock_yt.search.return_value.list.assert_called_once_with(
        q="Romanian Deadlift KB tutorial form",
        type="video",
        part="id,snippet",
        maxResults=1,
        videoDuration="medium",
    )


async def test_search_video_returns_none_when_no_results(mock_build):
    mock_yt = MagicMock()
    mock_build.return_value = mock_yt
    mock_yt.search.return_value.list.return_value.execute.return_value = {"items": []}
    from backend.services.youtube import search_video
    result = await search_video("Unknown Exercise XYZ")
    assert result is None


async def test_search_video_returns_none_on_api_error(mock_build):
    mock_build.side_effect = Exception("API quota exceeded")
    from backend.services.youtube import search_video
    result = await search_video("Romanian Deadlift KB")
    assert result is None
```

- [ ] **Step 2: Run to verify tests fail**

```bash
pytest tests/test_youtube_service.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'backend.services.youtube'`.

- [ ] **Step 3: Implement youtube service**

Create `backend/services/youtube.py`:
```python
import asyncio
from googleapiclient.discovery import build
from backend.config import get_settings


async def search_video(exercise_name: str) -> dict | None:
    """Cerca il miglior video tutorial per l'esercizio su YouTube.
    Restituisce {'url': ..., 'title': ...} oppure None se nessun risultato.
    """
    try:
        return await asyncio.to_thread(_sync_search, exercise_name)
    except Exception:
        return None


def _sync_search(exercise_name: str) -> dict | None:
    settings = get_settings()
    youtube = build("youtube", "v3", developerKey=settings.youtube_api_key)
    resp = youtube.search().list(
        q=f"{exercise_name} tutorial form",
        type="video",
        part="id,snippet",
        maxResults=1,
        videoDuration="medium",
    ).execute()
    items = resp.get("items", [])
    if not items:
        return None
    video_id = items[0]["id"]["videoId"]
    title = items[0]["snippet"]["title"]
    return {
        "url": f"https://www.youtube.com/watch?v={video_id}",
        "title": title,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_youtube_service.py -v
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/services/youtube.py tests/test_youtube_service.py
git commit -m "feat: add YouTube service with search_video (caches via Supabase)"
```

---

### Task 5: Coaching Agent

**Files:**
- Create: `backend/agents/coaching.py`
- Create: `tests/test_coaching_agent.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_coaching_agent.py`:
```python
import datetime
from unittest.mock import AsyncMock, patch
import pytest


# --- select_block tests (pure function) ---

def test_select_block_explicit_a():
    from backend.agents.coaching import select_block
    assert select_block("facciamo blocco A oggi", 1) == "A"


def test_select_block_explicit_b():
    from backend.agents.coaching import select_block
    assert select_block("voglio fare block B", 2) == "B"


def test_select_block_explicit_c():
    from backend.agents.coaching import select_block
    assert select_block("blocco C per favore", 3) == "C"


def test_select_block_case_insensitive():
    from backend.agents.coaching import select_block
    assert select_block("BLOCCO A", 1) == "A"


def test_select_block_monday_returns_a(monkeypatch):
    from backend.agents.coaching import select_block
    # Monday = weekday 0
    monkeypatch.setattr(
        "backend.agents.coaching.datetime",
        type("dt", (), {"date": type("d", (), {"today": staticmethod(lambda: datetime.date(2026, 4, 6))})})()
    )
    assert select_block("voglio allenarmi", 1) == "A"


def test_select_block_tuesday_returns_b(monkeypatch):
    from backend.agents.coaching import select_block
    # Tuesday = weekday 1 → April 7, 2026
    monkeypatch.setattr(
        "backend.agents.coaching.datetime",
        type("dt", (), {"date": type("d", (), {"today": staticmethod(lambda: datetime.date(2026, 4, 7))})})()
    )
    assert select_block("voglio allenarmi", 1) == "B"


def test_select_block_sunday_returns_c(monkeypatch):
    from backend.agents.coaching import select_block
    # Sunday = weekday 6 → April 12, 2026
    monkeypatch.setattr(
        "backend.agents.coaching.datetime",
        type("dt", (), {"date": type("d", (), {"today": staticmethod(lambda: datetime.date(2026, 4, 12))})})()
    )
    assert select_block("cosa faccio oggi?", 1) == "C"


# --- build_training_context tests (mocked Supabase + YouTube) ---

@pytest.fixture
def mock_supabase_coaching():
    with patch("backend.agents.coaching.get_block_exercises") as mock_ex, \
         patch("backend.agents.coaching.get_video_link") as mock_vl, \
         patch("backend.agents.coaching.save_video_link") as mock_sv, \
         patch("backend.agents.coaching.search_video") as mock_yt:
        mock_ex.return_value = [
            {"block": "A", "drill_id": "1.a", "exercise_name": "Romanian Deadlift KB", "sets": "4", "reps": "8", "rest": "/"},
        ]
        mock_vl.return_value = {"url": "https://www.youtube.com/watch?v=abc", "title": "KB RDL Tutorial"}
        mock_sv.return_value = None
        mock_yt.return_value = None
        yield mock_ex, mock_vl, mock_sv, mock_yt


async def test_build_training_context_includes_block_name(mock_supabase_coaching):
    mock_ex, mock_vl, mock_sv, mock_yt = mock_supabase_coaching
    mock_ex.return_value = mock_ex.return_value
    mock_vl.return_value = None
    mock_yt.return_value = None
    from backend.agents.coaching import build_training_context
    result = await build_training_context("A")
    assert "BLOCCO A" in result
    assert "Posterior Chain" in result


async def test_build_training_context_includes_exercise(mock_supabase_coaching):
    from backend.agents.coaching import build_training_context
    result = await build_training_context("A")
    assert "Romanian Deadlift KB" in result


async def test_build_training_context_uses_cached_video(mock_supabase_coaching):
    mock_ex, mock_vl, mock_sv, mock_yt = mock_supabase_coaching
    from backend.agents.coaching import build_training_context
    result = await build_training_context("A")
    assert "https://www.youtube.com/watch?v=abc" in result
    mock_yt.assert_not_called()  # YouTube API not called if DB has link


async def test_build_training_context_calls_youtube_when_no_cache(mock_supabase_coaching):
    mock_ex, mock_vl, mock_sv, mock_yt = mock_supabase_coaching
    mock_vl.return_value = None  # No cached link
    mock_yt.return_value = {"url": "https://www.youtube.com/watch?v=xyz", "title": "RDL Video"}
    from backend.agents.coaching import build_training_context
    result = await build_training_context("A")
    assert "https://www.youtube.com/watch?v=xyz" in result
    mock_yt.assert_called_once_with("Romanian Deadlift KB")
    mock_sv.assert_called_once()  # Saved to DB after YouTube lookup


async def test_build_training_context_no_video_shows_fallback(mock_supabase_coaching):
    mock_ex, mock_vl, mock_sv, mock_yt = mock_supabase_coaching
    mock_vl.return_value = None
    mock_yt.return_value = None
    from backend.agents.coaching import build_training_context
    result = await build_training_context("A")
    assert "nessun video disponibile" in result


async def test_build_training_context_empty_block(mock_supabase_coaching):
    mock_ex, mock_vl, mock_sv, mock_yt = mock_supabase_coaching
    mock_ex.return_value = []
    from backend.agents.coaching import build_training_context
    result = await build_training_context("A")
    assert "Nessun esercizio" in result
```

- [ ] **Step 2: Run to verify tests fail**

```bash
pytest tests/test_coaching_agent.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'backend.agents.coaching'`.

- [ ] **Step 3: Implement coaching agent**

Create `backend/agents/coaching.py`:
```python
import re
import datetime
from backend.services.supabase import get_block_exercises, get_video_link, save_video_link
from backend.services.youtube import search_video

BLOCK_NAMES = {
    "A": "Posterior Chain & Core",
    "B": "Knee & Hip",
    "C": "Mobility & Skill",
}

MONTH_FOCUS = {
    1: "Movement quality",
    2: "Base strength",
    3: "Strength + stability",
    4: "Power",
    5: "Advanced control",
    6: "Integration",
}

# Weekday → block: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
_WEEKDAY_BLOCK = {0: "A", 1: "B", 2: "C", 3: "A", 4: "B", 5: "C", 6: "C"}


def select_block(user_input: str, current_month: int) -> str:
    """Determina il blocco da fare.
    - Se l'utente specifica ('blocco A', 'block B') → usa quello
    - Altrimenti → ruota A→B→C in base al giorno della settimana
    """
    text = user_input.lower()
    for letter in ("a", "b", "c"):
        if re.search(rf"\b(block|blocco)\s*{letter}\b", text):
            return letter.upper()
    weekday = datetime.date.today().weekday()
    return _WEEKDAY_BLOCK.get(weekday, "C")


async def build_training_context(block: str) -> str:
    """Costruisce il contesto da passare a Claude Sonnet con esercizi e video link."""
    exercises = await get_block_exercises(block)
    if not exercises:
        return f"Nessun esercizio trovato per il blocco {block}."

    lines = [f"BLOCCO {block} — {BLOCK_NAMES.get(block, block)}", ""]

    for ex in exercises:
        name = ex["exercise_name"]
        drill = ex.get("drill_id") or ""
        sets = ex.get("sets") or ""
        reps = ex.get("reps") or ""
        rest = ex.get("rest") or ""

        lines.append(f"{drill}. {name} — {sets} serie × {reps} reps — rest {rest}")

        video = await get_video_link(name)
        if video is None:
            video = await search_video(name)
            if video:
                await save_video_link(name, video["url"], video["title"], "youtube")

        if video:
            lines.append(f"    📹 {video['url']} ({video['title']})")
        else:
            lines.append("    📹 nessun video disponibile")

    month = min(datetime.date.today().month, 6)
    focus = MONTH_FOCUS.get(month, "")
    lines.extend(["", f"Mese corrente: Month {month} — {focus}"])

    return "\n".join(lines)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_coaching_agent.py -v
```

Expected: all 12 tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
pytest tests/ -v --tb=short
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/agents/coaching.py tests/test_coaching_agent.py
git commit -m "feat: add coaching agent with select_block and build_training_context"
```

---

### Task 6: Orchestrator — Intent + Routing

**Files:**
- Modify: `backend/services/claude.py`
- Modify: `backend/orchestrator.py`
- Modify: `tests/test_orchestrator.py`

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_orchestrator.py`:
```python
def test_select_model_sonnet_for_training_request():
    assert select_model(["log_memory", "training_request"]) == SONNET_MODEL
```

- [ ] **Step 2: Run to verify test fails**

```bash
pytest tests/test_orchestrator.py::test_select_model_sonnet_for_training_request -v
```

Expected: FAIL — `training_request` not handled by `select_model`.

- [ ] **Step 3: Update claude.py — add training_request intent to prompt**

In `backend/services/claude.py`, replace the `_INTENT_PROMPT` string. Change the intent list section to add `training_request`:

```python
_INTENT_PROMPT = """Sei un classificatore di intent per un'app companion comportamentale.
Analizza il messaggio e restituisci SOLO un JSON valido:
{{"intent": ["intent1"], "tone": "tone_value"}}

Intent disponibili (seleziona tutti quelli applicabili):
- log_memory: sempre incluso
- log_nutrition: l'utente menziona cibo, pasti, bevande, calorie
- log_task: l'utente menziona qualcosa da fare o un obiettivo
- coaching_check: l'utente esprime stato emotivo, difficoltà, o deviazioni da abitudini
- habit_update: l'utente aggiorna un habit (esercizio, lettura, ecc.)
- training_request: l'utente vuole allenarsi, chiede cosa fare oggi, menziona un blocco specifico, o chiede del suo piano di allenamento

Tone disponibili:
- neutral: risposta informativa
- motivational: l'utente ha bisogno di motivazione o ha fatto qualcosa di positivo
- supportive: l'utente esprime difficoltà o emozioni negative

Messaggio:"""
```

Also update `stream_response` to accept an optional `extra_system` parameter:

```python
async def stream_response(
    messages: list[dict],
    model: str,
    tone: str,
    extra_system: str = "",
) -> AsyncGenerator[str, None]:
    system = _SYSTEM_PROMPTS.get(tone, _SYSTEM_PROMPTS["neutral"])
    if extra_system:
        system = f"{system}\n\n{extra_system}"
    async with client.messages.stream(
        model=model,
        max_tokens=1024,
        system=system,
        messages=messages,
    ) as stream:
        async for token in stream.text_stream:
            yield token
```

- [ ] **Step 4: Update orchestrator.py — add training_request routing + select_model**

Replace `backend/orchestrator.py` with:
```python
import asyncio
import datetime
import json
from typing import AsyncIterator
from backend.models import IntentResult
from backend.services.claude import (
    classify_intent,
    stream_response,
    HAIKU_MODEL,
    SONNET_MODEL,
)
from backend.services.supabase import get_today_session, upsert_session


def select_model(intent: list[str]) -> str:
    """Select Claude model based on intents. Pure function."""
    if "coaching_check" in intent or "training_request" in intent or len(intent) > 2:
        return SONNET_MODEL
    return HAIKU_MODEL


async def process(text: str) -> AsyncIterator[str]:
    # Lazy import to avoid ModuleNotFoundError when memory agent doesn't exist yet
    from backend.agents.memory import process as memory_process  # noqa: PLC0415

    # 1. Classify intent with Haiku (fast, cheap)
    intent_result: IntentResult = await classify_intent(text)
    model = select_model(intent_result.intent)

    # 2. Retrieve today's session
    session = await get_today_session()
    session_id = session["id"] if session else None
    history: list[dict] = session["messages"] if session else []

    # 3. Save memory in background (does not block streaming)
    _bg_task = asyncio.create_task(memory_process(text))  # noqa: F841 — keep ref to prevent GC

    # 4. Build training context if requested
    extra_system = ""
    if "training_request" in intent_result.intent:
        from backend.agents.coaching import build_training_context, select_block  # noqa: PLC0415
        block = select_block(text, datetime.date.today().month)
        extra_system = await build_training_context(block)

    # 5. Build message history with new message (max 20)
    messages = (history + [{"role": "user", "content": text}])[-20:]

    # 6. Stream response token by token
    full_response = ""
    async for token in stream_response(messages, model, intent_result.tone, extra_system=extra_system):
        full_response += token
        yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

    # 7. Update session with assistant response
    updated_messages = (messages + [{"role": "assistant", "content": full_response}])[-20:]
    await upsert_session(session_id, updated_messages)

    yield f"data: {json.dumps({'type': 'done', 'memory_saved': True})}\n\n"
```

- [ ] **Step 5: Run orchestrator tests to verify**

```bash
pytest tests/test_orchestrator.py -v
```

Expected: all 5 tests PASS (including new `test_select_model_sonnet_for_training_request`).

- [ ] **Step 6: Run full test suite**

```bash
pytest tests/ -v --tb=short
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/services/claude.py backend/orchestrator.py tests/test_orchestrator.py
git commit -m "feat: add training_request intent routing to coaching agent in orchestrator"
```

---

### Task 7: CLI Script — load_training.py

**Files:**
- Create: `scripts/load_training.py`

No automated tests for this script — it's a one-shot CLI. Verified by running it.

- [ ] **Step 1: Create scripts/ directory if it doesn't exist**

```bash
mkdir -p scripts
```

- [ ] **Step 2: Create the script**

Create `scripts/load_training.py`:
```python
"""CLI: parse Jump.xlsx and upsert exercises into Supabase training_exercises table.

Usage:
    python scripts/load_training.py Jump.xlsx
"""
import sys
import os

# Allow running from project root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import openpyxl
from backend.config import get_settings
from supabase import create_client


def parse_exercises(path: str) -> list[dict]:
    wb = openpyxl.load_workbook(path)
    ws = wb.active

    exercises = []
    current_block = None

    for row in ws.iter_rows(values_only=True):
        col_a = row[0] if len(row) > 0 else None
        col_b = row[1] if len(row) > 1 else None
        col_c = row[2] if len(row) > 2 else None
        col_d = row[3] if len(row) > 3 else None
        col_e = row[4] if len(row) > 4 else None

        # Block header row: "A - Posterior Chain & Core"
        if isinstance(col_a, str) and len(col_a) >= 3 and col_a[1] == " " and col_a[0] in ("A", "B", "C"):
            current_block = col_a[0]
            continue

        # Skip column header rows
        if col_a == "DRILL":
            continue

        # Skip empty rows or rows without exercise names
        if current_block is None or col_b is None:
            continue

        # Normalize numeric values to strings
        def to_str(val) -> str:
            if val is None:
                return ""
            if isinstance(val, float) and val == int(val):
                return str(int(val))
            return str(val)

        exercises.append({
            "block": current_block,
            "drill_id": to_str(col_a),
            "exercise_name": str(col_b).strip(),
            "sets": to_str(col_c),
            "reps": to_str(col_d),
            "rest": to_str(col_e),
        })

    return exercises


def load(path: str) -> None:
    exercises = parse_exercises(path)
    if not exercises:
        print("Nessun esercizio trovato. Controlla il formato del file.")
        return

    settings = get_settings()
    sb = create_client(settings.supabase_url, settings.supabase_key)

    for ex in exercises:
        sb.table("training_exercises").upsert(
            ex,
            on_conflict="block,exercise_name",
        ).execute()

    print(f"✓ Caricati {len(exercises)} esercizi su Supabase.")
    for ex in exercises:
        print(f"  [{ex['block']}] {ex['drill_id']}. {ex['exercise_name']} — {ex['sets']}×{ex['reps']} rest {ex['rest']}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python scripts/load_training.py Jump.xlsx")
        sys.exit(1)
    load(sys.argv[1])
```

- [ ] **Step 3: Run the script**

```bash
python scripts/load_training.py Jump.xlsx
```

Expected output:
```
✓ Caricati 14 esercizi su Supabase.
  [A] 1.a. Romanian Deadlift KB — 4×8 rest /
  [A] 1.b. TRX Row — 4×10 rest 60"
  [A] 2. Side Plank — 3×30"&30" rest 30"
  [A] 3. Bird-dog — 3×8&8 rest 30"
  [A] 4. Swing KB — 5×15 rest 60"
  [B] 1.a. Split Squat — 4×8&8 rest /
  ...
```

Verify in Supabase Table Editor that `training_exercises` has rows.

- [ ] **Step 4: Commit**

```bash
git add scripts/load_training.py
git commit -m "feat: add load_training.py CLI to parse Jump.xlsx and upsert exercises to Supabase"
```

---

### Task 8: End-to-End Smoke Test

- [ ] **Step 1: Run full test suite**

```bash
pytest tests/ -v --tb=short
```

Expected: all tests PASS.

- [ ] **Step 2: Start the server**

```bash
uvicorn backend.main:app --reload
```

- [ ] **Step 3: Test training_request flow**

```bash
curl -N -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"text": "voglio fare il blocco A oggi"}'
```

Expected: SSE stream with `type: token` events containing a response about Block A exercises with video links, followed by `type: done`.

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "feat: coaching agent MVP complete — training plans + YouTube video links"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Task 1 — Config + deps (spec §9, §2 requirements)
- [x] Task 2 — DB schema (spec §3)
- [x] Task 3 — Supabase functions (spec §6)
- [x] Task 4 — YouTube service (spec §5)
- [x] Task 5 — Coaching agent (spec §7)
- [x] Task 6 — Orchestrator routing (spec §8)
- [x] Task 7 — load_training.py CLI (spec §4)
- [x] Task 8 — End-to-end test (spec §10)

**Out of scope (not included, per spec §11):**
- Session completion tracking (✅/❌)
- Automatic month progression
- Push notifications
- HTTP endpoint for Excel upload
- Manual video links via chat
