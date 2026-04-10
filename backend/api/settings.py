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
    return await get_user_settings()
