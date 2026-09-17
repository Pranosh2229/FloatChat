from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "FLOATCHAT"
    environment: str = "development"

    database_url: str = "postgresql+asyncpg://floatchat:floatchat@localhost:5432/floatchat"
    redis_url: str | None = None

    # Redesign Phase 0: moved from local Ollama (qwen2.5:3b-instruct) to the Gemini API — see
    # REDESIGN_PLAN.md decision #6. gemini_api_key has no safe default; it must come from
    # backend/.env (gitignored), never committed. The LLM's job in this architecture stays narrow
    # (NL -> structured query extraction, not open-ended chat) regardless of provider.
    gemini_api_key: str = ""
    # gemini-2.5-flash-lite was retired for new API keys as of this project's key (confirmed via
    # a real 404 from the live API, not assumed); gemini-3.5-flash-lite is Google's current
    # stable lightweight tier and was verified working end-to-end, including with
    # responseSchema-constrained structured output, against the real API before this became the
    # default.
    gemini_model: str = "gemini-3.5-flash-lite"

    cors_origins: list[str] = ["http://localhost:3000"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
