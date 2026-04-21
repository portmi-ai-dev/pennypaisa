"""Pydantic models for price data."""

from pydantic import BaseModel


class PricesResponse(BaseModel):
    """Response model for aggregated prices."""

    gold: float
    silver: float
    btc: float
    btcMarketCap: float
    btcDominance: float
    goldChange: float
    goldChangePercent: float
    goldWeeklyChangePercent: float
    silverChange: float
    silverChangePercent: float
    silverWeeklyChangePercent: float
    btcChange: float
    btcChangePercent: float
    btcWeeklyChangePercent: float
    btcVolume24h: float
    btcVolumeChangePercent: float
    isWeekend: bool
    timestamp: str
    source: str
    error: str | None = None
