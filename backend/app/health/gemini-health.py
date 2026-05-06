from fastapi import APIRouter, HTTPException

from app.core.config import settings
from app.core.gemini import get_gemini_client
from app.models.health import HealthResponse

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/gemini", response_model=HealthResponse)
def gemini_health() -> HealthResponse:
    if not settings.GEMINI_API_KEY:
        return HealthResponse(
            status="disabled",
            service="gemini",
            detail="GEMINI_API_KEY is not configured",
        )

    try:
        client = get_gemini_client()
        # Verify the API key by listing available models (grabs just the first page)
        models = list(client.models.list())
        if not models:
            raise RuntimeError("No models returned from Gemini API")
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "error",
                "service": "gemini",
                "error": str(exc),
            },
        ) from exc

    return HealthResponse(status="ok", service="gemini")