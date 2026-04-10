from unittest.mock import AsyncMock, patch, MagicMock
import pytest


@pytest.fixture(autouse=True)
def mock_get_push_token():
    with patch("backend.services.push.get_push_token", new_callable=AsyncMock) as mock:
        yield mock


async def test_send_push_posts_to_expo(mock_get_push_token):
    mock_get_push_token.return_value = "ExponentPushToken[test123]"

    with patch("backend.services.push.httpx.AsyncClient") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock()
        mock_client_cls.return_value = mock_client

        from backend.services.push import send_push
        await send_push(title="BuddyAI", body="Test", data={"type": "checkin"})

    mock_client.post.assert_called_once()
    call_kwargs = mock_client.post.call_args
    payload = call_kwargs.kwargs["json"]
    assert payload["to"] == "ExponentPushToken[test123]"
    assert payload["body"] == "Test"
    assert payload["data"] == {"type": "checkin"}


async def test_send_push_noop_when_no_token(mock_get_push_token):
    mock_get_push_token.return_value = None

    with patch("backend.services.push.httpx.AsyncClient") as mock_client_cls:
        from backend.services.push import send_push
        await send_push(title="BuddyAI", body="Test")

    mock_client_cls.assert_not_called()


async def test_send_push_without_data(mock_get_push_token):
    mock_get_push_token.return_value = "ExponentPushToken[abc]"

    with patch("backend.services.push.httpx.AsyncClient") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock()
        mock_client_cls.return_value = mock_client

        from backend.services.push import send_push
        await send_push(title="BuddyAI", body="Ciao")

    payload = mock_client.post.call_args.kwargs["json"]
    assert "data" not in payload
