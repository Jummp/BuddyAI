import io
from functools import lru_cache
from openai import AsyncOpenAI
from backend.config import get_settings

SUPPORTED_FORMATS = {"mp3", "mp4", "wav", "m4a", "webm", "ogg", "flac"}


def _require_openai_api_key() -> str:
    api_key = get_settings().openai_api_key
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY non configurata")
    return api_key


@lru_cache(maxsize=1)
def get_openai_client() -> AsyncOpenAI:
    return AsyncOpenAI(api_key=_require_openai_api_key())


class _OpenAIProxy:
    def __getattr__(self, name: str):
        return getattr(get_openai_client(), name)


openai_client = _OpenAIProxy()


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
