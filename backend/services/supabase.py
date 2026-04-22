import asyncio
import datetime
from functools import lru_cache
from typing import Optional
from supabase import create_client, Client
from backend.config import get_settings


def _require_supabase_url() -> str:
    url = get_settings().supabase_url
    if not url:
        raise RuntimeError("SUPABASE_URL non configurata")
    return url


def _require_supabase_key() -> str:
    key = get_settings().supabase_key
    if not key:
        raise RuntimeError("SUPABASE_KEY non configurata")
    return key


@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    return create_client(_require_supabase_url(), _require_supabase_key())


class _SupabaseProxy:
    def __getattr__(self, name: str):
        return getattr(get_supabase_client(), name)


supabase = _SupabaseProxy()


async def save_memory(raw_text: str, summary: str, tags: list, entities: dict) -> None:
    await asyncio.to_thread(
        lambda: supabase.table("memories").insert({
            "raw_text": raw_text,
            "summary": summary,
            "tags": tags,
            "entities": entities,
        }).execute()
    )


async def get_memories(
    limit: int = 20,
    offset: int = 0,
    memory_type: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> list[dict]:
    query = supabase.table("memories").select("*")
    if memory_type:
        query = query.eq("entities->>type", memory_type)
    if date_from:
        query = query.gte("date", date_from)
    if date_to:
        # memories.date is TIMESTAMPTZ — use exclusive upper bound on next day
        # so "2026-04-07" includes all records up to 23:59:59
        next_day = (datetime.date.fromisoformat(date_to) + datetime.timedelta(days=1)).isoformat()
        query = query.lt("date", next_day)
    result = await asyncio.to_thread(
        lambda: query.order("date", desc=True).range(offset, offset + limit - 1).execute()
    )
    return result.data


async def delete_memory(memory_id: str) -> None:
    await asyncio.to_thread(
        lambda: supabase.table("memories").delete().eq("id", memory_id).execute()
    )


async def update_memory_tags(memory_id: str, tags: list) -> dict:
    result = await asyncio.to_thread(
        lambda: supabase.table("memories")
            .update({"tags": tags})
            .eq("id", memory_id)
            .execute()
    )
    return result.data[0] if result.data else {}


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


async def create_training_exercise(fields: dict) -> dict:
    result = await asyncio.to_thread(
        lambda: supabase.table("training_exercises")
            .insert(fields)
            .execute()
    )
    return result.data[0] if result.data else fields


async def update_training_exercise(exercise_id: str, fields: dict) -> dict:
    result = await asyncio.to_thread(
        lambda: supabase.table("training_exercises")
            .update(fields)
            .eq("id", exercise_id)
            .execute()
    )
    return result.data[0] if result.data else {}


async def delete_training_exercise(exercise_id: str) -> None:
    await asyncio.to_thread(
        lambda: supabase.table("training_exercises")
            .delete()
            .eq("id", exercise_id)
            .execute()
    )


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
    """Salva il piano nutrizionale. Update se esiste, insert altrimenti."""
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    data = {
        "diet_type": diet_type,
        "allergies": allergies,
        "targets": targets,
        "foods": foods if foods else {},
        "notes": notes or "",
        "source": source,
        "updated_at": now,
    }
    existing = await get_nutrition_plan()
    if existing and existing.get("id"):
        await asyncio.to_thread(
            lambda: supabase.table("nutrition_plan")
                .update(data)
                .eq("id", existing["id"])
                .execute()
        )
    else:
        await asyncio.to_thread(
            lambda: supabase.table("nutrition_plan").insert(data).execute()
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


async def save_push_token(token: str) -> None:
    """Salva o aggiorna il token Expo push."""
    now = datetime.datetime.utcnow().isoformat()
    await asyncio.to_thread(
        lambda: supabase.table("push_tokens")
            .upsert({"token": token, "updated_at": now}, on_conflict="token")
            .execute()
    )


async def get_push_token() -> Optional[str]:
    """Restituisce il token più recente, o None se non registrato."""
    result = await asyncio.to_thread(
        lambda: supabase.table("push_tokens")
            .select("token")
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
    )
    return result.data[0]["token"] if result.data else None


async def log_training_complete(date: str) -> None:
    """Segna l'allenamento come completato per la data."""
    await asyncio.to_thread(
        lambda: supabase.table("training_logs")
            .upsert({"date": date, "completed": True}, on_conflict="date")
            .execute()
    )


async def get_training_log_today() -> bool:
    """Restituisce True se l'allenamento è stato completato oggi."""
    today = datetime.date.today().isoformat()
    result = await asyncio.to_thread(
        lambda: supabase.table("training_logs")
            .select("completed")
            .eq("date", today)
            .limit(1)
            .execute()
    )
    return bool(result.data and result.data[0]["completed"])


async def get_fridge_items() -> list[dict]:
    """Restituisce tutti gli ingredienti nel frigo."""
    result = await asyncio.to_thread(
        lambda: supabase.table("fridge_items")
            .select("*")
            .order("name")
            .execute()
    )
    return result.data


async def upsert_fridge_item(name: str, quantity: float, unit: str) -> dict:
    """Crea o aggiorna un ingrediente nel frigo."""
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    result = await asyncio.to_thread(
        lambda: supabase.table("fridge_items")
            .upsert(
                {"name": name, "quantity": quantity, "unit": unit, "updated_at": now},
                on_conflict="name",
            )
            .execute()
    )
    return result.data[0] if result.data else {"name": name, "quantity": quantity, "unit": unit}


async def remove_fridge_items(names: list[str]) -> None:
    """Rimuove ingredienti dal frigo."""
    await asyncio.to_thread(
        lambda: supabase.table("fridge_items")
            .delete()
            .in_("name", names)
            .execute()
    )


async def get_user_settings() -> dict:
    """Restituisce le impostazioni utente (unico record)."""
    result = await asyncio.to_thread(
        lambda: supabase.table("user_settings")
            .select("*")
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
    )
    if result.data:
        return result.data[0]
    return {"checkin_time": "08:00", "training_reminder_time": "09:00"}


async def save_user_settings(checkin_time: str, training_reminder_time: str) -> None:
    """Crea o aggiorna le impostazioni utente."""
    now = datetime.datetime.utcnow().isoformat()
    existing = await get_user_settings()
    if "id" in existing:
        await asyncio.to_thread(
            lambda: supabase.table("user_settings")
                .update({"checkin_time": checkin_time, "training_reminder_time": training_reminder_time, "updated_at": now})
                .eq("id", existing["id"])
                .execute()
        )
    else:
        await asyncio.to_thread(
            lambda: supabase.table("user_settings")
                .insert({"checkin_time": checkin_time, "training_reminder_time": training_reminder_time})
                .execute()
        )


async def delete_fridge_item(item_id: str) -> None:
    """Rimuove un ingrediente dal frigo per id."""
    await asyncio.to_thread(
        lambda: supabase.table("fridge_items").delete().eq("id", item_id).execute()
    )


async def update_habit_definition(habit_id: str, fields: dict) -> dict:
    """Aggiorna i campi di una habit (nome, target, unit, reminder_time)."""
    result = await asyncio.to_thread(
        lambda: supabase.table("habit_definitions")
            .update(fields)
            .eq("id", habit_id)
            .execute()
    )
    return result.data[0]


async def delete_habit_definition(habit_id: str) -> None:
    """Elimina una habit e i suoi log (ON DELETE CASCADE)."""
    await asyncio.to_thread(
        lambda: supabase.table("habit_definitions").delete().eq("id", habit_id).execute()
    )


async def get_nutrition_logs(date_from: str, date_to: Optional[str] = None) -> list[dict]:
    """Restituisce i log pasti per un range di date."""
    if date_to is None:
        date_to = date_from
    result = await asyncio.to_thread(
        lambda: supabase.table("nutrition_logs")
            .select("*")
            .gte("date", date_from)
            .lte("date", date_to)
            .order("created_at", desc=True)
            .execute()
    )
    return result.data


async def save_token_log(model: str, input_tokens: int, output_tokens: int, endpoint: str = "chat") -> None:
    await asyncio.to_thread(
        lambda: supabase.table("token_logs").insert({
            "model": model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "endpoint": endpoint,
        }).execute()
    )


_TOKEN_PRICES: dict[str, dict[str, float]] = {
    "claude-sonnet-4-6":          {"input": 3.0,  "output": 15.0},
    "claude-haiku-4-5-20251001":  {"input": 0.80, "output": 4.0},
}


async def get_token_stats(date_from: str, date_to: str) -> dict:
    next_day = (datetime.date.fromisoformat(date_to) + datetime.timedelta(days=1)).isoformat()
    result = await asyncio.to_thread(
        lambda: supabase.table("token_logs")
            .select("model, input_tokens, output_tokens, endpoint, created_at")
            .gte("created_at", date_from)
            .lt("created_at", next_day)
            .execute()
    )
    logs = result.data or []

    total_input = sum(l["input_tokens"] for l in logs)
    total_output = sum(l["output_tokens"] for l in logs)
    cost = 0.0
    by_model: dict[str, dict] = {}

    for l in logs:
        m = l["model"]
        p = _TOKEN_PRICES.get(m, {"input": 3.0, "output": 15.0})
        c = (l["input_tokens"] * p["input"] + l["output_tokens"] * p["output"]) / 1_000_000
        cost += c
        if m not in by_model:
            by_model[m] = {"input": 0, "output": 0, "cost": 0.0, "calls": 0}
        by_model[m]["input"] += l["input_tokens"]
        by_model[m]["output"] += l["output_tokens"]
        by_model[m]["cost"] += c
        by_model[m]["calls"] += 1

    return {
        "total_input": total_input,
        "total_output": total_output,
        "total_calls": len(logs),
        "cost_usd": round(cost, 4),
        "by_model": [
            {"model": k, "input": v["input"], "output": v["output"],
             "calls": v["calls"], "cost_usd": round(v["cost"], 4)}
            for k, v in by_model.items()
        ],
    }


async def delete_nutrition_log(log_id: str) -> None:
    await asyncio.to_thread(
        lambda: supabase.table("nutrition_logs").delete().eq("id", log_id).execute()
    )


async def update_nutrition_log(log_id: str, meal_description: str, nutrients: dict) -> dict:
    result = await asyncio.to_thread(
        lambda: supabase.table("nutrition_logs")
            .update({"meal_description": meal_description, "nutrients": nutrients})
            .eq("id", log_id)
            .execute()
    )
    return result.data[0] if result.data else {}


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


async def save_training_document(block: str, filename: str, file_type: str, file_bytes: bytes) -> None:
    import base64
    b64_data = base64.standard_b64encode(file_bytes).decode()
    await asyncio.to_thread(
        lambda: supabase.table("training_documents").insert({
            "block": block,
            "filename": filename,
            "file_type": file_type,
            "file_data": b64_data,
        }).execute()
    )
