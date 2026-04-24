"""Aggregate Gemini-generated sentiment across assets."""

import asyncio
from datetime import datetime, timezone

import httpx

from app.intel.btc import fetch_crypto_sentiment
from app.intel.gold import fetch_gold_sentiment
from app.intel.silver import fetch_silver_sentiment
from app.models.intel import IntelSentimentResponse
from app.services.aggregator import aggregate_prices




def current_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


async def aggregate_sentiments(client: httpx.AsyncClient) -> IntelSentimentResponse:
    """Fetch prices once, then sentiment for crypto, gold, and silver."""
    prices = await aggregate_prices(client)
    print(f"Intel price snapshot: {prices}")

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