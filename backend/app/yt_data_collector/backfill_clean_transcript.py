"""One-shot backfill: populate clean_transcript for existing rows.

Run once:
    python -m app.yt_data_collector.backfill_clean_transcript

Reads every row where clean_transcript IS NULL but transcript_raw or
assembly_ai_transcript has data, extracts plain text, and updates in bulk.
"""

from __future__ import annotations

import asyncio
import json
import logging

from app.core.config import settings
from app.yt_data_collector.video_id_corn import extract_clean_transcript

logger = logging.getLogger(__name__)


async def backfill() -> None:
    import asyncpg

    conn = await asyncpg.connect(settings.database_url)
    try:
        rows = await conn.fetch(
            """
            SELECT id, transcript_raw, assembly_ai_transcript
            FROM video_transcripts
            WHERE clean_transcript IS NULL
              AND (transcript_raw IS NOT NULL OR assembly_ai_transcript IS NOT NULL)
            """
        )
        logger.info("Backfill: %d rows to process", len(rows))
        if not rows:
            print("Nothing to backfill — all rows already have clean_transcript.")
            return

        updated = 0
        for row in rows:
            raw = row["transcript_raw"]
            # transcript_raw may be stored as text (JSON string) or jsonb
            if isinstance(raw, str):
                try:
                    raw = json.loads(raw)
                except (json.JSONDecodeError, TypeError):
                    raw = None

            assembly = row["assembly_ai_transcript"]
            clean = extract_clean_transcript(raw, assembly)
            if clean:
                await conn.execute(
                    "UPDATE video_transcripts SET clean_transcript = $1 WHERE id = $2",
                    clean,
                    row["id"],
                )
                updated += 1

        print(f"Backfill complete: {updated}/{len(rows)} rows updated.")
        logger.info("Backfill complete: %d/%d rows updated", updated, len(rows))
    finally:
        await conn.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(backfill())
