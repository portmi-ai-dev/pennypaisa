"""Groq-driven sentiment generation — prompt → validated `AssetSentiment`.

Uses llama-3.3-70b-versatile with json_object response format. Falls back
to raw text if json_object fails. Retries on 429 (TPM exceeded) with
exponential backoff.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from groq import AsyncGroq
from pydantic import ValidationError

from app.core.config import settings
from app.models.sentiment import AssetSentiment


@dataclass(slots=True)
class GenerationResult:
    """What ``generate_sentiment`` hands back to fetchers + history writer."""

    sentiment: AssetSentiment | None
    raw_text: str | None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None


logger = logging.getLogger(__name__)


_MODEL = "llama-3.3-70b-versatile"
_MAX_COMPLETION_TOKENS = 1024
_TEMPERATURE = 0.0
_MAX_RETRIES = 3
_BASE_BACKOFF_SECONDS = 15.0


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


def _is_json_format_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return (
        "json_validate_failed" in text
        or "failed to validate json" in text
        or "does not support response format" in text
        or "response_format" in text
    )


def _is_rate_limit_error(exc: Exception) -> bool:
    text = str(exc)
    return "429" in text or "rate_limit" in text.lower()


def _parse_sentiment(text: str) -> AssetSentiment:
    """Parse JSON into an `AssetSentiment`."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

    payload = json.loads(cleaned)

    if not isinstance(payload, dict):
        raise ValueError("Groq payload is not an object")

    consensus = str(payload.get("consensus", "neutral")).lower()
    if consensus not in {"bull", "bear", "neutral"}:
        consensus = "neutral"

    confidence = payload.get("confidence")
    if isinstance(confidence, str):
        confidence = confidence.lower()
        if confidence not in {"low", "medium", "high"}:
            confidence = None
    else:
        confidence = None

    summary = str(payload.get("summary", "")).strip()
    analyst_view = str(payload.get("analystView", "")).strip()

    return AssetSentiment(
        consensus=consensus,
        summary=summary or "Market signals mixed.",
        analystView=analyst_view or "Insufficient analyst coverage to form a detailed view.",
        confidence=confidence,
        lastUpdated=datetime.now().strftime("%b %d, %Y %H:%M"),
    )


# ---------------------------------------------------------------------------
# Groq call with retry
# ---------------------------------------------------------------------------


async def _call_groq_raw(client: AsyncGroq, **kwargs: Any) -> Any:
    """Single Groq call with 429 retry + exponential backoff."""
    last_exc: Exception | None = None
    for attempt in range(_MAX_RETRIES):
        try:
            return await client.chat.completions.create(**kwargs)
        except Exception as exc:
            last_exc = exc
            if _is_rate_limit_error(exc):
                wait = _BASE_BACKOFF_SECONDS * (2 ** attempt)
                logger.info("Groq 429 — waiting %.0fs before retry %d/%d", wait, attempt + 1, _MAX_RETRIES)
                await asyncio.sleep(wait)
                continue
            raise
    raise last_exc  # type: ignore[misc]


async def generate_sentiment(prompt: str) -> GenerationResult:
    """Run the prompt through Groq and return parsed sentiment + metadata.

    Strategy:
    1. Try json_object mode (llama-3.3-70b doesn't support json_schema).
    2. On format error → retry with raw text mode.
    3. On 429 (TPM) → exponential backoff retry up to 3 times.

    Returns ``GenerationResult`` with ``sentiment=None`` on any failure.
    """
    if not settings.groq_api_key:
        raise ValueError("groq_api_key is not configured")

    client = AsyncGroq(api_key=settings.groq_api_key)

    # Attempt 1: json_object mode (llama-3.3-70b doesn't support json_schema)
    # Attempt 2: no response_format, raw parse
    response = None
    for fmt_label, fmt in [
        ("json_object", {"type": "json_object"}),
        ("raw", None),
    ]:
        try:
            kwargs: dict[str, Any] = {
                "model": _MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "max_completion_tokens": _MAX_COMPLETION_TOKENS,
                "temperature": _TEMPERATURE,
            }
            if fmt is not None:
                kwargs["response_format"] = fmt
            response = await _call_groq_raw(client, **kwargs)
            break
        except Exception as exc:
            if _is_json_format_error(exc):
                logger.warning("Groq %s JSON failed; trying next fallback", fmt_label)
                continue
            logger.warning("Groq sentiment call failed (%s): %s", fmt_label, exc)
            return GenerationResult(sentiment=None, raw_text=None)

    if response is None:
        logger.warning("All Groq response format attempts failed")
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
