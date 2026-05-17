"""Gemini sentiment service — orchestration layer used by worker jobs.

Generates sentiment via Gemini, builds the response payload, persists
to the Gemini cache + history tables. The worker calls
``generate_and_cache`` directly; the API serves cached reads.
"""

from __future__ import annotations

import logging
from typing import Literal

from app.models.sentiment import GeminiSentimentResponse
from app.sentiment.gemini import cache as gemini_cache
from app.sentiment.gemini.generator import (
    GeminiGenerationResult,
    generate_sentiment_gemini,
)

logger = logging.getLogger(__name__)

Asset = Literal["gold", "silver", "crypto"]


def _result_to_response(result: GeminiGenerationResult) -> GeminiSentimentResponse | None:
    if result.sentiment is None:
        return None
    return GeminiSentimentResponse(
        sentiment=result.sentiment,
        model=result.model,
        feedTranscripts=result.feed_transcripts,
        groundingEnabled=result.grounding_enabled,
        groundingSourcesCount=result.grounding_sources_count,
        groundingMetadata=result.grounding_metadata,
        promptTokens=result.prompt_tokens,
        completionTokens=result.completion_tokens,
        thoughtsTokens=result.thoughts_tokens,
        toolUseTokens=result.tool_use_tokens,
        cachedTokens=result.cached_tokens,
        totalTokens=result.total_tokens,
    )


async def generate_and_cache(
    asset: Asset,
    *,
    feed_transcripts: bool = True,
    enable_grounding: bool = True,
    model: str | None = None,
) -> GeminiSentimentResponse | None:
    """Generate Gemini sentiment for ``asset`` and persist cache + history.

    Called from the worker cron (twice daily) and on-demand worker jobs.
    Returns None if generation failed.
    """
    result = await generate_sentiment_gemini(
        asset,
        feed_transcripts=feed_transcripts,
        enable_grounding=enable_grounding,
        model=model,
    )

    response = _result_to_response(result)
    if response is None:
        logger.warning("gemini generate_and_cache: no sentiment for %s", asset)
        return None

    await gemini_cache.set_cached(
        asset,
        response,
        prompt=result.prompt,
        raw_response=result.raw_text,
        grounding_metadata=result.grounding_metadata,
    )
    return response


async def refresh_all(
    *,
    feed_transcripts: bool = True,
    enable_grounding: bool = True,
    model: str | None = None,
) -> dict[str, GeminiSentimentResponse | None]:
    """Refresh all 3 assets sequentially under per-asset advisory locks.

    Sequential to respect Gemini quotas. Uses Postgres advisory locks so
    parallel workers don't double-generate the same asset.
    """
    results: dict[str, GeminiSentimentResponse | None] = {}
    for asset in ("crypto", "gold", "silver"):
        got = await gemini_cache.try_acquire_refresh_lock(asset)  # type: ignore[arg-type]
        if not got:
            logger.info("gemini refresh skipped (%s): another worker holds the lock", asset)
            results[asset] = None
            continue
        try:
            results[asset] = await generate_and_cache(
                asset,  # type: ignore[arg-type]
                feed_transcripts=feed_transcripts,
                enable_grounding=enable_grounding,
                model=model,
            )
        except Exception as exc:
            logger.warning("gemini refresh failed (%s): %s", asset, exc)
            results[asset] = None
        finally:
            await gemini_cache.release_refresh_lock(asset)  # type: ignore[arg-type]
    return results
