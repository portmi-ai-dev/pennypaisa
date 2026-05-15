"""Postgres-backed cache + history for Gemini sentiment results.

Cache lifecycle:
    * ``TTL_SECONDS`` — how long a cache row stays "fresh"; matches the
      cron refresh cadence (12h) so a healthy cron means every read is a hit.
    * ``STALE_TTL_SECONDS`` — extra window where the stale row is still
      served while a background refresh runs.

Tables (see ``app/sentiment/gemini/schema.py``):
    * ``gemini_sentiment_cache``   — one row per asset, UPSERTed on write.
    * ``gemini_sentiment_history`` — append-only log of every Gemini call.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Literal

from app.core.database import get_db
from app.models.sentiment import GeminiSentimentResponse

logger = logging.getLogger(__name__)

Asset = Literal["gold", "silver", "crypto"]

# 12 hours — matches the twice-daily worker cron cadence.
TTL_SECONDS = 12 * 60 * 60

# 2 extra hours where the stale row is still served during background refresh.
STALE_TTL_SECONDS = 2 * 60 * 60


def _advisory_lock_key(asset: Asset) -> int:
    """Stable bigint per asset for ``pg_try_advisory_lock``."""
    return hash(f"gemini:sentiment:{asset}") % (2**31)


async def get_cached(
    asset: Asset,
) -> tuple[GeminiSentimentResponse | None, bool]:
    """Return ``(response, is_stale)``.

    * ``(response, False)`` — fresh row inside its TTL.
    * ``(response, True)``  — expired but within SWR window; caller
      should fire background refresh.
    * ``(None, False)``     — no row or expired beyond SWR.
    """
    try:
        async with get_db() as conn:
            row = await conn.fetchrow(
                """
                SELECT response, expires_at
                FROM gemini_sentiment_cache
                WHERE asset = $1
                """,
                asset,
            )
        if row is None:
            return None, False

        response = GeminiSentimentResponse.model_validate_json(row["response"])
        expires_at: datetime = row["expires_at"]
        now = datetime.now(timezone.utc)

        if now <= expires_at:
            return response, False

        stale_until = expires_at + timedelta(seconds=STALE_TTL_SECONDS)
        if now <= stale_until:
            return response, True
        return None, False
    except Exception as exc:
        logger.debug("Gemini cache read failed (%s): %s", asset, exc)
        return None, False


async def try_acquire_refresh_lock(asset: Asset) -> bool:
    """Per-asset session advisory lock for refresh dedup across workers."""
    try:
        async with get_db() as conn:
            got = await conn.fetchval(
                "SELECT pg_try_advisory_lock($1)",
                _advisory_lock_key(asset),
            )
        return bool(got)
    except Exception as exc:
        logger.debug("Gemini advisory lock acquire failed (%s): %s", asset, exc)
        return False


async def release_refresh_lock(asset: Asset) -> None:
    try:
        async with get_db() as conn:
            await conn.execute(
                "SELECT pg_advisory_unlock($1)",
                _advisory_lock_key(asset),
            )
    except Exception as exc:
        logger.debug("Gemini advisory lock release failed (%s): %s", asset, exc)


async def set_cached(
    asset: Asset,
    response: GeminiSentimentResponse,
    *,
    prompt: str | None = None,
    raw_response: str | None = None,
) -> None:
    """UPSERT the cache row + append history record in one transaction."""
    payload = response.model_dump_json()
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=TTL_SECONDS)

    try:
        async with get_db() as conn:
            async with conn.transaction():
                await conn.execute(
                    """
                    INSERT INTO gemini_sentiment_cache
                        (asset, response, model, expires_at, updated_at)
                    VALUES ($1, $2::jsonb, $3, $4, now())
                    ON CONFLICT (asset) DO UPDATE
                        SET response   = EXCLUDED.response,
                            model      = EXCLUDED.model,
                            expires_at = EXCLUDED.expires_at,
                            updated_at = now()
                    """,
                    asset,
                    payload,
                    response.model,
                    expires_at,
                )
                if prompt is not None:
                    await conn.execute(
                        """
                        INSERT INTO gemini_sentiment_history
                            (asset, prompt, response, raw_response, model,
                             feed_transcripts, grounding_enabled,
                             grounding_sources_count,
                             prompt_tokens, completion_tokens,
                             thoughts_tokens, tool_use_tokens,
                             cached_tokens, total_tokens)
                        VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9,
                                $10, $11, $12, $13, $14)
                        """,
                        asset,
                        prompt,
                        payload,
                        raw_response,
                        response.model,
                        response.feedTranscripts,
                        response.groundingEnabled,
                        response.groundingSourcesCount,
                        response.promptTokens,
                        response.completionTokens,
                        response.thoughtsTokens,
                        response.toolUseTokens,
                        response.cachedTokens,
                        response.totalTokens,
                    )
    except Exception as exc:
        logger.debug("Gemini cache write failed (%s): %s", asset, exc)


async def invalidate(asset: Asset | None = None) -> None:
    """Drop cache rows so next read misses; keeps history."""
    try:
        async with get_db() as conn:
            if asset is None:
                await conn.execute("DELETE FROM gemini_sentiment_cache")
            else:
                await conn.execute(
                    "DELETE FROM gemini_sentiment_cache WHERE asset = $1",
                    asset,
                )
    except Exception as exc:
        logger.debug("Gemini cache invalidate failed: %s", exc)
