from fastapi import APIRouter, Depends, HTTPException
from redis.asyncio import Redis

from app.core.redis_client import get_redis

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/redis")
async def redis_health(redis: Redis = Depends(get_redis)) -> dict[str, str]:
    try:
        await redis.ping()
    except Exception as exc:  # pragma: no cover - runtime diagnostics
        message = str(exc)
        hint = "Check REDIS_SSL and REDIS_PORT. TLS ports require REDIS_SSL=true."
        if "SSL" in message or "ssl" in message:
            hint = (
                "TLS handshake failed. Verify Redis Cloud TLS port and set "
                "REDIS_SSL_CERT_REQS=none if cert validation fails."
            )
        raise HTTPException(
            status_code=503,
            detail={
                "status": "down",
                "service": "redis",
                "error": message,
                "hint": hint,
            },
        ) from exc
    return {"status": "ok", "service": "redis"}