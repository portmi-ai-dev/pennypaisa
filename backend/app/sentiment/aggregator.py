"""Aggregate sentiment across assets — reads from Gemini cache for GETs.

The GET endpoints serve cached Gemini results from Postgres. Groq paths
remain for on-demand regeneration via dedicated endpoints but are NOT
cached in Postgres.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Literal

from app.sentiment._common import generate_and_cache
from app.sentiment.gemini import cache as gemini_cache
from app.models.sentiment import AssetSentiment, IntelSentimentResponse

logger = logging.getLogger(__name__)

Asset = Literal["gold", "silver", "crypto"]


def current_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


async def _read_gemini_sentiment(asset: Asset) -> AssetSentiment | None:
    """Read a single asset's cached Gemini sentiment, returning the inner AssetSentiment."""
    cached, _ = await gemini_cache.get_cached(asset)
    if cached is None:
        return None
    return cached.sentiment


async def aggregate_sentiments() -> IntelSentimentResponse:
    """Return cached Gemini sentiment for all 3 assets in legacy shape."""
    crypto = await _read_gemini_sentiment("crypto")
    gold = await _read_gemini_sentiment("gold")
    silver = await _read_gemini_sentiment("silver")
    return IntelSentimentResponse(
        crypto=crypto,
        gold=gold,
        silver=silver,
        timestamp=current_timestamp(),
    )


async def fetch_asset_sentiment(
    asset: Asset,
    *,
    force_refresh: bool = False,
) -> AssetSentiment | None:
    """Read cached Gemini sentiment for a single asset.

    ``force_refresh`` triggers an ephemeral Groq generation as a fallback —
    used by the legacy ``?refresh=true`` query param. Does NOT update the
    Gemini cache (regenerate-gemini endpoints do that via worker).
    """
    if force_refresh:
        return await generate_and_cache(asset)
    return await _read_gemini_sentiment(asset)


async def regenerate_single_asset(asset: Asset) -> AssetSentiment | None:
    """Ephemeral Groq regeneration — no DB write."""
    return await generate_and_cache(asset)
