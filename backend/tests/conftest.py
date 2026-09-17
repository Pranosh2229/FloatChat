import pytest_asyncio

from app.database import engine


@pytest_asyncio.fixture(autouse=True)
async def _dispose_engine_pool():
    """
    Dispose the async engine's connection pool after every test. Without this, asyncpg
    connections opened under one test's event loop get torn down under a *different* test's
    (already-closed) loop on Windows' ProactorEventLoop, raising
    `RuntimeError: Event loop is closed` during pool cleanup — a harness artifact, not a real
    failure (each test passes cleanly in isolation).
    """
    yield
    await engine.dispose()
