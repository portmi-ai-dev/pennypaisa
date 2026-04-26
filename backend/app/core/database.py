from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

import asyncpg

from app.core.config import settings

_pool: asyncpg.Pool | None = None


async def connect_db() -> asyncpg.Pool:
    global _pool
    if not settings.NEON_DATABASE_URL:
        raise RuntimeError("NEON_DATABASE_URL is not configured")
    if not settings.NEON_DATABASE_URL.startswith(("postgresql://", "postgres://")):
        raise RuntimeError("NEON_DATABASE_URL must start with postgres:// or postgresql://")
    if _pool is None:
        # min_size=5 keeps a warm pool ready for hover bursts; max_size=30
        # gives headroom for ~5k concurrent users (each request holds a
        # connection only for the brief PK lookup). Tune via load tests.
        _pool = await asyncpg.create_pool(
            dsn=settings.NEON_DATABASE_URL,
            min_size=5,
            max_size=30,
            command_timeout=10,
        )
    return _pool


async def close_db() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


@asynccontextmanager
async def get_db() -> AsyncIterator[asyncpg.Connection]:
    if _pool is None:
        raise RuntimeError("Database pool is not initialized")

    async with _pool.acquire() as connection:
        yield connection