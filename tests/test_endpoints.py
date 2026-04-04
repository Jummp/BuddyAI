import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch, MagicMock


async def test_health():
    from backend.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


async def test_chat_streams_tokens():
    async def mock_process(text):
        yield 'data: {"type": "token", "content": "Ciao"}\n\n'
        yield 'data: {"type": "done", "memory_saved": true}\n\n'

    from backend.main import app
    with patch("backend.main.orchestrate", side_effect=mock_process):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/chat", json={"text": "ciao buddy"})
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]


async def test_chat_empty_text_returns_422():
    from backend.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/chat", json={"text": ""})
    assert response.status_code == 422


async def test_voice_unsupported_format_returns_400():
    from backend.main import app
    with patch("backend.main.transcribe", new_callable=AsyncMock) as mock_t:
        mock_t.side_effect = ValueError("Formato audio non supportato: .xyz")
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/voice",
                files={"audio": ("test.xyz", b"fake", "audio/xyz")}
            )
    assert response.status_code == 400
    assert "Formato audio non supportato" in response.json()["detail"]


async def test_memories_returns_list():
    from backend.main import app
    with patch("backend.main.get_memories", new_callable=AsyncMock) as mock_m:
        mock_m.return_value = [{"id": "abc", "summary": "test"}]
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/memories?limit=10&offset=0")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
