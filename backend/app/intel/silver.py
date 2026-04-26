"""Silver sentiment fetcher."""

from typing import Any

from app.intel import cache
from app.intel.prompts import build_prompt
from app.intel.utils import generate_sentiment
from app.models.intel import AssetSentiment


async def fetch_silver_sentiment(
    prices: dict[str, Any] | None = None,
    *,
    use_cache: bool = True,
) -> AssetSentiment | None:
    """Fetch analyst-grade silver sentiment, honouring the Redis cache."""
    if use_cache:
        cached = await cache.get_cached("silver")
        if cached is not None:
            return cached

    sentiment = await generate_sentiment(build_prompt("silver", prices))
    if sentiment is not None:
        await cache.set_cached("silver", sentiment)
    return sentiment
