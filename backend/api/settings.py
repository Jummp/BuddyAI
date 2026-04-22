from fastapi import APIRouter
from pydantic import BaseModel
from backend.services.supabase import get_user_settings, save_user_settings

router = APIRouter(prefix="/settings", tags=["settings"])


class UserSettingsIn(BaseModel):
    checkin_time: str = "08:00"
    training_reminder_time: str = "09:00"


@router.get("")
@router.get("/")
async def get_settings():
    return await get_user_settings()


@router.put("")
@router.put("/")
async def update_settings(body: UserSettingsIn):
    await save_user_settings(
        checkin_time=body.checkin_time,
        training_reminder_time=body.training_reminder_time,
    )
    _reschedule_jobs(body.checkin_time, body.training_reminder_time)
    return await get_user_settings()


def _reschedule_jobs(checkin_time: str, training_time: str) -> None:
    try:
        from backend.services.scheduler import get_scheduler
        scheduler = get_scheduler()
        if scheduler is None:
            return
        ch, cm = _parse_time(checkin_time)
        th, tm = _parse_time(training_time)
        scheduler.reschedule_job("morning_checkin", trigger="cron", hour=ch, minute=cm)
        scheduler.reschedule_job("training_reminder", trigger="cron", hour=th, minute=tm)
    except Exception:
        pass


def _parse_time(t: str) -> tuple[int, int]:
    parts = t.split(":")
    return int(parts[0]), int(parts[1])
