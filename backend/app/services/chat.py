"""Chat service for interacting with Gemini API."""

import re
from dataclasses import dataclass
from typing import Literal

from google import genai
from google.genai import types

from app.core.config import settings


class QuotaExceededError(Exception):
    """Raised when Gemini returns RESOURCE_EXHAUSTED / 429.

    Carries an optional `retry_after_seconds` hint parsed from the Gemini
    error payload so the API layer can pass it through to the client.
    """

    def __init__(self, message: str, retry_after_seconds: int | None = None) -> None:
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


def _parse_retry_seconds(message: str) -> int | None:
    """Best-effort extraction of Gemini's `retryDelay: '23s'` hint."""
    m = re.search(r"retryDelay['\"]?\s*:\s*['\"]?(\d+(?:\.\d+)?)s", message)
    if not m:
        m = re.search(r"retry in (\d+(?:\.\d+)?)s", message, re.IGNORECASE)
    if not m:
        return None
    try:
        return max(1, int(float(m.group(1))))
    except (TypeError, ValueError):
        return None


@dataclass
class ChatTurn:
    """A prior turn in the conversation.

    Use `role='user'` for the human and `role='assistant'` for the model.
    The service maps 'assistant' -> Gemini's 'model' role internally.
    """

    role: Literal["user", "assistant"]
    content: str


def _to_gemini_contents(
    history: list[ChatTurn],
    user_message: str,
) -> list[types.Content]:
    """Build a Gemini multi-turn `contents` list from history + new message.

    Gemini expects roles to alternate user/model. We don't enforce strict
    alternation here — Gemini handles consecutive same-role turns gracefully —
    but we do map 'assistant' -> 'model' which Gemini requires.
    """
    contents: list[types.Content] = []
    for turn in history:
        gemini_role = "model" if turn.role == "assistant" else "user"
        contents.append(
            types.Content(
                role=gemini_role,
                parts=[types.Part.from_text(text=turn.content)],
            )
        )
    contents.append(
        types.Content(
            role="user",
            parts=[types.Part.from_text(text=user_message)],
        )
    )
    return contents


async def chat_with_gemini(
    user_message: str,
    *,
    history: list[ChatTurn] | None = None,
) -> str:
    """Send a message to Gemini and get a response.

    Args:
        user_message: The user's new query/prompt.
        history: Optional prior turns (oldest-first) to give the assistant
            memory of the conversation so far.

    Returns:
        The text response from Gemini.
    """
    if not settings.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not configured")

    client = genai.Client(api_key=settings.GEMINI_API_KEY)

    config = None
    if settings.GEMINI_ENABLE_GROUNDING:
        config = types.GenerateContentConfig(
            tools=[types.Tool(google_search=types.GoogleSearch())]
        )

    # If there is no prior history, pass the message as a plain string for
    # backwards compatibility (the original single-turn shape). Otherwise,
    # build a multi-turn `contents` list.
    contents: str | list[types.Content]
    if history:
        contents = _to_gemini_contents(history, user_message)
    else:
        contents = user_message

    try:
        response = client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=contents,
            config=config,
        )
    except Exception as exc:
        msg = str(exc)
        # Detect rate-limit / quota-exhaustion specifically so the API layer
        # can respond with HTTP 429 + a real retry hint instead of a generic
        # "service unavailable". Free-tier quota for gemini-2.5-flash is only
        # 20 requests/day — this is the most common failure in development.
        if "RESOURCE_EXHAUSTED" in msg or " 429" in msg or "quota" in msg.lower():
            raise QuotaExceededError(
                f"Gemini quota exhausted for model '{settings.GEMINI_MODEL}'. "
                f"Free tier allows ~20 requests/day. {msg}",
                retry_after_seconds=_parse_retry_seconds(msg),
            ) from exc
        raise RuntimeError(
            f"Gemini API error with model '{settings.GEMINI_MODEL}': {msg}"
        ) from exc

    return response.text if response.text else "(No response from Gemini)"
