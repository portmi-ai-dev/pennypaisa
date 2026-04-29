from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

import scrapetube
from yt_dlp import YoutubeDL

logger = logging.getLogger(__name__)


CONTENT_TYPES = ("videos", "shorts", "streams")

# Best-effort channel display names (for known default channels).
CHANNEL_NAME_OVERRIDES: dict[str, str] = {
    "https://www.youtube.com/channel/UCRvqjQPSeaWn-uEx-w0XOIg": "Benjamin Cowen",
    "https://www.youtube.com/channel/UCanAtEpNJ2H9otfsgcLlu0w": "Trade Smarter with Chris Vermeulen",
    "https://www.youtube.com/channel/UCwTu6kD2igaLMpxswtcdxlg": "Gareth Soloway",
}


def channel_url_to_name(channel_url: str) -> str:
    channel_url = (channel_url or "").strip()
    if not channel_url:
        return ""
    if channel_url in CHANNEL_NAME_OVERRIDES:
        return CHANNEL_NAME_OVERRIDES[channel_url]
    # Fallback: use the last path segment (e.g. channel id).
    return channel_url.rstrip("/").split("/")[-1]


def extract_text(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        simple_text = value.get("simpleText")
        if isinstance(simple_text, str):
            return simple_text.strip()
        runs = value.get("runs")
        if isinstance(runs, list):
            parts = [run.get("text", "") for run in runs if isinstance(run, dict)]
            return "".join(parts).strip()
    return ""


def parse_view_count(view_text: str) -> int | None:
    if not view_text:
        return None
    digits = re.sub(r"[^0-9]", "", view_text)
    if not digits:
        return None
    try:
        return int(digits)
    except ValueError:
        return None


def parse_duration_seconds(length_text: str) -> int | None:
    if not length_text:
        return None
    parts = length_text.strip().split(":")
    if not parts or not all(part.isdigit() for part in parts):
        return None
    numbers = [int(part) for part in parts]
    if len(numbers) == 3:
        hours, minutes, seconds = numbers
        return hours * 3600 + minutes * 60 + seconds
    if len(numbers) == 2:
        minutes, seconds = numbers
        return minutes * 60 + seconds
    if len(numbers) == 1:
        return numbers[0]
    return None


def _calculate_publish_datetime(relative_str: str | None, fetch_date: datetime | None) -> datetime | None:
    """Back-calculates the publish datetime from relative strings like '15 hours ago'."""
    if not relative_str or not fetch_date:
        return None
    s = relative_str.lower().strip()
    match = re.search(r"(\d+)\s+(year|month|week|day|hour|minute|second)", s)
    if not match:
        return None
    amount = int(match.group(1))
    unit = match.group(2)

    if "year" in unit:
        delta = timedelta(days=amount * 365)
    elif "month" in unit:
        delta = timedelta(days=amount * 30)
    elif "week" in unit:
        delta = timedelta(weeks=amount)
    elif "day" in unit:
        delta = timedelta(days=amount)
    elif "hour" in unit:
        delta = timedelta(hours=amount)
    elif "minute" in unit:
        delta = timedelta(minutes=amount)
    elif "second" in unit:
        delta = timedelta(seconds=amount)
    else:
        return None

    return fetch_date - delta


def _parse_yyyymmdd_to_datetime_utc(date_text: str | None) -> datetime | None:
    if not date_text or len(date_text) != 8 or not date_text.isdigit():
        return None
    try:
        d = datetime.strptime(date_text, "%Y%m%d").replace(tzinfo=timezone.utc)
        return d
    except ValueError:
        return None


def _resolve_publish_datetime_utc(video_id: str) -> datetime | None:
    """Fallback exact publish timestamp via yt-dlp (slower, but robust)."""
    video_url = f"https://www.youtube.com/watch?v={video_id}"
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": False,
    }
    with YoutubeDL(ydl_opts) as ydl:
        info: dict[str, Any] = ydl.extract_info(video_url, download=False)

    timestamp = info.get("release_timestamp") or info.get("timestamp")
    if isinstance(timestamp, (int, float)):
        return datetime.fromtimestamp(timestamp, tz=timezone.utc)

    upload_date = info.get("upload_date")
    if upload_date:
        parsed = _parse_yyyymmdd_to_datetime_utc(str(upload_date))
        if parsed:
            return parsed

    release_date = info.get("release_date")
    if release_date:
        parsed = _parse_yyyymmdd_to_datetime_utc(str(release_date))
        if parsed:
            return parsed

    return None


def _iter_channel_entries(
    *,
    channel_url: str,
    content_type: str,
) -> Iterable[dict[str, Any]]:
    return scrapetube.get_channel(
        channel_url=channel_url,
        content_type=content_type,
        sort_by="newest",
    )


def fetch_last_month_video_ids(
    *,
    channel_urls: tuple[str, ...],
    max_age_days: int = 30,
    resolve_exact_publish_date: bool = False,
    now_utc: datetime | None = None,
) -> list[dict[str, Any]]:
    """Fetch videos/shorts/streams for the last month across channels.

    Returns list of dicts with keys:
    channel_url, video_id, video_title, description_snippet,
    content_type, video_length.seconds, view_count.value, video_publish_date, fetch_date_utc
    """
    if now_utc is None:
        now_utc = datetime.now(timezone.utc)
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)

    cutoff = now_utc - timedelta(days=max_age_days)
    fetched_at_utc = now_utc.isoformat()

    records: list[dict[str, Any]] = []

    for channel_url in channel_urls:
        for content_type in CONTENT_TYPES:
            scraped = 0
            kept = 0
            for raw_entry in _iter_channel_entries(channel_url=channel_url, content_type=content_type):
                scraped += 1
                video_id = raw_entry.get("videoId")
                if not video_id:
                    continue

                title = extract_text(raw_entry.get("title"))
                description = extract_text(raw_entry.get("descriptionSnippet"))
                length_text = extract_text(raw_entry.get("lengthText"))
                view_count_text = extract_text(raw_entry.get("viewCountText"))
                published_relative_text = extract_text(raw_entry.get("publishedTimeText"))

                publish_dt = _calculate_publish_datetime(published_relative_text, now_utc)
                if publish_dt is None and resolve_exact_publish_date:
                    try:
                        publish_dt = _resolve_publish_datetime_utc(str(video_id))
                    except Exception as exc:
                        logger.info("yt-dlp publish date failed | video_id=%s | reason=%s", video_id, exc)

                # With newest-first ordering, once we cross the cutoff we can stop this feed.
                if publish_dt is not None and publish_dt < cutoff:
                    break

                # If we can't determine publish time, keep scanning (don't break),
                # but also don't include it in the last-month output.
                if publish_dt is None:
                    continue

                record = {
                    "channel_url": channel_url,
                    "channel_name": channel_url_to_name(channel_url),
                    "video_id": str(video_id),
                    "video_title": title,
                    "description_snippet": description,
                    "content_type": content_type,
                    "video_length": {"seconds": parse_duration_seconds(length_text)},
                    "view_count": {"value": parse_view_count(view_count_text)},
                    "video_publish_date": publish_dt.date().isoformat(),
                    "fetch_date_utc": fetched_at_utc,
                }
                records.append(record)
                kept += 1

            logger.info(
                "Scrape channel done | channel=%s | content_type=%s | scraped=%d | kept=%d",
                channel_url,
                content_type,
                scraped,
                kept,
            )

    return records


def records_to_jsonl(records: list[dict[str, Any]]) -> str:
    return "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in records)
