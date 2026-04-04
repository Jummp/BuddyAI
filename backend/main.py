from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import field_validator
from backend.models import ChatRequest
from backend.orchestrator import process as orchestrate
from backend.services.whisper import transcribe
from backend.services.supabase import get_memories

app = FastAPI(title="BuddyOS Core Engine", version="0.1.0")


class ChatRequestValidated(ChatRequest):
    @field_validator("text")
    @classmethod
    def text_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Il testo non può essere vuoto")
        return v.strip()


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}


@app.post("/chat")
async def chat(request: ChatRequestValidated):
    return StreamingResponse(
        orchestrate(request.text),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/memories")
async def memories(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    return await get_memories(limit=limit, offset=offset)
