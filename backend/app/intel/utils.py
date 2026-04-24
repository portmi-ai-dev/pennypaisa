"""Shared helpers for Gemini-driven market sentiment."""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from typing import Any, Literal

from google.genai import types

from app.core.config import settings
from app.core.gemini import get_gemini_client
from app.models.intel import AssetSentiment

logger = logging.getLogger(__name__)


def today_str() -> str:
    """Return today's date formatted for prompts."""
    return datetime.now().strftime("%B %d, %Y")


def _clean_json(text: str) -> str:
    """Strip markdown fences or leading text before JSON."""
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"```$", "", cleaned).strip()
    return cleaned


def _trim_words(value: str, limit: int) -> str:
    words = value.split()
    if len(words) <= limit:
        return value
    return " ".join(words[:limit])


def _parse_sentiment(text: str) -> AssetSentiment:
    """Parse Gemini JSON response into a sentiment model."""
    payload = json.loads(_clean_json(text))
    reasoning = str(payload.get("reasoning", "")).strip()
    cowen_view = str(payload.get("cowenView", "")).strip()
    soloway_view = str(payload.get("solowayView", "")).strip()

    payload["reasoning"] = _trim_words(reasoning, 30)
    payload["cowenView"] = _trim_words(cowen_view, 25)
    payload["solowayView"] = _trim_words(soloway_view, 25)
    payload.setdefault(
        "lastUpdated",
        datetime.now().strftime("%b %d, %Y %H:%M"),
    )
    return AssetSentiment(**payload)


def format_price_context(
    prices: dict[str, Any] | None,
    asset: Literal["gold", "silver", "crypto"],
) -> str:
    """Format an asset-specific price snapshot for prompts."""
    if not prices:
        return "Live price snapshot unavailable."

    def _fmt(value: Any, digits: int = 2) -> str:
        try:
            num = float(value)
        except (TypeError, ValueError):
            return "—"
        return f"{num:,.{digits}f}"

    def _pct(value: Any) -> str:
        try:
            num = float(value)
        except (TypeError, ValueError):
            return "—"
        return f"{num:+.2f}%"

    gold = _fmt(prices.get("gold"))
    silver = _fmt(prices.get("silver"))
    btc = _fmt(prices.get("btc"), 0)

    if asset == "gold":
        return (
            "Live Gold snapshot right now: "
            f"Price ${gold} | 24h { _pct(prices.get('goldChangePercent')) } | "
            f"Weekly { _pct(prices.get('goldWeeklyChangePercent')) }. "
            "Use only this gold data in your reasoning."
        )
    if asset == "silver":
        return (
            "Live Silver snapshot right now: "
            f"Price ${silver} | 24h { _pct(prices.get('silverChangePercent')) } | "
            f"Weekly { _pct(prices.get('silverWeeklyChangePercent')) }. "
            "Use only this silver data in your reasoning."
        )

    return (
        "Live Bitcoin/Crypto snapshot right now: "
        f"BTC ${btc} | 24h { _pct(prices.get('btcChangePercent')) } | "
        f"Weekly { _pct(prices.get('btcWeeklyChangePercent')) } | "
        f"Dominance { _fmt(prices.get('btcDominance'), 1) }% | "
        f"Market Cap ${ _fmt(prices.get('btcMarketCap'), 0) }. "
        "Use only this crypto data in your reasoning."
    )


async def generate_sentiment(prompt: str) -> AssetSentiment | None:
    """Generate a sentiment payload from Gemini.

    Returns None if the call fails or JSON cannot be parsed.
    """
    if not settings.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not configured")

    client = get_gemini_client()

    # Debug: print the exact prompt to confirm price context inclusion.
    print("Gemini sentiment prompt:\n", prompt)

    # Gemini does not allow response_mime_type with tool usage. When grounding
    # is enabled, we drop response_mime_type and rely on the prompt to return JSON.
    if settings.GEMINI_ENABLE_GROUNDING:
        config = types.GenerateContentConfig(
            tools=[types.Tool(google_search=types.GoogleSearch())],
        )
    else:
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
        )

    try:
        response = client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=prompt,
            config=config,
        )
        if not response.text:
            raise ValueError("Gemini returned empty response")
        return _parse_sentiment(response.text)
    except Exception as exc:
        logger.warning("Gemini sentiment generation failed: %s", exc)
        return None