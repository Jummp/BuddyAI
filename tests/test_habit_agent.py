from unittest.mock import AsyncMock, patch
import pytest

LETTURA_DEF = {"id": "uuid-lettura", "name": "lettura", "habit_type": "habit", "unit": "min", "target": 420}
ALCOL_DEF = {"id": "uuid-alcol", "name": "alcol", "habit_type": "limit", "unit": "unità", "target": 7}


def _log(name_def: dict, value: float) -> dict:
    return {"value": value, "habit_definitions": {k: name_def[k] for k in ("name", "habit_type", "unit", "target")}}


@pytest.fixture(autouse=True)
def mock_supabase():
    with (
        patch("backend.agents.habit.get_habit_definitions", new_callable=AsyncMock) as mock_defs,
        patch("backend.agents.habit.save_habit_definition", new_callable=AsyncMock) as mock_save_def,
        patch("backend.agents.habit.save_habit_log", new_callable=AsyncMock) as mock_save_log,
        patch("backend.agents.habit.get_weekly_habit_logs", new_callable=AsyncMock) as mock_logs,
        patch("backend.agents.habit.extract_habits", new_callable=AsyncMock) as mock_extract,
    ):
        yield {
            "defs": mock_defs,
            "save_def": mock_save_def,
            "save_log": mock_save_log,
            "logs": mock_logs,
            "extract": mock_extract,
        }


async def test_log_single_habit(mock_supabase):
    mock_supabase["defs"].return_value = [LETTURA_DEF]
    mock_supabase["extract"].return_value = [{"action": "log", "name": "lettura", "value": 30}]
    mock_supabase["logs"].return_value = [_log(LETTURA_DEF, 30)]

    from backend.agents.habit import process_habit
    result = await process_habit("ho letto 30 minuti")

    assert "Lettura" in result
    assert "30/420min" in result
    mock_supabase["save_log"].assert_called_once()


async def test_log_multiple_habits(mock_supabase):
    mock_supabase["defs"].return_value = [LETTURA_DEF, ALCOL_DEF]
    mock_supabase["extract"].return_value = [
        {"action": "log", "name": "lettura", "value": 60},
        {"action": "log", "name": "alcol", "value": 2},
    ]
    mock_supabase["logs"].side_effect = [
        [_log(LETTURA_DEF, 60)],
        [_log(LETTURA_DEF, 60), _log(ALCOL_DEF, 2)],
    ]

    from backend.agents.habit import process_habit
    result = await process_habit("ho letto un'ora e bevuto 2 birre")

    assert "Lettura" in result
    assert "Alcol" in result
    assert mock_supabase["save_log"].call_count == 2


async def test_create_habit(mock_supabase):
    mock_supabase["defs"].return_value = []
    mock_supabase["extract"].return_value = [
        {"action": "create", "name": "meditazione", "habit_type": "habit", "unit": "min", "target": 20}
    ]
    mock_supabase["save_def"].return_value = {"id": "uuid-med", "name": "meditazione"}

    from backend.agents.habit import process_habit
    result = await process_habit("aggiungi habit meditazione 20 minuti al giorno")

    assert "Habit creata" in result
    assert "meditazione" in result
    mock_supabase["save_def"].assert_called_once_with(
        name="meditazione", habit_type="habit", unit="min", target=20
    )


async def test_alert_attenzione(mock_supabase):
    mock_supabase["defs"].return_value = [ALCOL_DEF]
    mock_supabase["extract"].return_value = [{"action": "log", "name": "alcol", "value": 5}]
    mock_supabase["logs"].return_value = [_log(ALCOL_DEF, 5)]  # 5/7 = 71% > 70%

    from backend.agents.habit import process_habit
    result = await process_habit("ho bevuto 5 birre")

    assert "ATTENZIONE" in result


async def test_alert_superato(mock_supabase):
    mock_supabase["defs"].return_value = [ALCOL_DEF]
    mock_supabase["extract"].return_value = [{"action": "log", "name": "alcol", "value": 8}]
    mock_supabase["logs"].return_value = [_log(ALCOL_DEF, 8)]  # 8/7 > 100%

    from backend.agents.habit import process_habit
    result = await process_habit("ho bevuto 8 birre")

    assert "SUPERATO" in result


async def test_alert_basso(mock_supabase):
    mock_supabase["defs"].return_value = [LETTURA_DEF]
    mock_supabase["extract"].return_value = [{"action": "log", "name": "lettura", "value": 30}]
    mock_supabase["logs"].return_value = [_log(LETTURA_DEF, 30)]  # 30/420 = 7% < 60%

    from backend.agents.habit import process_habit
    result = await process_habit("ho letto 30 minuti")

    assert "BASSO" in result


async def test_weekly_summary_on_keyword(mock_supabase):
    mock_supabase["defs"].return_value = [LETTURA_DEF]
    mock_supabase["logs"].return_value = [_log(LETTURA_DEF, 300)]

    from backend.agents.habit import process_habit
    result = await process_habit("dimmi il riepilogo della settimana")

    assert "Settimana" in result
    assert "Lettura" in result
    mock_supabase["extract"].assert_not_called()


async def test_weekly_summary_empty(mock_supabase):
    mock_supabase["defs"].return_value = []
    mock_supabase["logs"].return_value = []

    from backend.agents.habit import get_weekly_summary
    result = await get_weekly_summary("2026-03-30")

    assert "Nessun dato" in result
