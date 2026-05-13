"""YouTube audio downloader + AssemblyAI transcription pipeline.

Flow: yt-dlp downloads audio → upload to AssemblyAI → poll for result.
Supports proxy and cookie-based auth to avoid YouTube IP blocks.
"""

from __future__ import annotations

import logging
import os
import shutil
import tempfile
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qs, urlparse

import requests
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


def _get_cookies_file() -> str | None:
    """Return validated cookies file path, or None."""
    path = (settings.YT_COOKIES_FILE or "").strip()
    if path and os.path.isfile(path):
        return path
    if path:
        logger.warning("YT_COOKIES_FILE set but file not found: %s", path)
    return None


# ---------------------------------------------------------------------------
# URL / video-id helpers
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# yt-dlp audio download
# ---------------------------------------------------------------------------


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


def _download_audio_to_temp(video_url: str, output_dir: str) -> str:
    """Download audio from a YouTube video using yt-dlp.

    Returns path to the downloaded MP3 file.
    """
    output_template = f"{output_dir}/audio.%(ext)s"
    options: dict[str, Any] = {
        "format": "bestaudio/best",
        "outtmpl": output_template,
        "quiet": True,
        "noplaylist": True,
        # Enable remote JS challenge solver — fixes "n challenge solving failed"
        "allowed_extractors": ["youtube"],
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }
        ],
    }

    # Proxy support
    proxy = _get_proxy_url()
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


# ---------------------------------------------------------------------------
# AssemblyAI transcription
# ---------------------------------------------------------------------------


def _transcribe_audio_with_assemblyai(audio_path: str) -> str:
    """Upload audio file to AssemblyAI and poll until transcription completes."""
    api_key = (settings.assemblyai_api_key or "").strip()
    if not api_key:
        raise RuntimeError("ASSEMBLYAI_API_KEY is not configured")

    headers = {"authorization": api_key}

    # 1. Upload audio
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

    # 2. Submit transcription job
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

    # 3. Poll for completion
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


def transcribe_video(video_url: str) -> str:
    """Download audio from YouTube video and transcribe via AssemblyAI.

    This is the primary transcription pipeline:
    yt-dlp download → ffmpeg extract MP3 → AssemblyAI upload → poll → text

    Returns the transcribed text.
    """
    with tempfile.TemporaryDirectory() as tmp_dir:
        audio_path = _download_audio_to_temp(video_url, tmp_dir)
        return _transcribe_audio_with_assemblyai(audio_path)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def get_transcript_for_url(video_url: str) -> TranscriptResult:
    """Get transcript for a YouTube video URL via AssemblyAI.

    Downloads audio with yt-dlp, transcribes with AssemblyAI.
    Raises RuntimeError if transcription fails or is unavailable.
    """
    video_id = extract_video_id(video_url)
    if not video_id:
        raise ValueError("Invalid YouTube URL")

    api_key = (settings.assemblyai_api_key or "").strip()
    if not api_key:
        raise RuntimeError(
            "ASSEMBLYAI_API_KEY is not configured — required for transcription"
        )

    transcript = transcribe_video(video_url)
    if transcript and transcript.strip():
        return TranscriptResult(
            video_id=video_id,
            source="assemblyai",
            text=transcript.strip(),
        )

    raise RuntimeError("Transcript unavailable for this video")
