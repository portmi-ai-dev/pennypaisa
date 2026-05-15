"""Shared Groq generation orchestration — ephemeral, no DB persistence.

Groq sentiment results are NOT cached in Neon. Only Gemini sentiment is
persisted (see ``app.sentiment.gemini``). The Groq endpoints remain
operational for live A/B comparison against Gemini, but every call is
freshly generated.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Literal

from app.sentiment.prompts import build_prompt
from app.sentiment.transcripts import (
    fetch_recent_transcripts,
    format_transcripts_for_prompt,
)
from app.sentiment.utils import generate_sentiment
from app.models.sentiment import AssetSentiment

logger = logging.getLogger(__name__)

Asset = Literal["gold", "silver", "crypto"]

GROQ_MODEL_NAME = "llama-3.3-70b-versatile"


@dataclass(slots=True)
class SentimentGenerationResult:
    """Sentiment + metadata returned by generate_and_cache_with_meta."""

    sentiment: AssetSentiment | None
    model: str
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None


_transcript_block_cache: str | None = None


async def _get_transcript_block() -> str:
    """In-memory transcript cache for a single Groq batch."""
    global _transcript_block_cache
    if _transcript_block_cache is not None:
        return _transcript_block_cache
    try:
        transcripts = await fetch_recent_transcripts()
        _transcript_block_cache = format_transcripts_for_prompt(transcripts)
    except Exception as exc:
        logger.warning("Failed to fetch transcripts for sentiment: %s", exc)
        _transcript_block_cache = ""
    return _transcript_block_cache


def clear_transcript_cache() -> None:
    """Reset the in-memory transcript cache."""
    global _transcript_block_cache
    _transcript_block_cache = None


async def generate_and_cache_with_meta(asset: Asset) -> SentimentGenerationResult:
    """Call Groq and return result + metadata. Does NOT persist to DB."""
    transcript_block = await _get_transcript_block()
    prompt = build_prompt(asset, transcript_block=transcript_block)
    result = await generate_sentiment(prompt)
    return SentimentGenerationResult(
        sentiment=result.sentiment,
        model=GROQ_MODEL_NAME,
        prompt_tokens=result.prompt_tokens,
        completion_tokens=result.completion_tokens,
        total_tokens=result.total_tokens,
    )


async def generate_and_cache(asset: Asset) -> AssetSentiment | None:
    """Thin wrapper for callers that don't need metadata."""
    result = await generate_and_cache_with_meta(asset)
    return result.sentiment
