

## Sentiment Generation Pipeline — Full Map

### 1. SCHEDULING

| Trigger | Where | Cadence |
|---------|-------|---------|
| **Cron (primary)** | `refresher.py → run_refresher()` | Every **60 min**, started from `lifespan.py` on app boot. 30s initial delay. |
| **SWR (safety net)** | `_common.py → _refresh_in_background()` | On-demand when user reads stale cache (expired but within +1hr SWR window) |
| **Manual force** | `POST /api/sentiment/regenerate` | User-triggered, bypasses cache entirely |
| **Single asset** | `GET /api/sentiment/{asset}?refresh=true` | User-triggered per asset |

### 2. FLOW (for one generation cycle)

```
run_refresher()                          ← hourly cron
  └─ _refresh_all()
       ├─ clear_transcript_cache()       ← reset so fresh transcripts fetched
       └─ _refresh_one(asset) × 3        ← gold, silver, crypto IN PARALLEL
            ├─ pg_try_advisory_lock()     ← dedup across workers
            ├─ aggregate_prices(client)   ← live price fetch
            └─ generate_and_cache(asset, prices)
                 ├─ _get_transcript_block()
                 │    └─ fetch_recent_transcripts()   ← SQL: last 2/channel from video_transcripts
                 │    └─ format_transcripts_for_prompt()  ← truncate to 4000 chars total
                 ├─ build_prompt(asset, prices, transcript_block)
                 │    ├─ Analysis frame (gold/silver/crypto specific)
                 │    ├─ DATE: today
                 │    ├─ LIVE PRICE SNAPSHOT (from aggregator)
                 │    ├─ TRANSCRIPT BLOCK (YouTube analyst commentary)
                 │    └─ Schema spec (JSON output format)
                 ├─ generate_sentiment(prompt)
                 │    └─ Groq API call: openai/gpt-oss-20b
                 │         ├─ strict JSON schema response_format
                 │         └─ max_tokens=4096
                 └─ cache.set_cached()
                      ├─ UPSERT intel_sentiment_cache (1 row/asset)
                      └─ INSERT intel_sentiment_history (audit log)
```

### 3. INPUTS to the model

Per asset, the prompt contains:

| Section | Source | Example |
|---------|--------|---------|
| **Analysis frame** | Hardcoded in `prompts.py` | "You are a precious-metals desk analyst... Weigh: Macro, DXY, real yields..." |
| **Date** | `datetime.now()` | "DATE: May 11, 2026" |
| **Live prices** | `aggregate_prices()` → Binance, CoinGecko, CoinLore, GoldAPI, Kitco | "LIVE BITCOIN SNAPSHOT — Spot $103,500 \| 24h +1.85% \| Dominance 52.5%" |
| **Transcripts** | `video_transcripts` DB → last 2/channel | "[Benjamin Cowen] Labor Market... (2026-05-08)\n{first 1000 chars}" |
| **Schema spec** | Hardcoded | "Respond with pure JSON: marketType, confidence, horizon, reasoning, analystView" |

### 4. OUTPUT schema

```json
{
  "marketType": "bull | bear | neutral",
  "confidence": "low | medium | high",
  "horizon": "short-term | medium-term | long-term",
  "reasoning": "<=35 words",
  "analystView": "<=55 words"
}
```

Post-processing in `_parse_sentiment()`: `reasoning` trimmed to 35 words, `analystView` to 55 words.

### 5. MODEL + LIMITS

- **Model**: `openai/gpt-oss-20b` on Groq
- **TPM limit**: 8000 tokens (free tier)
- **3 calls per cycle** (gold + silver + crypto in parallel) → can hit TPM if prompts large
- Transcript block capped at 4000 chars (~1000 tokens) to stay under

### 6. CACHING

| Layer | TTL | Purpose |
|-------|-----|---------|
| `intel_sentiment_cache` | 1 hour | Primary read path |
| SWR window | +1 hour after expiry | Serve stale while regenerating |
| Advisory lock | Per-asset | Dedup parallel workers |
| Transcript in-memory cache | Cleared each refresh cycle | Avoid 3x DB hit per cycle |

---

**Key observations for refinement:**

1. `reasoning` capped at 35 words, `analystView` at 55 words — very tight. May want to increase.
2. Model is `openai/gpt-oss-20b` — relatively small. Could upgrade if Groq tier allows.
3. 8000 TPM limit is tight with transcripts. Calls go sequential if parallel 3 all hit within same minute.
4. Price aggregator has hardcoded fallback prices (gold $4646, BTC $65000) — stale if APIs fail. No weekly change data for gold/silver (only 24h).
5. No error reporting to frontend when sentiment generation fails silently — just missing data.

What you want to refine?