"""Aggregate sentiment across assets — sequential to respect Groq TPM."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Literal

import httpx

from app.sentiment._common import generate_and_cache, get_or_swr
from app.sentiment.btc import fetch_crypto_sentiment
from app.sentiment.gold import fetch_gold_sentiment
from app.sentiment.silver import fetch_silver_sentiment
from app.models.sentiment import AssetSentiment, IntelSentimentResponse
from app.services.aggregator import aggregate_prices

logger = logging.getLogger(__name__)

Asset = Literal["gold", "silver", "crypto"]

_FETCHERS = {
    "gold": fetch_gold_sentiment,
    "silver": fetch_silver_sentiment,
    "crypto": fetch_crypto_sentiment,
}


def current_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


async def aggregate_sentiments(client: httpx.AsyncClient) -> IntelSentimentResponse:
    """Fetch live prices once, then sentiment for crypto, gold, and silver.

    Cache reads are parallel-safe (just DB lookups). Only cold-miss paths
    hit Groq, and those go through generate_and_cache which has 429 retry.
    """
    prices = await aggregate_prices(client)
    logger.info(
        "Sentiment price snapshot — gold=%s silver=%s btc=%s",
        prices.get("gold"),
        prices.get("silver"),
        prices.get("btc"),
    )

    # Sequential: each fetcher checks cache first (instant), only cold-miss
    # hits Groq. Sequential avoids TPM burst on simultaneous cold misses.
    crypto = await fetch_crypto_sentiment(prices)
    gold = await fetch_gold_sentiment(prices)
    silver = await fetch_silver_sentiment(prices)

    return IntelSentimentResponse(
        crypto=crypto,
        gold=gold,
        silver=silver,
        timestamp=current_timestamp(),
    )


async def fetch_asset_sentiment(
    client: httpx.AsyncClient,
    asset: Asset,
    *,
    force_refresh: bool = False,
) -> AssetSentiment | None:
    """Fetch sentiment for a single asset."""
    if not force_refresh:
        cached = await get_or_swr(asset, prices=None)
        if cached is not None:
            return cached

    prices = await aggregate_prices(client)
    fetcher = _FETCHERS[asset]
    return await fetcher(prices=prices, use_cache=False)


async def regenerate_single_asset(
    client: httpx.AsyncClient,
    asset: Asset,
) -> AssetSentiment | None:
    """Force-regenerate a single asset — bypasses cache, writes fresh."""
    prices = await aggregate_prices(client)
    return await generate_and_cache(asset, prices)
