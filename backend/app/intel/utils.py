"""Gemini-driven sentiment generation — prompt → validated `AssetSentiment`.

Design notes:

* When grounding (Google Search) is enabled, Gemini forbids `response_mime_type`
  and `response_schema`, so we rely on the prompt's explicit JSON contract plus
  a resilient parser that strips code fences and repairs minor shape issues.
* When grounding is disabled, we request `application/json` with a strict
  `response_schema` so Gemini returns the exact shape every time.
* Parsing is defensive: missing optional fields are tolerated; lists and key
  levels are coerced to empty / None rather than raising.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from google.genai import types
from pydantic import ValidationError

from app.core.config import settings
from app.core.gemini import get_gemini_client
from app.models.intel import AssetSentiment, KeyLevels


@dataclass(slots=True)
class GenerationResult:
    """What ``generate_sentiment`` hands back to fetchers + history writer."""

    sentiment: AssetSentiment | None
    raw_text: str | None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None


def _extract_token_usage(response: Any) -> tuple[int | None, int | None, int | None]:
    """Pull ``(prompt, completion, total)`` token counts from a Gemini response.

    The google-genai SDK exposes these on ``response.usage_metadata``. Fields
    are optional — different models / grounding modes may omit some — so we
    return None for anything missing rather than fail.
    """
    meta = getattr(response, "usage_metadata", None)
    if meta is None:
        return None, None, None
    return (
        getattr(meta, "prompt_token_count", None),
        getattr(meta, "candidates_token_count", None),
        getattr(meta, "total_token_count", None),
    )

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Response schema for strict structured output (non-grounded path)
# ---------------------------------------------------------------------------


def _response_schema() -> types.Schema:
    """JSON schema matching `AssetSentiment` — consumed by Gemini directly."""
    str_type = types.Schema(type="STRING")
    return types.Schema(
        type="OBJECT",
        required=[
            "marketType",
            "reasoning",
            "analystView",
        ],
        properties={
            "marketType": types.Schema(type="STRING", enum=["bull", "bear", "neutral"]),
            "confidence": types.Schema(type="STRING", enum=["low", "medium", "high"]),
            "horizon": types.Schema(
                type="STRING",
                enum=["short-term", "medium-term", "long-term"],
            ),
            "reasoning": str_type,
            "analystView": str_type,
            "technicalSignal": str_type,
            "macroContext": str_type,
            "keyLevels": types.Schema(
                type="OBJECT",
                properties={
                    "support": str_type,
                    "resistance": str_type,
                },
            ),
            "catalysts": types.Schema(type="ARRAY", items=str_type),
            "risks": types.Schema(type="ARRAY", items=str_type),
        },
    )


# ---------------------------------------------------------------------------
# Response parsing
# ---------------------------------------------------------------------------


_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE | re.MULTILINE)


def _strip_fences(text: str) -> str:
    """Strip markdown code fences that Gemini sometimes adds despite instructions."""
    return _FENCE_RE.sub("", text.strip()).strip()


def _extract_json_object(text: str) -> str:
    """Locate the first top-level JSON object in text.

    Grounded responses can include a short preamble before the JSON. This
    finds the first `{` and walks to its matching `}` so we don't misparse.
    """
    start = text.find("{")
    if start == -1:
        return text
    depth = 0
    in_str = False
    escape = False
    for i in range(start, len(text)):
        ch = text[i]
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return text[start:]


def _trim_words(value: str, limit: int) -> str:
    value = value.strip()
    words = value.split()
    if len(words) <= limit:
        return value
    trimmed = " ".join(words[:limit]).rstrip(",.;:—- ")
    return trimmed + "…"


def _coerce_key_levels(raw: Any) -> KeyLevels | None:
    if not isinstance(raw, dict):
        return None
    support = raw.get("support")
    resistance = raw.get("resistance")
    if support is None and resistance is None:
        return None
    return KeyLevels(
        support=str(support).strip() if support else None,
        resistance=str(resistance).strip() if resistance else None,
    )


def _coerce_string_list(raw: Any, limit: int = 3) -> list[str]:
    if not isinstance(raw, list):
        return []
    cleaned = [str(item).strip() for item in raw if str(item).strip()]
    return cleaned[:limit]


def _parse_sentiment(text: str) -> AssetSentiment:
    """Parse Gemini response JSON into an `AssetSentiment`.

    Tolerates minor shape issues: extra prose around the JSON, missing
    optional fields, oversized strings, and list items.
    """
    cleaned = _extract_json_object(_strip_fences(text))
    payload = json.loads(cleaned)

    if not isinstance(payload, dict):
        raise ValueError("Gemini payload is not an object")

    reasoning = _trim_words(str(payload.get("reasoning", "")), 40)
    analyst = _trim_words(str(payload.get("analystView", "")), 60)
    technical = payload.get("technicalSignal")
    macro = payload.get("macroContext")

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

    normalized: dict[str, Any] = {
        "marketType": market_type,
        "reasoning": reasoning or "Signals are mixed; conviction low.",
        "analystView": analyst or "Watching macro structure and technical levels; no high-conviction setup yet.",
        "confidence": confidence,
        "horizon": horizon,
        "technicalSignal": _trim_words(str(technical), 24) if technical else None,
        "macroContext": _trim_words(str(macro), 30) if macro else None,
        "keyLevels": _coerce_key_levels(payload.get("keyLevels")),
        "catalysts": _coerce_string_list(payload.get("catalysts")),
        "risks": _coerce_string_list(payload.get("risks")),
        "lastUpdated": datetime.now().strftime("%b %d, %Y %H:%M"),
    }
    return AssetSentiment(**normalized)


# ---------------------------------------------------------------------------
# Gemini call
# ---------------------------------------------------------------------------


def _build_config() -> types.GenerateContentConfig:
    """Build the Gemini config — grounding takes precedence when enabled."""
    if settings.GEMINI_ENABLE_GROUNDING:
        # Grounding + structured output are mutually exclusive in the current
        # Gemini API. The prompt carries the JSON schema contract instead.
        return types.GenerateContentConfig(
            tools=[types.Tool(google_search=types.GoogleSearch())],
            temperature=0.4,
        )
    return types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=_response_schema(),
        temperature=0.3,
    )


async def generate_sentiment(prompt: str) -> GenerationResult:
    """Run the prompt through Gemini and return parsed sentiment + metadata.

    Returns a ``GenerationResult`` with ``sentiment=None`` on any failure —
    the aggregator treats missing assets as optional so a partial response
    is better than a 5xx. Raw text and token usage are returned (when
    available) so callers can persist them in the history table for
    analytics even when parsing fails.
    """
    if not settings.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not configured")

    client = get_gemini_client()
    config = _build_config()

    try:
        response = client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=prompt,
            config=config,
        )
    except Exception as exc:
        logger.warning("Gemini sentiment call failed: %s", exc)
        return GenerationResult(sentiment=None, raw_text=None)

    prompt_toks, completion_toks, total_toks = _extract_token_usage(response)
    text = response.text or ""
    if not text.strip():
        logger.warning("Gemini returned an empty response")
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
            "Gemini response failed validation: %s | raw=%s",
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
