"""YouTube single-URL transcript routes — enqueue + poll pattern.

`POST /api/yt/transcript` does NOT block while yt-dlp / AssemblyAI
runs. It enqueues a job onto the arq worker and returns a `job_id`
immediately. Clients poll `GET /api/yt/transcript/{job_id}` for status
and result.
"""

from __future__ import annotations

from arq.connections import ArqRedis
from arq.jobs import Job, JobStatus
from fastapi import APIRouter, Depends, HTTPException

from app.core.arq_client import get_arq
from app.models.yt import (
    EnqueueResponse,
    JobStatusResponse,
    TranscriptRequest,
)

router = APIRouter(prefix="/api", tags=["yt"])


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
