import asyncio
import datetime
from typing import Optional
from supabase import create_client, Client
from backend.config import get_settings

settings = get_settings()
supabase: Client = create_client(settings.supabase_url, settings.supabase_key)


async def save_memory(raw_text: str, summary: str, entities: dict) -> None:
    await asyncio.to_thread(
        lambda: supabase.table("memories").insert({
            "raw_text": raw_text,
            "summary": summary,
            "entities": entities,
        }).execute()
    )


async def get_memories(limit: int = 20, offset: int = 0) -> list[dict]:
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


async def upsert_session(session_id: Optional[str], messages: list[dict]) -> str:
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
