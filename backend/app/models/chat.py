"""Pydantic models for the /chat API surface."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ChatTurnIn(BaseModel):
    """A single prior turn in the conversation, sent by the client.

    The client sends ``role: 'user' | 'assistant'``; the service maps
    'assistant' to Gemini's 'model' role internally.
    """

    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    """User chat message request.

    ``message`` is the new user turn. ``history`` is the (optional) prior
    conversation, oldest-first. Pass it to give the assistant memory of
    earlier turns within the same session.
    """

    message: str
    history: list[ChatTurnIn] = Field(default_factory=list)


class ChatResponse(BaseModel):
    """Chat response from Gemini."""

    answer: str
