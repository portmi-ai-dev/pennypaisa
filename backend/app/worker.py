"""arq worker process — runs YouTube scraping jobs out-of-band from FastAPI.

Why a separate worker:
    yt-dlp downloads, ffmpeg transcoding, and AssemblyAI long-polling can
    each take 30s-6min per call. Running them in the API process pins
    threads from uvicorn's pool, eats RAM, and blocks the event loop on
    sync stretches. Moving them here keeps `api.gilver.ai` responsive
    while the worker box absorbs the heavy CPU/IO bursts.

Job inventory (this slice — YouTube only):
    * ``transcript_job``           — single video URL → transcript (on-demand).
    * ``backfill_scrape_job``      — bulk: scrape recent video IDs only,
      no transcripts. Default window 10 days.
    * ``backfill_transcript_job``  — bulk: transcribe rows already in
      ``video_ids`` that are missing a transcript. Default window 10 days.

Cron:
    * ``yt_hourly_cron``       — replaces the in-process loop that used
      to live in ``app.core.lifespan``. Fires once per hour to scrape
      new video IDs + transcribe (combined sync — separate from the
      manual split-stage jobs above).

Other workloads (Gemini intel refresher) intentionally stay in-process
inside FastAPI's lifespan for now — only YouTube was moved.

Run locally:
    arq app.worker.WorkerSettings
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from arq.connections import RedisSettings
from arq.cron import cron

from app.core.config import settings
from app.core.database import close_db, connect_db
from app.yt_data_collector.video_id_corn import (
    ensure_schema as ensure_yt_schema,
    load_channel_urls,
    scrape_video_ids_only,
    sync_latest_video_ids_and_transcripts,
    transcribe_missing,
)
from app.yt_data_collector.yt_transcriber import (
    TranscriptResult,
    get_transcript_for_url,
)

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Job functions — each takes ``ctx`` (arq context) as first positional arg.
# Return values are JSON-serialised and stored in Redis under the job's
# result key, retrievable via ``Job(job_id, redis).result()``.
# ─────────────────────────────────────────────────────────────────────────────


async def transcript_job(ctx: dict[str, Any], video_url: str) -> dict[str, Any]:
    """Resolve a single YouTube URL to its transcript.

    `get_transcript_for_url` is sync (yt-dlp + requests + AssemblyAI poll)
    so we hand it to a thread to avoid blocking the worker's event loop.
    Wrapped in ``asyncio.wait_for`` against
    ``YT_TRANSCRIPT_PER_VIDEO_TIMEOUT_SECONDS`` so a hung video never
    starves the worker; on timeout the underlying thread keeps running
    in the background until network completes (Python can't kill a
    thread mid-call), but this coroutine returns control immediately.
    """
    result: TranscriptResult = await asyncio.wait_for(
        asyncio.to_thread(get_transcript_for_url, video_url),
        timeout=settings.YT_TRANSCRIPT_PER_VIDEO_TIMEOUT_SECONDS,
    )
    return {
        "videoId": result.video_id,
        "source": result.source,
        "text": result.text,
    }


async def backfill_scrape_job(ctx: dict[str, Any], days: int = 10) -> dict[str, Any]:
    """Scrape recent video IDs only (no transcripts) from configured channels.

    Stage 1 of the split-backfill flow. Cheap call relative to transcript
    fetching — separates "what's new on the channels" from "fetch the
    expensive transcripts" so the latter can be scheduled independently.
    """
    channel_urls = load_channel_urls()
    started_at = datetime.now(timezone.utc)

    counts = await scrape_video_ids_only(
        channel_urls=channel_urls,
        max_age_days=days,
    )

    completed_at = datetime.now(timezone.utc)
    duration = (completed_at - started_at).total_seconds()

    return {
        **counts,
        "days_window": days,
        "channels": list(channel_urls),
        "started_at": started_at.isoformat().replace("+00:00", "Z"),
        "completed_at": completed_at.isoformat().replace("+00:00", "Z"),
        "duration_seconds": round(duration, 2),
    }


async def backfill_transcript_job(ctx: dict[str, Any], days: int = 10) -> dict[str, int]:
    """Transcribe rows in ``video_ids`` from the last ``days`` days that
    don't yet have a row in ``video_transcripts``.

    Stage 2 of the split-backfill flow. Reads candidates from Postgres
    (no YouTube re-scrape), so callers control the transcript-budget
    spend independently of the cheap scrape stage.
    """
    return await transcribe_missing(max_age_days=days)


# ─────────────────────────────────────────────────────────────────────────────
# Cron job — replaces the in-process ``run_video_id_corn`` loop that used
# to be spawned from ``app.core.lifespan``. Fires every hour at minute 5
# (slight offset so it doesn't collide with other top-of-hour work).
# ─────────────────────────────────────────────────────────────────────────────


async def yt_hourly_cron(ctx: dict[str, Any]) -> None:
    """Hourly: scrape new video IDs + transcribe missing transcripts."""
    try:
        await sync_latest_video_ids_and_transcripts(
            channel_urls=load_channel_urls()
        )
    except Exception as exc:
        logger.warning("yt cron tick failed: %s", exc)


# ─────────────────────────────────────────────────────────────────────────────
# Worker lifecycle — boot the asyncpg pool once per worker process so jobs
# can `async with get_db() as conn:` immediately.
# ─────────────────────────────────────────────────────────────────────────────


async def startup(ctx: dict[str, Any]) -> None:
    if settings.NEON_DATABASE_URL:
        await connect_db()
        await ensure_yt_schema()
        logger.info("worker: db pool + yt schema ready")
    else:
        logger.warning("worker: NEON_DATABASE_URL unset — yt jobs will fail")


async def shutdown(ctx: dict[str, Any]) -> None:
    await close_db()


def _probe_ssl(use_ssl: bool) -> bool:
    """Sync ping to decide whether SSL handshake actually works.

    Mirrors the ``REDIS_SSL_FALLBACK`` behaviour of
    ``app.core.redis_client.connect_redis``: try SSL; if the handshake
    fails (Redis Cloud often serves TLS and non-TLS on different ports
    and the user's port may not be TLS), fall back transparently rather
    than crash the worker.

    Sync probe is used because ``WorkerSettings.redis_settings`` is
    evaluated at class-definition time, before any event loop exists.
    """
    import redis  # sync client used only for the probe

    try:
        client = redis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            username=settings.REDIS_USERNAME,
            password=settings.REDIS_PASSWORD,
            ssl=use_ssl,
            ssl_cert_reqs=(
                "none" if settings.REDIS_SSL_CERT_REQS.lower() == "none" else "required"
            ) if use_ssl else None,
            socket_connect_timeout=3,
        )
        client.ping()
        client.close()
        return True
    except Exception:
        return False


def _build_redis_settings() -> RedisSettings:
    """Translate our Pydantic Redis config into arq's RedisSettings.

    Mirrors ``app.core.redis_client.connect_redis`` — same host/port/SSL
    semantics so the worker talks to the same Redis instance the API uses.

    NOTE: ``ssl_cert_reqs`` must be the *string* form (``"required"`` /
    ``"none"``), not an ``ssl.VerifyMode`` enum. redis-py's
    ``RedisSSLContext`` only branches on `None` or `str` and silently
    drops anything else, which then fails later with
    ``AttributeError: 'RedisSSLContext' object has no attribute 'cert_reqs'``.
    """
    use_ssl = settings.REDIS_SSL
    if use_ssl and settings.REDIS_SSL_FALLBACK and not _probe_ssl(True):
        logger.warning(
            "worker: TLS handshake to Redis failed; falling back to non-TLS"
        )
        use_ssl = False

    ssl_cert_reqs = (
        "none" if settings.REDIS_SSL_CERT_REQS.lower() == "none" else "required"
    )

    return RedisSettings(
        host=settings.REDIS_HOST,
        port=settings.REDIS_PORT,
        username=settings.REDIS_USERNAME,
        password=settings.REDIS_PASSWORD,
        ssl=use_ssl,
        ssl_cert_reqs=ssl_cert_reqs if use_ssl else "none",
    )


class WorkerSettings:
    """arq worker configuration. Run with ``arq app.worker.WorkerSettings``."""

    redis_settings = _build_redis_settings()
    functions = [transcript_job, backfill_scrape_job, backfill_transcript_job]
    cron_jobs = [
        # Minute 5 of every hour — small offset away from :00 to avoid
        # piling onto whatever other systems run at the top of the hour.
        cron(yt_hourly_cron, minute={5}),
    ]
    on_startup = startup
    on_shutdown = shutdown

    # Cap concurrent jobs per worker process. yt-dlp + ffmpeg are CPU-heavy;
    # 2 keeps a single-vCPU box responsive. Bump on bigger boxes.
    max_jobs = 2

    # Keep job results in Redis for 1h so the API's polling endpoint can
    # still read the result after the job finishes. After 1h the result
    # is GC'd from Redis.
    keep_result = 60 * 60

    # Per-job hard timeout — read from settings so a single env var can
    # widen the budget for bulk backfills without code changes. The
    # per-video timeout (``YT_TRANSCRIPT_PER_VIDEO_TIMEOUT_SECONDS``)
    # bounds each individual attempt inside the loop, so any stuck video
    # is skipped without burning this whole budget.
    job_timeout = settings.YT_BULK_JOB_TIMEOUT_SECONDS
