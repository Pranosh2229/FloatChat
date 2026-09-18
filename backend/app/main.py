import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.admin import router as admin_router
from app.api.anomaly import router as anomaly_router
from app.api.events import router as events_router
from app.api.floats import router as floats_router
from app.api.health import router as health_router
from app.api.profiles import router as profiles_router
from app.api.query import router as query_router
from app.api.regions import router as regions_router
from app.config import get_settings
from app.database import Base, engine
from app.middleware.security import (
    OriginCheckMiddleware,
    RateLimitingMiddleware,
    SecurityHeadersMiddleware,
)
from app.models import *  # noqa: F401,F403 -- registers all models on Base.metadata

settings = get_settings()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # create_all, not Alembic migrations — appropriately scoped for the MVP deadline; revisit
    # if/when schema changes need versioned migrations rather than a fresh dev database.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(OriginCheckMiddleware)
app.add_middleware(RateLimitingMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

app.include_router(health_router)
app.include_router(regions_router)
app.include_router(floats_router)
app.include_router(profiles_router)
app.include_router(anomaly_router)
app.include_router(events_router)
app.include_router(query_router)
app.include_router(admin_router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Part 12 hardening (spec §44) — a general safety net for endpoints that don't already
    translate their own domain errors (query/orchestrator.py does its own, more specific,
    handling for /query). A live demo should never show a raw Python traceback; the real
    exception is still logged server-side (with `exc_info`) so it stays debuggable.
    """
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Something went wrong on the server. This has been logged."},
    )
