import datetime
from fastapi import APIRouter, Query
from backend.services.supabase import get_token_stats

router = APIRouter(prefix="/tokens", tags=["tokens"])


@router.get("/stats")
async def token_stats(
    date_from: str = Query(default=None),
    date_to: str = Query(default=None),
):
    if date_from is None:
        date_from = datetime.date.today().isoformat()
    if date_to is None:
        date_to = date_from
    return await get_token_stats(date_from, date_to)
