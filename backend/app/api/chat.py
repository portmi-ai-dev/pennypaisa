"""Chat API endpoints."""

from fastapi import APIRouter, HTTPException

from app.models.chat import ChatRequest, ChatResponse
from app.services.chat import ChatTurn, QuotaExceededError, chat_with_gemini

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("/query")
async def query_gemini(request: ChatRequest) -> ChatResponse:
    """Query Gemini with a user message and optional prior turns."""
    if not request.message or not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    history: list[ChatTurn] = [
        ChatTurn(role=t.role, content=t.content)
        for t in request.history
        if t.content and t.content.strip()
    ]

    try:
        answer = await chat_with_gemini(request.message, history=history)
    except QuotaExceededError as exc:
        # Surface the rate-limit truthfully as 429 so the frontend can show a
        # quota-specific message and (optionally) auto-retry.
        headers: dict[str, str] = {}
        if exc.retry_after_seconds is not None:
            headers["Retry-After"] = str(exc.retry_after_seconds)
        raise HTTPException(
            status_code=429,
            detail={
                "code": "quota_exceeded",
                "error": "Gemini quota exhausted",
                "message": str(exc),
                "retryAfter": exc.retry_after_seconds,
            },
            headers=headers or None,
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Gemini API error",
                "message": str(exc),
            },
        ) from exc

    return ChatResponse(answer=answer)
