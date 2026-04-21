from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

import ssl

from redis.asyncio import Redis
from redis.exceptions import ConnectionError

from app.core.config import settings

_redis: Redis | None = None


async def connect_redis() -> Redis:
    global _redis
    if not settings.REDIS_HOST or not settings.REDIS_PASSWORD:
        raise RuntimeError("REDIS_HOST and REDIS_PASSWORD must be configured")
    if _redis is None:
        ssl_cert_reqs = ssl.CERT_REQUIRED
        if settings.REDIS_SSL_CERT_REQS.lower() == "none":
            ssl_cert_reqs = ssl.CERT_NONE
        _redis = Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            username=settings.REDIS_USERNAME,
            password=settings.REDIS_PASSWORD,
            ssl=settings.REDIS_SSL,
            ssl_cert_reqs=ssl_cert_reqs,
            decode_responses=True,
        )
    try:
        await _redis.ping()
    except ConnectionError as exc:
        if settings.REDIS_SSL and settings.REDIS_SSL_FALLBACK:
            _redis = Redis(
                host=settings.REDIS_HOST,
                port=settings.REDIS_PORT,
                username=settings.REDIS_USERNAME,
                password=settings.REDIS_PASSWORD,
                ssl=False,
                decode_responses=True,
            )
            await _redis.ping()
        else:
            raise
    return _redis


async def close_redis() -> None:
    global _redis
    if _redis is not None:
        await _redis.close()
        _redis = None


def get_redis() -> Redis:
    if _redis is None:
        raise RuntimeError("Redis client is not initialized")
    return _redis


@asynccontextmanager
async def redis_lifespan(app) -> AsyncIterator[None]:
    await connect_redis()
    try:
        yield
    finally:
        await close_redis()