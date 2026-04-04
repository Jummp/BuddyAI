from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class ChatRequest(BaseModel):
    text: str

class IntentResult(BaseModel):
    intent: List[str]
    tone: str

class MemoryEntities(BaseModel):
    events: List[str] = []
    people: List[str] = []
    emotions: List[str] = []
    topics: List[str] = []

class MemoryRecord(BaseModel):
    id: str
    date: datetime
    raw_text: str
    summary: Optional[str]
    entities: MemoryEntities
    created_at: datetime
