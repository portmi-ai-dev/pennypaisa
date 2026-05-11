"""Fetch recent video transcripts from Neon DB for sentiment enrichment.

Retrieves the latest N transcripts per channel from ``video_transcripts``,
using the ``clean_transcript`` column which normalises both YouTube API
(JSON with tracks/raw_entries) and AssemblyAI (plain text) sources into
a single plain-text field.

For existing rows that were inserted before the ``clean_transcript``
column existed, falls back to on-the-fly extraction from the raw columns.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from app.core.database import get_db
from app.yt_data_collector.video_id_corn import extract_clean_transcript

logger = logging.getLogger(__name__)

# How many recent transcripts per channel to include in the sentiment prompt
TRANSCRIPTS_PER_CHANNEL = 2


async def fetch_recent_transcripts(
    *,
    per_channel: int = TRANSCRIPTS_PER_CHANNEL,
) -> list[dict[str, Any]]:
    """Return the most recent transcripts across all tracked channels.

    Uses a ``DISTINCT ON (channel_url)`` lateral pattern to fetch
    the latest ``per_channel`` transcripts per channel, ordered by
    publish date descending.

    Each returned dict has:
        channel_name, video_title, video_publish_date, clean_transcript
    """
    query = """
        WITH ranked AS (
            SELECT
                t.channel_url,
                COALESCE(t.channel_name, v.channel_name) AS channel_name,
                t.video_title,
                t.video_publish_date,
                t.clean_transcript,
                t.transcript_raw,
                t.assembly_ai_transcript,
                ROW_NUMBER() OVER (
                    PARTITION BY t.channel_url
                    ORDER BY t.video_publish_date DESC NULLS LAST
                ) AS rn
            FROM video_transcripts t
            LEFT JOIN video_ids v USING (video_id)
            WHERE t.channel_url IS NOT NULL
              AND (
                  t.clean_transcript IS NOT NULL
                  OR t.transcript_raw IS NOT NULL
                  OR t.assembly_ai_transcript IS NOT NULL
              )
        )
        SELECT channel_url, channel_name, video_title,
               video_publish_date, clean_transcript,
               transcript_raw, assembly_ai_transcript
        FROM ranked
        WHERE rn <= $1
        ORDER BY channel_url, video_publish_date DESC
    """

    try:
        async with get_db() as conn:
            rows = await conn.fetch(query, per_channel)
    except Exception as exc:
        logger.warning("Failed to fetch recent transcripts: %s", exc)
        return []

    results: list[dict[str, Any]] = []
    for row in rows:
        # Use clean_transcript if populated; otherwise extract on-the-fly
        clean = row["clean_transcript"]
        if not clean:
            raw = row["transcript_raw"]
            if isinstance(raw, str):
                try:
                    raw = json.loads(raw)
                except (json.JSONDecodeError, TypeError):
                    raw = None
            clean = extract_clean_transcript(raw, row["assembly_ai_transcript"])

        if not clean:
            continue

        results.append({
            "channel_name": row["channel_name"] or row["channel_url"],
            "video_title": row["video_title"] or "",
            "video_publish_date": (
                row["video_publish_date"].isoformat()
                if row["video_publish_date"]
                else None
            ),
            "clean_transcript": clean,
        })

    logger.info("Fetched %d recent transcripts for sentiment", len(results))
    return results


def format_transcripts_for_prompt(
    transcripts: list[dict[str, Any]],
    *,
    max_chars_per_transcript: int = 1000,
    max_total_chars: int = 4000,
) -> str:
    """Format transcripts into a prompt-ready block.

    Truncates each transcript to ``max_chars_per_transcript`` and the
    entire block to ``max_total_chars`` (~1000 tokens) to stay within
    Groq's 8000 TPM budget alongside the base prompt (~5000 tokens).
    Returns empty string if no transcripts.
    """
    if not transcripts:
        return ""

    parts: list[str] = []
    total = 0
    for t in transcripts:
        text = t["clean_transcript"]
        if len(text) > max_chars_per_transcript:
            text = text[:max_chars_per_transcript] + "..."

        header = f"[{t['channel_name']}] {t['video_title']}"
        if t.get("video_publish_date"):
            header += f" ({t['video_publish_date']})"

        part = f"{header}\n{text}"

        if total + len(part) > max_total_chars:
            remaining = max_total_chars - total
            if remaining > 200:
                parts.append(part[:remaining] + "...")
            break

        parts.append(part)
        total += len(part)

    if not parts:
        return ""

    block = "\n\n---\n\n".join(parts)
    return (
        "RECENT YOUTUBE ANALYST COMMENTARY (use as additional signal — "
        "do not quote or attribute directly):\n\n"
        + block
    )
