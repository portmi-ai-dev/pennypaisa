# Data collection scripts

## `channels_video_id_fetcher.py`

Scrapes channel metadata using `scrapetube`, processes channels **one by one**, and saves a **clean JSONL** output for downstream caption/transcript workflows.

### Default target channels

- `https://www.youtube.com/channel/UCRvqjQPSeaWn-uEx-w0XOIg` Benjamin Cowen
- `https://www.youtube.com/channel/UCwTu6kD2igaLMpxswtcdxlg`Trade Smarter with Chris Vermeulen
- `https://www.youtube.com/channel/UCanAtEpNJ2H9otfsgcLlu0w`greath soloway

### Output

The script writes one file under `output/`:

- `youtube_channels_clean_<timestamp>.jsonl` (one clean record per line)

Each JSONL record contains:

- `channel_url`
- `video_id`
- `video_title`
- `description_snippet`
- `video_length.text`
- `video_length.seconds`
- `view_count.text`
- `view_count.value`
- `video_publish_date`
- `fetch_date_utc`

### Terminal progress logging

The script logs:

- run start / finish
- channel start / finish
- scrape progress every `N` records (default `25`)
- limit reached notices (if `--limit` is used)

### Usage

```bash
python3 channels_video_id_fetcher.py
```

Quick smoke run with smaller volume:

```bash
python3 channels_video_id_fetcher.py --limit 3 --progress-every 1
```

Use custom channels (repeat `--channel-url`):

```bash
python3 data_collection/channels_video_id_fetcher.py \
	--channel-url "https://www.youtube.com/channel/UCRvqjQPSeaWn-uEx-w0XOIg" \
	--channel-url "https://www.youtube.com/channel/UCwTu6kD2igaLMpxswtcdxlg"
```

## `transcript_raw_by_video_id_fetcher.py`

Fetches **full raw transcript payload** by YouTube video ID using `youtube-transcript-api` and writes JSONL.

By default, it reads input rows from:

- `output/video_ids.jsonl`

Each input row should contain at least `video_id` (extra metadata is preserved in output).

### Output

- `youtube_video_raw_by_id_<timestamp>.jsonl`

Each line contains:

- `video_id`
- `transcript_fetch_date_utc`
- `source_video_metadata` (original row from input JSONL)
- `transcript_raw.video_id`
- `transcript_raw.track_count`
- `transcript_raw.tracks[]` with:
	- `language`
	- `language_code`
	- `is_generated`
	- `is_translatable`
	- `translation_languages`
	- `raw_entries[]` (`text`, `start`, `duration`)

### Usage

Default input JSONL mode:

```bash
python3 data_collection/video_raw_by_id_fetcher.py
```

Use a specific input JSONL path:

```bash
python3 data_collection/video_raw_by_id_fetcher.py --input-jsonl data_collection/output/video_ids.jsonl
```

Quick test on first 5 rows:

```bash
python3 data_collection/video_raw_by_id_fetcher.py --limit 5
```

Multiple IDs:

```bash
python3 data_collection/video_raw_by_id_fetcher.py \
	--video-id "y6bK6dx3zAo" \
	--video-id "dQw4w9WgXcQ"
```
