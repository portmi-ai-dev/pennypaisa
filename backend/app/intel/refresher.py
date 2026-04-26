"""Background worker that proactively refreshes the sentiment cache.

Runs once on startup and then every ``REFRESH_INTERVAL_SECONDS``. Under
healthy operation this means every user-facing read is a cache hit — the
SWR path in ``_common.py`` is the safety net, not the primary path.

Single-flight is enforced via the same per-asset Postgres advisory lock
as the SWR path, so running multiple uvicorn workers won't multiply
Gemini calls.
"""

from __future__ import annotations

import asyncio
import logging
from typing import get_args

from app.intel import cache
from app.intel._common import Asset, generate_and_cache
from app.services.aggregator import aggregate_prices

logger = logging.getLogger(__name__)

# Refresh every hour — matches the cache TTL so a healthy cron means
# every read is a hit.
REFRESH_INTERVAL_SECONDS = 60 * 60

# Small initial delay so the cron doesn't fight with app startup work.
INITIAL_DELAY_SECONDS = 30


async def _refresh_one(http_client, asset: Asset) -> None:
    """Refresh a single asset under the per-asset advisory lock."""
    got = await cache.try_acquire_refresh_lock(asset)
    if not got:
        logger.info("cron refresh skipped (%s): another worker is refreshing", asset)
        return
    try:
        prices = await aggregate_prices(http_client)
        sentiment = await generate_and_cache(asset, prices)
        if sentiment is None:
            logger.warning("cron refresh produced no sentiment for %s", asset)
        else:
            logger.info("cron refresh ok (%s)", asset)
    except Exception as exc:
        logger.warning("cron refresh failed (%s): %s", asset, exc)
    finally:
        await cache.release_refresh_lock(asset)


async def _refresh_all(http_client) -> None:
    """Refresh all assets in parallel — each holds its own lock."""
    await asyncio.gather(
        *(_refresh_one(http_client, asset) for asset in get_args(Asset)),
        return_exceptions=True,
    )


async def run_refresher(http_client) -> None:
    """Long-running task — wakes up every hour to refresh the cache.

    Started by ``lifespan`` and cancelled on shutdown.
    """
    try:
        await asyncio.sleep(INITIAL_DELAY_SECONDS)
        while True:
            await _refresh_all(http_client)
            await asyncio.sleep(REFRESH_INTERVAL_SECONDS)
    except asyncio.CancelledError:
        logger.info("sentiment cache refresher stopped")
        raise
