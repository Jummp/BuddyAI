from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    anthropic_api_key: str
    openai_api_key: str
    supabase_url: str
    supabase_key: str


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
