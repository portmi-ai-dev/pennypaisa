"""YouTube transcript resolver (URL -> transcript text/segments)."""

from __future__ import annotations

import re
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

ASSEMBLYAI_BASE_URL = "https://api.assemblyai.com"


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


def _entries_to_text(entries: list[Any]) -> str:
    return " ".join(str(_extract_entry_value(entry, "text", "")).strip() for entry in entries).strip()


def _fetch_youtube_transcript(video_id: str) -> list[Any]:
    api = YouTubeTranscriptApi()
    if hasattr(api, "fetch"):
        return api.fetch(video_id)
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
    options = {
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

    try:
        entries = _fetch_youtube_transcript(video_id)
        if entries and _is_valid_transcript(entries):
            return TranscriptResult(
                video_id=video_id,
                source="youtube",
                text=_entries_to_text(entries),
            )
    except (TranscriptsDisabled, NoTranscriptFound, CouldNotRetrieveTranscript):
        pass

    if (settings.assemblyai_api_key or "").strip():
        transcript = _transcribe_video_audio_with_assemblyai(video_url)
        if transcript and transcript.strip():
            return TranscriptResult(
                video_id=video_id,
                source="assemblyai",
                text=transcript.strip(),
            )

    raise RuntimeError("Transcript unavailable for this video")
