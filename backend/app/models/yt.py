"""Pydantic models for YouTube ingestion / transcription routes.

Centralised here so every API surface (routes, jobs, future analytics
endpoints) shares the same shape definitions instead of redefining
inline `BaseModel` subclasses per file.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


# ─────────────────────────────────────────────────────────────────────────────
# Request bodies
# ─────────────────────────────────────────────────────────────────────────────


class TranscriptRequest(BaseModel):
    """Single-URL transcript request body."""

    url: str = Field(..., description="YouTube video URL")


# ─────────────────────────────────────────────────────────────────────────────
# Enqueue acknowledgements (returned by every POST that queues a job)
# ─────────────────────────────────────────────────────────────────────────────


JobQueueStatus = Literal["queued"]


class EnqueueResponse(BaseModel):
    """Returned the moment a job is accepted onto the worker queue."""

    job_id: str
    status: JobQueueStatus = "queued"


class BackfillEnqueueResponse(EnqueueResponse):
    """Same as ``EnqueueResponse`` plus the ``days`` window the caller picked."""

    days: int


# ─────────────────────────────────────────────────────────────────────────────
# Result payloads (the ``result`` field of a completed job)
# ─────────────────────────────────────────────────────────────────────────────


TranscriptSource = Literal["youtube", "assemblyai"]


class TranscriptJobResult(BaseModel):
    """Result of the single-URL transcript job (``transcript_job``)."""

    videoId: str
    source: TranscriptSource
    text: str


class BackfillScrapeResult(BaseModel):
    """Result of the ``backfill_scrape_job`` (video IDs only).

    ``channels_timed_out`` counts channels whose scrapetube generator stalled
    past ``YT_SCRAPE_PER_CHANNEL_TIMEOUT_SECONDS`` and were skipped.
    """

    processed_ids: int
    inserted_ids: int
    insert_failed: int
    channels_timed_out: int = 0


class BackfillTranscriptResult(BaseModel):
    """Result of the ``backfill_transcript_job``.

    Counters separate YouTube-API hits from AssemblyAI fallbacks so we
    can monitor how often the cheap path fails and we have to spend on
    AssemblyAI.
    """

    candidates: int
    youtube_stored: int = 0
    assemblyai_stored: int = 0
    transcripts_unavailable: int = 0
    transcripts_failed: int = 0


# ─────────────────────────────────────────────────────────────────────────────
# Job status (returned by every GET /api/yt/.../{job_id} endpoint)
# ─────────────────────────────────────────────────────────────────────────────


JobLifecycleStatus = Literal[
    "queued", "in_progress", "completed", "failed", "not_found"
]


class JobStatusResponse(BaseModel):
    """Generic job-poll response shared by every poll endpoint.

    ``result`` is intentionally typed as a free-form dict so the same
    model can carry any of the per-job result shapes above. Routes can
    optionally validate the inner shape with the per-job result models
    when they need stricter typing.
    """

    job_id: str
    status: JobLifecycleStatus
    result: dict[str, Any] | None = None
    error: str | None = None
