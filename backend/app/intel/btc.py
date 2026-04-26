"""Bitcoin / crypto sentiment fetcher."""

from typing import Any

from app.intel._common import generate_and_cache, get_or_swr
from app.models.intel import AssetSentiment


async def fetch_crypto_sentiment(
    prices: dict[str, Any] | None = None,
    *,
    use_cache: bool = True,
) -> AssetSentiment | None:
    """Fetch analyst-grade BTC sentiment with stale-while-revalidate."""
    if use_cache:
        cached = await get_or_swr("crypto", prices)
        if cached is not None:
            return cached
    return await generate_and_cache("crypto", prices)
