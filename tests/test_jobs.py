from unittest.mock import AsyncMock, patch
import pytest


@pytest.fixture(autouse=True)
def mock_send_push():
    with patch("backend.services.push.send_push", new_callable=AsyncMock) as mock:
        yield mock


# ── Morning check-in ─────────────────────────────────────────────────────────

async def test_morning_checkin_sends_push(mock_send_push):
    with patch("backend.jobs.morning_checkin.send_push", new_callable=AsyncMock) as mock_push:
        from backend.jobs.morning_checkin import run
        await run()

    mock_push.assert_called_once()
    call_kwargs = mock_push.call_args.kwargs
    assert call_kwargs["data"]["type"] == "checkin"
    assert call_kwargs["title"] == "BuddyAI"


# ── Training reminder ─────────────────────────────────────────────────────────

async def test_training_reminder_sends_push():
    def consume_coro(coro):
        coro.close()

    with (
        patch("backend.jobs.training_reminder.send_push", new_callable=AsyncMock) as mock_push,
        patch("backend.jobs.training_reminder.asyncio.create_task", side_effect=consume_coro),
    ):
        from backend.jobs.training_reminder import run
        await run()

    mock_push.assert_called_once()
    assert mock_push.call_args.kwargs["data"]["type"] == "training"


async def test_adaptive_recheck_sends_if_not_completed():
    with (
        patch("backend.jobs.training_reminder.get_training_log_today", new_callable=AsyncMock, return_value=False) as mock_log,
        patch("backend.jobs.training_reminder.send_push", new_callable=AsyncMock) as mock_push,
    ):
        from backend.jobs.training_reminder import adaptive_recheck
        await adaptive_recheck()

    mock_push.assert_called_once()
    assert "Non hai ancora" in mock_push.call_args.kwargs["body"]


async def test_adaptive_recheck_skips_if_completed():
    with (
        patch("backend.jobs.training_reminder.get_training_log_today", new_callable=AsyncMock, return_value=True),
        patch("backend.jobs.training_reminder.send_push", new_callable=AsyncMock) as mock_push,
    ):
        from backend.jobs.training_reminder import adaptive_recheck
        await adaptive_recheck()

    mock_push.assert_not_called()


# ── Habit reminder ────────────────────────────────────────────────────────────

async def test_habit_reminder_sends_for_matching_time():
    import datetime
    now_str = datetime.datetime.now().strftime("%H:%M")

    habits = [
        {"name": "lettura", "reminder_time": now_str, "habit_type": "habit"},
        {"name": "acqua", "reminder_time": None, "habit_type": "habit"},
    ]

    with (
        patch("backend.jobs.habit_reminder.get_habit_definitions", new_callable=AsyncMock, return_value=habits),
        patch("backend.jobs.habit_reminder.send_push", new_callable=AsyncMock) as mock_push,
    ):
        from backend.jobs.habit_reminder import run
        await run()

    mock_push.assert_called_once()
    assert mock_push.call_args.kwargs["data"]["habit_name"] == "lettura"


async def test_habit_reminder_skips_no_reminder():
    habits = [
        {"name": "lettura", "reminder_time": None, "habit_type": "habit"},
    ]

    with (
        patch("backend.jobs.habit_reminder.get_habit_definitions", new_callable=AsyncMock, return_value=habits),
        patch("backend.jobs.habit_reminder.send_push", new_callable=AsyncMock) as mock_push,
    ):
        from backend.jobs.habit_reminder import run
        await run()

    mock_push.assert_not_called()
