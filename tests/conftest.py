import os
import pytest

# Set dummy env vars before any module that calls get_settings() is imported.
# Real keys are loaded from .env at runtime; these dummies prevent ValidationError in CI/tests.
os.environ.setdefault("ANTHROPIC_API_KEY", "test-anthropic-key")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0In0.signature")
os.environ.setdefault("YOUTUBE_API_KEY", "test-youtube-key")


@pytest.fixture(autouse=True)
def clear_settings_cache():
    yield
    from backend.config import get_settings
    get_settings.cache_clear()
