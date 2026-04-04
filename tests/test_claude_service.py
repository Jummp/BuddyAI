from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from backend.models import IntentResult

async def test_classify_intent_returns_intent_result():
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text='{"intent": ["log_memory", "log_nutrition"], "tone": "neutral"}')]

    with patch("backend.services.claude.client") as mock_client:
        mock_client.messages.create = AsyncMock(return_value=mock_response)
        from backend.services.claude import classify_intent
        result = await classify_intent("ho mangiato la pasta")

    assert isinstance(result, IntentResult)
    assert "log_memory" in result.intent
    assert "log_nutrition" in result.intent
    assert result.tone == "neutral"

async def test_classify_intent_invalid_json_raises():
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text="questo non è json")]

    with patch("backend.services.claude.client") as mock_client:
        mock_client.messages.create = AsyncMock(return_value=mock_response)
        from backend.services.claude import classify_intent
        with pytest.raises(ValueError, match="Intent classification fallita"):
            await classify_intent("testo qualsiasi")

async def test_summarize_and_extract_returns_tuple():
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text='{"summary": "Ho mangiato pasta.", "entities": {"events": ["ho mangiato"], "people": [], "emotions": [], "topics": ["cibo"]}}')]

    with patch("backend.services.claude.client") as mock_client:
        mock_client.messages.create = AsyncMock(return_value=mock_response)
        from backend.services.claude import summarize_and_extract
        summary, entities = await summarize_and_extract("oggi ho mangiato la pasta")

    assert summary == "Ho mangiato pasta."
    assert "cibo" in entities["topics"]
