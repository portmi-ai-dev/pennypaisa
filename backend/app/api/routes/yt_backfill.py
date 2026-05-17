"""YouTube bulk-job routes — split into two stages, both worker-backed.

Stage 1 — `POST /api/yt/backfill_scrape`
    Enqueue a job that scrapes recent video IDs only (no transcripts)
    from the channels listed in ``YT_CHANNEL_URLS``. Default window 10
    days; pass ``?days=N`` to override.

Stage 2 — `POST /api/yt/backfill_transcript`
    Enqueue a job that transcribes rows already in ``video_ids`` from
    the last N days that don't yet have a row in ``video_transcripts``.
    Falls back to AssemblyAI when the YouTube transcript API fails.
    Default window 10 days; pass ``?days=N`` to override.

Each stage has its own poll endpoint so callers can track them
independently. Both polls share the same response shape.
"""

from __future__ import annotations

from arq.connections import ArqRedis
from arq.jobs import Job, JobStatus
from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.arq_client import get_arq
from app.core.config import settings
from app.models.yt import BackfillEnqueueResponse, JobStatusResponse

router = APIRouter(prefix="/api", tags=["yt"])


def _require_db() -> None:
    if not settings.NEON_DATABASE_URL:
        raise HTTPException(status_code=400, detail="NEON_DATABASE_URL is not configured.")


async def _read_job_status(job_id: str, arq: ArqRedis) -> JobStatusResponse:
    """Shared job-poll logic used by both backfill stages."""
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


# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: scrape video IDs only
# ─────────────────────────────────────────────────────────────────────────────


@router.post(
    "/yt/backfill_scrape",
    response_model=BackfillEnqueueResponse,
    summary="Enqueue a scrape job (video IDs only, no transcripts)",
)
async def yt_backfill_scrape(
    arq: ArqRedis = Depends(get_arq),
    days: int = Query(
        10,
        ge=1,
        le=365,
        description="How many days back to scrape (defaults to 10).",
    ),
) -> BackfillEnqueueResponse:
    _require_db()
    job = await arq.enqueue_job("backfill_scrape_job", days)
    if job is None:
        raise HTTPException(status_code=503, detail="Failed to enqueue backfill_scrape job")
    return BackfillEnqueueResponse(job_id=job.job_id, status="queued", days=days)


@router.get(
    "/yt/job/backfill_scrape/{job_id}",
    response_model=JobStatusResponse,
    summary="Check status / fetch result of a backfill_scrape job",
)
async def yt_backfill_scrape_status(
    job_id: str,
    arq: ArqRedis = Depends(get_arq),
) -> JobStatusResponse:
    return await _read_job_status(job_id, arq)


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: transcribe missing rows already in the DB
# ─────────────────────────────────────────────────────────────────────────────


@router.post(
    "/yt/backfill_transcript",
    response_model=BackfillEnqueueResponse,
    summary="Enqueue a transcript backfill job (transcribes DB rows missing transcripts)",
)
async def yt_backfill_transcript(
    arq: ArqRedis = Depends(get_arq),
    days: int = Query(
        10,
        ge=1,
        le=365,
        description="How many days back to look for missing transcripts (defaults to 10).",
    ),
) -> BackfillEnqueueResponse:
    _require_db()
    job = await arq.enqueue_job("backfill_transcript_job", days)
    if job is None:
        raise HTTPException(status_code=503, detail="Failed to enqueue backfill_transcript job")
    return BackfillEnqueueResponse(job_id=job.job_id, status="queued", days=days)


@router.get(
    "/yt/backfill_transcript/{job_id}",
    response_model=JobStatusResponse,
    summary="Check status / fetch result of a backfill_transcript job",
)
async def yt_backfill_transcript_status(
    job_id: str,
    arq: ArqRedis = Depends(get_arq),
) -> JobStatusResponse:
    return await _read_job_status(job_id, arq)


# ---------------------------------------------------------------------------
# Test endpoint: TranscriptAPI.com direct fetch (no proxy/assemblyai needed)
# ---------------------------------------------------------------------------


@router.get(
    "/yt/test_transcript/{video_id}",
    summary="[TEST] Fetch transcript via transcriptapi.com",
)
async def test_transcript_api(video_id: str):
    """Test endpoint — fetches transcript directly from transcriptapi.com.

    No proxy, no AssemblyAI, no yt-dlp. Just a direct API call.
    """
    import httpx

    api_key = (settings.TRANSCRIPT_API_KEY or "").strip()
    if not api_key:
        raise HTTPException(status_code=500, detail="TRANSCRIPT_API_KEY not configured")

    url = "https://transcriptapi.com/api/v2/youtube/transcript"
    params = {"video_url": video_id, "format": "json"}
    headers = {"Authorization": f"Bearer {api_key}"}

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url, params=params, headers=headers)

    if resp.status_code != 200:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"transcriptapi.com returned {resp.status_code}: {resp.text[:300]}",
        )

    data = resp.json()
    transcript = data.get("transcript", "")
    text = ""
    if isinstance(transcript, list):
        text = " ".join(seg.get("text", "") for seg in transcript)
    elif isinstance(transcript, str):
        text = transcript

    return {
        "video_id": video_id,
        "source": "transcriptapi.com",
        "chars": len(text),
        "transcript": text,
        "raw_response_keys": list(data.keys()),
    }
