from fastapi import APIRouter

from app.models.health import HealthResponse

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/server", response_model=HealthResponse)
def server_status() -> HealthResponse:
	"""Basic backend/server liveness check."""
	return HealthResponse(status="ok", service="backend")


@router.head("/server")
def server_status_head() -> None:
	"""Allow HEAD requests for health checks."""
	return None
