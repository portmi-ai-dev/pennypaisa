from __future__ import annotations

import asyncio
import json
import logging
from datetime import date, datetime, timezone
from typing import Any

from youtube_transcript_api import (
    CouldNotRetrieveTranscript,
    NoTranscriptFound,
    TranscriptsDisabled,
    YouTubeTranscriptApi,
)

from app.core.database import get_db
from app.yt_data_collector.one_month_video_ids import fetch_last_month_video_ids

logger = logging.getLogger(__name__)

# Default channels (copied from archived scraper).
DEFAULT_CHANNEL_URLS: tuple[str, ...] = (
    "https://www.youtube.com/channel/UCRvqjQPSeaWn-uEx-w0XOIg",  # Benjamin Cowen
    "https://www.youtube.com/channel/UCanAtEpNJ2H9otfsgcLlu0w",  # Trade Smarter with Chris Vermeulen
    "https://www.youtube.com/channel/UCwTu6kD2igaLMpxswtcdxlg",  # Gareth Soloway
)

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


def resolve_channel_urls_from_env() -> tuple[str, ...]:
    """Reads `YT_CHANNEL_URLS` as comma-separated channel URLs (optional).

    Loaded via `app.core.config.Settings` from `backend/.env` (or exported env vars).
    """
    from app.core.config import settings

    raw = (settings.YT_CHANNEL_URLS or "").strip()

    if not raw:
        return DEFAULT_CHANNEL_URLS

    parts = [p.strip() for p in raw.split(",")]
    urls = tuple(p for p in parts if p)
    return urls or DEFAULT_CHANNEL_URLS


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
    video_title              TEXT,
    video_publish_date       DATE,
    transcript_fetch_date_utc TIMESTAMPTZ NOT NULL,
    transcript_raw           JSONB NOT NULL,
    source_video_metadata    JSONB NOT NULL,
    inserted_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

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


def _entry_to_dict(entry: Any) -> dict[str, Any]:
    if isinstance(entry, dict):
        return entry
    return {
        "text": getattr(entry, "text", ""),
        "start": getattr(entry, "start", 0),
        "duration": getattr(entry, "duration", 0),
    }


def _fetched_entries_to_list(fetched_entries: Any) -> list[dict[str, Any]]:
    if hasattr(fetched_entries, "to_raw_data"):
        raw = fetched_entries.to_raw_data()
        return [_entry_to_dict(item) for item in raw]
    if isinstance(fetched_entries, list):
        return [_entry_to_dict(item) for item in fetched_entries]
    try:
        return [_entry_to_dict(item) for item in fetched_entries]
    except TypeError:
        return []


def _translation_languages_to_list(value: Any) -> list[dict[str, Any]] | None:
    if value is None:
        return None

    normalized: list[dict[str, Any]] = []
    for item in value:
        if isinstance(item, dict):
            normalized.append(item)
            continue

        normalized.append(
            {
                "language": getattr(item, "language", None),
                "language_code": getattr(item, "language_code", None),
            }
        )

    return normalized


def _list_transcripts(video_id: str) -> Any:
    api = YouTubeTranscriptApi()
    if hasattr(api, "list"):
        return api.list(video_id)
    if hasattr(YouTubeTranscriptApi, "list_transcripts"):
        return YouTubeTranscriptApi.list_transcripts(video_id)
    raise RuntimeError("Unsupported youtube-transcript-api version: cannot list transcripts")


def fetch_transcript_raw(video_id: str) -> dict[str, Any]:
    transcript_list = _list_transcripts(video_id)

    tracks: list[dict[str, Any]] = []
    for transcript in transcript_list:
        fetched_entries = transcript.fetch()
        raw_entries = _fetched_entries_to_list(fetched_entries)

        track_data = {
            "language": getattr(transcript, "language", None),
            "language_code": getattr(transcript, "language_code", None),
            "is_generated": getattr(transcript, "is_generated", None),
            "is_translatable": getattr(transcript, "is_translatable", None),
            "translation_languages": _translation_languages_to_list(
                getattr(transcript, "translation_languages", None)
            ),
            "raw_entries": raw_entries,
        }
        tracks.append(track_data)

    if not tracks:
        raise RuntimeError("No transcript tracks returned")

    return {
        "video_id": video_id,
        "track_count": len(tracks),
        "tracks": tracks,
    }


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


async def _store_transcript(*, video_record: dict[str, Any], transcript_raw: dict[str, Any]) -> None:
    video_id = str(video_record["video_id"])
    channel_url = video_record.get("channel_url")
    title = video_record.get("video_title")
    publish_date = _parse_date(video_record.get("video_publish_date"))
    fetched_at = datetime.now(timezone.utc)

    # asyncpg JSONB expects a JSON string parameter.
    transcript_raw_json = json.dumps(transcript_raw, ensure_ascii=False)
    source_json = json.dumps(video_record, ensure_ascii=False)

    async with get_db() as conn:
        await conn.execute(
            """
            INSERT INTO video_transcripts (
                video_id,
                channel_url,
                video_title,
                video_publish_date,
                transcript_fetch_date_utc,
                transcript_raw,
                source_video_metadata
            )
            VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)
            ON CONFLICT (video_id) DO NOTHING;
            """,
            video_id,
            channel_url,
            title,
            publish_date,
            fetched_at,
            transcript_raw_json,
            source_json,
        )


async def sync_latest_video_ids_and_transcripts(*, channel_urls: tuple[str, ...]) -> None:
    """Hourly sync (last month): insert new IDs; transcribe + store missing transcripts."""
    await sync_video_ids_and_transcripts(channel_urls=channel_urls, max_age_days=30)


async def sync_video_ids_and_transcripts(*, channel_urls: tuple[str, ...], max_age_days: int) -> dict[str, int]:
    """Scrape recent video IDs; insert missing; transcribe + store missing transcripts.

    Returns counts: processed_ids, inserted_ids, transcripts_stored.
    """
    await ensure_schema()

    records = fetch_last_month_video_ids(channel_urls=channel_urls, max_age_days=max_age_days)
    if not records:
        logger.info("yt sync: no records scraped")
        return {"processed_ids": 0, "inserted_ids": 0, "transcripts_stored": 0}

    inserted = 0
    insert_failed = 0
    newly_inserted_records: list[dict[str, Any]] = []
    for record in records:
        try:
            did_insert = await _insert_video_id_if_missing(record)
        except Exception as exc:
            insert_failed += 1
            logger.warning("yt sync insert failed | video_id=%s | reason=%s", record.get("video_id"), exc)
            continue
        if did_insert:
            inserted += 1
            newly_inserted_records.append(record)

    logger.info("yt sync: ids processed=%d | inserted=%d", len(records), inserted)

    # Transcribe: only for new IDs, but also ensure we don't double-run if a transcript exists.
    transcripts_stored = 0
    transcripts_failed = 0
    for record in newly_inserted_records:
        video_id = str(record.get("video_id") or "")
        if not video_id:
            continue
        try:
            if await _transcript_exists(video_id):
                continue
            transcript_raw = await asyncio.to_thread(fetch_transcript_raw, video_id)
            await _store_transcript(video_record=record, transcript_raw=transcript_raw)
            logger.info("yt transcript stored | video_id=%s", video_id)
            transcripts_stored += 1
        except (NoTranscriptFound, TranscriptsDisabled, CouldNotRetrieveTranscript) as exc:
            logger.info("yt transcript unavailable | video_id=%s | reason=%s", video_id, exc)
        except Exception as exc:
            transcripts_failed += 1
            logger.warning("yt transcript failed | video_id=%s | reason=%s", video_id, exc)

    return {
        "processed_ids": len(records),
        "inserted_ids": inserted,
        "transcripts_stored": transcripts_stored,
        "insert_failed": insert_failed,
        "transcripts_failed": transcripts_failed,
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
