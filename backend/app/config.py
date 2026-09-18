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

    # Caps how many real Gemini calls this process will make in a UTC day (app/llm/spend_tracker.py)
    # — a free-tier key has a hard daily quota regardless, but this stops a bug (a retry loop, a
    # scripted stress test) from silently burning through it before anyone notices.
    gemini_daily_call_limit: int = 300

    # Requests/minute per client IP before a 429 (app/middleware/security.py's RateLimitingMiddleware).
    rate_limit_per_minute: int = 120

    # Gates /admin/* (app/api/admin.py). Deliberately no default value: an empty key means the
    # admin API refuses every request rather than falling back to a guessable default — a real
    # key must be set explicitly via ADMIN_API_KEY in a deployed environment's env, never committed.
    admin_api_key: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
