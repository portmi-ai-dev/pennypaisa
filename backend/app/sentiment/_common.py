"""Shared cache + Groq orchestration for the per-asset fetchers.

Three behaviours all the fetchers need:

1. **Cache hit** → return immediately.
2. **Stale-while-revalidate** → return the stale row, kick off a background
   refresh under a per-asset advisory lock so only one worker calls Groq.
3. **Cold miss** → block on a fresh Groq call (rare under healthy cron).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Literal

from app.sentiment import cache
from app.sentiment.prompts import build_prompt
from app.sentiment.transcripts import (
    fetch_recent_transcripts,
    format_transcripts_for_prompt,
)
from app.sentiment.utils import generate_sentiment
from app.models.sentiment import AssetSentiment

logger = logging.getLogger(__name__)

Asset = Literal["gold", "silver", "crypto"]

# Module-level transcript cache: fetched once per refresh cycle, shared
# across all three asset calls so we don't hit the DB 3x.
_transcript_block_cache: str | None = None


async def _get_transcript_block() -> str:
    """Fetch and format recent transcripts, with simple in-memory cache."""
    global _transcript_block_cache
    if _transcript_block_cache is not None:
        return _transcript_block_cache
    try:
        transcripts = await fetch_recent_transcripts()
        _transcript_block_cache = format_transcripts_for_prompt(transcripts)
    except Exception as exc:
        logger.warning("Failed to fetch transcripts for sentiment: %s", exc)
        _transcript_block_cache = ""
    return _transcript_block_cache


def clear_transcript_cache() -> None:
    """Reset the transcript cache — called at the start of each refresh cycle."""
    global _transcript_block_cache
    _transcript_block_cache = None


async def generate_and_cache(
    asset: Asset,
    prices: dict[str, Any] | None = None,
) -> AssetSentiment | None:
    """Call Groq for ``asset`` and persist cache + history.

    Used by the cold-miss path AND the cron worker. Always writes both
    tables; the history row carries prompt + raw + token counts.

    Fetches recent YouTube analyst transcripts and includes them as
    additional signal in the prompt.
    """
    transcript_block = await _get_transcript_block()
    prompt = build_prompt(asset, prices, transcript_block=transcript_block)
    result = await generate_sentiment(prompt)
    if result.sentiment is not None:
        await cache.set_cached(
            asset,
            result.sentiment,
            prompt=prompt,
            raw_response=result.raw_text,
            model="llama-3.3-70b-versatile",
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
