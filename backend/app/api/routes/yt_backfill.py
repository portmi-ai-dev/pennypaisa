"""YouTube backfill / sync admin routes — all routed through arq worker.

Both `/api/yt/backfill` and `/api/yt/sync-now` enqueue jobs onto the
worker process and return a `job_id` immediately. Use
`/api/yt/job/{job_id}` to poll status. The in-memory job dict has been
removed — arq's Redis-backed result store is durable across API
restarts.
"""

from __future__ import annotations

from typing import Any, Literal

from arq.connections import ArqRedis
from arq.jobs import Job, JobStatus
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.core.arq_client import get_arq
from app.core.config import settings

router = APIRouter(prefix="/api", tags=["yt"])


class EnqueueResponse(BaseModel):
    job_id: str
    status: Literal["queued"]
    max_age_days: int


class JobStatusResponse(BaseModel):
    job_id: str
    status: Literal["queued", "in_progress", "completed", "failed", "not_found"]
    result: dict[str, Any] | None = None
    error: str | None = None


def _require_db() -> None:
    if not settings.NEON_DATABASE_URL:
        raise HTTPException(status_code=400, detail="NEON_DATABASE_URL is not configured.")


@router.post("/yt/backfill", response_model=EnqueueResponse, summary="Enqueue a backfill job")
async def yt_backfill(
    arq: ArqRedis = Depends(get_arq),
    max_age_days: int = Query(90, ge=1, le=365, description="How far back to scrape (days)."),
) -> EnqueueResponse:
    _require_db()
    job = await arq.enqueue_job("yt_backfill_job", max_age_days)
    if job is None:
        raise HTTPException(status_code=503, detail="Failed to enqueue backfill job")
    return EnqueueResponse(job_id=job.job_id, status="queued", max_age_days=max_age_days)


@router.post("/yt/sync-now", response_model=EnqueueResponse, summary="Enqueue an immediate yt sync")
async def yt_sync_now(
    arq: ArqRedis = Depends(get_arq),
    max_age_days: int = Query(30, ge=1, le=365, description="How far back to scrape (days)."),
) -> EnqueueResponse:
    _require_db()
    job = await arq.enqueue_job("yt_sync_now_job", max_age_days)
    if job is None:
        raise HTTPException(status_code=503, detail="Failed to enqueue sync job")
    return EnqueueResponse(job_id=job.job_id, status="queued", max_age_days=max_age_days)


@router.get(
    "/yt/job/{job_id}",
    response_model=JobStatusResponse,
    summary="Check status / fetch result of any yt worker job",
)
async def yt_job_status(
    job_id: str,
    arq: ArqRedis = Depends(get_arq),
) -> JobStatusResponse:
    job = Job(job_id, arq)
    status: JobStatus = await job.status()

    if status == JobStatus.not_found:
        return JobStatusResponse(job_id=job_id, status="not_found")
    if status == JobStatus.queued or status == JobStatus.deferred:
        return JobStatusResponse(job_id=job_id, status="queued")
    if status == JobStatus.in_progress:
        return JobStatusResponse(job_id=job_id, status="in_progress")

    try:
        result_value = await job.result(timeout=0)
    except Exception as exc:
        return JobStatusResponse(job_id=job_id, status="failed", error=str(exc))

    if not isinstance(result_value, dict):
        return JobStatusResponse(
            job_id=job_id,
            status="failed",
            error=f"Unexpected result type: {type(result_value).__name__}",
        )

    return JobStatusResponse(job_id=job_id, status="completed", result=result_value)
