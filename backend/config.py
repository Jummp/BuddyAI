from functools import lru_cache
from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    anthropic_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("ANTHROPIC_API_KEY", "anthropic_api_key"),
    )
    openai_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("OPENAI_API_KEY", "openai_api_key"),
    )
    supabase_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices("SUPABASE_URL", "supabase_url"),
    )
    supabase_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("SUPABASE_KEY", "supabase_key"),
    )
    youtube_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("YOUTUBE_API_KEY", "youtube_api_key"),
    )
    checkin_time: str = "08:00"
    training_reminder_time: str = "09:00"
    training_reminder_hours: int = 4


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


def missing_required_settings() -> list[str]:
    settings = get_settings()
    missing: list[str] = []
    required = {
        "ANTHROPIC_API_KEY": settings.anthropic_api_key,
        "OPENAI_API_KEY": settings.openai_api_key,
        "SUPABASE_URL": settings.supabase_url,
        "SUPABASE_KEY": settings.supabase_key,
        "YOUTUBE_API_KEY": settings.youtube_api_key,
    }
    for key, value in required.items():
        if not value:
            missing.append(key)
    return missing
