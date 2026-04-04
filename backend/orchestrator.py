import asyncio
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
    if "coaching_check" in intent or len(intent) > 2:
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

    # 4. Build message history with new message (max 20)
    messages = (history + [{"role": "user", "content": text}])[-20:]

    # 5. Stream response token by token
    full_response = ""
    async for token in stream_response(messages, model, intent_result.tone):
        full_response += token
        yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

    # 6. Update session with assistant response
    updated_messages = (messages + [{"role": "assistant", "content": full_response}])[-20:]
    await upsert_session(session_id, updated_messages)

    yield f"data: {json.dumps({'type': 'done', 'memory_saved': True})}\n\n"
