"""YouTube backfill routes (one-time admin actions)."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from app.core.config import settings
from app.core.database import connect_db
from app.yt_data_collector.video_id_corn import (
    resolve_channel_urls_from_env,
    sync_video_ids_and_transcripts,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["yt"])

# Best-effort in-memory job tracking (dev-friendly; not durable).
_jobs: dict[str, dict[str, object]] = {}


async def _run_backfill_job(*, job_id: str, max_age_days: int) -> None:
    started_at = datetime.now(timezone.utc)
    _jobs[job_id] = {
        "job_id": job_id,
        "status": "running",
        "started_at_utc": started_at.isoformat(),
        "max_age_days": max_age_days,
    }
    try:
        await connect_db()
        channel_urls = resolve_channel_urls_from_env()
        counts = await sync_video_ids_and_transcripts(channel_urls=channel_urls, max_age_days=max_age_days)
        _jobs[job_id] = {
            **_jobs[job_id],
            "status": "completed",
            "completed_at_utc": datetime.now(timezone.utc).isoformat(),
            "result": counts,
        }
    except Exception as exc:
        logger.warning("yt backfill failed | job_id=%s | reason=%s", job_id, exc)
        _jobs[job_id] = {
            **_jobs.get(job_id, {"job_id": job_id}),
            "status": "failed",
            "completed_at_utc": datetime.now(timezone.utc).isoformat(),
            "error": str(exc),
        }


@router.post("/yt/backfill", summary="Backfill video_ids + transcripts (one-time)")
async def yt_backfill(
    background_tasks: BackgroundTasks,
    max_age_days: int = Query(90, ge=1, le=365, description="How far back to scrape (days)."),
    run_in_background: bool = Query(
        True,
        description="If true, returns immediately with a job_id (recommended).",
    ),
) -> dict[str, object]:
    if not settings.NEON_DATABASE_URL:
        raise HTTPException(status_code=400, detail="NEON_DATABASE_URL is not configured.")

    job_id = str(uuid4())

    if run_in_background:
        background_tasks.add_task(_run_backfill_job, job_id=job_id, max_age_days=max_age_days)
        return {"job_id": job_id, "status": "queued", "max_age_days": max_age_days}

    await _run_backfill_job(job_id=job_id, max_age_days=max_age_days)
    return _jobs[job_id]


@router.get("/yt/backfill/{job_id}", summary="Check backfill status")
async def yt_backfill_status(job_id: str) -> dict[str, object]:
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Unknown job_id")
    return job


@router.post("/yt/sync-now", summary="Run the hourly yt sync once (manual trigger)")
async def yt_sync_now(
    max_age_days: int = Query(30, ge=1, le=365, description="How far back to scrape (days)."),
) -> dict[str, int]:
    if not settings.NEON_DATABASE_URL:
        raise HTTPException(status_code=400, detail="NEON_DATABASE_URL is not configured.")
    await connect_db()
    channel_urls = resolve_channel_urls_from_env()
    # Run sync immediately (same behavior as the cron tick).
    return await sync_video_ids_and_transcripts(channel_urls=channel_urls, max_age_days=max_age_days)

