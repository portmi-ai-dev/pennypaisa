"""Market sentiment API routes."""

import asyncio
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request

from app.core.rate_limit import limiter
from app.sentiment._common import generate_and_cache
from app.sentiment.aggregator import aggregate_sentiments, current_timestamp, fetch_asset_sentiment
from app.models.sentiment import AssetSentiment, IntelSentimentResponse
from app.services.aggregator import aggregate_prices

router = APIRouter(prefix="/api", tags=["sentiment"])

Asset = Literal["gold", "silver", "crypto", "bitcoin"]

_ASSET_ALIASES: dict[str, Literal["gold", "silver", "crypto"]] = {
    "gold": "gold",
    "silver": "silver",
    "crypto": "crypto",
    "bitcoin": "crypto",
    "btc": "crypto",
}


@router.get("/sentiment", response_model=IntelSentimentResponse)
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


@router.get("/sentiment/{asset}", response_model=AssetSentiment)
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


@router.post("/sentiment/regenerate", response_model=IntelSentimentResponse)
@limiter.limit("5/minute")
async def regenerate_sentiment(request: Request) -> IntelSentimentResponse:
    """Force-regenerate sentiment for all assets — bypasses cache, writes DB + history.

    Calls Groq for crypto, gold, and silver in parallel, persists results,
    then returns the freshly generated data. Never returns cached data.
    """
    try:
        prices = await aggregate_prices(request.app.state.http_client)
        crypto, gold, silver = await asyncio.gather(
            generate_and_cache("crypto", prices),
            generate_and_cache("gold", prices),
            generate_and_cache("silver", prices),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Sentiment regeneration failed",
                "message": str(exc),
            },
        ) from exc

    return IntelSentimentResponse(
        crypto=crypto,
        gold=gold,
        silver=silver,
        timestamp=current_timestamp(),
    )


# ── Backward-compat aliases for /api/intel/sentiment* ──────────────────
# Frontend may still call the old paths. These simply delegate to the
# handlers above so there's zero code duplication.


@router.get("/intel/sentiment", response_model=IntelSentimentResponse, include_in_schema=False)
@limiter.limit("30/minute")
async def get_sentiment_legacy(request: Request) -> IntelSentimentResponse:
    return await get_sentiment(request)


@router.get("/intel/sentiment/{asset}", response_model=AssetSentiment, include_in_schema=False)
@limiter.limit("60/minute")
async def get_asset_sentiment_legacy(
    asset: Asset, request: Request, refresh: bool = Query(False),
) -> AssetSentiment:
    return await get_asset_sentiment(asset, request, refresh)


@router.post("/intel/sentiment/regenerate", response_model=IntelSentimentResponse, include_in_schema=False)
@limiter.limit("5/minute")
async def regenerate_sentiment_legacy(request: Request) -> IntelSentimentResponse:
    return await regenerate_sentiment(request)
