from unittest.mock import MagicMock, patch
import pytest

@pytest.fixture
def mock_supabase():
    with patch("backend.services.supabase.supabase") as mock:
        yield mock

async def test_save_memory_calls_insert(mock_supabase):
    mock_supabase.table.return_value.insert.return_value.execute = MagicMock()
    from backend.services.supabase import save_memory
    await save_memory("testo grezzo", "summary", {"events": ["ho mangiato"]})
    mock_supabase.table.assert_called_with("memories")

async def test_get_memories_returns_list(mock_supabase):
    mock_supabase.table.return_value.select.return_value.order.return_value.range.return_value.execute.return_value.data = [
        {"id": "abc", "raw_text": "test", "summary": "s", "entities": {}, "date": "2026-04-04T10:00:00Z", "created_at": "2026-04-04T10:00:00Z"}
    ]
    from backend.services.supabase import get_memories
    result = await get_memories(limit=20, offset=0)
    assert isinstance(result, list)
    assert len(result) == 1

async def test_get_today_session_returns_none_when_empty(mock_supabase):
    mock_supabase.table.return_value.select.return_value.gte.return_value.order.return_value.limit.return_value.execute.return_value.data = []
    from backend.services.supabase import get_today_session
    result = await get_today_session()
    assert result is None

async def test_upsert_session_inserts_when_no_session_id(mock_supabase):
    mock_supabase.table.return_value.insert.return_value.execute.return_value.data = [
        {"id": "new-session-uuid"}
    ]
    from backend.services.supabase import upsert_session
    result = await upsert_session(None, [{"role": "user", "content": "ciao"}])
    assert result == "new-session-uuid"
    mock_supabase.table.return_value.insert.assert_called_once()

async def test_upsert_session_updates_when_session_id_exists(mock_supabase):
    mock_supabase.table.return_value.update.return_value.eq.return_value.execute = MagicMock()
    from backend.services.supabase import upsert_session
    result = await upsert_session("existing-id", [{"role": "user", "content": "ciao"}])
    assert result == "existing-id"
    mock_supabase.table.return_value.update.assert_called_once()


async def test_get_block_exercises_returns_list(mock_supabase):
    mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = [
        {"id": "uuid-1", "block": "A", "drill_id": "1.a", "exercise_name": "Romanian Deadlift KB", "sets": "4", "reps": "8", "rest": "/", "month_focus": None}
    ]
    from backend.services.supabase import get_block_exercises
    result = await get_block_exercises("A")
    assert isinstance(result, list)
    assert result[0]["exercise_name"] == "Romanian Deadlift KB"
    mock_supabase.table.assert_called_with("training_exercises")


async def test_get_video_link_returns_none_when_missing(mock_supabase):
    mock_supabase.table.return_value.select.return_value.ilike.return_value.limit.return_value.execute.return_value.data = []
    from backend.services.supabase import get_video_link
    result = await get_video_link("Romanian Deadlift KB")
    assert result is None


async def test_get_video_link_returns_dict_when_found(mock_supabase):
    mock_supabase.table.return_value.select.return_value.ilike.return_value.limit.return_value.execute.return_value.data = [
        {"exercise_name": "Romanian Deadlift KB", "url": "https://youtube.com/watch?v=abc", "title": "KB RDL Tutorial"}
    ]
    from backend.services.supabase import get_video_link
    result = await get_video_link("Romanian Deadlift KB")
    assert result == {"url": "https://youtube.com/watch?v=abc", "title": "KB RDL Tutorial"}


async def test_save_video_link_calls_upsert(mock_supabase):
    mock_supabase.table.return_value.upsert.return_value.execute = MagicMock()
    from backend.services.supabase import save_video_link
    await save_video_link("Romanian Deadlift KB", "https://youtube.com/watch?v=abc", "KB RDL Tutorial", "youtube")
    mock_supabase.table.assert_called_with("training_links")
    mock_supabase.table.return_value.upsert.assert_called_once()


async def test_save_nutrition_log_calls_insert(mock_supabase):
    mock_supabase.table.return_value.insert.return_value.execute = MagicMock()
    from backend.services.supabase import save_nutrition_log
    await save_nutrition_log("2026-04-05", "pollo e riso", {"calories_kcal": 480})
    mock_supabase.table.assert_called_with("nutrition_logs")
    mock_supabase.table.return_value.insert.assert_called_once()


async def test_get_weekly_nutrition_returns_list(mock_supabase):
    mock_supabase.table.return_value.select.return_value.gte.return_value.lte.return_value.order.return_value.execute.return_value.data = [
        {"id": "uuid-1", "date": "2026-04-05", "meal_description": "pollo", "nutrients": {"calories_kcal": 480}}
    ]
    from backend.services.supabase import get_weekly_nutrition
    result = await get_weekly_nutrition("2026-03-30")
    assert isinstance(result, list)
    assert result[0]["date"] == "2026-04-05"


async def test_get_nutrition_plan_returns_none_when_empty(mock_supabase):
    mock_supabase.table.return_value.select.return_value.order.return_value.limit.return_value.execute.return_value.data = []
    from backend.services.supabase import get_nutrition_plan
    result = await get_nutrition_plan()
    assert result is None


async def test_save_nutrition_plan_calls_upsert(mock_supabase):
    mock_supabase.table.return_value.delete.return_value.neq.return_value.execute = MagicMock()
    mock_supabase.table.return_value.upsert.return_value.execute = MagicMock()
    from backend.services.supabase import save_nutrition_plan
    await save_nutrition_plan(
        diet_type="vegetarian",
        allergies=["latticini"],
        targets={"calories_kcal": 2200, "iron_mg": 18},
        foods={"iron": [{"food": "spinaci", "qty": "200g"}]},
        notes="test",
        source="generated",
    )
    mock_supabase.table.return_value.upsert.assert_called_once()
    mock_supabase.table.return_value.delete.assert_called_once()


async def test_upsert_nutrition_targets_merges_targets(mock_supabase):
    # Simulate existing plan with some targets
    mock_supabase.table.return_value.select.return_value.order.return_value.limit.return_value.execute.return_value.data = [
        {"id": "plan-uuid", "targets": {"calories_kcal": 2000, "protein_g": 100}}
    ]
    mock_supabase.table.return_value.update.return_value.eq.return_value.execute = MagicMock()
    from backend.services.supabase import upsert_nutrition_targets
    await upsert_nutrition_targets({"iron_mg": 18, "protein_g": 150})
    mock_supabase.table.return_value.update.assert_called_once()


async def test_get_habit_definitions_returns_list(mock_supabase):
    mock_supabase.table.return_value.select.return_value.order.return_value.execute.return_value.data = [
        {"id": "def-uuid", "name": "lettura", "habit_type": "habit", "unit": "min", "target": 420.0}
    ]
    from backend.services.supabase import get_habit_definitions
    result = await get_habit_definitions()
    assert isinstance(result, list)
    assert result[0]["name"] == "lettura"


async def test_save_habit_definition_calls_insert(mock_supabase):
    mock_supabase.table.return_value.insert.return_value.execute.return_value.data = [
        {"id": "new-uuid", "name": "meditazione", "habit_type": "habit", "unit": "min", "target": 140.0}
    ]
    from backend.services.supabase import save_habit_definition
    result = await save_habit_definition("meditazione", "habit", "min", 140.0)
    mock_supabase.table.assert_called_with("habit_definitions")
    mock_supabase.table.return_value.insert.assert_called_once()
    assert result["id"] == "new-uuid"


async def test_save_habit_log_calls_insert(mock_supabase):
    mock_supabase.table.return_value.insert.return_value.execute = MagicMock()
    from backend.services.supabase import save_habit_log
    await save_habit_log("def-uuid", "2026-04-05", 30.0, "ho letto mezz'ora")
    mock_supabase.table.assert_called_with("habit_logs")
    mock_supabase.table.return_value.insert.assert_called_once()


async def test_get_weekly_habit_logs_returns_list(mock_supabase):
    mock_supabase.table.return_value.select.return_value.gte.return_value.lte.return_value.order.return_value.execute.return_value.data = [
        {
            "id": "log-uuid", "habit_id": "def-uuid", "date": "2026-04-05",
            "value": 30.0, "description": "ho letto",
            "habit_definitions": {"name": "lettura", "habit_type": "habit", "unit": "min", "target": 420.0}
        }
    ]
    from backend.services.supabase import get_weekly_habit_logs
    result = await get_weekly_habit_logs("2026-03-31")
    assert isinstance(result, list)
    assert result[0]["habit_definitions"]["name"] == "lettura"
