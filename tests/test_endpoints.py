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


async def test_chat_mobile_returns_json():
    async def mock_process(text):
        yield 'data: {"type": "token", "content": "Ciao"}\n\n'
        yield 'data: {"type": "token", "content": " Jump"}\n\n'
        yield 'data: {"type": "done", "memory_saved": true}\n\n'

    from backend.main import app
    with patch("backend.main.orchestrate", side_effect=mock_process):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/chat/mobile", json={"text": "ciao buddy"})
    assert response.status_code == 200
    assert response.json() == {"content": "Ciao Jump", "memory_saved": True}


async def test_chat_mobile_reuses_cached_response_for_same_client_message_id():
    mock_process = AsyncMock()

    from backend.main import app
    with patch("backend.main.orchestrate", mock_process):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            from backend.main import _cache_mobile_response
            _cache_mobile_response("msg-1", {"content": "cached", "memory_saved": True})
            response = await client.post("/chat/mobile", json={"text": "ciao buddy", "client_message_id": "msg-1"})
    assert response.status_code == 200
    assert response.json() == {"content": "cached", "memory_saved": True}
    mock_process.assert_not_called()


async def test_training_exercise_crud_endpoints():
    from backend.main import app
    with (
        patch("backend.api.push.create_training_exercise", new_callable=AsyncMock) as mock_create,
        patch("backend.api.push.update_training_exercise", new_callable=AsyncMock) as mock_update,
        patch("backend.api.push.delete_training_exercise", new_callable=AsyncMock) as mock_delete,
    ):
        mock_create.return_value = {"id": "ex-1", "block": "A", "exercise_name": "Squat"}
        mock_update.return_value = {"id": "ex-1", "block": "B", "exercise_name": "Front Squat"}
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            create_response = await client.post("/training/exercises", json={"block": "a", "exercise_name": "Squat"})
            update_response = await client.patch("/training/exercises/ex-1", json={"block": "b", "exercise_name": "Front Squat"})
            delete_response = await client.delete("/training/exercises/ex-1")
    assert create_response.status_code == 200
    assert create_response.json()["block"] == "A"
    assert update_response.status_code == 200
    assert update_response.json()["exercise_name"] == "Front Squat"
    assert delete_response.status_code == 200
    assert delete_response.json() == {"deleted": True}


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
    with patch("backend.api.memories.get_memories", new_callable=AsyncMock) as mock_m:
        mock_m.return_value = [{"id": "abc", "summary": "test"}]
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/memories?limit=10&offset=0")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
