from contextlib import asynccontextmanager
from typing import AsyncIterator

from app.core.config import settings
from app.core.database import close_db, connect_db
from app.core.http import create_http_client
from app.core.redis_client import close_redis, connect_redis
from app.intel.schema import ensure_schema


@asynccontextmanager
async def lifespan(app) -> AsyncIterator[None]:
    http_client = create_http_client()
    app.state.http_client = http_client

    db_ready = False
    if settings.NEON_DATABASE_URL:
        try:
            await connect_db()
            db_ready = True
            await ensure_schema()
        except Exception as exc:
            print(f"Database connection failed on startup: {exc}")
    await connect_redis()
    try:
        yield
    finally:
        await close_redis()
        if db_ready:
            await close_db()
        await http_client.aclose()