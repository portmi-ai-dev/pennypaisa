"""Chat API endpoints."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.chat import chat_with_gemini

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    """User chat message request."""

    message: str


class ChatResponse(BaseModel):
    """Chat response from Gemini."""

    answer: str


@router.post("/query")
async def query_gemini(request: ChatRequest) -> ChatResponse:
    """
    Query Gemini with a user message.

    Args:
        request: ChatRequest containing the user's message

    Returns:
        ChatResponse with Gemini's answer
    """
    if not request.message or not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    try:
        answer = await chat_with_gemini(request.message)
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Gemini API error",
                "message": str(exc),
            },
        ) from exc

    return ChatResponse(answer=answer)
