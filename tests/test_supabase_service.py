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
