from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    anthropic_api_key: str
    openai_api_key: str
    supabase_url: str
    supabase_key: str

    class Config:
        env_file = ".env"

settings = Settings()
