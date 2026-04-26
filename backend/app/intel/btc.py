"""Bitcoin / crypto sentiment fetcher."""

from typing import Any

from app.intel import cache
from app.intel.prompts import build_prompt
from app.intel.utils import generate_sentiment
from app.models.intel import AssetSentiment


async def fetch_crypto_sentiment(
    prices: dict[str, Any] | None = None,
    *,
    use_cache: bool = True,
) -> AssetSentiment | None:
    """Fetch analyst-grade BTC sentiment, honouring the Redis cache."""
    if use_cache:
        cached = await cache.get_cached("crypto")
        if cached is not None:
            return cached

    sentiment = await generate_sentiment(build_prompt("crypto", prices))
    if sentiment is not None:
        await cache.set_cached("crypto", sentiment)
    return sentiment
