from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    anthropic_api_key: str
    openai_api_key: str
    supabase_url: str
    supabase_key: str
    youtube_api_key: str
    checkin_time: str = "08:00"
    training_reminder_time: str = "09:00"
    training_reminder_hours: int = 4


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
