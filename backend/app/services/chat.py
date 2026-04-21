"""Chat service for interacting with Gemini API."""

from google import genai
from google.genai import types

from app.core.config import settings


async def chat_with_gemini(user_message: str) -> str:
    """
    Send a message to Gemini and get a response.

    Args:
        user_message: The user's query/prompt

    Returns:
        The text response from Gemini
    """
    if not settings.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not configured")

    client = genai.Client(api_key=settings.GEMINI_API_KEY)

    config = None
    if settings.GEMINI_ENABLE_GROUNDING:
        config = types.GenerateContentConfig(
            tools=[types.Tool(google_search=types.GoogleSearch())]
        )

    try:
        response = client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=user_message,
            config=config,
        )
    except Exception as exc:
        # Re-raise with more context for debugging
        raise RuntimeError(
            f"Gemini API error with model '{settings.GEMINI_MODEL}': {str(exc)}"
        ) from exc

    return response.text if response.text else "(No response from Gemini)"
