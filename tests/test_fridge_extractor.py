from unittest.mock import AsyncMock, MagicMock, patch
import pytest


@pytest.fixture
def mock_client():
    with patch("backend.services.fridge_extractor.client") as mock:
        yield mock


async def test_extract_add_items(mock_client):
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text='[{"action": "add", "name": "pollo", "quantity": 500, "unit": "g"}]')]
    mock_client.messages.create = AsyncMock(return_value=mock_response)

    from backend.services.fridge_extractor import extract_fridge_items
    result = await extract_fridge_items("ho comprato 500g di pollo")

    assert len(result) == 1
    assert result[0]["action"] == "add"
    assert result[0]["name"] == "pollo"
    assert result[0]["quantity"] == 500


async def test_extract_multiple_items(mock_client):
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text=(
        '[{"action": "add", "name": "latte", "quantity": 1, "unit": "L"},'
        ' {"action": "add", "name": "uova", "quantity": 6, "unit": "unità"}]'
    ))]
    mock_client.messages.create = AsyncMock(return_value=mock_response)

    from backend.services.fridge_extractor import extract_fridge_items
    result = await extract_fridge_items("ho latte e 6 uova")

    assert len(result) == 2


async def test_extract_remove_item(mock_client):
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text='[{"action": "remove", "name": "pollo"}]')]
    mock_client.messages.create = AsyncMock(return_value=mock_response)

    from backend.services.fridge_extractor import extract_fridge_items
    result = await extract_fridge_items("ho finito il pollo")

    assert result[0]["action"] == "remove"
    assert result[0]["name"] == "pollo"


async def test_extract_returns_empty_on_error(mock_client):
    mock_client.messages.create = AsyncMock(side_effect=Exception("API error"))

    from backend.services.fridge_extractor import extract_fridge_items
    result = await extract_fridge_items("testo qualsiasi")

    assert result == []


async def test_extract_returns_empty_on_malformed_json(mock_client):
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text="non sono json")]
    mock_client.messages.create = AsyncMock(return_value=mock_response)

    from backend.services.fridge_extractor import extract_fridge_items
    result = await extract_fridge_items("testo qualsiasi")

    assert result == []
