import argparse
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from youtube_transcript_api import (
    CouldNotRetrieveTranscript,
    NoTranscriptFound,
    TranscriptsDisabled,
    YouTubeTranscriptApi,
)

DEFAULT_VIDEO_IDS = ("y6bK6dx3zAo",)
DEFAULT_INPUT_JSONL = "data_collection/output/video_ids.jsonl"


def setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
    )


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


def fetch_video_raw(video_id: str) -> dict[str, Any]:
    """Fetch all raw transcript tracks + entries available for a YouTube video ID."""
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


def load_source_rows_from_jsonl(input_jsonl: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    total_non_empty_lines = 0
    with input_jsonl.open("r", encoding="utf-8") as f:
        for line_number, line in enumerate(f, start=1):
            stripped = line.strip()
            if not stripped:
                continue
            total_non_empty_lines += 1
            try:
                obj = json.loads(stripped)
            except json.JSONDecodeError as exc:
                raise RuntimeError(
                    f"Invalid JSON at line {line_number} in {input_jsonl}: {exc}"
                ) from exc

            if not isinstance(obj, dict):
                continue
            if not obj.get("video_id"):
                continue
            rows.append(obj)

    if total_non_empty_lines == 0:
        raise RuntimeError(
            f"Input JSONL is empty: {input_jsonl}. Please provide a file that has video_id rows."
        )

    return rows


def build_record(video_id: str, raw_payload: dict[str, Any], source_row: dict[str, Any] | None) -> dict[str, Any]:
    record: dict[str, Any] = {
        "video_id": video_id,
        "transcript_fetch_date_utc": datetime.now(timezone.utc).isoformat(),
        "transcript_raw": raw_payload,
    }

    if source_row:
        record["source_video_metadata"] = source_row

    return record


def save_jsonl(records: list[dict[str, Any]], output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    output_path = output_dir / f"youtube_video_raw_by_id_{timestamp}.jsonl"

    with output_path.open("w", encoding="utf-8") as f:
        for row in records:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    return output_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch full raw transcript payload by YouTube video IDs using youtube-transcript-api"
    )
    parser.add_argument(
        "--video-id",
        action="append",
        dest="video_ids",
        help="YouTube video ID (repeat this flag for multiple IDs)",
    )
    parser.add_argument(
        "--input-jsonl",
        default=DEFAULT_INPUT_JSONL,
        help=(
            "Path to source JSONL containing video metadata rows with video_id "
            f"(default: {DEFAULT_INPUT_JSONL})"
        ),
    )
    parser.add_argument(
        "--output-dir",
        default="data_collection/output",
        help="Directory where JSONL output is saved",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional number of input rows to process",
    )
    return parser.parse_args()


def main() -> None:
    setup_logging()
    logger = logging.getLogger(__name__)

    args = parse_args()
    output_dir = Path(args.output_dir)

    source_rows: list[dict[str, Any]] = []
    video_ids: tuple[str, ...]
    if args.video_ids:
        video_ids = tuple(args.video_ids)
        source_rows = [{"video_id": video_id} for video_id in video_ids]
        logger.info("Input mode | direct video IDs")
    else:
        input_jsonl_path = Path(args.input_jsonl)
        if not input_jsonl_path.exists():
            raise FileNotFoundError(f"Input JSONL not found: {input_jsonl_path}")

        source_rows = load_source_rows_from_jsonl(input_jsonl_path)
        if args.limit is not None:
            source_rows = source_rows[: args.limit]

        if not source_rows:
            logger.warning("No valid source rows found in %s", input_jsonl_path)
            return

        video_ids = tuple(str(row["video_id"]) for row in source_rows)
        logger.info("Input mode | source JSONL=%s", input_jsonl_path)

    logger.info("Run started | total_video_ids=%d", len(video_ids))

    records: list[dict[str, Any]] = []
    failures: list[dict[str, str]] = []

    for index, source_row in enumerate(source_rows, start=1):
        video_id = str(source_row.get("video_id"))
        logger.info("[%d/%d] Fetch started | video_id=%s", index, len(video_ids), video_id)

        try:
            raw_payload = fetch_video_raw(video_id)
            record = build_record(video_id=video_id, raw_payload=raw_payload, source_row=source_row)
            records.append(record)
            logger.info(
                "[%d/%d] Fetch completed | video_id=%s | tracks=%d",
                index,
                len(video_ids),
                video_id,
                raw_payload.get("track_count", 0),
            )
        except (TranscriptsDisabled, NoTranscriptFound, CouldNotRetrieveTranscript) as exc:
            failure = {"video_id": video_id, "error": str(exc)}
            failures.append(failure)
            logger.warning(
                "[%d/%d] Transcript unavailable | video_id=%s | reason=%s",
                index,
                len(video_ids),
                video_id,
                exc,
            )
        except Exception as exc:
            failure = {"video_id": video_id, "error": str(exc)}
            failures.append(failure)
            logger.exception("[%d/%d] Fetch failed | video_id=%s", index, len(video_ids), video_id)

    if records:
        output_path = save_jsonl(records=records, output_dir=output_dir)
        logger.info("Output saved | records=%d | file=%s", len(records), output_path)
    else:
        logger.warning("No successful records to write")

    if failures:
        logger.warning("Failures=%d", len(failures))
        for failure in failures:
            logger.warning("Failed video_id=%s | reason=%s", failure['video_id'], failure['error'])

    logger.info("Run finished")


if __name__ == "__main__":
    main()
