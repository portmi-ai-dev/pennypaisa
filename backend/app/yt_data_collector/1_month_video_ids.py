from __future__ import annotations

import argparse
import logging
from pathlib import Path

from app.yt_data_collector.one_month_video_ids import fetch_last_month_video_ids, records_to_jsonl


def setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scrape last-month YouTube video IDs for channels and output JSONL."
    )
    parser.add_argument(
        "--channel-url",
        action="append",
        dest="channel_urls",
        required=True,
        help="YouTube channel URL to scrape (repeat flag for multiple).",
    )
    parser.add_argument(
        "--max-age-days",
        type=int,
        default=30,
        help="Max age in days (default: 30).",
    )
    parser.add_argument(
        "--resolve-exact-publish-date",
        action=argparse.BooleanOptionalAction,
        default=False,
        help="Fallback to yt-dlp when relative publish time is missing (default: false).",
    )
    parser.add_argument(
        "--output-jsonl",
        default=None,
        help="Write JSONL output to this path (defaults to stdout).",
    )
    return parser.parse_args()


def main() -> None:
    setup_logging()
    args = parse_args()

    records = fetch_last_month_video_ids(
        channel_urls=tuple(args.channel_urls),
        max_age_days=max(1, int(args.max_age_days)),
        resolve_exact_publish_date=bool(args.resolve_exact_publish_date),
    )
    text = records_to_jsonl(records)

    if args.output_jsonl:
        path = Path(args.output_jsonl).expanduser().resolve()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        logging.getLogger(__name__).info("Wrote JSONL | path=%s | records=%d", path, len(records))
        return

    print(text, end="")


if __name__ == "__main__":
    main()

