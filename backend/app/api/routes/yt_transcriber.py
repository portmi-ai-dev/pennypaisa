"""YouTube transcript API routes — enqueue + poll pattern.

`POST /api/yt/transcript` no longer blocks while yt-dlp / AssemblyAI run.
Instead it enqueues a job onto the arq worker and returns a `job_id`
immediately. Clients poll `GET /api/yt/transcript/{job_id}` for status
and result.

This frees the FastAPI event loop and uvicorn worker pool from being
pinned for 30s-6min per scrape.
"""

from __future__ import annotations

from typing import Any, Literal

from arq.connections import ArqRedis
from arq.jobs import Job, JobStatus
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.arq_client import get_arq

router = APIRouter(prefix="/api", tags=["yt"])


class TranscriptRequest(BaseModel):
    url: str = Field(..., description="YouTube video URL")


class EnqueueResponse(BaseModel):
    job_id: str
    status: Literal["queued"]


class JobStatusResponse(BaseModel):
    job_id: str
    status: Literal["queued", "in_progress", "completed", "failed", "not_found"]
    result: dict[str, Any] | None = None
    error: str | None = None


@router.post(
    "/yt/transcript",
    response_model=EnqueueResponse,
    summary="Enqueue a transcript job for a YouTube URL",
)
async def yt_transcript(
    request: TranscriptRequest,
    arq: ArqRedis = Depends(get_arq),
) -> EnqueueResponse:
    job = await arq.enqueue_job("transcript_job", request.url)
    if job is None:
        # arq returns None when a job with the same _job_id already exists;
        # we don't pass _job_id, so this should be a transient enqueue
        # failure (Redis unreachable, etc.).
        raise HTTPException(status_code=503, detail="Failed to enqueue transcript job")
    return EnqueueResponse(job_id=job.job_id, status="queued")


@router.get(
    "/yt/transcript/{job_id}",
    response_model=JobStatusResponse,
    summary="Check status / fetch result of a transcript job",
)
async def yt_transcript_status(
    job_id: str,
    arq: ArqRedis = Depends(get_arq),
) -> JobStatusResponse:
    job = Job(job_id, arq)
    status: JobStatus = await job.status()

    # arq's JobStatus enum: deferred, queued, in_progress, complete, not_found
    if status == JobStatus.not_found:
        return JobStatusResponse(job_id=job_id, status="not_found")
    if status == JobStatus.queued or status == JobStatus.deferred:
        return JobStatusResponse(job_id=job_id, status="queued")
    if status == JobStatus.in_progress:
        return JobStatusResponse(job_id=job_id, status="in_progress")

    # status == complete — `result()` returns the value or raises if the
    # job raised an exception. Catch + surface as failed.
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
