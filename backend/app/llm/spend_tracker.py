"""
A daily cap on real Gemini calls (app/llm/gemini_client.py) — an in-process counter, not a
database table: this is a single-process FastAPI deployment (see main.py's lifespan), so process
memory is a fine home for a number that only needs to survive until the next UTC day anyway, and
it avoids a schema/migration for what is fundamentally a safety valve, not persisted business data.
Resets automatically when the UTC date rolls over rather than needing a cron job.
"""

import datetime as dt
import threading


class SpendCapTracker:
    def __init__(self, daily_limit: int) -> None:
        self.daily_limit = daily_limit
        self._lock = threading.Lock()
        self._day: dt.date = dt.date.today()
        self._calls_today = 0

    def _roll_if_new_day(self) -> None:
        today = dt.date.today()
        if today != self._day:
            self._day = today
            self._calls_today = 0

    def is_exceeded(self) -> bool:
        with self._lock:
            self._roll_if_new_day()
            return self._calls_today >= self.daily_limit

    def record_call(self) -> None:
        with self._lock:
            self._roll_if_new_day()
            self._calls_today += 1

    def reset(self) -> None:
        with self._lock:
            self._day = dt.date.today()
            self._calls_today = 0

    def stats(self) -> dict:
        with self._lock:
            self._roll_if_new_day()
            return {
                "date": self._day.isoformat(),
                "calls_today": self._calls_today,
                "daily_limit": self.daily_limit,
                "remaining": max(0, self.daily_limit - self._calls_today),
            }


# One tracker per process, shared by every request — mirrors get_settings()'s module-level
# singleton pattern rather than reconstructing (and losing) state per request.
_tracker: SpendCapTracker | None = None


def get_spend_tracker() -> SpendCapTracker:
    global _tracker
    if _tracker is None:
        from app.config import get_settings

        _tracker = SpendCapTracker(get_settings().gemini_daily_call_limit)
    return _tracker
