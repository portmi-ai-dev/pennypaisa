from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Iterable


logger = logging.getLogger(__name__)


DDL = """
CREATE TABLE IF NOT EXISTS video_ids (
    video_id                   TEXT PRIMARY KEY,
    channel_url                TEXT,
    video_title                TEXT,
    description_snippet        TEXT,
    video_length_text          TEXT,
    video_length_seconds       INTEGER,
    view_count_text            TEXT,
    view_count_value           BIGINT,
    video_publish_date         TEXT,
    video_publish_date_relative TEXT,
    video_publish_datetime_utc TIMESTAMPTZ,
    fetch_date_utc             TIMESTAMPTZ,
    raw                        JSONB NOT NULL,
    inserted_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_ids_channel_url ON video_ids (channel_url);
CREATE INDEX IF NOT EXISTS idx_video_ids_fetch_date ON video_ids (fetch_date_utc DESC);
"""


UPSERT_SQL = """
INSERT INTO video_ids (
    video_id,
    channel_url,
    video_title,
    description_snippet,
    video_length_text,
    video_length_seconds,
    view_count_text,
    view_count_value,
    video_publish_date,
    video_publish_date_relative,
    video_publish_datetime_utc,
    fetch_date_utc,
    raw,
    updated_at
)
VALUES (
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now()
)
ON CONFLICT (video_id) DO UPDATE SET
    channel_url                 = EXCLUDED.channel_url,
    video_title                 = EXCLUDED.video_title,
    description_snippet         = EXCLUDED.description_snippet,
    video_length_text           = EXCLUDED.video_length_text,
    video_length_seconds        = EXCLUDED.video_length_seconds,
    view_count_text             = EXCLUDED.view_count_text,
    view_count_value            = EXCLUDED.view_count_value,
    video_publish_date          = EXCLUDED.video_publish_date,
    video_publish_date_relative = EXCLUDED.video_publish_date_relative,
    video_publish_datetime_utc  = EXCLUDED.video_publish_datetime_utc,
    fetch_date_utc              = EXCLUDED.fetch_date_utc,
    raw                         = EXCLUDED.raw,
    updated_at                  = now();
"""


def setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
    )


def _parse_timestamptz(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    # Handle "Z" suffix
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def _calculate_publish_date(relative_str: str | None, fetch_date: datetime | None) -> datetime | None:
    """
    Back-calculates the publish date from a relative string like '15 hours ago'.
    """
    if not relative_str or not fetch_date:
        return None
    
    s = relative_str.lower().strip()
    
    # Matches '15 hours ago', '1 day ago', '2 weeks ago', etc.
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


def _safe_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.isdigit():
            return int(stripped)
    return None


def _obj_to_row(obj: dict[str, Any]) -> tuple[
    str,
    str | None,
    str | None,
    str | None,
    str | None,
    int | None,
    str | None,
    int | None,
    str | None,
    str | None,
    datetime | None,
    datetime | None,
    str,
]:
    video_id = str(obj.get("video_id") or "").strip()
    if not video_id:
        raise ValueError("Missing video_id")

    video_length = obj.get("video_length") if isinstance(obj.get("video_length"), dict) else {}
    view_count = obj.get("view_count") if isinstance(obj.get("view_count"), dict) else {}

    # Primary time components
    fetch_date = _parse_timestamptz(obj.get("fetch_date_utc"))
    pub_datetime_utc = _parse_timestamptz(obj.get("video_publish_datetime_utc"))
    rel_date_str = obj.get("video_publish_date_relative")

    # If the explicit UTC timestamp is missing, calculate it from relative time
    if pub_datetime_utc is None and rel_date_str and fetch_date:
        pub_datetime_utc = _calculate_publish_date(str(rel_date_str), fetch_date)

    raw_json = json.dumps(obj, ensure_ascii=False)

    return (
        video_id,
        (str(obj.get("channel_url")).strip() if obj.get("channel_url") else None),
        (str(obj.get("video_title")).strip() if obj.get("video_title") else None),
        (str(obj.get("description_snippet")) if obj.get("description_snippet") else None),
        (str(video_length.get("text")).strip() if video_length.get("text") else None),
        _safe_int(video_length.get("seconds")),
        (str(view_count.get("text")).strip() if view_count.get("text") else None),
        _safe_int(view_count.get("value")),
        (str(obj.get("video_publish_date")).strip() if obj.get("video_publish_date") else None),
        (str(rel_date_str).strip() if rel_date_str else None),
        pub_datetime_utc,
        fetch_date,
        raw_json,
    )


def iter_jsonl(path: Path) -> Iterable[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            stripped = line.strip()
            if not stripped:
                continue
            try:
                obj = json.loads(stripped)
            except json.JSONDecodeError as exc:
                raise ValueError(f"Invalid JSON at {path}:{line_no}") from exc
            if not isinstance(obj, dict):
                continue
            yield obj


def find_latest_clean_jsonl(output_dir: Path) -> Path | None:
    candidates = sorted(
        output_dir.glob("youtube_channels_clean_*.jsonl"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    return candidates[0] if candidates else None


def _read_env_file_value(env_path: Path, key: str) -> str | None:
    if not env_path.exists():
        return None
    try:
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[len("export ") :].strip()
            if not line.startswith(f"{key}="):
                continue
            value = line.split("=", 1)[1].strip()
            if (value.startswith('"') and value.endswith('"')) or (
                value.startswith("'") and value.endswith("'")
            ):
                value = value[1:-1]
            return value.strip() or None
    except Exception:
        return None
    return None


def resolve_neon_database_url() -> str | None:
    # Prefer explicit environment variable (e.g. `NEON_DATABASE_URL=... python3 ...`)
    value = os.environ.get("NEON_DATABASE_URL")
    if value and value.strip():
        return value.strip()

    # Fallback: read backend/.env directly. Avoid importing `app.core.config`
    # because Settings validation requires unrelated env vars (REDIS/GEMINI/etc).
    backend_dir = Path(__file__).resolve().parents[2]
    return _read_env_file_value(backend_dir / ".env", "NEON_DATABASE_URL")


async def ensure_video_ids_schema(*, conn) -> None:
    await conn.execute(DDL)


async def import_file(
    *,
    input_jsonl: Path,
    progress_every: int,
    dry_run: bool,
    ensure_schema: bool,
) -> None:
    logger.info("Import started | input=%s | dry_run=%s", input_jsonl, dry_run)

    records: list[tuple[Any, ...]] = []
    total = 0
    bad = 0

    if dry_run:
        for obj in iter_jsonl(input_jsonl):
            total += 1
            try:
                _obj_to_row(obj)
            except Exception as exc:
                bad += 1
                logger.warning("Skipping bad row | reason=%s", exc)
            if total % progress_every == 0:
                logger.info("Progress | processed=%d | bad=%d", total, bad)

        logger.info("Import finished | processed=%d | inserted_or_updated=%d | bad=%d", total, total - bad, bad)
        return

    try:
        import asyncpg  # type: ignore
    except Exception as exc:
        raise RuntimeError(
            "asyncpg is required. Install backend deps (e.g. `pip install -r backend/requirements.txt`)."
        ) from exc

    dsn = resolve_neon_database_url()
    if not dsn:
        raise RuntimeError(
            "NEON_DATABASE_URL is not set. Pass it as an env var or set it in `backend/.env`."
        )

    async with asyncpg.create_pool(dsn=dsn, min_size=1, max_size=5) as pool:
        async with pool.acquire() as conn:
            if ensure_schema:
                await ensure_video_ids_schema(conn=conn)

        for obj in iter_jsonl(input_jsonl):
            total += 1
            try:
                row = _obj_to_row(obj)
            except Exception as exc:
                bad += 1
                logger.warning("Skipping bad row | reason=%s", exc)
                continue

            records.append(row)

            if len(records) >= 500:
                async with pool.acquire() as conn:
                    await conn.executemany(UPSERT_SQL, records)
                if total % progress_every == 0:
                    logger.info(
                        "Progress | processed=%d | inserted_or_updated=%d | bad=%d",
                        total,
                        total - bad,
                        bad,
                    )
                records.clear()

        if records:
            async with pool.acquire() as conn:
                await conn.executemany(UPSERT_SQL, records)

    logger.info("Import finished | processed=%d | inserted_or_updated=%d | bad=%d", total, total - bad, bad)


def parse_args() -> argparse.Namespace:
    here = Path(__file__).resolve().parent
    default_output = here / "output"
    default_input = find_latest_clean_jsonl(default_output) or (default_output / "video_ids.jsonl")

    parser = argparse.ArgumentParser(
        description="Import youtube_channels_clean_*.jsonl into Neon Postgres table `video_ids`."
    )
    parser.add_argument(
        "--input-jsonl",
        default=str(default_input),
        help="Path to youtube_channels_clean_*.jsonl.",
    )
    parser.add_argument(
        "--progress-every",
        type=int,
        default=5000,
        help="Log progress every N processed rows.",
    )
    parser.add_argument(
        "--no-ensure-schema",
        action="store_true",
        help="Skip CREATE TABLE IF NOT EXISTS / indexes.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and validate input, but do not write to the database.",
    )

    return parser.parse_args()


def _ensure_import_path() -> None:
    try:
        import app  # noqa: F401
    except Exception:
        backend_dir = Path(__file__).resolve().parents[2]
        os.sys.path.insert(0, str(backend_dir))


def main() -> None:
    setup_logging()
    args = parse_args()
    _ensure_import_path()

    input_jsonl = Path(args.input_jsonl).expanduser().resolve()
    if not input_jsonl.exists():
        raise SystemExit(f"Input JSONL not found: {input_jsonl}")

    asyncio.run(
        import_file(
            input_jsonl=input_jsonl,
            progress_every=max(1, int(args.progress_every)),
            dry_run=bool(args.dry_run),
            ensure_schema=not bool(args.no_ensure_schema),
        )
    )


if __name__ == "__main__":
    main()
