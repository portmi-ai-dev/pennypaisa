"""Bitcoin / crypto sentiment fetcher."""

from app.sentiment._common import generate_and_cache, get_or_swr
from app.models.sentiment import AssetSentiment


async def fetch_crypto_sentiment(
    *,
    use_cache: bool = True,
) -> AssetSentiment | None:
    """Fetch analyst-grade BTC sentiment with stale-while-revalidate."""
    if use_cache:
        cached = await get_or_swr("crypto")
        if cached is not None:
            return cached
    return await generate_and_cache("crypto")
