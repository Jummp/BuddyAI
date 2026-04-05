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
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
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


async def save_nutrition_log(date: str, meal_description: str, nutrients: dict) -> None:
    """Salva un log pasto per la data specificata (formato ISO: '2026-04-05')."""
    await asyncio.to_thread(
        lambda: supabase.table("nutrition_logs").insert({
            "date": date,
            "meal_description": meal_description,
            "nutrients": nutrients,
        }).execute()
    )


async def get_weekly_nutrition(week_start: str) -> list[dict]:
    """Restituisce tutti i log dalla data week_start (ISO) a +6 giorni."""
    week_end = (datetime.date.fromisoformat(week_start) + datetime.timedelta(days=6)).isoformat()
    result = await asyncio.to_thread(
        lambda: supabase.table("nutrition_logs")
            .select("*")
            .gte("date", week_start)
            .lte("date", week_end)
            .order("date")
            .execute()
    )
    return result.data


async def get_nutrition_plan() -> dict | None:
    """Restituisce il piano nutrizionale attivo (l'unico record in nutrition_plan)."""
    result = await asyncio.to_thread(
        lambda: supabase.table("nutrition_plan")
            .select("*")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
    )
    return result.data[0] if result.data else None


async def save_nutrition_plan(
    diet_type: str,
    allergies: list[str],
    targets: dict,
    foods: dict,
    notes: str,
    source: str,
) -> None:
    """Salva il piano nutrizionale. Delete + insert (non atomico).
NOTE: un crash tra delete e insert lascia la tabella vuota fino alla prossima chiamata.
"""
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    await asyncio.to_thread(
        lambda: supabase.table("nutrition_plan").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    )
    await asyncio.to_thread(
        lambda: supabase.table("nutrition_plan").upsert({
            "diet_type": diet_type,
            "allergies": allergies,
            "targets": targets,
            "foods": foods,
            "notes": notes,
            "source": source,
            "updated_at": now,
        }).execute()
    )


async def upsert_nutrition_targets(targets: dict) -> None:
    """Aggiorna solo i campi targets nel piano esistente (merge, non sovrascrittura)."""
    existing = await get_nutrition_plan()
    if existing is None:
        return
    merged = {**existing.get("targets", {}), **targets}
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    await asyncio.to_thread(
        lambda: supabase.table("nutrition_plan")
            .update({"targets": merged, "updated_at": now})
            .eq("id", existing["id"])
            .execute()
    )


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
