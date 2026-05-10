from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_YT_API_BASE = "https://www.googleapis.com/youtube/v3"
_CHANNELS_JSON = Path(__file__).parent.parent / "core" / "channels.json"


def _build_name_map() -> dict[str, str]:
    try:
        channels: list[dict[str, str]] = json.loads(_CHANNELS_JSON.read_text())
        return {c["url"].rstrip("/"): c.get("name", "") for c in channels if c.get("url")}
    except Exception:
        return {}


def channel_url_to_name(channel_url: str) -> str:
    channel_url = (channel_url or "").strip().rstrip("/")
    if not channel_url:
        return ""
    name_map = _build_name_map()
    if channel_url in name_map:
        return name_map[channel_url]
    return channel_url.split("/")[-1]


def _extract_channel_id(channel_url: str) -> str:
    match = re.search(r"/channel/(UC[a-zA-Z0-9_-]+)", channel_url)
    if match:
        return match.group(1)
    raise ValueError(f"Cannot extract channel ID from: {channel_url}")


def _channel_id_to_uploads_playlist(channel_id: str) -> str:
    return "UU" + channel_id[2:]


def _parse_iso8601_duration(duration: str) -> int | None:
    if not duration:
        return None
    match = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", duration)
    if not match:
        return None
    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    seconds = int(match.group(3) or 0)
    return hours * 3600 + minutes * 60 + seconds


def _classify_content_type(
    duration_seconds: int | None,
    has_live_details: bool,
) -> str:
    if has_live_details:
        return "streams"
    if duration_seconds is not None and duration_seconds <= 60:
        return "shorts"
    return "videos"


def _fetch_video_details(
    video_ids: list[str],
    api_key: str,
    client: httpx.Client,
) -> dict[str, dict[str, Any]]:
    """Batch fetch video details. Up to 50 IDs per request (API limit)."""
    details: dict[str, dict[str, Any]] = {}

    for i in range(0, len(video_ids), 50):
        batch = video_ids[i : i + 50]
        resp = client.get(
            f"{_YT_API_BASE}/videos",
            params={
                "part": "contentDetails,statistics,liveStreamingDetails",
                "id": ",".join(batch),
                "key": api_key,
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()

        for item in data.get("items", []):
            vid = item["id"]
            cd = item.get("contentDetails", {})
            stats = item.get("statistics", {})
            has_live = "liveStreamingDetails" in item

            duration_seconds = _parse_iso8601_duration(cd.get("duration", ""))
            view_count = None
            vc_str = stats.get("viewCount")
            if vc_str and vc_str.isdigit():
                view_count = int(vc_str)

            details[vid] = {
                "duration_seconds": duration_seconds,
                "view_count": view_count,
                "content_type": _classify_content_type(duration_seconds, has_live),
            }

    return details


def fetch_last_month_video_ids(
    *,
    channel_urls: tuple[str, ...],
    max_age_days: int = 30,
    api_key: str | None = None,
    now_utc: datetime | None = None,
) -> list[dict[str, Any]]:
    """Fetch videos/shorts/streams via YouTube Data API v3.

    Uses the channel's uploads playlist (UU...) for reliable enumeration,
    then batch-fetches video details for duration, view count, and content
    type classification.
    """
    if api_key is None:
        from app.core.config import settings
        api_key = settings.YOUTUBE_API_KEY

    if not api_key:
        logger.error("YOUTUBE_API_KEY not configured")
        return []

    if now_utc is None:
        now_utc = datetime.now(timezone.utc)
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)

    cutoff = now_utc - timedelta(days=max_age_days)
    fetched_at_utc = now_utc.isoformat()
    records: list[dict[str, Any]] = []

    with httpx.Client() as client:
        for channel_url in channel_urls:
            try:
                channel_id = _extract_channel_id(channel_url)
            except ValueError as exc:
                logger.warning("Skipping channel: %s", exc)
                continue

            uploads_playlist = _channel_id_to_uploads_playlist(channel_id)
            channel_name = channel_url_to_name(channel_url)

            page_token: str | None = None
            channel_video_ids: list[str] = []
            channel_items: list[dict[str, Any]] = []
            reached_cutoff = False

            while not reached_cutoff:
                params: dict[str, Any] = {
                    "part": "snippet,contentDetails",
                    "playlistId": uploads_playlist,
                    "maxResults": 50,
                    "key": api_key,
                }
                if page_token:
                    params["pageToken"] = page_token

                resp = client.get(
                    f"{_YT_API_BASE}/playlistItems",
                    params=params,
                    timeout=30,
                )
                resp.raise_for_status()
                data = resp.json()

                for item in data.get("items", []):
                    snippet = item.get("snippet", {})
                    cd = item.get("contentDetails", {})
                    video_id = (
                        cd.get("videoId")
                        or snippet.get("resourceId", {}).get("videoId")
                    )
                    if not video_id:
                        continue

                    published_str = (
                        cd.get("videoPublishedAt")
                        or snippet.get("publishedAt")
                    )
                    if not published_str:
                        continue

                    try:
                        published_at = datetime.fromisoformat(
                            published_str.replace("Z", "+00:00")
                        )
                    except ValueError:
                        continue

                    if published_at < cutoff:
                        reached_cutoff = True
                        break

                    channel_video_ids.append(video_id)
                    channel_items.append({
                        "video_id": video_id,
                        "title": snippet.get("title", ""),
                        "description": (snippet.get("description") or "")[:500],
                        "published_at": published_at,
                    })

                page_token = data.get("nextPageToken")
                if not page_token:
                    break

            video_details = _fetch_video_details(
                channel_video_ids, api_key, client
            )

            for item in channel_items:
                vid = item["video_id"]
                details = video_details.get(vid, {})
                records.append({
                    "channel_url": channel_url,
                    "channel_name": channel_name,
                    "video_id": vid,
                    "video_title": item["title"],
                    "description_snippet": item["description"],
                    "content_type": details.get("content_type", "videos"),
                    "video_length": {"seconds": details.get("duration_seconds")},
                    "view_count": {"value": details.get("view_count")},
                    "video_publish_date": item["published_at"].date().isoformat(),
                    "fetch_date_utc": fetched_at_utc,
                })

            logger.info(
                "YT API scrape done | channel=%s | found=%d",
                channel_url,
                len(channel_items),
            )

    return records


def records_to_jsonl(records: list[dict[str, Any]]) -> str:
    return "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in records)
