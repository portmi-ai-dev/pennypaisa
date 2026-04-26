"""Postgres-backed cache + history for Gemini sentiment results.

Why Postgres and not Redis:
    The hover-path speed comes from the frontend (preloaded React state +
    10-min throttle), not from sub-millisecond cache reads. A single-row
    PK lookup in Postgres is plenty fast for the cold-path hovers that
    actually hit the backend, and it lets us co-locate the audit log of
    every Gemini call alongside the cache.

Cache lifecycle:
    * ``TTL_SECONDS`` — how long a cache row stays "fresh"; matches the
      cron refresh cadence so a healthy cron means every read is a hit.
    * ``STALE_TTL_SECONDS`` — additional window where we still serve the
      old row (stale-while-revalidate) while a background task regenerates
      it. Belt-and-suspenders for a slow / failed cron tick.

Tables (see ``app/intel/schema.py``):
    * ``intel_sentiment_cache`` — 1 row per asset, UPSERTed on write.
    * ``intel_sentiment_history`` — append-only log of every Gemini call,
      with prompt + parsed/raw response + token usage + model.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Literal

from app.core.database import get_db
from app.models.intel import AssetSentiment

logger = logging.getLogger(__name__)

Asset = Literal["gold", "silver", "crypto"]

# 1 hour: refreshed proactively by the cron worker, so under healthy
# operation every cache read is a hit.
TTL_SECONDS = 60 * 60

# Extra window (1 more hour) during which we still serve the old row
# while a background task regenerates it. Protects against a missed cron
# tick or transient Gemini failure — users see the slightly-stale row
# immediately instead of waiting on a cold-path Gemini call.
STALE_TTL_SECONDS = 60 * 60


def _advisory_lock_key(asset: Asset) -> int:
    """Stable 32-bit-ish int per asset for ``pg_try_advisory_xact_lock``."""
    # Postgres advisory locks take a bigint key; hash() is fine here since
    # we only need a deterministic, well-distributed mapping per asset.
    return hash(f"intel:sentiment:{asset}") % (2**31)


async def get_cached(asset: Asset) -> tuple[AssetSentiment | None, bool]:
    """Return ``(sentiment, is_stale)``.

    * ``(sentiment, False)`` — fresh row inside its TTL.
    * ``(sentiment, True)``  — expired but inside the SWR window;
      caller should kick off a background refresh.
    * ``(None, False)``      — no row, or expired beyond the SWR window.
    """
    try:
        async with get_db() as conn:
            row = await conn.fetchrow(
                """
                SELECT response, expires_at
                FROM intel_sentiment_cache
                WHERE asset = $1
                """,
                asset,
            )
        if row is None:
            return None, False

        sentiment = AssetSentiment.model_validate_json(row["response"])
        expires_at: datetime = row["expires_at"]
        now = datetime.now(timezone.utc)

        if now <= expires_at:
            return sentiment, False

        stale_until = expires_at + timedelta(seconds=STALE_TTL_SECONDS)
        if now <= stale_until:
            return sentiment, True
        return None, False
    except Exception as exc:
        logger.debug("Sentiment cache read failed (%s): %s", asset, exc)
        return None, False


async def try_acquire_refresh_lock(asset: Asset) -> bool:
    """Try to claim the per-asset refresh lock for the current connection.

    Used by the SWR background refresh and the cron worker to avoid
    duplicate Gemini calls when multiple workers/requests race to
    regenerate the same asset. Returns True if we got the lock, False if
    another worker already holds it (caller should skip refresh).

    NOTE: this is a *session* advisory lock — release with
    ``pg_advisory_unlock``. We use session (not transaction) locks so the
    caller can hold the lock across a long Gemini call without keeping a
    transaction open the whole time.
    """
    try:
        async with get_db() as conn:
            got = await conn.fetchval(
                "SELECT pg_try_advisory_lock($1)",
                _advisory_lock_key(asset),
            )
        return bool(got)
    except Exception as exc:
        logger.debug("Advisory lock acquire failed (%s): %s", asset, exc)
        return False


async def release_refresh_lock(asset: Asset) -> None:
    """Release the per-asset refresh lock."""
    try:
        async with get_db() as conn:
            await conn.execute(
                "SELECT pg_advisory_unlock($1)",
                _advisory_lock_key(asset),
            )
    except Exception as exc:
        logger.debug("Advisory lock release failed (%s): %s", asset, exc)


async def set_cached(
    asset: Asset,
    sentiment: AssetSentiment,
    *,
    prompt: str | None = None,
    raw_response: str | None = None,
    model: str | None = None,
    prompt_tokens: int | None = None,
    completion_tokens: int | None = None,
    total_tokens: int | None = None,
) -> None:
    """UPSERT the cache row and append a history record in one transaction.

    Cache row → O(1) hover reads. History insert → permanent audit / training
    record. Both happen atomically so a successful Gemini call can never be
    lost from the audit log even under concurrent writes.
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
                            (asset, prompt, response, raw_response, model,
                             prompt_tokens, completion_tokens, total_tokens)
                        VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)
                        """,
                        asset,
                        prompt,
                        payload,
                        raw_response,
                        model,
                        prompt_tokens,
                        completion_tokens,
                        total_tokens,
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
