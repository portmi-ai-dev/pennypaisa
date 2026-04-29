import argparse
import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import scrapetube
from yt_dlp import YoutubeDL

DEFAULT_CHANNEL_URLS = (
	"https://www.youtube.com/channel/UCRvqjQPSeaWn-uEx-w0XOIg", #Benjamin Cowen
	"https://www.youtube.com/channel/UCanAtEpNJ2H9otfsgcLlu0w", #Trade Smarter with Chris Vermeulen
	"https://www.youtube.com/channel/UCwTu6kD2igaLMpxswtcdxlg", #greath soloway
)
CONTENT_TYPES = ("videos","shorts","streams")
PROGRESS_EVERY = 25


def setup_logging() -> None:
	logging.basicConfig(
		level=logging.INFO,
		format="%(asctime)s | %(levelname)s | %(message)s",
	)


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
	return int(digits)


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


def parse_yyyymmdd_to_iso(date_text: str | None) -> str | None:
	if not date_text or len(date_text) != 8 or not date_text.isdigit():
		return None
	try:
		return datetime.strptime(date_text, "%Y%m%d").date().isoformat()
	except ValueError:
		return None


def get_publish_info(
	video_id: str,
	publish_cache: dict[str, dict[str, str | None]],
	logger: logging.Logger,
) -> dict[str, str | None]:
	if video_id in publish_cache:
		return publish_cache[video_id]

	video_url = f"https://www.youtube.com/watch?v={video_id}"
	info: dict[str, Any] | None = None
	result: dict[str, str | None] = {
		"video_publish_date": None,
		"video_publish_datetime_utc": None,
	}

	try:
		ydl_opts = {
			"quiet": True,
			"no_warnings": True,
			"skip_download": True,
			"extract_flat": False,
		}
		with YoutubeDL(ydl_opts) as ydl:
			info = ydl.extract_info(video_url, download=False)

		upload_date = parse_yyyymmdd_to_iso(str(info.get("upload_date")) if info.get("upload_date") else None)
		release_date = parse_yyyymmdd_to_iso(str(info.get("release_date")) if info.get("release_date") else None)
		timestamp = info.get("release_timestamp") or info.get("timestamp")

		publish_date = upload_date or release_date
		publish_datetime_utc: str | None = None
		if isinstance(timestamp, (int, float)):
			publish_datetime_utc = datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()

		result = {
			"video_publish_date": publish_date,
			"video_publish_datetime_utc": publish_datetime_utc,
		}
	except Exception as exc:
		logger.warning("Publish date enrichment failed | video_id=%s | reason=%s", video_id, exc)

	publish_cache[video_id] = result
	return result


def build_clean_record(
	raw_entry: dict[str, Any],
	channel_url: str,
	fetched_at_utc: str,
	publish_info: dict[str, str | None],
) -> dict[str, Any]:
	video_id = raw_entry.get("videoId")
	title = extract_text(raw_entry.get("title"))
	description = extract_text(raw_entry.get("descriptionSnippet"))
	length_text = extract_text(raw_entry.get("lengthText"))
	view_count_text = extract_text(raw_entry.get("viewCountText"))
	published_relative_text = extract_text(raw_entry.get("publishedTimeText"))
	published_exact_date = publish_info.get("video_publish_date")
	published_exact_datetime_utc = publish_info.get("video_publish_datetime_utc")

	return {
		"channel_url": channel_url,
		"video_id": video_id,
		"video_title": title,
		"description_snippet": description,
		"video_length": {
			"text": length_text,
			"seconds": parse_duration_seconds(length_text),
		},
		"view_count": {
			"text": view_count_text,
			"value": parse_view_count(view_count_text),
		},
		"video_publish_date": published_exact_date or published_relative_text,
		"video_publish_date_relative": published_relative_text,
		"video_publish_datetime_utc": published_exact_datetime_utc,
		"fetch_date_utc": fetched_at_utc,
	}


def fetch_channel_clean_data(
	channel_url: str,
	content_types: tuple[str, ...],
	limit: int | None,
	progress_every: int,
	resolve_exact_publish_date: bool,
) -> list[dict[str, Any]]:
	logger = logging.getLogger(__name__)
	fetched_at_utc = datetime.now(timezone.utc).isoformat()
	all_records: list[dict[str, Any]] = []
	publish_cache: dict[str, dict[str, str | None]] = {}

	for content_type in content_types:
		logger.info("Scraping started | channel=%s | content_type=%s", channel_url, content_type)
		iterator = scrapetube.get_channel(
			channel_url=channel_url,
			content_type=content_type,
			sort_by="newest",
		)

		count = 0
		for raw_entry in iterator:
			video_id = raw_entry.get("videoId")
			if not video_id:
				continue

			publish_info = {
				"video_publish_date": None,
				"video_publish_datetime_utc": None,
			}
			if resolve_exact_publish_date:
				publish_info = get_publish_info(
					video_id=video_id,
					publish_cache=publish_cache,
					logger=logger,
				)

			record = build_clean_record(
				raw_entry=raw_entry,
				channel_url=channel_url,
				fetched_at_utc=fetched_at_utc,
				publish_info=publish_info,
			)
			if not record.get("video_id"):
				continue

			all_records.append(record)
			count += 1

			if count == 1 or (progress_every > 0 and count % progress_every == 0):
				logger.info(
					"Progress | channel=%s | content_type=%s | scraped=%d",
					channel_url,
					content_type,
					count,
				)

			if limit is not None and count >= limit:
				logger.info(
					"Limit reached | channel=%s | content_type=%s | limit=%d",
					channel_url,
					content_type,
					limit,
				)
				break

		logger.info("Scraping completed | channel=%s | content_type=%s | total=%d", channel_url, content_type, count)

	return all_records


def save_clean_jsonl(records: list[dict[str, Any]], output_dir: Path) -> Path:
	output_dir.mkdir(parents=True, exist_ok=True)
	timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
	jsonl_path = output_dir / f"youtube_channels_clean_{timestamp}.jsonl"

	with jsonl_path.open("w", encoding="utf-8") as f:
		for row in records:
			f.write(json.dumps(row, ensure_ascii=False) + "\n")

	return jsonl_path


def parse_args() -> argparse.Namespace:
	parser = argparse.ArgumentParser(
		description="Scrape YouTube channel metadata using scrapetube and output clean JSONL"
	)
	parser.add_argument(
		"--channel-url",
		action="append",
		dest="channel_urls",
		help="YouTube channel URL to scrape (repeat this flag to pass multiple channels)",
	)
	parser.add_argument(
		"--output-dir",
		default="data_collection/output",
		help="Directory where clean JSONL output is saved",
	)
	parser.add_argument(
		"--limit",
		type=int,
		default=None,
		help="Optional per-channel per-content-type cap for quick testing",
	)
	parser.add_argument(
		"--progress-every",
		type=int,
		default=PROGRESS_EVERY,
		help="Log progress every N scraped records",
	)
	parser.add_argument(
		"--resolve-exact-publish-date",
		action=argparse.BooleanOptionalAction,
		default=True,
		help="Enrich records with exact publish date using yt-dlp (default: enabled)",
	)
	return parser.parse_args()


def main() -> None:
	setup_logging()
	logger = logging.getLogger(__name__)
	args = parse_args()
	output_dir = Path(args.output_dir)
	channel_urls = tuple(args.channel_urls) if args.channel_urls else DEFAULT_CHANNEL_URLS
	content_types = tuple(CONTENT_TYPES)

	logger.info("Run started | channels=%d | content_types=%s", len(channel_urls), content_types)

	all_records: list[dict[str, Any]] = []
	for index, channel_url in enumerate(channel_urls, start=1):
		logger.info("Channel %d/%d started | %s", index, len(channel_urls), channel_url)
		channel_records = fetch_channel_clean_data(
			channel_url=channel_url,
			content_types=content_types,
			limit=args.limit,
			progress_every=args.progress_every,
			resolve_exact_publish_date=args.resolve_exact_publish_date,
		)
		all_records.extend(channel_records)
		logger.info("Channel %d/%d finished | records=%d", index, len(channel_urls), len(channel_records))

	if not all_records:
		logger.warning("No entries fetched. Please verify channel URLs or network access.")
		return

	jsonl_path = save_clean_jsonl(records=all_records, output_dir=output_dir)

	logger.info("Run finished | total_records=%d", len(all_records))
	logger.info("Clean JSONL saved at %s", jsonl_path)


if __name__ == "__main__":
	main()
