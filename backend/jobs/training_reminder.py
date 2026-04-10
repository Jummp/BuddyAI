import asyncio
from backend.services.push import send_push
from backend.services.supabase import get_training_log_today

_FIRST_BODY = "Oggi tocca allenarsi! Apri BuddyAI per vedere il tuo blocco."
_SECOND_BODY = "Non hai ancora fatto l'allenamento. Dai, ce la fai!"


async def run() -> None:
    """Invia primo reminder allenamento, poi schedula re-check adattivo."""
    await send_push(
        title="BuddyAI — Allenamento",
        body=_FIRST_BODY,
        data={"type": "training"},
    )
    # Re-check adattivo dopo 4 ore (non bloccante)
    asyncio.create_task(_schedule_recheck())


async def _schedule_recheck() -> None:
    from backend.config import get_settings
    settings = get_settings()
    hours = getattr(settings, "training_reminder_hours", 4)
    await asyncio.sleep(hours * 3600)
    await adaptive_recheck()


async def adaptive_recheck() -> None:
    """Invia secondo reminder solo se allenamento non ancora completato."""
    completed = await get_training_log_today()
    if not completed:
        await send_push(
            title="BuddyAI — Allenamento",
            body=_SECOND_BODY,
            data={"type": "training"},
        )
