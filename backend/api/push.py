import asyncio
import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.services.supabase import (
    save_push_token, log_training_complete, get_training_log_today,
    get_block_exercises, get_video_link, supabase,
)

router = APIRouter()


class PushTokenRequest(BaseModel):
    token: str


@router.post("/push/token")
async def register_push_token(request: PushTokenRequest):
    await save_push_token(request.token)
    return {"registered": True}


@router.post("/training/complete")
async def complete_training():
    today = datetime.date.today().isoformat()
    await log_training_complete(today)
    return {"date": today, "completed": True}


@router.get("/training/today")
async def training_today():
    completed = await get_training_log_today()
    return {"completed": completed}


@router.get("/training/status")
async def training_status(date: str = None):
    """Stato allenamento per una data specifica (YYYY-MM-DD). Default: oggi."""
    if date is None:
        date = datetime.date.today().isoformat()
    result = await asyncio.to_thread(
        lambda: supabase.table("training_logs")
            .select("completed")
            .eq("date", date)
            .limit(1)
            .execute()
    )
    completed = bool(result.data and result.data[0]["completed"])
    return {"date": date, "completed": completed}


@router.get("/training/logs")
async def training_logs(date_from: str, date_to: str):
    """Lista log allenamenti in un range (YYYY-MM-DD). Restituisce [{date, completed}]."""
    result = await asyncio.to_thread(
        lambda: supabase.table("training_logs")
            .select("date, completed")
            .gte("date", date_from)
            .lte("date", date_to)
            .order("date")
            .execute()
    )
    return result.data or []


@router.get("/training/block/{block}")
async def training_block(block: str):
    """Restituisce tutti gli esercizi di un blocco (A, B, C) con video link se disponibile."""
    b = block.upper()
    if b not in ("A", "B", "C"):
        raise HTTPException(status_code=400, detail="Blocco deve essere A, B o C")
    exercises = await get_block_exercises(b)
    result = []
    for ex in exercises:
        video = await get_video_link(ex["exercise_name"])
        result.append({**ex, "video": video})
    return result
