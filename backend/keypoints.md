# Backend Key Points

Quick reference for the intel sentiment pipeline. Read this first before
poking at `app/intel/`.

## Pipeline (high level)

```
Frontend hover ─► /api/intel/sentiment[/{asset}] ─► Postgres cache (1h TTL)
                                                         │
                                  fresh hit ◄────────────┤
                                  stale hit ◄────────────┤  (background refresh)
                                  miss     ─► Gemini ─► Postgres (cache + history)
```

## Tables (Neon Postgres)

- **`intel_sentiment_cache`** — 1 row per asset. UPSERTed on write.
  Columns: `asset PK, response JSONB, expires_at, updated_at`.
- **`intel_sentiment_history`** — append-only Gemini call log for
  analytics / fine-tuning. Columns include `prompt`, `response`,
  `raw_response`, `model`, `prompt_tokens`, `completion_tokens`,
  `total_tokens`, `generated_at`.

DDL lives in `app/intel/schema.py` and runs on startup.

## Cache lifecycle

- `TTL_SECONDS = 1h` — fresh window.
- `STALE_TTL_SECONDS = 1h` — stale-while-revalidate window. Expired rows
  are still served while a background task regenerates.
- Cron worker (`app/intel/refresher.py`) refreshes every 1h, so under
  healthy operation users always see a fresh hit.

## Single-flight (no Gemini stampede)

Both the SWR refresh and the cron use Postgres `pg_try_advisory_lock`
keyed per-asset. If another worker is already refreshing, others skip.
Implemented in `cache.try_acquire_refresh_lock` / `release_refresh_lock`.

## Where things live

| File | Responsibility |
|---|---|
| `app/intel/cache.py` | Cache reads (with SWR flag), UPSERT + history insert, advisory lock helpers. |
| `app/intel/schema.py` | DDL, runs on startup. |
| `app/intel/_common.py` | Shared cache→Gemini orchestration (`get_or_swr`, `generate_and_cache`, background refresh). |
| `app/intel/refresher.py` | Hourly cron worker — proactively refreshes all assets. |
| `app/intel/utils.py` | Gemini call. Returns `GenerationResult` with sentiment + raw text + token counts. |
| `app/intel/gold.py` / `silver.py` / `btc.py` | Thin per-asset wrappers around `_common`. |
| `app/intel/aggregator.py` | Aggregate endpoint logic + `fetch_asset_sentiment`. |
| `app/intel/prompts.py` | Persona + schema prompt builders. |
| `app/core/database.py` | asyncpg pool: `min_size=5, max_size=30, command_timeout=10`. |
| `app/core/rate_limit.py` | slowapi limiter (per-IP). |
| `app/core/lifespan.py` | Connects DB, ensures schema, starts the hourly refresher. |

## Rate limits (per IP)

- `GET /api/intel/sentiment` → **30/min**
- `GET /api/intel/sentiment/{asset}` → **60/min**

slowapi is in-process per worker. Fine for abuse protection; for strict
global limits, swap the storage backend.

## Why the hover feels instant

Speed comes from the **frontend**, not the cache:

1. App mount → `/api/intel/sentiment` populates React state for all 3 assets.
2. Hover panel renders from props — no fetch awaited.
3. `fetchSentimentFor()` has a 10-min in-memory throttle → most hovers
   issue zero HTTP traffic.
4. localStorage holds the aggregate for 10 min across reloads.

Backend cache is the safety net for cold paths and Gemini quota, not
the source of UX speed.

## Adding a new asset

1. Add the literal to `Asset = Literal[...]` in `cache.py`, `_common.py`,
   `aggregator.py`, and the route's `_ASSET_ALIASES`.
2. Create `app/intel/<asset>.py` mirroring `gold.py`.
3. Register in `aggregator._FETCHERS`.
4. Add a frame in `prompts.py`.

## Useful queries

```sql
-- Current cache state
SELECT asset, expires_at, updated_at FROM intel_sentiment_cache;

-- Recent history with token usage
SELECT asset, generated_at, prompt_tokens, completion_tokens, total_tokens
FROM intel_sentiment_history
ORDER BY generated_at DESC LIMIT 20;

-- Daily token spend
SELECT date_trunc('day', generated_at) AS day,
       SUM(total_tokens) AS tokens
FROM intel_sentiment_history
GROUP BY 1 ORDER BY 1 DESC;
```

## Times stored as UTC

`TIMESTAMPTZ` columns are UTC; Neon SQL editor displays them as `+00`.
Nepal time = UTC + 5:45. Convert at the display layer:
`SELECT updated_at AT TIME ZONE 'Asia/Kathmandu' FROM intel_sentiment_cache;`
