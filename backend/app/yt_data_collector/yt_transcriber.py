"""YouTube transcript resolver (URL -> transcript text/segments).

Supports residential proxy rotation and cookie-based auth to
avoid YouTube IP blocks on cloud servers.
"""

from __future__ import annotations

import logging
import os
import re
import shutil
import tempfile
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qs, urlparse

import requests
from youtube_transcript_api import (
    CouldNotRetrieveTranscript,
    NoTranscriptFound,
    TranscriptsDisabled,
    YouTubeTranscriptApi,
)
from yt_dlp import YoutubeDL

from app.core.config import settings

logger = logging.getLogger(__name__)

ASSEMBLYAI_BASE_URL = "https://api.assemblyai.com"


# ---------------------------------------------------------------------------
# Proxy + cookie helpers
# ---------------------------------------------------------------------------

def _get_proxy_url() -> str | None:
    """Return raw proxy URL from settings, or None."""
    url = (settings.YT_PROXY_URL or "").strip()
    return url or None


def _get_yt_dlp_proxy() -> str | None:
    """Return proxy URL string for yt-dlp, or None."""
    return _get_proxy_url()


def _get_cookies_file() -> str | None:
    """Return validated cookies file path, or None."""
    path = (settings.YT_COOKIES_FILE or "").strip()
    if path and os.path.isfile(path):
        return path
    if path:
        logger.warning("YT_COOKIES_FILE set but file not found: %s", path)
    return None


def _build_transcript_api() -> YouTubeTranscriptApi:
    """Build YouTubeTranscriptApi instance with proxy_config if configured.

    Priority:
    1. Webshare rotating residential proxy (first-class library support)
    2. Generic proxy URL (any HTTP/HTTPS/SOCKS proxy)
    3. No proxy (direct connection — fine for dev, blocked on cloud)
    """
    # 1. Webshare (recommended for production)
    ws_user = (settings.YT_WEBSHARE_PROXY_USERNAME or "").strip()
    ws_pass = (settings.YT_WEBSHARE_PROXY_PASSWORD or "").strip()
    if ws_user and ws_pass:
        try:
            from youtube_transcript_api.proxies import WebshareProxyConfig
            proxy_config = WebshareProxyConfig(
                proxy_username=ws_user,
                proxy_password=ws_pass,
            )
            logger.debug("YouTubeTranscriptApi using Webshare rotating proxy")
            return YouTubeTranscriptApi(proxy_config=proxy_config)
        except ImportError:
            logger.warning(
                "WebshareProxyConfig not available — upgrade youtube-transcript-api >= 0.6.3"
            )
        except Exception as exc:
            logger.warning("Failed to configure Webshare proxy: %s", exc)

    # 2. Generic proxy URL
    proxy_url = _get_proxy_url()
    if proxy_url:
        try:
            from youtube_transcript_api.proxies import GenericProxyConfig
            proxy_config = GenericProxyConfig(
                http_url=proxy_url,
                https_url=proxy_url,
            )
            logger.debug("YouTubeTranscriptApi using generic proxy")
            return YouTubeTranscriptApi(proxy_config=proxy_config)
        except ImportError:
            logger.warning(
                "GenericProxyConfig not available — upgrade youtube-transcript-api >= 0.6.3"
            )
        except Exception as exc:
            logger.warning("Failed to configure generic transcript proxy: %s", exc)

    # 3. No proxy
    return YouTubeTranscriptApi()


@dataclass(slots=True)
class TranscriptResult:
    video_id: str
    source: str
    text: str


def extract_video_id(url: str) -> str | None:
    parsed_url = urlparse(url)

    if parsed_url.hostname in {"www.youtube.com", "youtube.com", "m.youtube.com"}:
        return parse_qs(parsed_url.query).get("v", [None])[0]

    if parsed_url.hostname == "youtu.be":
        return parsed_url.path.lstrip("/")

    return None


def _extract_entry_value(entry: Any, key: str, default: Any) -> Any:
    if isinstance(entry, dict):
        return entry.get(key, default)
    return getattr(entry, key, default)


def _is_valid_transcript(entries: list[Any]) -> bool:
    combined_text = " ".join(
        str(_extract_entry_value(entry, "text", "")) for entry in entries
    )
    return bool(re.search(r"[A-Za-z0-9]", combined_text))


def _is_upcoming_live_reason(reason: str) -> bool:
    lowered = (reason or "").lower()
    return any(
        marker in lowered
        for marker in (
            "live event will begin",
            "will begin in",
            "is upcoming",
            "upcoming live",
            "premiere",
            "scheduled to begin",
        )
    )


def _entries_to_text(entries: list[Any]) -> str:
    return " ".join(str(_extract_entry_value(entry, "text", "")).strip() for entry in entries).strip()


def _resolve_js_runtimes() -> dict[str, dict[str, str]] | None:
    runtime = (settings.YT_DLP_JS_RUNTIME or "").strip().lower()
    runtime_path = (settings.YT_DLP_JS_RUNTIME_PATH or "").strip()
    if runtime:
        config: dict[str, dict[str, str]] = {runtime: {}}
        if runtime_path:
            config[runtime]["path"] = runtime_path
        return config

    for runtime_name, candidates in (
        ("node", ("node",)),
        ("bun", ("bun",)),
        ("deno", ("deno",)),
        ("quickjs", ("qjs", "quickjs")),
    ):
        for candidate in candidates:
            resolved = shutil.which(candidate)
            if resolved:
                return {runtime_name: {"path": resolved}}

    return None


def _fetch_youtube_transcript(video_id: str) -> list[Any]:
    api = _build_transcript_api()

    # Modern .fetch() (v0.6+) — proxy already baked into api instance
    if hasattr(api, "fetch"):
        return api.fetch(video_id)

    # Legacy class-method API (no proxy support in old versions)
    if hasattr(YouTubeTranscriptApi, "get_transcript"):
        return YouTubeTranscriptApi.get_transcript(video_id)

    transcripts = (
        YouTubeTranscriptApi.list_transcripts(video_id)
        if hasattr(YouTubeTranscriptApi, "list_transcripts")
        else api.list(video_id)
    )
    try:
        return transcripts.find_manually_created_transcript(["en"]).fetch()
    except Exception:
        return transcripts.find_generated_transcript(["en"]).fetch()


def _download_audio_to_temp(video_url: str, output_dir: str) -> str:
    output_template = f"{output_dir}/audio.%(ext)s"
    options: dict[str, Any] = {
        "format": "bestaudio/best",
        "outtmpl": output_template,
        "quiet": True,
        "noplaylist": True,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }
        ],
    }

    # Proxy support
    proxy = _get_yt_dlp_proxy()
    if proxy:
        options["proxy"] = proxy

    # Cookie support — avoids "Sign in to confirm you're not a bot"
    cookies_file = _get_cookies_file()
    if cookies_file:
        options["cookiefile"] = cookies_file

    js_runtimes = _resolve_js_runtimes()
    if js_runtimes:
        options["js_runtimes"] = js_runtimes

    with YoutubeDL(options) as ydl:
        info = ydl.extract_info(video_url, download=True)
        original_path = ydl.prepare_filename(info)

    return original_path.rsplit(".", 1)[0] + ".mp3"


def _transcribe_audio_with_assemblyai(audio_path: str) -> str:
    api_key = (settings.assemblyai_api_key or "").strip()
    if not api_key:
        raise RuntimeError("ASSEMBLYAI_API_KEY is not configured")

    headers = {"authorization": api_key}

    upload_endpoint = f"{ASSEMBLYAI_BASE_URL}/v2/upload"
    with open(audio_path, "rb") as audio_file:
        upload_response = requests.post(
            upload_endpoint,
            headers=headers,
            data=audio_file,
            timeout=120,
        )
    upload_response.raise_for_status()
    upload_payload = upload_response.json()
    audio_url = upload_payload.get("upload_url")
    if not audio_url:
        raise RuntimeError(f"Unexpected AssemblyAI upload response: {upload_payload}")

    submit_endpoint = f"{ASSEMBLYAI_BASE_URL}/v2/transcript"
    submit_payload = {
        "audio_url": audio_url,
        "language_detection": True,
        "speech_models": ["universal-3-pro", "universal-2"],
    }
    submit_response = requests.post(
        submit_endpoint,
        json=submit_payload,
        headers=headers,
        timeout=60,
    )
    submit_response.raise_for_status()
    submit_data = submit_response.json()
    transcript_id = submit_data.get("id")
    if not transcript_id:
        raise RuntimeError(f"Unexpected AssemblyAI submit response: {submit_data}")

    polling_endpoint = f"{ASSEMBLYAI_BASE_URL}/v2/transcript/{transcript_id}"
    for _ in range(120):
        polling_response = requests.get(polling_endpoint, headers=headers, timeout=30)
        polling_response.raise_for_status()
        polling_payload = polling_response.json()

        status = (polling_payload.get("status") or "").lower()
        if status == "completed":
            return str(polling_payload.get("text") or "")
        if status == "error":
            raise RuntimeError(
                f"AssemblyAI transcription failed: {polling_payload.get('error')}"
            )

        time.sleep(3)

    raise TimeoutError("AssemblyAI transcription timed out while waiting for completion")


def _transcribe_video_audio_with_assemblyai(video_url: str) -> str:
    with tempfile.TemporaryDirectory() as tmp_dir:
        audio_path = _download_audio_to_temp(video_url, tmp_dir)
        return _transcribe_audio_with_assemblyai(audio_path)


def get_transcript_for_url(video_url: str) -> TranscriptResult:
    video_id = extract_video_id(video_url)
    if not video_id:
        raise ValueError("Invalid YouTube URL")

    upcoming = False
    try:
        entries = _fetch_youtube_transcript(video_id)
        if entries and _is_valid_transcript(entries):
            return TranscriptResult(
                video_id=video_id,
                source="youtube",
                text=_entries_to_text(entries),
            )
    except (TranscriptsDisabled, NoTranscriptFound, CouldNotRetrieveTranscript) as exc:
        if _is_upcoming_live_reason(str(exc)):
            upcoming = True
    except Exception as exc:
        if _is_upcoming_live_reason(str(exc)):
            upcoming = True
        else:
            raise

    if upcoming:
        raise RuntimeError("Transcript unavailable for upcoming live stream")

    if (settings.assemblyai_api_key or "").strip():
        transcript = _transcribe_video_audio_with_assemblyai(video_url)
        if transcript and transcript.strip():
            return TranscriptResult(
                video_id=video_id,
                source="assemblyai",
                text=transcript.strip(),
            )

    raise RuntimeError("Transcript unavailable for this video")
