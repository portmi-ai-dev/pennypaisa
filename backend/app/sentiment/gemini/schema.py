"""DDL for Gemini sentiment Postgres tables.

Two tables, two responsibilities:

* ``gemini_sentiment_cache`` — one row per asset, UPSERTed on every fresh
  generation. Served on the read hot path; TTL enforced via ``expires_at``.
* ``gemini_sentiment_history`` — append-only audit log of every Gemini call,
  capturing prompt + parsed/raw response + grounding + token usage.
"""

from __future__ import annotations

import logging

from app.core.database import get_db

logger = logging.getLogger(__name__)


_DDL = """
CREATE TABLE IF NOT EXISTS gemini_sentiment_cache (
    asset       TEXT        PRIMARY KEY,
    response    JSONB       NOT NULL,
    model       TEXT,
    expires_at  TIMESTAMPTZ NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gemini_sentiment_history (
    id                       BIGSERIAL   PRIMARY KEY,
    asset                    TEXT        NOT NULL,
    prompt                   TEXT        NOT NULL,
    response                 JSONB       NOT NULL,
    raw_response             TEXT,
    model                    TEXT,
    feed_transcripts         BOOLEAN,
    grounding_enabled        BOOLEAN,
    grounding_sources_count  INTEGER,
    grounding_metadata       JSONB,
    prompt_tokens            INTEGER,
    completion_tokens        INTEGER,
    thoughts_tokens          INTEGER,
    tool_use_tokens          INTEGER,
    cached_tokens            INTEGER,
    total_tokens             INTEGER,
    generated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gemini_history_asset_time
    ON gemini_sentiment_history (asset, generated_at DESC);
"""

_MIGRATIONS = [
    """
    ALTER TABLE gemini_sentiment_history
        ADD COLUMN IF NOT EXISTS grounding_metadata JSONB;
    """,
]


async def ensure_schema() -> None:
    """Create / patch the Gemini cache + history tables."""
    try:
        async with get_db() as conn:
            await conn.execute(_DDL)
            for migration in _MIGRATIONS:
                await conn.execute(migration)
        logger.info("gemini sentiment schema ready")
    except Exception as exc:
        logger.warning("Failed to ensure gemini sentiment schema: %s", exc)
