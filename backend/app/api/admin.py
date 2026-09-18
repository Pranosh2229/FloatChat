"""
Admin API — backend-only, deliberately never wired into any frontend UI (the user's explicit
call after reviewing an earlier draft that shipped both an AdminModal *and* a hardcoded fallback
admin key baked into that same frontend bundle, which made the key visible to anyone who opened
devtools on the public site). Reaching these endpoints means holding the real `ADMIN_API_KEY`
value and calling them directly (curl, an internal dashboard, etc.) — never a button on the site.

No file-upload endpoint here either, by design: this API's job is read-only visibility into the
system's own state (is the DB up, how much of the Gemini quota is used today), not a second,
parallel way to get data into the database alongside the real ingestion scripts.
"""

import secrets

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.llm.spend_tracker import get_spend_tracker
from app.models import ArgoFloat, Event, Profile

router = APIRouter(prefix="/admin", tags=["admin"])


async def verify_admin(x_admin_key: str | None = Header(default=None)) -> None:
    configured = get_settings().admin_api_key
    if not configured:
        # No key configured at all means "admin API is off," not "anything goes" — the opposite
        # of a hardcoded default that would otherwise grant access the moment someone forgets to
        # set a real one in production.
        raise HTTPException(status_code=503, detail="Admin API is not configured on this deployment.")
    if not x_admin_key or not secrets.compare_digest(x_admin_key, configured):
        raise HTTPException(status_code=401, detail="Invalid or missing X-Admin-Key.")


@router.get("/status", dependencies=[Depends(verify_admin)])
async def admin_status(db: AsyncSession = Depends(get_db)) -> dict:
    settings = get_settings()
    try:
        float_count = await db.scalar(select(func.count()).select_from(ArgoFloat))
        profile_count = await db.scalar(select(func.count()).select_from(Profile))
        event_count = await db.scalar(select(func.count()).select_from(Event))
        db_status = "ok"
    except Exception as exc:  # pragma: no cover — surfaced to the admin caller, not swallowed
        float_count = profile_count = event_count = None
        db_status = f"error: {exc}"

    return {
        "environment": settings.environment,
        "database": db_status,
        "counts": {"floats": float_count, "profiles": profile_count, "events": event_count},
    }


@router.get("/spend", dependencies=[Depends(verify_admin)])
async def admin_spend() -> dict:
    return get_spend_tracker().stats()


@router.post("/spend/reset", dependencies=[Depends(verify_admin)])
async def admin_reset_spend() -> dict:
    tracker = get_spend_tracker()
    tracker.reset()
    return tracker.stats()
