from fastapi import APIRouter

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/server")
def server_status() -> dict[str, str]:
	"""Basic backend/server liveness check."""
	return {"status": "ok", "service": "backend"}


@router.head("/server")
def server_status_head() -> None:
	"""Allow HEAD requests for health checks."""
	return None
