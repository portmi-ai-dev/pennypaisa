"""Pydantic models for AI market intelligence responses."""

from typing import Literal

from pydantic import BaseModel


MarketType = Literal["bull", "bear", "neutral"]
Confidence = Literal["low", "medium", "high"]
Horizon = Literal["short-term", "medium-term", "long-term"]


class AssetSentiment(BaseModel):
    """Analyst-grade sentiment summary for a single asset."""

    marketType: MarketType
    confidence: Confidence | None = None
    horizon: Horizon | None = None
    reasoning: str
    analystView: str
    lastUpdated: str | None = None


class IntelSentimentResponse(BaseModel):
    """Response payload for aggregated market intelligence."""

    crypto: AssetSentiment | None = None
    gold: AssetSentiment | None = None
    silver: AssetSentiment | None = None
    timestamp: str
