from backend.orchestrator import select_model
from backend.services.claude import HAIKU_MODEL, SONNET_MODEL


def test_select_model_haiku_for_log_memory_only():
    assert select_model(["log_memory"]) == HAIKU_MODEL


def test_select_model_haiku_for_nutrition():
    assert select_model(["log_memory", "log_nutrition"]) == HAIKU_MODEL


def test_select_model_sonnet_for_coaching():
    assert select_model(["log_memory", "coaching_check"]) == SONNET_MODEL


def test_select_model_sonnet_for_many_intents():
    # More than 2 intents → complex reasoning → Sonnet
    assert select_model(["log_memory", "log_nutrition", "log_task"]) == SONNET_MODEL
