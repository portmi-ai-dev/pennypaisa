"""Shared cache + Gemini orchestration for the per-asset fetchers.

Three behaviours all the fetchers need:

1. **Cache hit** → return immediately.
2. **Stale-while-revalidate** → return the stale row, kick off a background
   refresh under a per-asset advisory lock so only one worker calls Gemini.
3. **Cold miss** → block on a fresh Gemini call (rare under healthy cron).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Literal

from app.core.config import settings
from app.intel import cache
from app.intel.prompts import build_prompt
from app.intel.utils import generate_sentiment
from app.models.intel import AssetSentiment

logger = logging.getLogger(__name__)

Asset = Literal["gold", "silver", "crypto"]


async def generate_and_cache(
    asset: Asset,
    prices: dict[str, Any] | None = None,
) -> AssetSentiment | None:
    """Call Gemini for ``asset`` and persist cache + history.

    Used by the cold-miss path AND the cron worker. Always writes both
    tables; the history row carries prompt + raw + token counts.
    """
    prompt = build_prompt(asset, prices)
    result = await generate_sentiment(prompt)
    if result.sentiment is not None:
        await cache.set_cached(
            asset,
            result.sentiment,
            prompt=prompt,
            raw_response=result.raw_text,
            model=settings.GEMINI_MODEL,
            prompt_tokens=result.prompt_tokens,
            completion_tokens=result.completion_tokens,
            total_tokens=result.total_tokens,
        )
    return result.sentiment


async def _refresh_in_background(asset: Asset, prices: dict[str, Any] | None) -> None:
    """Background SWR refresh: dedup'd via Postgres advisory lock.

    If another worker already holds the lock, skip — they'll handle it.
    The advisory lock is a *session* lock; we always release it in
    ``finally`` so a Gemini timeout can't leave it stuck.
    """
    got = await cache.try_acquire_refresh_lock(asset)
    if not got:
        logger.debug("SWR refresh skipped (%s): another worker holds the lock", asset)
        return
    try:
        await generate_and_cache(asset, prices)
    except Exception as exc:
        logger.warning("SWR refresh failed (%s): %s", asset, exc)
    finally:
        await cache.release_refresh_lock(asset)


async def get_or_swr(
    asset: Asset,
    prices: dict[str, Any] | None,
) -> AssetSentiment | None:
    """Return a cached sentiment if available, scheduling SWR if stale."""
    cached, is_stale = await cache.get_cached(asset)
    if cached is None:
        return None
    if is_stale:
        # Fire-and-forget: don't await, the user gets the stale row now.
        asyncio.create_task(_refresh_in_background(asset, prices))
    return cached
