from backend.models import IntentResult, MemoryEntities, ChatRequest

def test_intent_result_defaults():
    r = IntentResult(intent=["log_memory"], tone="neutral")
    assert r.intent == ["log_memory"]
    assert r.tone == "neutral"

def test_memory_entities_defaults():
    e = MemoryEntities()
    assert e.events == []
    assert e.people == []
    assert e.emotions == []
    assert e.topics == []

def test_chat_request_requires_text():
    r = ChatRequest(text="ciao")
    assert r.text == "ciao"
