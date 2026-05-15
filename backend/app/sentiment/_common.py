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
from typing import Literal

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


async def generate_and_cache(asset: Asset) -> AssetSentiment | None:
    """Call Groq for ``asset`` and persist cache + history.

    Uses only YouTube analyst transcripts as the data source —
    no external price feeds.
    """
    transcript_block = await _get_transcript_block()
    prompt = build_prompt(asset, transcript_block=transcript_block)
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


async def _refresh_in_background(asset: Asset) -> None:
    """Background SWR refresh: dedup'd via Postgres advisory lock."""
    got = await cache.try_acquire_refresh_lock(asset)
    if not got:
        logger.debug("SWR refresh skipped (%s): another worker holds the lock", asset)
        return
    try:
        await generate_and_cache(asset)
    except Exception as exc:
        logger.warning("SWR refresh failed (%s): %s", asset, exc)
    finally:
        await cache.release_refresh_lock(asset)


async def get_or_swr(asset: Asset) -> AssetSentiment | None:
    """Return a cached sentiment if available, scheduling SWR if stale."""
    cached, is_stale = await cache.get_cached(asset)
    if cached is None:
        return None
    if is_stale:
        asyncio.create_task(_refresh_in_background(asset))
    return cached
