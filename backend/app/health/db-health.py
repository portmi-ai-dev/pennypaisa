from fastapi import APIRouter, HTTPException

from app.core.config import settings
from app.core.database import connect_db

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/db")
async def db_health() -> dict[str, str]:
    if not settings.NEON_DATABASE_URL:
        return {
            "status": "disabled",
            "service": "neon-db",
            "message": "NEON_DATABASE_URL is not configured",
        }

    try:
        pool = await connect_db()
        async with pool.acquire() as connection:
            await connection.execute("SELECT 1")
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "down",
                "service": "neon-db",
                "error": str(exc),
            },
        ) from exc

    return {"status": "ok", "service": "neon-db"}