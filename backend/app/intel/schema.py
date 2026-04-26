"""DDL for the intel sentiment Postgres tables.

Two tables, two responsibilities:

* ``intel_sentiment_cache`` — one row per asset, UPSERTed on every fresh
  generation. Served on the hover hot path; TTL enforced via ``expires_at``.
* ``intel_sentiment_history`` — append-only audit log of every Gemini call,
  capturing the exact prompt and parsed/raw response for analytics and
  potential fine-tuning. Never read on the hot path.

Keeping cache and history apart means hover reads stay a single PK lookup
even as the history table grows unboundedly.
"""

from __future__ import annotations

import logging

from app.core.database import get_db

logger = logging.getLogger(__name__)


_DDL = """
CREATE TABLE IF NOT EXISTS intel_sentiment_cache (
    asset       TEXT        PRIMARY KEY,
    response    JSONB       NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS intel_sentiment_history (
    id            BIGSERIAL   PRIMARY KEY,
    asset         TEXT        NOT NULL,
    prompt        TEXT        NOT NULL,
    response      JSONB       NOT NULL,
    raw_response  TEXT,
    model         TEXT,
    generated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intel_history_asset_time
    ON intel_sentiment_history (asset, generated_at DESC);
"""


async def ensure_schema() -> None:
    """Create the cache + history tables if they don't already exist."""
    try:
        async with get_db() as conn:
            await conn.execute(_DDL)
        logger.info("intel sentiment schema ready")
    except Exception as exc:
        logger.warning("Failed to ensure intel sentiment schema: %s", exc)
