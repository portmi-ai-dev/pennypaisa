"""Groq-driven sentiment generation — prompt → validated `AssetSentiment`.

Uses openai/gpt-oss-20b with reasoning and strict JSON schema output.
Strict mode guarantees exact 5-field response every time via constrained decoding.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from groq import AsyncGroq
from pydantic import ValidationError

from app.core.config import settings
from app.models.intel import AssetSentiment


@dataclass(slots=True)
class GenerationResult:
    """What ``generate_sentiment`` hands back to fetchers + history writer."""

    sentiment: AssetSentiment | None
    raw_text: str | None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Strict JSON schema — 5 fields
# ---------------------------------------------------------------------------

_GROQ_RESPONSE_FORMAT: dict[str, Any] = {
    "type": "json_schema",
    "json_schema": {
        "name": "asset_sentiment",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "marketType": {"type": "string", "enum": ["bull", "bear", "neutral"]},
                "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
                "horizon": {
                    "type": "string",
                    "enum": ["short-term", "medium-term", "long-term"],
                },
                "reasoning": {"type": "string"},
                "analystView": {"type": "string"},
            },
            "required": ["marketType", "confidence", "horizon", "reasoning", "analystView"],
            "additionalProperties": False,
        },
    },
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _trim_words(value: str, limit: int) -> str:
    value = value.strip()
    words = value.split()
    if len(words) <= limit:
        return value
    trimmed = " ".join(words[:limit]).rstrip(",.;:—- ")
    return trimmed + "…"


def _extract_token_usage(response: Any) -> tuple[int | None, int | None, int | None]:
    usage = getattr(response, "usage", None)
    if usage is None:
        return None, None, None
    return (
        getattr(usage, "prompt_tokens", None),
        getattr(usage, "completion_tokens", None),
        getattr(usage, "total_tokens", None),
    )


def _parse_sentiment(text: str) -> AssetSentiment:
    """Parse strict-mode JSON into an `AssetSentiment`.

    Strict mode guarantees valid JSON with exact schema — no fence-stripping needed.
    """
    payload = json.loads(text)

    if not isinstance(payload, dict):
        raise ValueError("Groq payload is not an object")

    market_type = str(payload.get("marketType", "neutral")).lower()
    if market_type not in {"bull", "bear", "neutral"}:
        market_type = "neutral"

    confidence = payload.get("confidence")
    if isinstance(confidence, str):
        confidence = confidence.lower()
        if confidence not in {"low", "medium", "high"}:
            confidence = None
    else:
        confidence = None

    horizon = payload.get("horizon")
    if isinstance(horizon, str):
        horizon = horizon.lower()
        if horizon not in {"short-term", "medium-term", "long-term"}:
            horizon = None
    else:
        horizon = None

    reasoning = _trim_words(str(payload.get("reasoning", "")), 35)
    analyst = _trim_words(str(payload.get("analystView", "")), 55)

    return AssetSentiment(
        marketType=market_type,
        confidence=confidence,
        horizon=horizon,
        reasoning=reasoning or "Signals are mixed; conviction low.",
        analystView=analyst or "Watching macro structure and technical levels; no high-conviction setup yet.",
        lastUpdated=datetime.now().strftime("%b %d, %Y %H:%M"),
    )


# ---------------------------------------------------------------------------
# Groq call
# ---------------------------------------------------------------------------

_MODEL = "openai/gpt-oss-20b"


async def generate_sentiment(prompt: str) -> GenerationResult:
    """Run the prompt through Groq and return parsed sentiment + metadata.

    Returns a ``GenerationResult`` with ``sentiment=None`` on any failure —
    the aggregator treats missing assets as optional so a partial response
    is better than a 5xx.
    """
    if not settings.groq_api_key:
        raise ValueError("groq_api_key is not configured")

    client = AsyncGroq(api_key=settings.groq_api_key)

    try:
        response = await client.chat.completions.create(
            model=_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=4096,
            response_format=_GROQ_RESPONSE_FORMAT,
        )
    except Exception as exc:
        logger.warning("Groq sentiment call failed: %s", exc)
        return GenerationResult(sentiment=None, raw_text=None)

    prompt_toks, completion_toks, total_toks = _extract_token_usage(response)
    text = response.choices[0].message.content or ""

    if not text.strip():
        logger.warning("Groq returned an empty response")
        return GenerationResult(
            sentiment=None,
            raw_text=None,
            prompt_tokens=prompt_toks,
            completion_tokens=completion_toks,
            total_tokens=total_toks,
        )

    try:
        sentiment = _parse_sentiment(text)
    except (json.JSONDecodeError, ValidationError, ValueError) as exc:
        logger.warning(
            "Groq response failed validation: %s | raw=%s",
            exc,
            text[:400],
        )
        sentiment = None

    return GenerationResult(
        sentiment=sentiment,
        raw_text=text,
        prompt_tokens=prompt_toks,
        completion_tokens=completion_toks,
        total_tokens=total_toks,
    )
