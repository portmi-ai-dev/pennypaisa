"""Market sentiment API routes."""

from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request

from app.core.rate_limit import limiter
from app.sentiment._common import generate_and_cache, generate_and_cache_with_meta
from app.sentiment.aggregator import (
    aggregate_sentiments,
    current_timestamp,
    fetch_asset_sentiment,
    regenerate_single_asset,
)
from app.sentiment.gemini.generator import generate_sentiment_gemini
from app.models.sentiment import (
    AssetSentiment,
    BulkSentimentRegenerateResponse,
    GeminiSentimentResponse,
    IntelSentimentResponse,
    SentimentRegenerateResponse,
)

router = APIRouter(prefix="/api", tags=["sentiment"])

Asset = Literal["gold", "silver", "crypto", "bitcoin"]

_ASSET_ALIASES: dict[str, Literal["gold", "silver", "crypto"]] = {
    "gold": "gold",
    "silver": "silver",
    "crypto": "crypto",
    "bitcoin": "crypto",
    "btc": "crypto",
}

GeminiModel = Literal[
    "gemini-2.5-flash-lite",
    "gemini-2.5-pro",
    "gemini-3-pro-preview",
]


@router.get("/sentiment", response_model=IntelSentimentResponse)
@limiter.limit("30/minute")
async def get_sentiment(request: Request) -> IntelSentimentResponse:
    """Return the latest sentiment for all assets."""
    try:
        return await aggregate_sentiments()
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Sentiment unavailable",
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
    """Return sentiment for a single asset — powers the bullion-hover panel."""
    normalized = _ASSET_ALIASES.get(asset.lower())
    if normalized is None:
        raise HTTPException(status_code=404, detail=f"Unknown asset '{asset}'")

    try:
        sentiment = await fetch_asset_sentiment(
            normalized,
            force_refresh=refresh,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Sentiment unavailable",
                "asset": normalized,
                "message": str(exc),
            },
        ) from exc

    if sentiment is None:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Sentiment unavailable",
                "asset": normalized,
                "message": "Upstream model returned no usable response.",
            },
        )
    return sentiment


@router.post("/sentiment/regenerate/{asset}", response_model=SentimentRegenerateResponse)
@limiter.limit("5/minute")
async def regenerate_asset_sentiment(
    asset: Asset,
    request: Request,
) -> SentimentRegenerateResponse:
    """Force-regenerate sentiment for a single asset via Groq. Bypasses cache.

    Returns sentiment + model name + token usage metadata.
    """
    normalized = _ASSET_ALIASES.get(asset.lower())
    if normalized is None:
        raise HTTPException(status_code=404, detail=f"Unknown asset '{asset}'")

    try:
        result = await generate_and_cache_with_meta(normalized)
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={"error": "Sentiment regeneration failed", "asset": normalized, "message": str(exc)},
        ) from exc

    if result.sentiment is None:
        raise HTTPException(
            status_code=503,
            detail={"error": "Sentiment regeneration failed", "asset": normalized, "message": "Model returned no usable response."},
        )
    return SentimentRegenerateResponse(
        sentiment=result.sentiment,
        model=result.model,
        promptTokens=result.prompt_tokens,
        completionTokens=result.completion_tokens,
        totalTokens=result.total_tokens,
    )


def _wrap_result(result) -> SentimentRegenerateResponse | None:
    if result.sentiment is None:
        return None
    return SentimentRegenerateResponse(
        sentiment=result.sentiment,
        model=result.model,
        promptTokens=result.prompt_tokens,
        completionTokens=result.completion_tokens,
        totalTokens=result.total_tokens,
    )


@router.post("/sentiment/regenerate", response_model=BulkSentimentRegenerateResponse)
@limiter.limit("3/minute")
async def regenerate_sentiment(request: Request) -> BulkSentimentRegenerateResponse:
    """Force-regenerate sentiment for all assets via Groq — sequential to respect TPM.

    Returns each asset's sentiment + model + token usage.
    """
    try:
        crypto = await generate_and_cache_with_meta("crypto")
        gold = await generate_and_cache_with_meta("gold")
        silver = await generate_and_cache_with_meta("silver")
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={"error": "Sentiment regeneration failed", "message": str(exc)},
        ) from exc

    return BulkSentimentRegenerateResponse(
        crypto=_wrap_result(crypto),
        gold=_wrap_result(gold),
        silver=_wrap_result(silver),
        timestamp=current_timestamp(),
    )


@router.post(
    "/sentiment/regenerate-gemini/{asset}",
    response_model=GeminiSentimentResponse,
)
@limiter.limit("5/minute")
async def regenerate_asset_sentiment_gemini(
    asset: Asset,
    request: Request,
    feed_transcripts: bool = Query(
        True,
        description="If true, include YouTube analyst transcripts in the prompt.",
    ),
    enable_grounding: bool = Query(
        True,
        description="If true, enable Google Search grounding for live data.",
    ),
    model: GeminiModel = Query(
        "gemini-2.5-flash-lite",
        description="Gemini model to use. Lets you compare pricing/tokens across tiers.",
    ),
) -> GeminiSentimentResponse:
    """Regenerate sentiment for a single asset via Gemini.

    Routes through Gemini with optional Google Search grounding.
    Caller can pick between flash-lite (cheap), pro (balanced), or
    3-pro-preview (premium) to compare quality vs cost.
    Does NOT write to the shared sentiment cache — this endpoint is for
    on-demand Gemini comparisons.
    """
    normalized = _ASSET_ALIASES.get(asset.lower())
    if normalized is None:
        raise HTTPException(status_code=404, detail=f"Unknown asset '{asset}'")

    try:
        result = await generate_sentiment_gemini(
            normalized,
            feed_transcripts=feed_transcripts,
            enable_grounding=enable_grounding,
            model=model,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Gemini sentiment generation failed",
                "asset": normalized,
                "message": str(exc),
            },
        ) from exc

    if result.sentiment is None:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Gemini sentiment generation failed",
                "asset": normalized,
                "message": "Model returned no parseable response.",
                "rawResponse": (result.raw_text or "")[:500],
            },
        )

    return GeminiSentimentResponse(
        sentiment=result.sentiment,
        model=result.model,
        feedTranscripts=result.feed_transcripts,
        groundingEnabled=result.grounding_enabled,
        groundingSourcesCount=result.grounding_sources_count,
        promptTokens=result.prompt_tokens,
        completionTokens=result.completion_tokens,
        thoughtsTokens=result.thoughts_tokens,
        toolUseTokens=result.tool_use_tokens,
        cachedTokens=result.cached_tokens,
        totalTokens=result.total_tokens,
    )


# ── Backward-compat aliases for /api/intel/sentiment* ──────────────────


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


@router.post("/intel/sentiment/regenerate/{asset}", response_model=SentimentRegenerateResponse, include_in_schema=False)
@limiter.limit("5/minute")
async def regenerate_asset_sentiment_legacy(asset: Asset, request: Request) -> SentimentRegenerateResponse:
    return await regenerate_asset_sentiment(asset, request)


@router.post("/intel/sentiment/regenerate", response_model=BulkSentimentRegenerateResponse, include_in_schema=False)
@limiter.limit("3/minute")
async def regenerate_sentiment_legacy(request: Request) -> BulkSentimentRegenerateResponse:
    return await regenerate_sentiment(request)
