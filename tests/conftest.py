import os
import pytest

# Set dummy env vars before any module that calls get_settings() is imported.
# Real keys are loaded from .env at runtime; these dummies prevent ValidationError in CI/tests.
os.environ.setdefault("ANTHROPIC_API_KEY", "test-anthropic-key")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "test-supabase-key")
