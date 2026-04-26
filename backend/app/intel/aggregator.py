"""Aggregate Gemini-generated sentiment across assets."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Literal

import httpx

from app.intel._common import get_or_swr
from app.intel.btc import fetch_crypto_sentiment
from app.intel.gold import fetch_gold_sentiment
from app.intel.silver import fetch_silver_sentiment
from app.models.intel import AssetSentiment, IntelSentimentResponse
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

    Sentiment fetches run in parallel and each honours the Postgres cache,
    so frequent calls from the frontend are cheap.
    """
    prices = await aggregate_prices(client)
    logger.info(
        "Intel price snapshot — gold=%s silver=%s btc=%s",
        prices.get("gold"),
        prices.get("silver"),
        prices.get("btc"),
    )

    crypto, gold, silver = await asyncio.gather(
        fetch_crypto_sentiment(prices),
        fetch_gold_sentiment(prices),
        fetch_silver_sentiment(prices),
    )

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
    """Fetch sentiment for a single asset — used by the hover endpoint.

    Only aggregates price data if we can't serve from cache, so a cache hit
    is near-instant and safe to call on every hover.
    """
    if not force_refresh:
        # get_or_swr unpacks the (sentiment, is_stale) tuple cache.get_cached
        # returns and schedules a background refresh when the row is stale.
        cached = await get_or_swr(asset, prices=None)
        if cached is not None:
            return cached

    # Cache miss (or forced refresh) — fetch fresh prices and regenerate.
    prices = await aggregate_prices(client)
    fetcher = _FETCHERS[asset]
    return await fetcher(prices=prices, use_cache=False)
