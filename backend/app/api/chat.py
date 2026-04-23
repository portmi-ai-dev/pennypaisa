"""Chat API endpoints."""

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.chat import ChatTurn, QuotaExceededError, chat_with_gemini

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatTurnIn(BaseModel):
    """A single prior turn in the conversation, sent by the client.

    The client sends `role: 'user' | 'assistant'`; the service maps
    'assistant' to Gemini's 'model' role internally.
    """

    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    """User chat message request.

    `message` is the new user turn. `history` is the (optional) prior
    conversation, oldest-first. Pass it to give the assistant memory of
    earlier turns within the same session.
    """

    message: str
    history: list[ChatTurnIn] = Field(default_factory=list)


class ChatResponse(BaseModel):
    """Chat response from Gemini."""

    answer: str


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
