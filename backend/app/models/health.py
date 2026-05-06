"""Pydantic models for /health/* endpoints."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel


HealthStatus = Literal["ok", "error", "disabled"]


class HealthResponse(BaseModel):
    """Standard health-check response.

    ``status`` is ``"ok"`` when the dependency responded, ``"error"``
    when it did not, and ``"disabled"`` when the dependency is
    intentionally turned off (e.g., Postgres URL not configured).
    """

    status: HealthStatus
    service: str
    detail: str | None = None


class ApiHealthEntry(BaseModel):
    """One row inside the aggregated external-API health response."""

    url: str
    status: HealthStatus
    code: int | None = None
    error: str | None = None


class ApiHealthResponse(BaseModel):
    """Aggregated response for ``/health/apis``."""

    apis: list[ApiHealthEntry]
    count: int


# Free-form fallback for any health endpoint that wants to attach
# arbitrary diagnostic fields without breaking the contract.
class HealthResponseExtended(HealthResponse):
    extra: dict[str, Any] | None = None
