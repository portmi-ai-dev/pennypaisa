"""Market intelligence API routes."""

from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request

from app.core.rate_limit import limiter
from app.intel.aggregator import aggregate_sentiments, fetch_asset_sentiment
from app.models.intel import AssetSentiment, IntelSentimentResponse

router = APIRouter(prefix="/api", tags=["intel"])

Asset = Literal["gold", "silver", "crypto", "bitcoin"]

_ASSET_ALIASES: dict[str, Literal["gold", "silver", "crypto"]] = {
    "gold": "gold",
    "silver": "silver",
    "crypto": "crypto",
    "bitcoin": "crypto",
    "btc": "crypto",
}


@router.get("/intel/sentiment", response_model=IntelSentimentResponse)
@limiter.limit("30/minute")
async def get_sentiment(request: Request) -> IntelSentimentResponse:
    """Return the latest Gemini-driven sentiment for all assets."""
    try:
        return await aggregate_sentiments(request.app.state.http_client)
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Gemini sentiment unavailable",
                "message": str(exc),
            },
        ) from exc


@router.get("/intel/sentiment/{asset}", response_model=AssetSentiment)
@limiter.limit("60/minute")
async def get_asset_sentiment(
    asset: Asset,
    request: Request,
    refresh: bool = Query(False, description="Bypass cache and regenerate."),
) -> AssetSentiment:
    """Return sentiment for a single asset — powers the bullion-hover panel.

    Served from cache on the hot path (~ms). On a cache miss we fetch fresh
    prices and call Gemini once, then cache for 10 minutes.
    """
    normalized = _ASSET_ALIASES.get(asset.lower())
    if normalized is None:
        raise HTTPException(status_code=404, detail=f"Unknown asset '{asset}'")

    try:
        sentiment = await fetch_asset_sentiment(
            request.app.state.http_client,
            normalized,
            force_refresh=refresh,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Gemini sentiment unavailable",
                "asset": normalized,
                "message": str(exc),
            },
        ) from exc

    if sentiment is None:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Gemini sentiment unavailable",
                "asset": normalized,
                "message": "Upstream model returned no usable response.",
            },
        )
    return sentiment
