"""Postgres-backed cache + history for Gemini sentiment results.

Why Postgres and not Redis:
    The hover-path speed comes from the frontend (preloaded React state +
    10-min throttle), not from sub-millisecond cache reads. A single-row
    PK lookup in Postgres is plenty fast for the cold-path hovers that
    actually hit the backend, and it lets us co-locate the audit log of
    every Gemini call alongside the cache.

Two tables (see ``app/intel/schema.py``):
    * ``intel_sentiment_cache`` — 1 row per asset. UPSERT on write, fetch
      latest non-expired payload on read. TTL enforced via ``expires_at``
      so we don't need a separate cleanup job for hot-path correctness.
    * ``intel_sentiment_history`` — append-only log of every fresh Gemini
      generation, with prompt + parsed response + raw text + model. Used
      for analytics / future training, never read on the hover path.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Literal

from app.core.database import get_db
from app.models.intel import AssetSentiment

logger = logging.getLogger(__name__)

Asset = Literal["gold", "silver", "crypto"]

# 10 minutes: long enough to absorb hover traffic, short enough to stay fresh
# on fast-moving crypto / metals days.
TTL_SECONDS = 10 * 60


async def get_cached(asset: Asset) -> AssetSentiment | None:
    """Return the cached sentiment for ``asset`` if it hasn't expired."""
    try:
        async with get_db() as conn:
            row = await conn.fetchrow(
                """
                SELECT response
                FROM intel_sentiment_cache
                WHERE asset = $1 AND expires_at > now()
                """,
                asset,
            )
        if row is None:
            return None
        return AssetSentiment.model_validate_json(row["response"])
    except Exception as exc:
        logger.debug("Sentiment cache read failed (%s): %s", asset, exc)
        return None


async def set_cached(
    asset: Asset,
    sentiment: AssetSentiment,
    *,
    prompt: str | None = None,
    raw_response: str | None = None,
    model: str | None = None,
) -> None:
    """UPSERT the cache row and append a history record in one transaction.

    The cache row gives us O(1) hover reads; the history insert preserves
    the exact prompt + outputs for future analysis. Doing both in one
    transaction means a successful Gemini call is never lost from the
    audit log even if the cache write races with another worker.
    """
    payload = sentiment.model_dump_json()
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=TTL_SECONDS)

    try:
        async with get_db() as conn:
            async with conn.transaction():
                await conn.execute(
                    """
                    INSERT INTO intel_sentiment_cache
                        (asset, response, expires_at, updated_at)
                    VALUES ($1, $2::jsonb, $3, now())
                    ON CONFLICT (asset) DO UPDATE
                        SET response   = EXCLUDED.response,
                            expires_at = EXCLUDED.expires_at,
                            updated_at = now()
                    """,
                    asset,
                    payload,
                    expires_at,
                )
                if prompt is not None:
                    await conn.execute(
                        """
                        INSERT INTO intel_sentiment_history
                            (asset, prompt, response, raw_response, model)
                        VALUES ($1, $2, $3::jsonb, $4, $5)
                        """,
                        asset,
                        prompt,
                        payload,
                        raw_response,
                        model,
                    )
    except Exception as exc:
        logger.debug("Sentiment cache write failed (%s): %s", asset, exc)


async def invalidate(asset: Asset | None = None) -> None:
    """Force the next read to miss — drops cache rows but keeps history."""
    try:
        async with get_db() as conn:
            if asset is None:
                await conn.execute("DELETE FROM intel_sentiment_cache")
            else:
                await conn.execute(
                    "DELETE FROM intel_sentiment_cache WHERE asset = $1",
                    asset,
                )
    except Exception as exc:
        logger.debug("Sentiment cache invalidate failed: %s", exc)
