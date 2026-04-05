import datetime
from unittest.mock import AsyncMock, patch
import pytest


# --- select_block tests (pure function) ---

def test_select_block_explicit_a():
    from backend.agents.coaching import select_block
    assert select_block("facciamo blocco A oggi", 1) == "A"


def test_select_block_explicit_b():
    from backend.agents.coaching import select_block
    assert select_block("voglio fare block B", 2) == "B"


def test_select_block_explicit_c():
    from backend.agents.coaching import select_block
    assert select_block("blocco C per favore", 3) == "C"


def test_select_block_case_insensitive():
    from backend.agents.coaching import select_block
    assert select_block("BLOCCO A", 1) == "A"


def test_select_block_monday_returns_a(monkeypatch):
    from backend.agents.coaching import select_block
    # Monday = weekday 0 → April 6, 2026
    monkeypatch.setattr(
        "backend.agents.coaching.datetime",
        type("dt", (), {"date": type("d", (), {"today": staticmethod(lambda: datetime.date(2026, 4, 6))})})()
    )
    assert select_block("voglio allenarmi", 1) == "A"


def test_select_block_tuesday_returns_b(monkeypatch):
    from backend.agents.coaching import select_block
    # Tuesday = weekday 1 → April 7, 2026
    monkeypatch.setattr(
        "backend.agents.coaching.datetime",
        type("dt", (), {"date": type("d", (), {"today": staticmethod(lambda: datetime.date(2026, 4, 7))})})()
    )
    assert select_block("voglio allenarmi", 1) == "B"


def test_select_block_sunday_returns_c(monkeypatch):
    from backend.agents.coaching import select_block
    # Sunday = weekday 6 → April 12, 2026
    monkeypatch.setattr(
        "backend.agents.coaching.datetime",
        type("dt", (), {"date": type("d", (), {"today": staticmethod(lambda: datetime.date(2026, 4, 12))})})()
    )
    assert select_block("cosa faccio oggi?", 1) == "C"


# --- build_training_context tests (mocked Supabase + YouTube) ---

@pytest.fixture
def mock_supabase_coaching():
    with patch("backend.agents.coaching.get_block_exercises") as mock_ex, \
         patch("backend.agents.coaching.get_video_link") as mock_vl, \
         patch("backend.agents.coaching.save_video_link") as mock_sv, \
         patch("backend.agents.coaching.search_video") as mock_yt:
        mock_ex.return_value = [
            {"block": "A", "drill_id": "1.a", "exercise_name": "Romanian Deadlift KB", "sets": "4", "reps": "8", "rest": "/"},
        ]
        mock_vl.return_value = {"url": "https://www.youtube.com/watch?v=abc", "title": "KB RDL Tutorial"}
        mock_sv.return_value = None
        mock_yt.return_value = None
        yield mock_ex, mock_vl, mock_sv, mock_yt


async def test_build_training_context_includes_block_name(mock_supabase_coaching):
    mock_ex, mock_vl, mock_sv, mock_yt = mock_supabase_coaching
    mock_vl.return_value = None
    mock_yt.return_value = None
    from backend.agents.coaching import build_training_context
    result = await build_training_context("A")
    assert "BLOCCO A" in result
    assert "Posterior Chain" in result


async def test_build_training_context_includes_exercise(mock_supabase_coaching):
    from backend.agents.coaching import build_training_context
    result = await build_training_context("A")
    assert "Romanian Deadlift KB" in result


async def test_build_training_context_uses_cached_video(mock_supabase_coaching):
    mock_ex, mock_vl, mock_sv, mock_yt = mock_supabase_coaching
    from backend.agents.coaching import build_training_context
    result = await build_training_context("A")
    assert "https://www.youtube.com/watch?v=abc" in result
    mock_yt.assert_not_called()  # YouTube API not called if DB has link


async def test_build_training_context_calls_youtube_when_no_cache(mock_supabase_coaching):
    mock_ex, mock_vl, mock_sv, mock_yt = mock_supabase_coaching
    mock_vl.return_value = None  # No cached link
    mock_yt.return_value = {"url": "https://www.youtube.com/watch?v=xyz", "title": "RDL Video"}
    from backend.agents.coaching import build_training_context
    result = await build_training_context("A")
    assert "https://www.youtube.com/watch?v=xyz" in result
    mock_yt.assert_called_once_with("Romanian Deadlift KB")
    mock_sv.assert_called_once()  # Saved to DB after YouTube lookup


async def test_build_training_context_no_video_shows_fallback(mock_supabase_coaching):
    mock_ex, mock_vl, mock_sv, mock_yt = mock_supabase_coaching
    mock_vl.return_value = None
    mock_yt.return_value = None
    from backend.agents.coaching import build_training_context
    result = await build_training_context("A")
    assert "nessun video disponibile" in result


async def test_build_training_context_empty_block(mock_supabase_coaching):
    mock_ex, mock_vl, mock_sv, mock_yt = mock_supabase_coaching
    mock_ex.return_value = []
    from backend.agents.coaching import build_training_context
    result = await build_training_context("A")
    assert "Nessun esercizio" in result
