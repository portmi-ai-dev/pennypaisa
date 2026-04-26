"""Redis-backed cache for Gemini sentiment results.

Gemini calls are expensive and rate-limited. The frontend triggers a sentiment
fetch every time the user hovers a bullion, so without caching we'd burn
quota and introduce hover latency. A short TTL keeps the data fresh enough
for intraday market intelligence while absorbing hover storms.
"""

from __future__ import annotations

import logging
from typing import Literal

from app.core.redis_client import get_redis
from app.models.intel import AssetSentiment

logger = logging.getLogger(__name__)

Asset = Literal["gold", "silver", "crypto"]

# 10 minutes: long enough to absorb hover traffic, short enough to stay fresh
# on fast-moving crypto / metals days.
TTL_SECONDS = 10 * 60

_KEY_TEMPLATE = "intel:sentiment:{asset}"


async def get_cached(asset: Asset) -> AssetSentiment | None:
    """Return a cached sentiment payload for the asset, or None."""
    try:
        redis = get_redis()
        raw = await redis.get(_KEY_TEMPLATE.format(asset=asset))
        if not raw:
            return None
        return AssetSentiment.model_validate_json(raw)
    except Exception as exc:
        logger.debug("Sentiment cache read failed (%s): %s", asset, exc)
        return None


async def set_cached(asset: Asset, sentiment: AssetSentiment) -> None:
    """Store a sentiment payload with the configured TTL."""
    try:
        redis = get_redis()
        payload = sentiment.model_dump_json()
        await redis.set(
            _KEY_TEMPLATE.format(asset=asset),
            payload,
            ex=TTL_SECONDS,
        )
    except Exception as exc:
        logger.debug("Sentiment cache write failed (%s): %s", asset, exc)


async def invalidate(asset: Asset | None = None) -> None:
    """Invalidate cache for one asset, or all if asset is None."""
    try:
        redis = get_redis()
        if asset is None:
            keys = [_KEY_TEMPLATE.format(asset=a) for a in ("gold", "silver", "crypto")]
            await redis.delete(*keys)
        else:
            await redis.delete(_KEY_TEMPLATE.format(asset=asset))
    except Exception as exc:
        logger.debug("Sentiment cache invalidate failed: %s", exc)
