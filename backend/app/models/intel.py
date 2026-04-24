"""Pydantic models for AI market intelligence responses."""

from typing import Literal

from pydantic import BaseModel


class AssetSentiment(BaseModel):
    """Normalized sentiment summary for an asset."""

    marketType: Literal["bull", "bear", "neutral"]
    reasoning: str
    cowenView: str
    solowayView: str
    lastUpdated: str | None = None


class IntelSentimentResponse(BaseModel):
    """Response payload for aggregated market intelligence."""

    crypto: AssetSentiment | None = None
    gold: AssetSentiment | None = None
    silver: AssetSentiment | None = None
    timestamp: str