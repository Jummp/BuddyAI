import asyncio
import datetime
import base64
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from backend.services.supabase import (
    save_push_token, log_training_complete, get_training_log_today,
    get_block_exercises, get_video_link, supabase, create_training_exercise,
    update_training_exercise, delete_training_exercise, save_video_link,
    save_training_document,
)

router = APIRouter()


class PushTokenRequest(BaseModel):
    token: str


class TrainingExerciseCreateRequest(BaseModel):
    block: str
    exercise_name: str
    drill_id: str | None = None
    sets: str | None = None
    reps: str | None = None
    rest: str | None = None
    month_focus: str | None = None


class TrainingExerciseUpdateRequest(BaseModel):
    block: str | None = None
    exercise_name: str | None = None
    drill_id: str | None = None
    sets: str | None = None
    reps: str | None = None
    rest: str | None = None
    month_focus: str | None = None


class VideoLinkRequest(BaseModel):
    exercise_name: str
    url: str
    title: str


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


@router.post("/training/exercises")
async def create_training_exercise_endpoint(body: TrainingExerciseCreateRequest):
    block = body.block.strip().upper()
    if block not in ("A", "B", "C"):
        raise HTTPException(status_code=400, detail="Blocco deve essere A, B o C")
    exercise_name = body.exercise_name.strip()
    if not exercise_name:
        raise HTTPException(status_code=400, detail="Nome esercizio obbligatorio")
    created = await create_training_exercise(
        {
            "block": block,
            "exercise_name": exercise_name,
            "drill_id": body.drill_id,
            "sets": body.sets,
            "reps": body.reps,
            "rest": body.rest,
            "month_focus": body.month_focus,
        }
    )
    return created


@router.patch("/training/exercises/{exercise_id}")
async def update_training_exercise_endpoint(exercise_id: str, body: TrainingExerciseUpdateRequest):
    fields = body.model_dump(exclude_none=True)
    if "block" in fields:
        fields["block"] = fields["block"].strip().upper()
        if fields["block"] not in ("A", "B", "C"):
            raise HTTPException(status_code=400, detail="Blocco deve essere A, B o C")
    if "exercise_name" in fields:
        fields["exercise_name"] = fields["exercise_name"].strip()
        if not fields["exercise_name"]:
            raise HTTPException(status_code=400, detail="Nome esercizio obbligatorio")
    if not fields:
        raise HTTPException(status_code=400, detail="Nessun campo da aggiornare")
    return await update_training_exercise(exercise_id, fields)


@router.delete("/training/exercises/{exercise_id}")
async def delete_training_exercise_endpoint(exercise_id: str):
    await delete_training_exercise(exercise_id)
    return {"deleted": True}


@router.post("/training/video-links")
async def save_training_video_link(body: VideoLinkRequest):
    await save_video_link(body.exercise_name, body.url, body.title, "mobile_app")
    return {"saved": True}


@router.post("/training/documents")
async def save_training_document_endpoint(
    block: str = Form(...),
    file: UploadFile = File(...),
):
    """Salva documento PDF o CSV per un blocco training (A, B o C)."""
    block = block.strip().upper()
    if block not in ("A", "B", "C"):
        raise HTTPException(status_code=400, detail="Blocco deve essere A, B o C")
    allowed = ("application/pdf", "text/csv", "application/vnd.ms-excel", "text/plain")
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Solo PDF e CSV sono supportati")
    file_bytes = await file.read()
    await save_training_document(block, file.filename or "document", file.content_type, file_bytes)
    return {"saved": True}


@router.get("/training/documents/{block}")
async def get_training_documents(block: str):
    """Restituisce i documenti caricati per un blocco (A, B, C)."""
    b = block.strip().upper()
    if b not in ("A", "B", "C"):
        raise HTTPException(status_code=400, detail="Blocco deve essere A, B o C")
    result = await asyncio.to_thread(
        lambda: supabase.table("training_documents")
            .select("id, block, filename, file_type, created_at")
            .eq("block", b)
            .order("created_at", desc=True)
            .execute()
    )
    return result.data or []
