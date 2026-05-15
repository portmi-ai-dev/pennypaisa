"""Background worker that proactively refreshes the sentiment cache.

Runs twice daily at 08:00 and 20:00 UTC. Under healthy operation this
means every user-facing read is a cache hit — the SWR path in
``_common.py`` is the safety net, not the primary path.

Single-flight is enforced via the same per-asset Postgres advisory lock
as the SWR path, so running multiple uvicorn workers won't multiply
Groq calls.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import get_args

from app.sentiment import cache
from app.sentiment._common import Asset, clear_transcript_cache, generate_and_cache

logger = logging.getLogger(__name__)

REFRESH_HOURS_UTC = (8, 20)

INITIAL_DELAY_SECONDS = 30


def _seconds_until_next_run() -> float:
    """Seconds from now until the next scheduled run (08:00 or 20:00 UTC)."""
    now = datetime.now(timezone.utc)
    candidates = []
    for hour in REFRESH_HOURS_UTC:
        target = now.replace(hour=hour, minute=0, second=0, microsecond=0)
        if target <= now:
            target = target.replace(day=target.day + 1) if hour == max(REFRESH_HOURS_UTC) else target
            if target <= now:
                target = target.replace(day=target.day + 1)
        candidates.append(target)
    next_run = min(candidates)
    delta = (next_run - now).total_seconds()
    return max(delta, 60.0)


async def _refresh_one(asset: Asset) -> None:
    """Refresh a single asset under the per-asset advisory lock."""
    got = await cache.try_acquire_refresh_lock(asset)
    if not got:
        logger.info("cron refresh skipped (%s): another worker is refreshing", asset)
        return
    try:
        sentiment = await generate_and_cache(asset)
        if sentiment is None:
            logger.warning("cron refresh produced no sentiment for %s", asset)
        else:
            logger.info("cron refresh ok (%s)", asset)
    except Exception as exc:
        logger.warning("cron refresh failed (%s): %s", asset, exc)
    finally:
        await cache.release_refresh_lock(asset)


async def _refresh_all() -> None:
    """Refresh all assets sequentially to respect Groq TPM limits."""
    clear_transcript_cache()
    for asset in get_args(Asset):
        try:
            await _refresh_one(asset)
        except Exception as exc:
            logger.warning("cron refresh error (%s): %s", asset, exc)


async def run_refresher(_http_client=None) -> None:
    """Long-running task — wakes up at 8AM and 8PM UTC to refresh the cache.

    Started by ``lifespan`` and cancelled on shutdown.
    The _http_client param is kept for backward compatibility but unused
    since sentiment no longer needs live price data.
    """
    try:
        await asyncio.sleep(INITIAL_DELAY_SECONDS)
        # Initial refresh on startup
        await _refresh_all()
        while True:
            sleep_for = _seconds_until_next_run()
            logger.info(
                "Sentiment refresher sleeping %.0f seconds until next run", sleep_for
            )
            await asyncio.sleep(sleep_for)
            await _refresh_all()
    except asyncio.CancelledError:
        logger.info("sentiment cache refresher stopped")
        raise
