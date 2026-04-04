from unittest.mock import AsyncMock, MagicMock, patch
import pytest

async def test_transcribe_unsupported_format_raises():
    from backend.services.whisper import transcribe
    with pytest.raises(ValueError, match="Formato audio non supportato"):
        await transcribe(b"fake", "audio.xyz")

async def test_transcribe_success():
    mock_response = MagicMock()
    mock_response.text = "Oggi ho mangiato la pasta"

    with patch("backend.services.whisper.openai_client") as mock_client:
        mock_client.audio.transcriptions.create = AsyncMock(return_value=mock_response)
        from backend.services.whisper import transcribe
        result = await transcribe(b"fake audio bytes", "test.mp3")

    assert result == "Oggi ho mangiato la pasta"

async def test_transcribe_empty_audio_raises():
    with patch("backend.services.whisper.openai_client") as mock_client:
        mock_client.audio.transcriptions.create = AsyncMock(
            side_effect=Exception("Audio troppo corto")
        )
        from backend.services.whisper import transcribe
        with pytest.raises(RuntimeError, match="Trascrizione fallita"):
            await transcribe(b"", "test.mp3")
