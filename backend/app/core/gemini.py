from __future__ import annotations

from google import genai

from app.core.config import settings


def get_gemini_client() -> genai.Client:
    return genai.Client(api_key=settings.GEMINI_API_KEY)