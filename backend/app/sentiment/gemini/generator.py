"""Gemini-driven sentiment generation with optional grounding search.

Uses the same prompt builders as the Groq path but routes through
Gemini with optional Google Search grounding. Lets the caller decide
whether to feed YouTube transcripts or rely purely on grounded search.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from google import genai
from google.genai import types

from app.core.config import settings
from app.models.sentiment import AssetSentiment
from app.sentiment.prompts import build_prompt
from app.sentiment.transcripts import (
    fetch_recent_transcripts,
    format_transcripts_for_prompt,
)

logger = logging.getLogger(__name__)

Asset = str


@dataclass(slots=True)
class GeminiGenerationResult:
    sentiment: AssetSentiment | None
    raw_text: str | None
    prompt: str
    model: str
    feed_transcripts: bool
    grounding_enabled: bool
    grounding_sources_count: int = 0
    grounding_metadata: dict[str, Any] | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    thoughts_tokens: int | None = None
    tool_use_tokens: int | None = None
    cached_tokens: int | None = None
    total_tokens: int | None = None


_GROUNDING_INSTRUCTION = (
    "\nADDITIONAL CONTEXT — You have access to Google Search grounding. "
    "Use it to verify current prices, recent news, geopolitical events, "
    "and macro data (CPI, PPI, DXY, yields, Fed actions). Search for the "
    "most recent data points to inform your view. Cite specific levels and "
    "recent events you find through grounding.\n"
)


def _strip_json_fences(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1] if "\n" in cleaned else cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
    return cleaned.strip()


def _extract_json_object(text: str) -> str:
    """Find first JSON object in text, even if wrapped in prose."""
    cleaned = _strip_json_fences(text)
    if cleaned.startswith("{"):
        return cleaned
    match = re.search(r"\{[\s\S]*\}", cleaned)
    if match:
        return match.group(0)
    return cleaned


def _parse_sentiment(text: str) -> AssetSentiment:
    """Parse JSON into an AssetSentiment."""
    raw_json = _extract_json_object(text)
    payload = json.loads(raw_json)

    if not isinstance(payload, dict):
        raise ValueError("Gemini payload is not an object")

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
        analystView=analyst_view or "Insufficient signal data to form detailed view.",
        confidence=confidence,
        lastUpdated=datetime.now().strftime("%b %d, %Y %H:%M"),
    )


def _extract_token_usage(response: Any) -> dict[str, int | None]:
    """Extract all Gemini token components.

    Gemini 2.5 models are 'thinking' models — they spend hidden reasoning
    tokens (thoughts_token_count) that are billed but not visible in the
    response text. Grounding search also consumes tool_use tokens.
    total_token_count = prompt + candidates + thoughts + tool_use + cached.
    """
    usage = getattr(response, "usage_metadata", None)
    if usage is None:
        return {
            "prompt": None,
            "completion": None,
            "thoughts": None,
            "tool_use": None,
            "cached": None,
            "total": None,
        }
    return {
        "prompt": getattr(usage, "prompt_token_count", None),
        "completion": getattr(usage, "candidates_token_count", None),
        "thoughts": getattr(usage, "thoughts_token_count", None),
        "tool_use": getattr(usage, "tool_use_prompt_token_count", None),
        "cached": getattr(usage, "cached_content_token_count", None),
        "total": getattr(usage, "total_token_count", None),
    }


def _count_grounding_sources(response: Any) -> int:
    """Count grounding chunks returned by Gemini search tool."""
    try:
        candidates = getattr(response, "candidates", None) or []
        if not candidates:
            return 0
        grounding = getattr(candidates[0], "grounding_metadata", None)
        if grounding is None:
            return 0
        chunks = getattr(grounding, "grounding_chunks", None) or []
        return len(chunks)
    except Exception:
        return 0


def _extract_grounding_metadata(response: Any) -> dict[str, Any] | None:
    """Extract full grounding metadata: search queries + fetched chunks.

    Returns dict with:
        search_queries: list of queries Gemini issued
        chunks: list of {title, uri, snippet} for each grounding result
        supports: list of {text, chunk_indices} showing which response
                  segments are backed by which sources
    """
    try:
        candidates = getattr(response, "candidates", None) or []
        if not candidates:
            return None
        grounding = getattr(candidates[0], "grounding_metadata", None)
        if grounding is None:
            return None

        search_queries = getattr(grounding, "web_search_queries", None) or []

        raw_chunks = getattr(grounding, "grounding_chunks", None) or []
        chunks = []
        for chunk in raw_chunks:
            web = getattr(chunk, "web", None)
            if web:
                chunks.append({
                    "title": getattr(web, "title", None),
                    "uri": getattr(web, "uri", None),
                })
            else:
                retrieved = getattr(chunk, "retrieved_context", None)
                if retrieved:
                    chunks.append({
                        "title": getattr(retrieved, "title", None),
                        "uri": getattr(retrieved, "uri", None),
                    })

        raw_supports = getattr(grounding, "grounding_supports", None) or []
        supports = []
        for support in raw_supports:
            segment = getattr(support, "segment", None)
            text = getattr(segment, "text", "") if segment else ""
            indices = getattr(support, "grounding_chunk_indices", None) or []
            confidence_scores = getattr(support, "confidence_scores", None) or []
            supports.append({
                "text": text,
                "chunk_indices": list(indices),
                "confidence_scores": [float(s) for s in confidence_scores],
            })

        if not search_queries and not chunks:
            return None

        return {
            "search_queries": list(search_queries),
            "chunks": chunks,
            "supports": supports,
        }
    except Exception:
        return None


async def generate_sentiment_gemini(
    asset: str,
    *,
    feed_transcripts: bool = True,
    enable_grounding: bool = True,
    model: str | None = None,
) -> GeminiGenerationResult:
    """Generate sentiment via Gemini with optional transcripts + grounding.

    ``model`` overrides the default GEMINI_MODEL from settings. Caller can
    pass any valid Gemini model ID to compare pricing/token usage across
    flash-lite, pro, and preview tiers.
    """
    if not settings.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not configured")

    model_name = model or settings.GEMINI_MODEL

    transcript_block = ""
    if feed_transcripts:
        try:
            transcripts = await fetch_recent_transcripts()
            transcript_block = format_transcripts_for_prompt(transcripts)
        except Exception as exc:
            logger.warning("Failed to fetch transcripts for Gemini sentiment: %s", exc)

    prompt = build_prompt(asset, transcript_block=transcript_block)

    if enable_grounding:
        prompt = prompt + _GROUNDING_INSTRUCTION

    client = genai.Client(api_key=settings.GEMINI_API_KEY)

    config_kwargs: dict[str, Any] = {
        "temperature": 0.0,
        "max_output_tokens": 8192,
    }
    if enable_grounding:
        config_kwargs["tools"] = [
            types.Tool(google_search=types.GoogleSearch())
        ]

    config = types.GenerateContentConfig(**config_kwargs)

    try:
        response = await asyncio.to_thread(
            client.models.generate_content,
            model=model_name,
            contents=prompt,
            config=config,
        )
    except Exception as exc:
        logger.warning("Gemini sentiment call failed (model=%s): %s", model_name, exc)
        raise

    tokens = _extract_token_usage(response)
    sources_count = _count_grounding_sources(response)
    grounding_meta = _extract_grounding_metadata(response)
    text = response.text or ""

    sentiment: AssetSentiment | None = None
    if text.strip():
        try:
            sentiment = _parse_sentiment(text)
        except (json.JSONDecodeError, ValueError) as exc:
            logger.warning(
                "Gemini response failed JSON parse: %s | raw=%s",
                exc,
                text[:400],
            )

    return GeminiGenerationResult(
        sentiment=sentiment,
        raw_text=text,
        prompt=prompt,
        model=model_name,
        feed_transcripts=feed_transcripts,
        grounding_enabled=enable_grounding,
        grounding_sources_count=sources_count,
        grounding_metadata=grounding_meta,
        prompt_tokens=tokens["prompt"],
        completion_tokens=tokens["completion"],
        thoughts_tokens=tokens["thoughts"],
        tool_use_tokens=tokens["tool_use"],
        cached_tokens=tokens["cached"],
        total_tokens=tokens["total"],
    )
