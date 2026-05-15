"""Gemini-driven sentiment generation pipeline.

Separate from the Groq pipeline so each model has its own:
  * cache table (gemini_sentiment_cache)
  * history table (gemini_sentiment_history)
  * generator + service modules

Worker jobs enqueue work onto the arq worker; API endpoints serve
cached reads and accept regeneration requests.
"""
