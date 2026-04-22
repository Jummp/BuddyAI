from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/internal/trigger", tags=["triggers"])


@router.post("/morning-checkin")
async def trigger_morning_checkin():
    from backend.jobs.morning_checkin import run
    await run()
    return {"triggered": "morning_checkin"}


@router.post("/training-reminder")
async def trigger_training_reminder():
    from backend.jobs.training_reminder import run
    await run()
    return {"triggered": "training_reminder"}


@router.post("/habit-reminder")
async def trigger_habit_reminder():
    from backend.jobs.habit_reminder import run
    await run()
    return {"triggered": "habit_reminder"}
