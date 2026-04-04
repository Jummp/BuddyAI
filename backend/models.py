from pydantic import BaseModel
from datetime import datetime


class ChatRequest(BaseModel):
    text: str


class IntentResult(BaseModel):
    intent: list[str]
    tone: str


class MemoryEntities(BaseModel):
    events: list[str] = []
    people: list[str] = []
    emotions: list[str] = []
    topics: list[str] = []


class MemoryRecord(BaseModel):
    id: str
    date: datetime
    raw_text: str
    summary: str | None = None
    entities: MemoryEntities
    created_at: datetime
