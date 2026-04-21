from contextlib import asynccontextmanager
import base64
import json
from fastapi import FastAPI, UploadFile, File, HTTPException, Request, Form
from fastapi.responses import StreamingResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import field_validator
from backend.models import ChatRequest
from backend.orchestrator import process as orchestrate
from backend.config import missing_required_settings
from backend.services.whisper import transcribe
from backend.services.scheduler import setup_scheduler
from backend.api.push import router as push_router
from backend.api.habits import router as habits_router
from backend.api.nutrition import router as nutrition_router
from backend.api.memories import router as memories_router
from backend.api.settings import router as settings_router
from backend.api.tokens import router as tokens_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = setup_scheduler()
    scheduler.start()
    yield
    scheduler.shutdown()


app = FastAPI(title="BuddyOS Core Engine", version="0.2.0", lifespan=lifespan)

# CORS — deve essere aggiunto PRIMA dei router
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(push_router)
app.include_router(habits_router)
app.include_router(nutrition_router)
app.include_router(memories_router)
app.include_router(settings_router)
app.include_router(tokens_router)

_MOBILE_RESPONSE_CACHE: dict[str, tuple[float, dict]] = {}


def _cache_mobile_response(message_id: str, payload: dict) -> None:
    now = __import__("time").time()
    expired = [key for key, (ts, _) in _MOBILE_RESPONSE_CACHE.items() if now - ts > 300]
    for key in expired:
        _MOBILE_RESPONSE_CACHE.pop(key, None)
    _MOBILE_RESPONSE_CACHE[message_id] = (now, payload)


class ChatRequestValidated(ChatRequest):
    @field_validator("text")
    @classmethod
    def text_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Il testo non può essere vuoto")
        return v.strip()


@app.get("/health")
async def health():
    missing = missing_required_settings()
    return {
        "status": "ok" if not missing else "degraded",
        "version": "0.2.0",
        "missing_settings": missing,
    }


@app.options("/{rest_of_path:path}")
async def preflight(rest_of_path: str):
    return Response(
        status_code=200,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        },
    )


@app.post("/chat")
async def chat(request: ChatRequestValidated):
    return StreamingResponse(
        orchestrate(request.text),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        },
    )


@app.post("/chat/mobile")
async def chat_mobile(request: ChatRequestValidated):
    """Versione non-streaming per client mobile che gestiscono male SSE."""
    if request.client_message_id and request.client_message_id in _MOBILE_RESPONSE_CACHE:
        return _MOBILE_RESPONSE_CACHE[request.client_message_id][1]

    full_response = ""
    memory_saved = False

    async for chunk in orchestrate(request.text):
        if not chunk.startswith("data: "):
            continue
        try:
            event = json.loads(chunk[6:].strip())
        except json.JSONDecodeError:
            continue
        if event.get("type") == "token":
            full_response += event.get("content", "")
        elif event.get("type") == "done":
            memory_saved = bool(event.get("memory_saved"))

    payload = {"content": full_response, "memory_saved": memory_saved}
    if request.client_message_id:
        _cache_mobile_response(request.client_message_id, payload)
    return payload


@app.post("/voice")
async def voice(audio: UploadFile = File(...)):
    audio_bytes = await audio.read()
    try:
        text = await transcribe(audio_bytes, audio.filename or "audio.mp3")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return StreamingResponse(
        orchestrate(text),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        },
    )


@app.post("/chat/upload")
async def chat_upload(
    text: str = Form(default=""),
    file: UploadFile = File(...),
):
    """Chat con allegato (immagine o documento). Invia a Claude con vision/document."""
    file_bytes = await file.read()
    mime = file.content_type or "application/octet-stream"
    b64 = base64.standard_b64encode(file_bytes).decode()

    if mime.startswith("image/"):
        file_block = {"type": "image", "source": {"type": "base64", "media_type": mime, "data": b64}}
    elif mime == "application/pdf":
        file_block = {"type": "document", "source": {"type": "base64", "media_type": mime, "data": b64}}
    else:
        # Unsupported type — fall back to text-only with filename note
        return StreamingResponse(
            orchestrate(text or f"[file: {file.filename}]"),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Access-Control-Allow-Origin": "*"},
        )

    content: list = [file_block]
    if text.strip():
        content.append({"type": "text", "text": text.strip()})

    from backend.services.claude import stream_response, SONNET_MODEL
    from backend.services.supabase import get_today_session, upsert_session
    import json as _json

    async def _stream():
        session = await get_today_session()
        session_id = session["id"] if session else None
        history = session["messages"] if session else []
        messages = (history + [{"role": "user", "content": content}])[-20:]
        full = ""
        async for token in stream_response(messages, SONNET_MODEL, "neutral"):
            full += token
            yield f"data: {_json.dumps({'type': 'token', 'content': token})}\n\n"
        updated = (messages + [{"role": "assistant", "content": full}])[-20:]
        await upsert_session(session_id, updated)
        yield f"data: {_json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Access-Control-Allow-Origin": "*"},
    )


@app.post("/voice/transcribe")
async def voice_transcribe(audio: UploadFile = File(...)):
    """Solo trascrizione — non chiama l'agente. Usato per preview in chat."""
    audio_bytes = await audio.read()
    try:
        text = await transcribe(audio_bytes, audio.filename or "audio.m4a")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {"text": text}
