from fastapi import APIRouter, Depends, HTTPException
from redis.asyncio import Redis

from app.core.redis_client import get_redis
from app.models.health import HealthResponse

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/redis", response_model=HealthResponse)
async def redis_health(redis: Redis = Depends(get_redis)) -> HealthResponse:
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
                "status": "error",
                "service": "redis",
                "error": message,
                "hint": hint,
            },
        ) from exc
    return HealthResponse(status="ok", service="redis")