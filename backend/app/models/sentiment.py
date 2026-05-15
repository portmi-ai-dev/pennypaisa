"""Pydantic models for AI market intelligence responses."""

from typing import Literal

from pydantic import BaseModel


Consensus = Literal["bull", "bear", "neutral"]
Confidence = Literal["low", "medium", "high"]


class AssetSentiment(BaseModel):
    """Transcript-derived sentiment summary for a single asset."""

    consensus: Consensus
    nearTermView: str
    longTermView: str
    confidence: Confidence | None = None
    lastUpdated: str | None = None


class IntelSentimentResponse(BaseModel):
    """Response payload for aggregated market intelligence."""

    crypto: AssetSentiment | None = None
    gold: AssetSentiment | None = None
    silver: AssetSentiment | None = None
    timestamp: str
