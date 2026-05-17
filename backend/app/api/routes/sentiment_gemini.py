"""Gemini sentiment routes — async enqueue + cached reads.

Why async/job-based:
    Gemini calls with grounding + thinking models routinely take 10-40s.
    Running them inline pins uvicorn workers and makes the API feel stuck.
    We enqueue the work onto the arq worker and return a ``job_id``
    immediately; clients poll for status + result.

Endpoints:
    POST   /api/sentiment/gemini/regenerate/{asset}  — enqueue job
    GET    /api/sentiment/gemini/job/{job_id}         — poll status/result
    GET    /api/sentiment/gemini                      — cached: all assets
    GET    /api/sentiment/gemini/{asset}              — cached: single asset
    POST   /api/sentiment/gemini/regenerate-all       — enqueue 3 jobs

Cache is populated by the worker cron (twice daily at 08:00 + 20:00 UTC)
and on-demand by the regenerate jobs.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from arq.connections import ArqRedis
from arq.jobs import Job, JobStatus
from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.core.arq_client import get_arq
from app.core.rate_limit import limiter
from app.models.sentiment import GeminiSentimentResponse
from app.models.yt import EnqueueResponse, JobStatusResponse
from app.sentiment.gemini import cache as gemini_cache

router = APIRouter(prefix="/api/sentiment/gemini", tags=["sentiment-gemini"])

Asset = Literal["gold", "silver", "crypto", "bitcoin"]

_ASSET_ALIASES: dict[str, Literal["gold", "silver", "crypto"]] = {
    "gold": "gold",
    "silver": "silver",
    "crypto": "crypto",
    "bitcoin": "crypto",
    "btc": "crypto",
}

GeminiModel = Literal[
    "gemini-2.5-flash-lite",
    "gemini-2.5-pro",
    "gemini-3-pro-preview",
]


def _normalize_asset(asset: str) -> Literal["gold", "silver", "crypto"]:
    normalized = _ASSET_ALIASES.get(asset.lower())
    if normalized is None:
        raise HTTPException(status_code=404, detail=f"Unknown asset '{asset}'")
    return normalized


# ─────────────────────────────────────────────────────────────────────────────
# Cached reads — served from Postgres, never block on Gemini.
# ─────────────────────────────────────────────────────────────────────────────


class GeminiAggregateResponse(GeminiSentimentResponse):
    """One-asset shape reused for the aggregate response below."""


@router.get(
    "/{asset}",
    response_model=GeminiSentimentResponse,
    summary="Cached Gemini sentiment for a single asset",
)
@limiter.limit("60/minute")
async def get_gemini_sentiment(
    asset: Asset,
    request: Request,
) -> GeminiSentimentResponse:
    """Return the latest cached Gemini sentiment for ``asset``."""
    normalized = _normalize_asset(asset)
    cached, _ = await gemini_cache.get_cached(normalized)
    if cached is None:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "No cached Gemini sentiment",
                "asset": normalized,
                "hint": "Trigger generation via POST /api/sentiment/gemini/regenerate/{asset}",
            },
        )
    return cached


@router.get(
    "",
    summary="Cached Gemini sentiment for all assets",
)
@limiter.limit("30/minute")
async def get_all_gemini_sentiment(request: Request) -> dict[str, object]:
    """Return cached Gemini sentiment for gold, silver, crypto."""
    out: dict[str, object] = {}
    for asset in ("crypto", "gold", "silver"):
        cached, _ = await gemini_cache.get_cached(asset)  # type: ignore[arg-type]
        out[asset] = cached.model_dump() if cached else None
    out["timestamp"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return out


@router.get(
    "/status",
    summary="Gemini sentiment cache freshness per asset",
)
@limiter.limit("30/minute")
async def gemini_cache_status(request: Request) -> dict[str, object]:
    """Inspection endpoint — shows cache age + freshness for monitoring.

    Tells you when each asset was last refreshed and whether the row is
    fresh / stale / expired. Use to debug missing sentiment in the UI.
    """
    status = await gemini_cache.get_cache_status()
    return {
        "assets": status,
        "checked_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Async regeneration — enqueue + poll pattern.
# ─────────────────────────────────────────────────────────────────────────────


@router.post(
    "/regenerate/{asset}",
    response_model=EnqueueResponse,
    summary="Enqueue Gemini sentiment regeneration for one asset",
)
@limiter.limit("10/minute")
async def regenerate_gemini_sentiment(
    asset: Asset,
    request: Request,
    feed_transcripts: bool = Query(
        True,
        description="If true, include YouTube analyst transcripts in the prompt.",
    ),
    enable_grounding: bool = Query(
        True,
        description="If true, enable Google Search grounding for live data.",
    ),
    model: GeminiModel = Query(
        "gemini-2.5-flash-lite",
        description="Gemini model to use.",
    ),
    arq: ArqRedis = Depends(get_arq),
) -> EnqueueResponse:
    """Enqueue a Gemini sentiment job onto the worker. Returns immediately."""
    normalized = _normalize_asset(asset)
    job = await arq.enqueue_job(
        "gemini_sentiment_job",
        normalized,
        feed_transcripts,
        enable_grounding,
        model,
    )
    if job is None:
        raise HTTPException(
            status_code=503,
            detail="Failed to enqueue Gemini sentiment job (queue may be full)",
        )
    return EnqueueResponse(job_id=job.job_id, status="queued")


@router.post(
    "/regenerate-all",
    summary="Enqueue Gemini sentiment regeneration for all 3 assets",
)
@limiter.limit("3/minute")
async def regenerate_all_gemini_sentiment(
    request: Request,
    feed_transcripts: bool = Query(True),
    enable_grounding: bool = Query(True),
    model: GeminiModel = Query("gemini-2.5-flash-lite"),
    arq: ArqRedis = Depends(get_arq),
) -> dict[str, object]:
    """Enqueue 3 separate jobs — one per asset. Returns all job IDs."""
    jobs: dict[str, str | None] = {}
    for asset in ("crypto", "gold", "silver"):
        job = await arq.enqueue_job(
            "gemini_sentiment_job",
            asset,
            feed_transcripts,
            enable_grounding,
            model,
        )
        jobs[asset] = job.job_id if job is not None else None
    return {"jobs": jobs, "status": "queued"}


@router.get(
    "/job/{job_id}",
    response_model=JobStatusResponse,
    summary="Check status / fetch result of a Gemini sentiment job",
)
async def gemini_sentiment_job_status(
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
