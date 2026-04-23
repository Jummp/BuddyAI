import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.services.supabase import (
    get_habit_definitions,
    save_habit_definition,
    update_habit_definition,
    delete_habit_definition,
    get_weekly_habit_logs,
    save_habit_log,
)

router = APIRouter(prefix="/habits", tags=["habits"])


class HabitCreateRequest(BaseModel):
    name: str
    habit_type: str = "habit"
    unit: str = ""
    target: float = 0


class HabitUpdateRequest(BaseModel):
    name: str | None = None
    habit_type: str | None = None
    unit: str | None = None
    target: float | None = None
    reminder_time: str | None = None  # "HH:MM" or null


@router.get("")
async def list_habits():
    """Lista habit definitions con totali settimana corrente."""
    today = datetime.date.today()
    week_start = (today - datetime.timedelta(days=today.weekday())).isoformat()

    definitions = await get_habit_definitions()
    logs = await get_weekly_habit_logs(week_start)

    totals: dict[str, float] = {}
    for log in logs:
        name = log.get("habit_definitions", {}).get("name", "")
        totals[name] = totals.get(name, 0) + log.get("value", 0)

    result = []
    for hd in definitions:
        result.append({**hd, "weekly_total": totals.get(hd["name"], 0)})
    return result


@router.post("", status_code=201)
async def create_habit(request: HabitCreateRequest):
    if request.habit_type not in ("habit", "limit"):
        raise HTTPException(status_code=400, detail="habit_type deve essere habit o limit")
    return await save_habit_definition(
        name=request.name,
        habit_type=request.habit_type,
        unit=request.unit,
        target=request.target,
    )


@router.patch("/{habit_id}")
async def update_habit(habit_id: str, request: HabitUpdateRequest):
    fields = {k: v for k, v in request.model_dump().items() if v is not None}
    if fields.get("habit_type") not in (None, "habit", "limit"):
        raise HTTPException(status_code=400, detail="habit_type deve essere habit o limit")
    if not fields:
        raise HTTPException(status_code=400, detail="Nessun campo da aggiornare")
    return await update_habit_definition(habit_id, fields)


@router.delete("/{habit_id}", status_code=204)
async def delete_habit(habit_id: str):
    await delete_habit_definition(habit_id)


class HabitLogRequest(BaseModel):
    value: float
    date: str | None = None


@router.post("/{habit_id}/log")
async def log_habit(habit_id: str, request: HabitLogRequest):
    today = request.date or datetime.date.today().isoformat()
    await save_habit_log(habit_id, today, request.value, "manual")
    week_start = (datetime.date.today() - datetime.timedelta(days=datetime.date.today().weekday())).isoformat()
    logs = await get_weekly_habit_logs(week_start)
    definitions = await get_habit_definitions()
    hd = next((d for d in definitions if d["id"] == habit_id), None)
    if not hd:
        raise HTTPException(status_code=404, detail="Habit non trovata")
    weekly_total = sum(l["value"] for l in logs if l.get("habit_definitions", {}).get("name") == hd["name"])
    return {**hd, "weekly_total": weekly_total}
