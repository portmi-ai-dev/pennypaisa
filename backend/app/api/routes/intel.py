"""Market intelligence API routes."""

from fastapi import APIRouter, HTTPException, Request

from app.intel.aggregator import aggregate_sentiments
from app.models.intel import IntelSentimentResponse

router = APIRouter(prefix="/api", tags=["intel"])


@router.get("/intel/sentiment", response_model=IntelSentimentResponse)
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