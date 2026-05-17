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

import json as _json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

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

    ALWAYS serves the last known row if one exists, regardless of age.
    A 3-day-old row is better than nothing — the UI can show "last updated
    N hours ago" rather than failing the request. The ``is_stale`` flag
    tells callers whether to schedule a background refresh.

    * ``(response, False)`` — row exists and is within TTL (fresh).
    * ``(response, True)``  — row exists but past TTL (stale; refresh suggested).
    * ``(None, False)``     — no row in the table at all.
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
        is_stale = datetime.now(timezone.utc) > expires_at
        return response, is_stale
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
    grounding_metadata: dict[str, Any] | None = None,
) -> None:
    """UPSERT the cache row + append history record in one transaction."""
    payload = response.model_dump_json()
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=TTL_SECONDS)

    grounding_json = (
        _json.dumps(grounding_metadata) if grounding_metadata else None
    )

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
                             grounding_sources_count, grounding_metadata,
                             prompt_tokens, completion_tokens,
                             thoughts_tokens, tool_use_tokens,
                             cached_tokens, total_tokens)
                        VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8,
                                $9::jsonb, $10, $11, $12, $13, $14, $15)
                        """,
                        asset,
                        prompt,
                        payload,
                        raw_response,
                        response.model,
                        response.feedTranscripts,
                        response.groundingEnabled,
                        response.groundingSourcesCount,
                        grounding_json,
                        response.promptTokens,
                        response.completionTokens,
                        response.thoughtsTokens,
                        response.toolUseTokens,
                        response.cachedTokens,
                        response.totalTokens,
                    )
    except Exception as exc:
        logger.debug("Gemini cache write failed (%s): %s", asset, exc)


async def get_cache_status() -> dict[str, dict[str, object]]:
    """Return cache freshness info per asset for monitoring / self-heal.

    Each asset entry contains:
        present: bool — is there a row at all
        updated_at: ISO timestamp (or None)
        expires_at: ISO timestamp (or None)
        age_seconds: how many seconds since updated_at (or None)
        is_fresh: bool — currently within TTL
        is_stale: bool — past TTL but within SWR window
        is_expired: bool — past SWR window
    """
    from datetime import datetime, timezone

    out: dict[str, dict[str, object]] = {}
    try:
        async with get_db() as conn:
            rows = await conn.fetch(
                """
                SELECT asset, updated_at, expires_at, model
                FROM gemini_sentiment_cache
                """
            )
        by_asset = {r["asset"]: r for r in rows}
    except Exception as exc:
        logger.warning("get_cache_status query failed: %s", exc)
        by_asset = {}

    now = datetime.now(timezone.utc)
    for asset in ("crypto", "gold", "silver"):
        row = by_asset.get(asset)
        if row is None:
            out[asset] = {
                "present": False,
                "updated_at": None,
                "expires_at": None,
                "age_seconds": None,
                "model": None,
                "is_fresh": False,
                "is_stale": False,
                "is_expired": True,
            }
            continue

        updated_at: datetime = row["updated_at"]
        expires_at: datetime = row["expires_at"]
        age = (now - updated_at).total_seconds()
        stale_until = expires_at.timestamp() + STALE_TTL_SECONDS
        is_fresh = now <= expires_at
        is_expired = now.timestamp() > stale_until
        is_stale = (not is_fresh) and (not is_expired)
        out[asset] = {
            "present": True,
            "updated_at": updated_at.isoformat(),
            "expires_at": expires_at.isoformat(),
            "age_seconds": age,
            "model": row["model"],
            "is_fresh": is_fresh,
            "is_stale": is_stale,
            "is_expired": is_expired,
        }
    return out


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
