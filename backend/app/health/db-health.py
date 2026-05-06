from fastapi import APIRouter, HTTPException

from app.core.config import settings
from app.core.database import connect_db
from app.models.health import HealthResponse

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/db", response_model=HealthResponse)
async def db_health() -> HealthResponse:
    if not settings.NEON_DATABASE_URL:
        return HealthResponse(
            status="disabled",
            service="neon-db",
            detail="NEON_DATABASE_URL is not configured",
        )

    try:
        pool = await connect_db()
        async with pool.acquire() as connection:
            await connection.execute("SELECT 1")
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "error",
                "service": "neon-db",
                "error": str(exc),
            },
        ) from exc

    return HealthResponse(status="ok", service="neon-db")