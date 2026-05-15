"""Fetch recent video transcripts from Neon DB for sentiment enrichment.

Retrieves the latest N transcripts per tracked channel from
``video_transcripts``, filtered to only channels in ``channels.json``.
Uses the ``clean_transcript`` column which normalises both YouTube API
and AssemblyAI sources into a single plain-text field.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from app.core.database import get_db
from app.yt_data_collector.video_id_corn import extract_clean_transcript

logger = logging.getLogger(__name__)

TRANSCRIPTS_PER_CHANNEL = 3
MAX_CHARS_PER_TRANSCRIPT = 3000
MAX_TOTAL_CHARS = 8000

_CHANNELS_JSON = Path(__file__).resolve().parent.parent / "core" / "channels.json"


def _load_tracked_channels() -> dict[str, str]:
    """Return {channel_url: channel_name} from channels.json."""
    try:
        channels = json.loads(_CHANNELS_JSON.read_text())
        return {
            c["url"].rstrip("/"): c.get("name", "")
            for c in channels
            if c.get("url")
        }
    except Exception:
        return {}


async def fetch_recent_transcripts(
    *,
    per_channel: int = TRANSCRIPTS_PER_CHANNEL,
) -> list[dict[str, Any]]:
    """Return the most recent transcripts from tracked channels only.

    Filters to channels defined in channels.json so stray transcripts
    from unknown channels never pollute the sentiment prompt.
    """
    tracked = _load_tracked_channels()
    if not tracked:
        logger.warning("No tracked channels found in channels.json")
        return []

    tracked_urls = list(tracked.keys())

    query = """
        WITH ranked AS (
            SELECT
                t.channel_url,
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
            WHERE t.channel_url = ANY($1)
              AND (
                  t.clean_transcript IS NOT NULL
                  OR t.transcript_raw IS NOT NULL
                  OR t.assembly_ai_transcript IS NOT NULL
              )
        )
        SELECT channel_url, video_title,
               video_publish_date, clean_transcript,
               transcript_raw, assembly_ai_transcript
        FROM ranked
        WHERE rn <= $2
        ORDER BY channel_url, video_publish_date DESC
    """

    try:
        async with get_db() as conn:
            rows = await conn.fetch(query, tracked_urls, per_channel)
    except Exception as exc:
        logger.warning("Failed to fetch recent transcripts: %s", exc)
        return []

    results: list[dict[str, Any]] = []
    for row in rows:
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

        channel_url = (row["channel_url"] or "").rstrip("/")
        channel_name = tracked.get(channel_url, channel_url.split("/")[-1])

        results.append({
            "channel_name": channel_name,
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
    max_chars_per_transcript: int = MAX_CHARS_PER_TRANSCRIPT,
    max_total_chars: int = MAX_TOTAL_CHARS,
) -> str:
    """Format transcripts into a prompt-ready block.

    Each transcript gets up to ``max_chars_per_transcript`` chars and the
    total block is capped at ``max_total_chars``.
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
