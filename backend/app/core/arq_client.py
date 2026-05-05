"""Singleton arq Redis pool used by FastAPI routes to enqueue jobs.

The API process never executes jobs — it only enqueues them and reads
results back. The pool here is shared across all requests so we don't
open a new Redis connection per enqueue call.

Pool lifecycle is managed in ``app.core.lifespan``: opened on startup,
closed on shutdown.
"""

from __future__ import annotations

import logging

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings

from app.core.config import settings

logger = logging.getLogger(__name__)

_pool: ArqRedis | None = None


def _redis_settings(use_ssl: bool) -> RedisSettings:
    """Build arq RedisSettings with the given SSL flag.

    NOTE: ``ssl_cert_reqs`` must be the string form ("required" / "none"),
    not an ``ssl.VerifyMode`` enum. redis-py's ``RedisSSLContext`` only
    branches on `None` or `str` and silently drops anything else, which
    then fails with ``AttributeError: ... no attribute 'cert_reqs'``.
    """
    ssl_cert_reqs = (
        "none" if settings.REDIS_SSL_CERT_REQS.lower() == "none" else "required"
    )
    return RedisSettings(
        host=settings.REDIS_HOST,
        port=settings.REDIS_PORT,
        username=settings.REDIS_USERNAME,
        password=settings.REDIS_PASSWORD,
        ssl=use_ssl,
        ssl_cert_reqs=ssl_cert_reqs if use_ssl else "none",
    )


def _probe_ssl(use_ssl: bool) -> bool:
    """Sync ping to decide whether SSL handshake actually works.

    arq's internal pool builder retries 5 times before surfacing a
    connection error, which floods the logs even when we plan to fall
    back. Pre-flighting with a short sync ping lets us choose the right
    SSL flag *before* creating the arq pool, so the noisy retry loop
    never fires.
    """
    import redis  # sync client used only for the probe

    try:
        client = redis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            username=settings.REDIS_USERNAME,
            password=settings.REDIS_PASSWORD,
            ssl=use_ssl,
            ssl_cert_reqs=(
                "none" if settings.REDIS_SSL_CERT_REQS.lower() == "none" else "required"
            ) if use_ssl else None,
            socket_connect_timeout=3,
        )
        client.ping()
        client.close()
        return True
    except Exception:
        return False


async def connect_arq() -> ArqRedis:
    """Open the shared pool. Idempotent — safe to call from lifespan.

    Mirrors ``app.core.redis_client.connect_redis`` semantics: probe SSL
    first (sync ping, ~3s timeout), and if it fails and
    ``REDIS_SSL_FALLBACK=true`` is set, silently use non-TLS instead.
    Probing avoids arq's noisy 5-retry connection loop.
    """
    global _pool
    if _pool is not None:
        return _pool

    use_ssl = settings.REDIS_SSL
    if use_ssl and settings.REDIS_SSL_FALLBACK and not _probe_ssl(True):
        logger.warning(
            "arq: TLS handshake to Redis failed; falling back to non-TLS"
        )
        use_ssl = False

    _pool = await create_pool(_redis_settings(use_ssl))
    return _pool


async def close_arq() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def get_arq() -> ArqRedis:
    """FastAPI dependency: returns the live pool, raises if not initialised."""
    if _pool is None:
        raise RuntimeError("arq pool is not initialised")
    return _pool
