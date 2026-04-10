from unittest.mock import AsyncMock, patch, MagicMock
import pytest


@pytest.fixture
def mock_anthropic_client():
    with patch("backend.services.habit_extractor.client") as mock:
        yield mock


async def test_extract_habits_returns_log_actions(mock_anthropic_client):
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text='[{"action": "log", "name": "lettura", "value": 30}]')]
    mock_anthropic_client.messages.create = AsyncMock(return_value=mock_response)
    from backend.services.habit_extractor import extract_habits
    result = await extract_habits("ho letto 30 minuti", ["lettura", "alcol"])
    assert result == [{"action": "log", "name": "lettura", "value": 30}]


async def test_extract_habits_returns_create_action(mock_anthropic_client):
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text='[{"action": "create", "name": "meditazione", "habit_type": "habit", "unit": "min", "target": 20}]')]
    mock_anthropic_client.messages.create = AsyncMock(return_value=mock_response)
    from backend.services.habit_extractor import extract_habits
    result = await extract_habits("aggiungi habit meditazione 20 minuti al giorno", [])
    assert result[0]["action"] == "create"
    assert result[0]["name"] == "meditazione"


async def test_extract_habits_uses_known_habits_in_prompt(mock_anthropic_client):
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text='[]')]
    mock_anthropic_client.messages.create = AsyncMock(return_value=mock_response)
    from backend.services.habit_extractor import extract_habits
    await extract_habits("ho bevuto acqua", ["lettura", "alcol", "acqua"])
    call_args = mock_anthropic_client.messages.create.call_args
    prompt_text = call_args.kwargs["messages"][0]["content"]
    assert "lettura" in prompt_text
    assert "acqua" in prompt_text


async def test_extract_habits_returns_empty_on_error(mock_anthropic_client):
    mock_anthropic_client.messages.create = AsyncMock(side_effect=Exception("API error"))
    from backend.services.habit_extractor import extract_habits
    result = await extract_habits("testo qualsiasi", ["lettura"])
    assert result == []


async def test_extract_habits_returns_empty_on_malformed_json(mock_anthropic_client):
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text="non sono json")]
    mock_anthropic_client.messages.create = AsyncMock(return_value=mock_response)
    from backend.services.habit_extractor import extract_habits
    result = await extract_habits("testo qualsiasi", ["lettura"])
    assert result == []
