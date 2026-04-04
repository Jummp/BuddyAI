import io
from openai import AsyncOpenAI
from backend.config import get_settings

openai_client = AsyncOpenAI(api_key=get_settings().openai_api_key)

SUPPORTED_FORMATS = {"mp3", "mp4", "wav", "m4a", "webm", "ogg", "flac"}


async def transcribe(audio_bytes: bytes, filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in SUPPORTED_FORMATS:
        raise ValueError(
            f"Formato audio non supportato: .{ext}. "
            f"Formati accettati: {', '.join(sorted(SUPPORTED_FORMATS))}"
        )
    try:
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = filename
        response = await openai_client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
        )
        return response.text
    except Exception as e:
        raise RuntimeError(f"Trascrizione fallita: {e}") from e
