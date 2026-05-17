from __future__ import annotations

import asyncio
import json
import logging
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from app.core.database import get_db
from app.yt_data_collector.one_month_video_ids import fetch_last_month_video_ids

logger = logging.getLogger(__name__)

_CHANNELS_JSON = Path(__file__).parent.parent / "core" / "channels.json"

# ---------------------------------------------------------------------------
# Channel registry — backed by channels.json
# ---------------------------------------------------------------------------


def load_channel_urls() -> tuple[str, ...]:
    """Load channel URLs from channels.json at the backend root.

    Falls back to an empty tuple (cron skips gracefully) if the file is
    missing or malformed — avoids hard crash on misconfigured deploys.
    """
    try:
        channels: list[dict[str, str]] = json.loads(_CHANNELS_JSON.read_text())
        urls = tuple(c["url"] for c in channels if c.get("url"))
        if not urls:
            logger.warning("channels.json exists but contains no valid URLs")
        return urls
    except FileNotFoundError:
        logger.warning("channels.json not found at %s", _CHANNELS_JSON)
        return ()
    except Exception as exc:
        logger.warning("channels.json load failed: %s", exc)
        return ()

# DB helpers
def _parse_date(value: object) -> date | None:
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        # Accept ISO date strings ("YYYY-MM-DD") and ISO datetimes ("YYYY-MM-DDTHH:MM:SS...").
        if len(text) >= 10:
            text = text[:10]
        try:
            return date.fromisoformat(text)
        except ValueError:
            return None
    return None


def _parse_timestamptz(value: object) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        # Ensure tz-aware for TIMESTAMPTZ
        return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(text)
            return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


# Every hour, same cadence as market intelligence refresher.
REFRESH_INTERVAL_SECONDS = 60 * 60
INITIAL_DELAY_SECONDS = 30


DDL = """
CREATE TABLE IF NOT EXISTS video_ids (
    video_id            TEXT PRIMARY KEY,
    channel_url         TEXT NOT NULL,
    channel_name        TEXT,
    video_title         TEXT,
    description_snippet TEXT,
    content_type        TEXT,
    video_length_seconds INTEGER,
    view_count_value    BIGINT,
    video_publish_date  DATE,
    fetch_date_utc      TIMESTAMPTZ NOT NULL,
    inserted_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE video_ids
    ADD COLUMN IF NOT EXISTS channel_name TEXT,
    ADD COLUMN IF NOT EXISTS content_type TEXT;

CREATE INDEX IF NOT EXISTS idx_video_ids_publish_date
    ON video_ids (video_publish_date DESC);

CREATE TABLE IF NOT EXISTS video_transcripts (
    video_id                 TEXT PRIMARY KEY,
    channel_url              TEXT,
    channel_name             TEXT,
    video_title              TEXT,
    video_publish_date       DATE,
    transcript_fetch_date_utc TIMESTAMPTZ NOT NULL,
    transcript_raw           JSONB,
    source_video_metadata    JSONB NOT NULL,
    assembly_ai_transcript   TEXT,
    transcript_source        TEXT,
    inserted_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migration: pre-existing rows have transcript_raw NOT NULL and no AssemblyAI
-- columns. Drop the constraint + add the new columns idempotently.
ALTER TABLE video_transcripts
    ALTER COLUMN transcript_raw DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS channel_name             TEXT,
    ADD COLUMN IF NOT EXISTS assembly_ai_transcript TEXT,
    ADD COLUMN IF NOT EXISTS transcript_source      TEXT,
    ADD COLUMN IF NOT EXISTS clean_transcript       TEXT;

CREATE INDEX IF NOT EXISTS idx_video_transcripts_fetch_date
    ON video_transcripts (transcript_fetch_date_utc DESC);
"""


async def ensure_schema() -> None:
    try:
        async with get_db() as conn:
            await conn.execute(DDL)
        logger.info("video_ids/video_transcripts schema ready")
    except Exception as exc:
        logger.warning("Failed to ensure yt schema: %s", exc)


def extract_clean_transcript(
    transcript_raw: dict[str, Any] | None = None,
    assembly_ai_transcript: str | None = None,
) -> str | None:
    """Extract plain text from either transcript source.

    transcript_raw (YouTube API): JSON with tracks[].raw_entries[].text
    assembly_ai_transcript: already plain text, use as-is.

    Returns a single clean string or None if both sources are empty.
    """
    # Prefer YouTube raw (has timestamps, more structured) when available
    if transcript_raw is not None:
        try:
            tracks = transcript_raw.get("tracks", [])
            if isinstance(tracks, list) and tracks:
                # Use first track (usually the auto-generated or primary language)
                raw_entries = tracks[0].get("raw_entries", [])
                if isinstance(raw_entries, list) and raw_entries:
                    texts = [
                        entry.get("text", "").strip()
                        for entry in raw_entries
                        if isinstance(entry, dict) and entry.get("text", "").strip()
                    ]
                    if texts:
                        return " ".join(texts)
        except Exception:
            pass

    # Fallback to AssemblyAI (already plain text)
    if assembly_ai_transcript and assembly_ai_transcript.strip():
        return assembly_ai_transcript.strip()

    return None


def _is_ip_blocked(reason: str) -> bool:
    """Detect YouTube IP-based blocks from error messages."""
    lowered = reason.lower()
    return any(kw in lowered for kw in (
        "requestblocked",
        "sign in to confirm",
        "not a bot",
        "blocked by youtube",
        "blocking requests from your ip",
        "too many requests",
        "429",
        "403",
    ))


async def _insert_video_id_if_missing(record: dict[str, Any]) -> bool:
    """Insert one video record; returns True if inserted, False if already existed."""
    video_id = str(record["video_id"])
    channel_url = str(record.get("channel_url") or "")
    channel_name = record.get("channel_name")
    title = record.get("video_title")
    description = record.get("description_snippet")
    content_type = record.get("content_type")
    length_seconds = None
    if isinstance(record.get("video_length"), dict):
        length_seconds = record["video_length"].get("seconds")
    view_value = None
    if isinstance(record.get("view_count"), dict):
        view_value = record["view_count"].get("value")
    publish_date = _parse_date(record.get("video_publish_date"))
    fetch_date = _parse_timestamptz(record.get("fetch_date_utc"))

    async with get_db() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO video_ids (
                video_id,
                channel_url,
                channel_name,
                video_title,
                description_snippet,
                content_type,
                video_length_seconds,
                view_count_value,
                video_publish_date,
                fetch_date_utc
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            ON CONFLICT (video_id) DO NOTHING
            RETURNING video_id;
            """,
            video_id,
            channel_url,
            channel_name,
            title,
            description,
            content_type,
            length_seconds,
            view_value,
            publish_date,
            fetch_date,
        )
        return row is not None


async def _transcript_exists(video_id: str) -> bool:
    async with get_db() as conn:
        row = await conn.fetchval("SELECT 1 FROM video_transcripts WHERE video_id=$1;", video_id)
        return bool(row)


async def _store_transcript(
    *,
    video_record: dict[str, Any],
    transcript_raw: dict[str, Any] | None = None,
    assembly_ai_transcript: str | None = None,
) -> None:
    """UPSERT a transcript row from either YouTube API and/or AssemblyAI.

    Either ``transcript_raw`` (YouTube API JSON) or ``assembly_ai_transcript``
    (AssemblyAI plain-text) — or both — must be supplied. ``transcript_source``
    is derived from which fields are present so callers can later filter
    ``WHERE transcript_source = 'assemblyai'`` etc.

    UPSERT semantics: if a row exists with only YouTube data and we now
    add AssemblyAI (or vice-versa), the existing field is preserved and
    the missing one is filled in; ``transcript_source`` is recomputed.
    """
    if transcript_raw is None and not assembly_ai_transcript:
        raise ValueError(
            "_store_transcript needs at least one of transcript_raw / assembly_ai_transcript"
        )

    video_id = str(video_record["video_id"])
    channel_url = video_record.get("channel_url")
    channel_name = video_record.get("channel_name")
    title = video_record.get("video_title")
    publish_date = _parse_date(video_record.get("video_publish_date"))
    fetched_at = datetime.now(timezone.utc)

    # ``default=str`` lets us pass through non-JSON-native types (notably
    # ``datetime.date`` for ``video_publish_date``) without a custom
    # encoder per call site.
    transcript_raw_json = (
        json.dumps(transcript_raw, ensure_ascii=False, default=str)
        if transcript_raw is not None
        else None
    )
    source_json = json.dumps(video_record, ensure_ascii=False, default=str)

    if transcript_raw is not None and assembly_ai_transcript:
        source_label = "both"
    elif transcript_raw is not None:
        source_label = "youtube"
    else:
        source_label = "assemblyai"

    clean_text = extract_clean_transcript(transcript_raw, assembly_ai_transcript)

    async with get_db() as conn:
        await conn.execute(
            """
            INSERT INTO video_transcripts (
                video_id,
                channel_url,
                channel_name,
                video_title,
                video_publish_date,
                transcript_fetch_date_utc,
                transcript_raw,
                source_video_metadata,
                assembly_ai_transcript,
                transcript_source,
                clean_transcript
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11)
            ON CONFLICT (video_id) DO UPDATE SET
                channel_name = COALESCE(EXCLUDED.channel_name, video_transcripts.channel_name),
                transcript_raw = COALESCE(video_transcripts.transcript_raw, EXCLUDED.transcript_raw),
                assembly_ai_transcript = COALESCE(video_transcripts.assembly_ai_transcript, EXCLUDED.assembly_ai_transcript),
                transcript_source = CASE
                    WHEN COALESCE(video_transcripts.transcript_raw, EXCLUDED.transcript_raw) IS NOT NULL
                     AND COALESCE(video_transcripts.assembly_ai_transcript, EXCLUDED.assembly_ai_transcript) IS NOT NULL
                        THEN 'both'
                    WHEN COALESCE(video_transcripts.transcript_raw, EXCLUDED.transcript_raw) IS NOT NULL
                        THEN 'youtube'
                    ELSE 'assemblyai'
                END,
                clean_transcript = COALESCE(EXCLUDED.clean_transcript, video_transcripts.clean_transcript),
                transcript_fetch_date_utc = EXCLUDED.transcript_fetch_date_utc;
            """,
            video_id,
            channel_url,
            channel_name,
            title,
            publish_date,
            fetched_at,
            transcript_raw_json,
            source_json,
            assembly_ai_transcript,
            source_label,
            clean_text,
        )


async def sync_latest_video_ids_and_transcripts(*, channel_urls: tuple[str, ...]) -> None:
    """Hourly sync (last month): insert new IDs; transcribe + store missing transcripts."""
    await sync_video_ids_and_transcripts(channel_urls=channel_urls, max_age_days=30)


# ---------------------------------------------------------------------------
# Split-stage helpers — used by the new ``backfill_scrape`` and
# ``backfill_transcript`` worker jobs. The combined sync above stays for the
# hourly cron path.
# ---------------------------------------------------------------------------


async def scrape_video_ids_only(
    *,
    channel_urls: tuple[str, ...],
    max_age_days: int,
) -> dict[str, int]:
    """Stage 1: scrape recent video IDs into ``video_ids`` only.

    Does NOT fetch transcripts — that's stage 2 (``transcribe_missing``).
    Each channel is scraped independently under
    ``YT_SCRAPE_PER_CHANNEL_TIMEOUT_SECONDS`` via the YouTube Data API v3
    uploads playlist so a single hung request can't stall the entire job.
    """
    from app.core.config import settings as _settings

    await ensure_schema()

    per_channel_timeout = _settings.YT_SCRAPE_PER_CHANNEL_TIMEOUT_SECONDS

    all_records: list[dict[str, Any]] = []
    channels_timed_out = 0
    channels_failed = 0

    for channel_url in channel_urls:
        try:
            records = await asyncio.wait_for(
                asyncio.to_thread(
                    fetch_last_month_video_ids,
                    channel_urls=(channel_url,),
                    max_age_days=max_age_days,
                ),
                timeout=per_channel_timeout,
            )
            all_records.extend(records)
        except asyncio.TimeoutError:
            channels_timed_out += 1
            logger.warning(
                "yt scrape: channel timeout after %ds | channel=%s",
                per_channel_timeout,
                channel_url,
            )
        except Exception as exc:
            channels_failed += 1
            logger.warning(
                "yt scrape: channel failed | channel=%s | reason=%s",
                channel_url,
                exc,
            )

    if not all_records:
        log = logger.error if channels_failed == 0 and channels_timed_out == 0 else logger.warning
        log(
            "yt scrape: ZERO video IDs across all channels (channels_timed_out=%d, channels_failed=%d)",
            channels_timed_out,
            channels_failed,
        )
        return {
            "processed_ids": 0,
            "inserted_ids": 0,
            "insert_failed": 0,
            "channels_timed_out": channels_timed_out,
            "channels_failed": channels_failed,
        }

    inserted = 0
    insert_failed = 0
    for record in all_records:
        try:
            did_insert = await _insert_video_id_if_missing(record)
        except Exception as exc:
            insert_failed += 1
            logger.warning("yt scrape insert failed | video_id=%s | reason=%s", record.get("video_id"), exc)
            continue
        if did_insert:
            inserted += 1

    logger.info(
        "yt scrape: ids processed=%d | inserted=%d | failed=%d | channels_timed_out=%d | channels_failed=%d",
        len(all_records),
        inserted,
        insert_failed,
        channels_timed_out,
        channels_failed,
    )
    return {
        "processed_ids": len(all_records),
        "inserted_ids": inserted,
        "insert_failed": insert_failed,
        "channels_timed_out": channels_timed_out,
        "channels_failed": channels_failed,
    }


async def transcribe_missing(*, max_age_days: int) -> dict[str, int]:
    """Stage 2: transcribe rows in ``video_ids`` from the last N days that
    don't yet have a row in ``video_transcripts``.

    Pipeline per video:
        yt-dlp audio download → AssemblyAI upload → poll → store text

    Throttles between requests with exponential backoff on consecutive
    failures. Aborts after 5 consecutive failures (yt-dlp blocked or
    AssemblyAI down).

    Returns counts:
        ``candidates``, ``transcribed``, ``failed``, ``unavailable``.
    """
    from app.core.config import settings as _settings
    from app.yt_data_collector.yt_transcriber import transcribe_video

    await ensure_schema()

    api_key = (getattr(_settings, "assemblyai_api_key", "") or "").strip()
    if not api_key:
        logger.warning("yt transcribe-missing: ASSEMBLYAI_API_KEY not configured — skipping")
        return {"candidates": 0, "transcribed": 0, "failed": 0, "unavailable": 0}

    cutoff = (datetime.now(timezone.utc) - timedelta(days=max_age_days)).date()

    async with get_db() as conn:
        rows = await conn.fetch(
            """
            SELECT v.video_id, v.channel_url, v.channel_name, v.video_title, v.video_publish_date
            FROM video_ids v
            LEFT JOIN video_transcripts t USING (video_id)
            WHERE t.video_id IS NULL
              AND (v.video_publish_date IS NULL OR v.video_publish_date >= $1)
            ORDER BY v.video_publish_date DESC NULLS LAST
            """,
            cutoff,
        )

    if not rows:
        logger.info("yt transcribe-missing: nothing to do (cutoff=%s)", cutoff)
        return {"candidates": 0, "transcribed": 0, "failed": 0, "unavailable": 0}

    per_video_timeout = _settings.YT_TRANSCRIPT_PER_VIDEO_TIMEOUT_SECONDS
    base_delay = _settings.YT_TRANSCRIPT_DELAY_SECONDS

    transcribed = 0
    failed = 0
    unavailable = 0
    consecutive_failures = 0
    _ABORT_THRESHOLD = 5

    for idx, row in enumerate(rows):
        video_id = row["video_id"]
        record = {
            "video_id": video_id,
            "channel_url": row["channel_url"],
            "channel_name": row["channel_name"],
            "video_title": row["video_title"],
            "video_publish_date": row["video_publish_date"],
        }

        # ── Throttle: delay between requests with backoff ───────────
        if idx > 0:
            delay = base_delay * (2 ** min(consecutive_failures, 4))
            if consecutive_failures > 0:
                logger.info(
                    "yt throttle: waiting %.0fs (consecutive_failures=%d)",
                    delay, consecutive_failures,
                )
            await asyncio.sleep(delay)

        # Bail if too many consecutive failures
        if consecutive_failures >= _ABORT_THRESHOLD:
            logger.error(
                "yt transcribe-missing: aborting after %d consecutive failures — "
                "check yt-dlp, AssemblyAI, and network config",
                consecutive_failures,
            )
            failed += len(rows) - idx
            break

        # ── Waterfall: transcriptapi → captions → yt-dlp+assemblyai ──
        video_url = f"https://www.youtube.com/watch?v={video_id}"
        try:
            from app.yt_data_collector.yt_transcriber import (
                _fetch_via_transcript_api,
                _fetch_captions_fallback,
            )

            # 1. transcriptapi.com (primary, most reliable)
            text = await asyncio.to_thread(_fetch_via_transcript_api, video_id)
            source = "transcriptapi"

            # 2. youtube-transcript-api (free fallback)
            if not text:
                text = await asyncio.to_thread(_fetch_captions_fallback, video_id)
                source = "captions"

            # 3. yt-dlp + AssemblyAI (expensive last resort)
            if not text:
                text = await asyncio.wait_for(
                    asyncio.to_thread(transcribe_video, video_url),
                    timeout=per_video_timeout,
                )
                source = "assemblyai"

            text = (text or "").strip()
            if not text:
                raise RuntimeError("All transcript sources returned empty")

            await _store_transcript(
                video_record=record, assembly_ai_transcript=text
            )
            logger.info(
                "yt transcript stored (%s) | video_id=%s", source, video_id
            )
            transcribed += 1
            consecutive_failures = 0
        except asyncio.TimeoutError:
            failed += 1
            consecutive_failures += 1
            logger.warning(
                "yt transcript timeout | video_id=%s | timeout=%ss",
                video_id, per_video_timeout,
            )
        except Exception as exc:
            exc_str = str(exc)
            if _is_ip_blocked(exc_str):
                consecutive_failures += 1
                failed += 1
                logger.warning(
                    "yt transcript IP blocked | video_id=%s | %s",
                    video_id, exc_str[:200],
                )
            elif "upcoming" in exc_str.lower() or "premiere" in exc_str.lower():
                unavailable += 1
                logger.info(
                    "yt transcript unavailable (upcoming) | video_id=%s", video_id
                )
            else:
                failed += 1
                consecutive_failures += 1
                logger.warning(
                    "yt transcript failed | video_id=%s | %s",
                    video_id, exc_str[:200],
                )

    return {
        "candidates": len(rows),
        "transcribed": transcribed,
        "failed": failed,
        "unavailable": unavailable,
    }


async def sync_video_ids_and_transcripts(
    *, channel_urls: tuple[str, ...], max_age_days: int
) -> dict[str, int]:
    """Combined sync: scrape IDs then transcribe via yt-dlp + AssemblyAI."""
    scrape_counts = await scrape_video_ids_only(
        channel_urls=channel_urls, max_age_days=max_age_days
    )
    transcript_counts = await transcribe_missing(max_age_days=max_age_days)

    return {
        # ── stage 1 (scrape) ────────────────────────────────────────────
        "processed_ids": scrape_counts["processed_ids"],
        "inserted_ids": scrape_counts["inserted_ids"],
        "insert_failed": scrape_counts["insert_failed"],
        # ── stage 2 (transcribe) ────────────────────────────────────────
        "transcript_candidates": transcript_counts["candidates"],
        "transcribed": transcript_counts["transcribed"],
        "transcripts_failed": transcript_counts["failed"],
        "transcripts_unavailable": transcript_counts["unavailable"],
    }


async def run_video_id_corn(*, channel_urls: tuple[str, ...]) -> None:
    """Long-running cron task: every hour sync IDs and transcripts."""
    try:
        await asyncio.sleep(INITIAL_DELAY_SECONDS)
        while True:
            try:
                await sync_latest_video_ids_and_transcripts(channel_urls=channel_urls)
            except Exception as exc:
                logger.warning("yt cron tick failed: %s", exc)
            await asyncio.sleep(REFRESH_INTERVAL_SECONDS)
    except asyncio.CancelledError:
        logger.info("yt video id cron stopped")
        raise
