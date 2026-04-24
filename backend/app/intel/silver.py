"""Silver-specific Gemini sentiment prompt and fetch helper."""

from typing import Any

from app.intel.utils import format_price_context, generate_sentiment, today_str
from app.models.intel import AssetSentiment



def build_silver_prompt(prices: dict[str, Any] | None = None) -> str:
	"""Build the Gemini prompt for silver sentiment."""
	today = today_str()
	price_context = format_price_context(prices, "silver")
	return (
		"Determine the absolute latest Silver (XAG) market sentiment (Bull or Bear) "
		f"as of today, {today}, based on the most recent analysis, videos, and tweets "
		"from Benjamin Cowen and Gareth Soloway. "
		f"{price_context} "
		"Provide JSON only (no markdown, no extra text): marketType (\"bull\"|\"bear\"|\"neutral\"), "
		"reasoning (MAX 30 WORDS), cowenView (MAX 25 WORDS), solowayView (MAX 25 WORDS)."
	)



async def fetch_silver_sentiment(prices: dict[str, Any] | None = None) -> AssetSentiment | None:
	"""Fetch silver sentiment from Gemini."""
	return await generate_sentiment(build_silver_prompt(prices))
