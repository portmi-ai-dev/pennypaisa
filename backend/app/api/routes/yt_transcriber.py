"""YouTube transcript API route."""

from __future__ import annotations

import asyncio
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.yt_data_collector.yt_transcriber import TranscriptResult, get_transcript_for_url

router = APIRouter(prefix="/api", tags=["yt"])


class TranscriptRequest(BaseModel):
    url: str = Field(..., description="YouTube video URL")


class TranscriptResponse(BaseModel):
    videoId: str
    source: Literal["youtube", "assemblyai"]
    text: str


@router.post("/yt/transcript", summary="Get transcript for a YouTube video URL")
async def yt_transcript(request: TranscriptRequest) -> TranscriptResponse:
    try:
        result: TranscriptResult = await asyncio.to_thread(get_transcript_for_url, request.url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Transcript service unavailable",
                "message": str(exc),
            },
        ) from exc

    return TranscriptResponse(
        videoId=result.video_id,
        source=result.source,
        text=result.text,
    )
