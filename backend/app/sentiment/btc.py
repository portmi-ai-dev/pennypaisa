"""Bitcoin / crypto sentiment fetcher (Groq, ephemeral)."""

from app.sentiment._common import generate_and_cache
from app.models.sentiment import AssetSentiment


async def fetch_crypto_sentiment(*, use_cache: bool = True) -> AssetSentiment | None:
    """Generate BTC sentiment via Groq. ``use_cache`` is ignored — kept for API compat."""
    return await generate_and_cache("crypto")
