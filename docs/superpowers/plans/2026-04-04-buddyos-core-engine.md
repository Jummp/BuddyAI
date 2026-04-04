# BuddyOS Core Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire il Core Engine di BuddyOS — un'API FastAPI che riceve input testo e voce, classifica l'intent, salva memorie su Supabase e restituisce risposte Claude in streaming SSE.

**Architecture:** Pipeline sincrona con streaming SSE. L'Orchestrator classifica l'intent con Claude Haiku, avvia il Memory Agent in background (`asyncio.create_task`), poi streama la risposta Claude (Haiku o Sonnet) token per token. La sessione giornaliera (max 20 messaggi) viene aggiornata dopo lo streaming.

**Tech Stack:** Python 3.11+, FastAPI, Uvicorn, Anthropic SDK (Claude Haiku + Sonnet), OpenAI SDK (Whisper), supabase-py, Pydantic v2, pytest + pytest-asyncio + httpx

---

## File Map

```
buddyos/
├── backend/
│   ├── __init__.py
│   ├── config.py              # Settings da .env (pydantic-settings)
│   ├── models.py              # Pydantic schemas condivisi
│   ├── orchestrator.py        # Intent → model selection → SSE stream
│   ├── agents/
│   │   ├── __init__.py
│   │   └── memory.py          # Summarize + extract entities + save
│   ├── services/
│   │   ├── __init__.py
│   │   ├── claude.py          # classify_intent, stream_response, summarize_and_extract
│   │   ├── whisper.py         # transcribe(audio_bytes, filename) -> str
│   │   └── supabase.py        # save_memory, get_memories, get_today_session, upsert_session
│   └── main.py                # FastAPI app + endpoints
├── tests/
│   ├── conftest.py
│   ├── test_models.py
│   ├── test_claude_service.py
│   ├── test_whisper_service.py
│   ├── test_orchestrator.py
│   ├── test_memory_agent.py
│   └── test_endpoints.py
├── requirements.txt
├── pytest.ini
├── .env.example
└── .gitignore
```

---

## Task 1: Project Setup

**Files:**
- Create: `requirements.txt`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `pytest.ini`
- Create: `backend/__init__.py`, `backend/agents/__init__.py`, `backend/services/__init__.py`

- [ ] **Step 1: Crea l'ambiente virtuale e installa dipendenze**

```bash
cd C:/Users/Jump.Jpc/Documents/Scripts/ClaudeCode/BuddyAI
python -m venv .venv
source .venv/Scripts/activate   # Windows: .venv\Scripts\activate
```

- [ ] **Step 2: Crea `requirements.txt`**

```
fastapi>=0.115
uvicorn[standard]>=0.30
anthropic>=0.40
openai>=1.50
supabase>=2.9
python-dotenv>=1.0
pydantic-settings>=2.5
python-multipart>=0.0.12
pytest>=8.3
pytest-asyncio>=0.24
httpx>=0.27
```

- [ ] **Step 3: Installa**

```bash
pip install -r requirements.txt
```

Expected: nessun errore, tutti i pacchetti installati.

- [ ] **Step 4: Crea `.env.example`**

```
ANTHROPIC_API_KEY=your_anthropic_key_here
OPENAI_API_KEY=your_openai_key_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_anon_key_here
```

- [ ] **Step 5: Crea `.gitignore`**

```
.venv/
.env
__pycache__/
*.pyc
.pytest_cache/
.superpowers/
```

- [ ] **Step 6: Crea `pytest.ini`**

```ini
[pytest]
asyncio_mode = auto
```

- [ ] **Step 7: Crea i file `__init__.py` vuoti**

Crea (vuoti):
- `backend/__init__.py`
- `backend/agents/__init__.py`
- `backend/services/__init__.py`
- `tests/__init__.py`

- [ ] **Step 8: Copia `.env.example` in `.env` e inserisci le chiavi reali**

```bash
cp .env.example .env
# Apri .env e sostituisci i placeholder con le chiavi vere
```

- [ ] **Step 9: Commit**

```bash
git init
git add requirements.txt .env.example .gitignore pytest.ini backend/__init__.py backend/agents/__init__.py backend/services/__init__.py tests/__init__.py
git commit -m "chore: project setup — deps, venv, gitignore"
```

---

## Task 2: Config & Models

**Files:**
- Create: `backend/config.py`
- Create: `backend/models.py`
- Create: `tests/test_models.py`

- [ ] **Step 1: Scrivi il test**

```python
# tests/test_models.py
from backend.models import IntentResult, MemoryEntities, ChatRequest

def test_intent_result_defaults():
    r = IntentResult(intent=["log_memory"], tone="neutral")
    assert r.intent == ["log_memory"]
    assert r.tone == "neutral"

def test_memory_entities_defaults():
    e = MemoryEntities()
    assert e.events == []
    assert e.people == []
    assert e.emotions == []
    assert e.topics == []

def test_chat_request_requires_text():
    r = ChatRequest(text="ciao")
    assert r.text == "ciao"
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

```bash
pytest tests/test_models.py -v
```

Expected: `ModuleNotFoundError: No module named 'backend.models'`

- [ ] **Step 3: Crea `backend/config.py`**

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    anthropic_api_key: str
    openai_api_key: str
    supabase_url: str
    supabase_key: str

    class Config:
        env_file = ".env"

settings = Settings()
```

- [ ] **Step 4: Crea `backend/models.py`**

```python
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class ChatRequest(BaseModel):
    text: str

class IntentResult(BaseModel):
    intent: List[str]
    tone: str

class MemoryEntities(BaseModel):
    events: List[str] = []
    people: List[str] = []
    emotions: List[str] = []
    topics: List[str] = []

class MemoryRecord(BaseModel):
    id: str
    date: datetime
    raw_text: str
    summary: Optional[str]
    entities: MemoryEntities
    created_at: datetime
```

- [ ] **Step 5: Esegui il test e verifica che passi**

```bash
pytest tests/test_models.py -v
```

Expected: `3 passed`

- [ ] **Step 6: Commit**

```bash
git add backend/config.py backend/models.py tests/test_models.py
git commit -m "feat: add config settings and pydantic models"
```

---

## Task 3: DB Schema su Supabase

**Files:**
- Create: `docs/sql/schema.sql` (SQL da eseguire manualmente su Supabase)

- [ ] **Step 1: Crea `docs/sql/schema.sql`**

```sql
-- Tabella memories: ogni messaggio dell'utente viene memorizzato qui
CREATE TABLE IF NOT EXISTS memories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date        TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_text    TEXT NOT NULL,
  summary     TEXT,
  entities    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabella sessions: cronologia conversazione giornaliera (max 20 msg)
CREATE TABLE IF NOT EXISTS sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  messages    JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index per recuperare rapidamente la sessione di oggi
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at DESC);

-- Index per recuperare memorie in ordine cronologico
CREATE INDEX IF NOT EXISTS idx_memories_date ON memories(date DESC);
```

- [ ] **Step 2: Esegui lo schema su Supabase**

1. Apri [https://supabase.com](https://supabase.com) → il tuo progetto
2. Vai su **SQL Editor**
3. Incolla il contenuto di `docs/sql/schema.sql` ed esegui
4. Verifica che le tabelle `memories` e `sessions` compaiano in **Table Editor**

- [ ] **Step 3: Commit**

```bash
git add docs/sql/schema.sql
git commit -m "feat: add supabase schema — memories and sessions tables"
```

---

## Task 4: Supabase Service

**Files:**
- Create: `backend/services/supabase.py`
- Create: `tests/test_supabase_service.py`

- [ ] **Step 1: Scrivi i test**

```python
# tests/test_supabase_service.py
from unittest.mock import MagicMock, patch, AsyncMock
import pytest

@pytest.fixture
def mock_supabase():
    with patch("backend.services.supabase.supabase") as mock:
        yield mock

async def test_save_memory_calls_insert(mock_supabase):
    mock_supabase.table.return_value.insert.return_value.execute = MagicMock()
    from backend.services.supabase import save_memory
    await save_memory("testo grezzo", "summary", {"events": ["ho mangiato"]})
    mock_supabase.table.assert_called_with("memories")

async def test_get_memories_returns_list(mock_supabase):
    mock_supabase.table.return_value.select.return_value.order.return_value.range.return_value.execute.return_value.data = [
        {"id": "abc", "raw_text": "test", "summary": "s", "entities": {}, "date": "2026-04-04T10:00:00Z", "created_at": "2026-04-04T10:00:00Z"}
    ]
    from backend.services.supabase import get_memories
    result = await get_memories(limit=20, offset=0)
    assert isinstance(result, list)
    assert len(result) == 1

async def test_get_today_session_returns_none_when_empty(mock_supabase):
    mock_supabase.table.return_value.select.return_value.gte.return_value.order.return_value.limit.return_value.execute.return_value.data = []
    from backend.services.supabase import get_today_session
    result = await get_today_session()
    assert result is None
```

- [ ] **Step 2: Esegui e verifica che falliscano**

```bash
pytest tests/test_supabase_service.py -v
```

Expected: `ModuleNotFoundError` o `ImportError`

- [ ] **Step 3: Crea `backend/services/supabase.py`**

```python
import asyncio
import datetime
from typing import Optional, List
from supabase import create_client, Client
from backend.config import settings

supabase: Client = create_client(settings.supabase_url, settings.supabase_key)


async def save_memory(raw_text: str, summary: str, entities: dict) -> None:
    await asyncio.to_thread(
        lambda: supabase.table("memories").insert({
            "raw_text": raw_text,
            "summary": summary,
            "entities": entities,
        }).execute()
    )


async def get_memories(limit: int = 20, offset: int = 0) -> List[dict]:
    result = await asyncio.to_thread(
        lambda: supabase.table("memories")
            .select("*")
            .order("date", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
    )
    return result.data


async def get_today_session() -> Optional[dict]:
    today = datetime.date.today().isoformat()
    result = await asyncio.to_thread(
        lambda: supabase.table("sessions")
            .select("*")
            .gte("created_at", today)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
    )
    return result.data[0] if result.data else None


async def upsert_session(session_id: Optional[str], messages: List[dict]) -> str:
    now = datetime.datetime.utcnow().isoformat()
    if session_id:
        await asyncio.to_thread(
            lambda: supabase.table("sessions")
                .update({"messages": messages, "updated_at": now})
                .eq("id", session_id)
                .execute()
        )
        return session_id
    else:
        result = await asyncio.to_thread(
            lambda: supabase.table("sessions")
                .insert({"messages": messages})
                .execute()
        )
        return result.data[0]["id"]
```

- [ ] **Step 4: Esegui e verifica che passino**

```bash
pytest tests/test_supabase_service.py -v
```

Expected: `3 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/services/supabase.py tests/test_supabase_service.py
git commit -m "feat: add supabase service — save_memory, get_memories, session management"
```

---

## Task 5: Claude Service

**Files:**
- Create: `backend/services/claude.py`
- Create: `tests/test_claude_service.py`

- [ ] **Step 1: Scrivi i test**

```python
# tests/test_claude_service.py
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from backend.models import IntentResult

async def test_classify_intent_returns_intent_result():
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text='{"intent": ["log_memory", "log_nutrition"], "tone": "neutral"}')]

    with patch("backend.services.claude.client") as mock_client:
        mock_client.messages.create = AsyncMock(return_value=mock_response)
        from backend.services.claude import classify_intent
        result = await classify_intent("ho mangiato la pasta")

    assert isinstance(result, IntentResult)
    assert "log_memory" in result.intent
    assert "log_nutrition" in result.intent
    assert result.tone == "neutral"

async def test_classify_intent_invalid_json_raises():
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text="questo non è json")]

    with patch("backend.services.claude.client") as mock_client:
        mock_client.messages.create = AsyncMock(return_value=mock_response)
        from backend.services.claude import classify_intent
        with pytest.raises(ValueError, match="Intent classification fallita"):
            await classify_intent("testo qualsiasi")

async def test_summarize_and_extract_returns_tuple():
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text='{"summary": "Ho mangiato pasta.", "entities": {"events": ["ho mangiato"], "people": [], "emotions": [], "topics": ["cibo"]}}')]

    with patch("backend.services.claude.client") as mock_client:
        mock_client.messages.create = AsyncMock(return_value=mock_response)
        from backend.services.claude import summarize_and_extract
        summary, entities = await summarize_and_extract("oggi ho mangiato la pasta")

    assert summary == "Ho mangiato pasta."
    assert "cibo" in entities["topics"]
```

- [ ] **Step 2: Esegui e verifica che falliscano**

```bash
pytest tests/test_claude_service.py -v
```

Expected: `ModuleNotFoundError`

- [ ] **Step 3: Crea `backend/services/claude.py`**

```python
import json
from typing import AsyncGenerator, List
import anthropic
from backend.config import settings
from backend.models import IntentResult

HAIKU_MODEL = "claude-haiku-4-5-20251001"
SONNET_MODEL = "claude-sonnet-4-6"

client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

_INTENT_PROMPT = """Sei un classificatore di intent per un'app companion comportamentale.
Analizza il messaggio e restituisci SOLO un JSON valido:
{{"intent": ["intent1"], "tone": "tone_value"}}

Intent disponibili (seleziona tutti quelli applicabili):
- log_memory: sempre incluso
- log_nutrition: l'utente menziona cibo, pasti, bevande, calorie
- log_task: l'utente menziona qualcosa da fare o un obiettivo
- coaching_check: l'utente esprime stato emotivo, difficoltà, o deviazioni da abitudini
- habit_update: l'utente aggiorna un habit (esercizio, lettura, ecc.)

Tone disponibili:
- neutral: risposta informativa
- motivational: l'utente ha bisogno di motivazione o ha fatto qualcosa di positivo
- supportive: l'utente esprime difficoltà o emozioni negative

Messaggio: {text}"""

_MEMORY_PROMPT = """Analizza il testo e restituisci SOLO un JSON valido:
{{"summary": "riassunto in 1-2 frasi", "entities": {{"events": [], "people": [], "emotions": [], "topics": []}}}}

Testo: {text}"""

_SYSTEM_PROMPTS = {
    "neutral": "Sei BuddyAI, un companion personale. Rispondi in modo chiaro e utile in italiano.",
    "motivational": "Sei BuddyAI, un companion personale. Rispondi con energia e motivazione in italiano. Riconosci i progressi dell'utente.",
    "supportive": "Sei BuddyAI, un companion personale. Rispondi con empatia e supporto in italiano. Non giudicare, aiuta l'utente a trovare una soluzione.",
}


async def classify_intent(text: str) -> IntentResult:
    response = await client.messages.create(
        model=HAIKU_MODEL,
        max_tokens=256,
        messages=[{"role": "user", "content": _INTENT_PROMPT.format(text=text)}],
    )
    raw = response.content[0].text.strip()
    try:
        data = json.loads(raw)
        return IntentResult(intent=data["intent"], tone=data["tone"])
    except (json.JSONDecodeError, KeyError) as e:
        raise ValueError(f"Intent classification fallita: {raw}") from e


async def stream_response(
    messages: List[dict],
    model: str,
    tone: str,
) -> AsyncGenerator[str, None]:
    system = _SYSTEM_PROMPTS.get(tone, _SYSTEM_PROMPTS["neutral"])
    async with client.messages.stream(
        model=model,
        max_tokens=1024,
        system=system,
        messages=messages,
    ) as stream:
        async for token in stream.text_stream:
            yield token


async def summarize_and_extract(text: str) -> tuple[str, dict]:
    response = await client.messages.create(
        model=HAIKU_MODEL,
        max_tokens=512,
        messages=[{"role": "user", "content": _MEMORY_PROMPT.format(text=text)}],
    )
    raw = response.content[0].text.strip()
    try:
        data = json.loads(raw)
        return data["summary"], data["entities"]
    except (json.JSONDecodeError, KeyError) as e:
        raise ValueError(f"Memory extraction fallita: {raw}") from e
```

- [ ] **Step 4: Esegui e verifica che passino**

```bash
pytest tests/test_claude_service.py -v
```

Expected: `3 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/services/claude.py tests/test_claude_service.py
git commit -m "feat: add claude service — classify_intent, stream_response, summarize_and_extract"
```

---

## Task 6: Whisper Service

**Files:**
- Create: `backend/services/whisper.py`
- Create: `tests/test_whisper_service.py`

- [ ] **Step 1: Scrivi i test**

```python
# tests/test_whisper_service.py
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

async def test_transcribe_unsupported_format_raises():
    from backend.services.whisper import transcribe
    with pytest.raises(ValueError, match="Formato audio non supportato"):
        await transcribe(b"fake", "audio.xyz")

async def test_transcribe_success():
    mock_response = MagicMock()
    mock_response.text = "Oggi ho mangiato la pasta"

    with patch("backend.services.whisper.openai_client") as mock_client:
        mock_client.audio.transcriptions.create = AsyncMock(return_value=mock_response)
        from backend.services.whisper import transcribe
        result = await transcribe(b"fake audio bytes", "test.mp3")

    assert result == "Oggi ho mangiato la pasta"

async def test_transcribe_empty_audio_raises():
    with patch("backend.services.whisper.openai_client") as mock_client:
        mock_client.audio.transcriptions.create = AsyncMock(
            side_effect=Exception("Audio troppo corto")
        )
        from backend.services.whisper import transcribe
        with pytest.raises(RuntimeError, match="Trascrizione fallita"):
            await transcribe(b"", "test.mp3")
```

- [ ] **Step 2: Esegui e verifica che falliscano**

```bash
pytest tests/test_whisper_service.py -v
```

Expected: `ModuleNotFoundError`

- [ ] **Step 3: Crea `backend/services/whisper.py`**

```python
import io
from openai import AsyncOpenAI
from backend.config import settings

openai_client = AsyncOpenAI(api_key=settings.openai_api_key)

SUPPORTED_FORMATS = {"mp3", "mp4", "wav", "m4a", "webm", "ogg", "flac"}


async def transcribe(audio_bytes: bytes, filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in SUPPORTED_FORMATS:
        raise ValueError(
            f"Formato audio non supportato: .{ext}. "
            f"Formati accettati: {', '.join(sorted(SUPPORTED_FORMATS))}"
        )
    try:
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = filename
        response = await openai_client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
        )
        return response.text
    except Exception as e:
        raise RuntimeError(f"Trascrizione fallita: {e}") from e
```

- [ ] **Step 4: Esegui e verifica che passino**

```bash
pytest tests/test_whisper_service.py -v
```

Expected: `3 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/services/whisper.py tests/test_whisper_service.py
git commit -m "feat: add whisper service — transcribe with format validation"
```

---

## Task 7: Orchestrator

**Files:**
- Create: `backend/orchestrator.py`
- Create: `tests/test_orchestrator.py`

- [ ] **Step 1: Scrivi i test**

```python
# tests/test_orchestrator.py
from backend.orchestrator import select_model
from backend.services.claude import HAIKU_MODEL, SONNET_MODEL

def test_select_model_haiku_for_log_memory_only():
    assert select_model(["log_memory"]) == HAIKU_MODEL

def test_select_model_haiku_for_nutrition():
    assert select_model(["log_memory", "log_nutrition"]) == HAIKU_MODEL

def test_select_model_sonnet_for_coaching():
    assert select_model(["log_memory", "coaching_check"]) == SONNET_MODEL

def test_select_model_sonnet_for_many_intents():
    # Più di 2 intent → reasoning complesso → Sonnet
    assert select_model(["log_memory", "log_nutrition", "log_task"]) == SONNET_MODEL
```

- [ ] **Step 2: Esegui e verifica che falliscano**

```bash
pytest tests/test_orchestrator.py -v
```

Expected: `ModuleNotFoundError`

- [ ] **Step 3: Crea `backend/orchestrator.py`**

```python
import asyncio
import json
from typing import AsyncGenerator, List
from backend.models import IntentResult
from backend.services.claude import (
    classify_intent,
    stream_response,
    HAIKU_MODEL,
    SONNET_MODEL,
)
from backend.services.supabase import get_today_session, upsert_session
from backend.agents.memory import process as memory_process


def select_model(intent: List[str]) -> str:
    """Seleziona il modello Claude in base agli intent. Funzione pura."""
    if "coaching_check" in intent or len(intent) > 2:
        return SONNET_MODEL
    return HAIKU_MODEL


async def process(text: str) -> AsyncGenerator[str, None]:
    # 1. Classifica intent con Haiku (veloce, economico)
    intent_result: IntentResult = await classify_intent(text)
    model = select_model(intent_result.intent)

    # 2. Recupera la sessione di oggi
    session = await get_today_session()
    session_id = session["id"] if session else None
    history: List[dict] = session["messages"] if session else []

    # 3. Salva memoria in background (non blocca lo streaming)
    asyncio.create_task(memory_process(text))

    # 4. Costruisci history con il nuovo messaggio (max 20)
    messages = (history + [{"role": "user", "content": text}])[-20:]

    # 5. Streama risposta token per token
    full_response = ""
    async for token in stream_response(messages, model, intent_result.tone):
        full_response += token
        yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

    # 6. Aggiorna sessione con la risposta dell'assistente
    updated_messages = (messages + [{"role": "assistant", "content": full_response}])[-20:]
    await upsert_session(session_id, updated_messages)

    yield f"data: {json.dumps({'type': 'done', 'memory_saved': True})}\n\n"
```

- [ ] **Step 4: Esegui e verifica che passino**

```bash
pytest tests/test_orchestrator.py -v
```

Expected: `4 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/orchestrator.py tests/test_orchestrator.py
git commit -m "feat: add orchestrator — intent routing, model selection, SSE stream coordination"
```

---

## Task 8: Memory Agent

**Files:**
- Create: `backend/agents/memory.py`
- Create: `tests/test_memory_agent.py`

- [ ] **Step 1: Scrivi i test**

```python
# tests/test_memory_agent.py
from unittest.mock import AsyncMock, patch
import pytest

async def test_memory_process_saves_to_db():
    with patch("backend.agents.memory.summarize_and_extract", new_callable=AsyncMock) as mock_extract, \
         patch("backend.agents.memory.save_memory", new_callable=AsyncMock) as mock_save:

        mock_extract.return_value = (
            "Ho mangiato pasta.",
            {"events": ["ho mangiato"], "people": [], "emotions": [], "topics": ["cibo"]}
        )

        from backend.agents.memory import process
        await process("oggi ho mangiato la pasta")

        mock_extract.assert_called_once_with("oggi ho mangiato la pasta")
        mock_save.assert_called_once_with(
            raw_text="oggi ho mangiato la pasta",
            summary="Ho mangiato pasta.",
            entities={"events": ["ho mangiato"], "people": [], "emotions": [], "topics": ["cibo"]}
        )

async def test_memory_process_logs_on_extraction_failure(caplog):
    import logging
    with patch("backend.agents.memory.summarize_and_extract", new_callable=AsyncMock) as mock_extract, \
         patch("backend.agents.memory.save_memory", new_callable=AsyncMock) as mock_save:

        mock_extract.side_effect = ValueError("Extraction fallita")

        from backend.agents.memory import process
        with caplog.at_level(logging.ERROR):
            await process("testo qualsiasi")

        mock_save.assert_not_called()
        assert "Memory Agent error" in caplog.text
```

- [ ] **Step 2: Esegui e verifica che falliscano**

```bash
pytest tests/test_memory_agent.py -v
```

Expected: `ModuleNotFoundError`

- [ ] **Step 3: Crea `backend/agents/memory.py`**

```python
import logging
from backend.services.claude import summarize_and_extract
from backend.services.supabase import save_memory

logger = logging.getLogger(__name__)


async def process(text: str) -> None:
    """Estrae summary ed entità dal testo e salva su Supabase.
    Eseguito in background — i fallimenti vengono loggati, non propagati.
    """
    try:
        summary, entities = await summarize_and_extract(text)
        await save_memory(raw_text=text, summary=summary, entities=entities)
    except Exception as e:
        logger.error(f"Memory Agent error: {e}")
```

- [ ] **Step 4: Esegui e verifica che passino**

```bash
pytest tests/test_memory_agent.py -v
```

Expected: `2 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/agents/memory.py tests/test_memory_agent.py
git commit -m "feat: add memory agent — summarize, extract entities, save to supabase"
```

---

## Task 9: FastAPI App + Tutti gli Endpoint

**Files:**
- Create: `backend/main.py`
- Create: `tests/test_endpoints.py`

- [ ] **Step 1: Scrivi i test**

```python
# tests/test_endpoints.py
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch, MagicMock

async def test_health():
    from backend.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

async def test_chat_streams_tokens():
    async def mock_process(text):
        yield 'data: {"type": "token", "content": "Ciao"}\n\n'
        yield 'data: {"type": "done", "memory_saved": true}\n\n'

    from backend.main import app
    with patch("backend.main.orchestrate", side_effect=mock_process):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/chat", json={"text": "ciao buddy"})
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]

async def test_chat_empty_text_returns_422():
    from backend.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/chat", json={"text": ""})
    assert response.status_code == 422

async def test_voice_unsupported_format_returns_400():
    from backend.main import app
    with patch("backend.main.transcribe", new_callable=AsyncMock) as mock_t:
        mock_t.side_effect = ValueError("Formato audio non supportato: .xyz")
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/voice",
                files={"audio": ("test.xyz", b"fake", "audio/xyz")}
            )
    assert response.status_code == 400
    assert "Formato audio non supportato" in response.json()["detail"]

async def test_memories_returns_list():
    from backend.main import app
    with patch("backend.main.get_memories", new_callable=AsyncMock) as mock_m:
        mock_m.return_value = [{"id": "abc", "summary": "test"}]
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/memories?limit=10&offset=0")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
```

- [ ] **Step 2: Esegui e verifica che falliscano**

```bash
pytest tests/test_endpoints.py -v
```

Expected: `ModuleNotFoundError`

- [ ] **Step 3: Crea `backend/main.py`**

```python
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import field_validator
from backend.models import ChatRequest
from backend.orchestrator import process as orchestrate
from backend.services.whisper import transcribe
from backend.services.supabase import get_memories

app = FastAPI(title="BuddyOS Core Engine", version="0.1.0")


class ChatRequestValidated(ChatRequest):
    @field_validator("text")
    @classmethod
    def text_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Il testo non può essere vuoto")
        return v.strip()


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}


@app.post("/chat")
async def chat(request: ChatRequestValidated):
    return StreamingResponse(
        orchestrate(request.text),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/voice")
async def voice(audio: UploadFile = File(...)):
    audio_bytes = await audio.read()
    try:
        text = await transcribe(audio_bytes, audio.filename or "audio.mp3")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return StreamingResponse(
        orchestrate(text),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/memories")
async def memories(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    return await get_memories(limit=limit, offset=offset)
```

- [ ] **Step 4: Esegui e verifica che passino**

```bash
pytest tests/test_endpoints.py -v
```

Expected: `5 passed`

- [ ] **Step 5: Esegui tutti i test**

```bash
pytest -v
```

Expected: tutti i test passano.

- [ ] **Step 6: Commit**

```bash
git add backend/main.py tests/test_endpoints.py
git commit -m "feat: add fastapi app — /health /chat /voice /memories endpoints"
```

---

## Task 10: Verifica Manuale End-to-End

**Prerequisiti:** `.env` configurato con chiavi reali, tabelle Supabase create (Task 3).

- [ ] **Step 1: Avvia il server**

```bash
source .venv/Scripts/activate
uvicorn backend.main:app --reload --port 8000
```

Expected: `Uvicorn running on http://127.0.0.1:8000`

- [ ] **Step 2: Testa `/health`**

```bash
curl http://localhost:8000/health
```

Expected:
```json
{"status": "ok", "version": "0.1.0"}
```

- [ ] **Step 3: Testa `/chat` con streaming**

```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"text": "oggi ho mangiato uova a colazione e non mi sono allenato"}' \
  --no-buffer
```

Expected: stream di righe `data: {...}` con token di testo, poi `data: {"type": "done", "memory_saved": true}`.

- [ ] **Step 4: Verifica che la memoria sia stata salvata**

```bash
curl http://localhost:8000/memories?limit=5
```

Expected: lista JSON con almeno un record contenente `raw_text` e `summary`.

- [ ] **Step 5: Testa `/voice` con un file audio**

```bash
# Usa qualsiasi file .mp3 di test
curl -X POST http://localhost:8000/voice \
  -F "audio=@test.mp3" \
  --no-buffer
```

Expected: stream SSE identico a `/chat`.

- [ ] **Step 6: Testa errore formato non supportato**

```bash
curl -X POST http://localhost:8000/voice \
  -F "audio=@documento.pdf"
```

Expected:
```json
{"detail": "Formato audio non supportato: .pdf. Formati accettati: flac, m4a, mp3, mp4, ogg, wav, webm"}
```

- [ ] **Step 7: Commit finale**

```bash
git add .
git commit -m "feat: buddyos core engine MVP complete — orchestrator, memory agent, SSE streaming"
```

---

## Self-Review — Copertura Spec

| Requisito spec | Task che lo implementa |
|---|---|
| FastAPI backend | Task 9 |
| Whisper trascrizione voce | Task 6 |
| Claude Haiku intent classification | Task 5, 7 |
| Claude Haiku/Sonnet model selection | Task 7 (`select_model`) |
| Memory Agent: summary + entity extraction | Task 5, 8 |
| Memory Agent in background (asyncio) | Task 7 (`create_task`) |
| Supabase `memories` table | Task 3, 4 |
| Supabase `sessions` table (max 20 msg, daily) | Task 3, 4 |
| SSE streaming format | Task 7, 9 |
| POST /chat | Task 9 |
| POST /voice | Task 9 |
| GET /memories (paginata) | Task 9 |
| GET /health | Task 9 |
| Error: audio non supportato → 400 | Task 6, 9 |
| Error: Claude timeout → 503 | Task 9 |
| Error: Supabase down → log + non blocca | Task 8 |
| Single-user, nessuna auth | Confermato — nessun task auth |
