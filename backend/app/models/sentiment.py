"""Pydantic models for AI market intelligence responses."""

from typing import Any, Literal

from pydantic import BaseModel


Consensus = Literal["bull", "bear", "neutral"]
Confidence = Literal["low", "medium", "high"]


class AssetSentiment(BaseModel):
    """Transcript-derived sentiment summary for a single asset."""

    consensus: Consensus
    summary: str
    analystView: str
    confidence: Confidence | None = None
    lastUpdated: str | None = None


class IntelSentimentResponse(BaseModel):
    """Response payload for aggregated market intelligence (cached reads)."""

    crypto: AssetSentiment | None = None
    gold: AssetSentiment | None = None
    silver: AssetSentiment | None = None
    timestamp: str


class SentimentRegenerateResponse(BaseModel):
    """Groq-generated sentiment with token usage metadata.

    Returned by the default regeneration endpoint so callers can see
    which model produced the answer and what it cost in tokens.
    """

    sentiment: AssetSentiment
    model: str
    promptTokens: int | None = None
    completionTokens: int | None = None
    totalTokens: int | None = None


class BulkSentimentRegenerateResponse(BaseModel):
    """Bulk-regenerate response with per-asset metadata."""

    crypto: SentimentRegenerateResponse | None = None
    gold: SentimentRegenerateResponse | None = None
    silver: SentimentRegenerateResponse | None = None
    timestamp: str


class GeminiSentimentResponse(BaseModel):
    """Gemini-generated sentiment with grounding metadata and token usage.

    Gemini 2.5 models are 'thinking' models — they consume hidden reasoning
    tokens (thoughtsTokens) that are billed but not in the visible output.
    Grounding search adds toolUseTokens for internal search calls.
    totalTokens = promptTokens + completionTokens + thoughtsTokens + toolUseTokens
                  + cachedTokens (if cache hits).
    """

    sentiment: AssetSentiment
    model: str
    feedTranscripts: bool
    groundingEnabled: bool
    groundingSourcesCount: int = 0
    groundingMetadata: dict[str, Any] | None = None
    promptTokens: int | None = None
    completionTokens: int | None = None
    thoughtsTokens: int | None = None
    toolUseTokens: int | None = None
    cachedTokens: int | None = None
    totalTokens: int | None = None
