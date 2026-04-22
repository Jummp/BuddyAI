from apscheduler.schedulers.asyncio import AsyncIOScheduler
from backend.config import get_settings

_scheduler: AsyncIOScheduler | None = None


def get_scheduler() -> AsyncIOScheduler | None:
    return _scheduler


def setup_scheduler() -> AsyncIOScheduler:
    """Configura e restituisce lo scheduler con tutti i job registrati."""
    from backend.jobs import morning_checkin, training_reminder, habit_reminder  # noqa: PLC0415

    settings = get_settings()

    checkin_hour, checkin_minute = _parse_time(
        getattr(settings, "checkin_time", "08:00")
    )
    training_hour, training_minute = _parse_time(
        getattr(settings, "training_reminder_time", "09:00")
    )

    global _scheduler
    scheduler = AsyncIOScheduler()
    _scheduler = scheduler
    scheduler.add_job(
        morning_checkin.run,
        "cron",
        hour=checkin_hour,
        minute=checkin_minute,
        id="morning_checkin",
    )
    scheduler.add_job(
        training_reminder.run,
        "cron",
        hour=training_hour,
        minute=training_minute,
        id="training_reminder",
    )
    scheduler.add_job(
        habit_reminder.run,
        "cron",
        minute="*",
        id="habit_reminder",
    )
    return scheduler


def _parse_time(time_str: str) -> tuple[int, int]:
    """Parsa 'HH:MM' in (hour, minute)."""
    parts = time_str.split(":")
    return int(parts[0]), int(parts[1])
