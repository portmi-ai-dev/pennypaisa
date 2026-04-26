"""Pydantic models for AI market intelligence responses."""

from typing import Literal

from pydantic import BaseModel, Field


MarketType = Literal["bull", "bear", "neutral"]
Confidence = Literal["low", "medium", "high"]
Horizon = Literal["short-term", "medium-term", "long-term"]


class KeyLevels(BaseModel):
    """Support / resistance levels surfaced by the analyst layer."""

    support: str | None = None
    resistance: str | None = None


class AssetSentiment(BaseModel):
    """Analyst-grade sentiment summary for a single asset.

    Legacy fields (`marketType`, `reasoning`, `cowenView`, `solowayView`,
    `lastUpdated`) are preserved for the existing 3D hover panels. Extra
    fields are optional enrichments — the frontend can opt in progressively.
    """

    # --- Legacy fields (consumed by the in-scene hover panels today) ---
    marketType: MarketType
    reasoning: str
    cowenView: str
    solowayView: str
    lastUpdated: str | None = None

    # --- Enriched analyst fields ---
    confidence: Confidence | None = None
    horizon: Horizon | None = None
    keyLevels: KeyLevels | None = None
    catalysts: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    technicalSignal: str | None = None
    macroContext: str | None = None


class IntelSentimentResponse(BaseModel):
    """Response payload for aggregated market intelligence."""

    crypto: AssetSentiment | None = None
    gold: AssetSentiment | None = None
    silver: AssetSentiment | None = None
    timestamp: str
