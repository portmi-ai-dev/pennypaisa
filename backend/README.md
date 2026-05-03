# PennyPaisa Backend

A production-ready FastAPI backend for real-time financial data, AI chat, and price aggregation. Integrated with **Redis Cloud**, **Neon Postgres**, **Google Gemini AI**, and multiple price providers.

---

## Quick Start

### Prerequisites
- Python 3.11+
- Virtual environment (recommended)
- API keys for:
  - Google Gemini API (from [AI Studio](https://aistudio.google.com))
  - Redis Cloud (optional but recommended)
  - Neon Postgres (optional)

### Installation

```bash
# Clone and navigate to backend
cd backend

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy and configure environment
cp .env.example .env
# Edit .env with your API keys and credentials
```

### Run the Server

```bash
# Development (with auto-reload)
uvicorn app.main:app --reload

# Production
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Server runs on `http://localhost:8000` by default.

---

## API Endpoints

### Health Checks

Verify service connectivity:

- **`GET /health/server`** – Backend liveness check
  - Response: `{ "status": "ok", "service": "backend" }`

- **`GET /health/redis`** – Redis Cloud connectivity (PING)
  - Response: `{ "status": "ok", "service": "redis" }` or error details

- **`GET /health/db`** – Neon Postgres connectivity (SELECT 1)
  - Response: `{ "status": "ok", "service": "neon-db" }` or `{ "status": "disabled", "service": "neon-db" }`

- **`GET /health/gemini`** – Google Gemini API connectivity
  - Response: `{ "status": "ok", "service": "gemini" }` or error message

- **`GET /health/apis`** – External API health checks
  - Requires `EXTERNAL_API_URLS` env var (comma-separated)
  - Response: `{ "apis": [...], "count": N }`

### Chat Endpoints

AI-powered chat with real-time web search (grounding enabled by default):

- **`POST /chat/query`** – Query Gemini with optional grounding search
  ```bash
  curl -X POST http://localhost:8000/chat/query \
    -H "Content-Type: application/json" \
    -d '{"message": "What is the latest news on AI?"}'
  ```
  - Request: `{ "message": "your question" }`
  - Response: `{ "answer": "gemini's response" }`

### Price Endpoints

Real-time aggregated financial data with multi-provider fallback:

- **`GET /api/prices`** – Get current prices for gold, silver, and BTC
  ```bash
  curl http://localhost:8000/api/prices
  ```
  - Fetches from: Gold API, Binance, CoinGecko, CoinLore, Kitco
  - Returns: Gold, silver, BTC prices with 24h changes, market cap, dominance

---


## Project Structure

```
backend/
├── .env                                 # Local secrets (gitignored)
├── .env.example                         # Template env file
├── keypoints.md                         # Internal backend notes and keypoints
├── README.md                            # Backend documentation
├── requirements.txt                     # Python dependencies
├── app/                                 # FastAPI application package
│   ├── __pycache__/                     # Auto-generated Python bytecode
│   ├── main.py                          # FastAPI app entrypoint + router wiring
│   ├── api/                             # Request routing layer
│   │   ├── __pycache__/                 # Auto-generated Python bytecode
│   │   ├── __init__.py                  # Exports the shared API router
│   │   ├── chat.py                      # /chat endpoints (Gemini chat)
│   │   ├── router.py                    # Health-router loader
│   │   └── routes/                      # Feature API routes
│   │       ├── __pycache__/             # Auto-generated Python bytecode
│   │       ├── __init__.py              # Routes package marker
│   │       ├── intel.py                 # /api/intel sentiment endpoints
│   │       ├── prices.py                # /api/prices + chart/historical data
│   │       ├── yt_backfill.py           # YouTube backfill admin endpoints
│   │       └── yt_transcriber.py        # YouTube transcript lookup endpoint
│   ├── core/                            # Infrastructure & shared clients
│   │   ├── __pycache__/                 # Auto-generated Python bytecode
│   │   ├── __init__.py                  # Core package marker
│   │   ├── config.py                    # Env settings (Pydantic Settings)
│   │   ├── database.py                  # Async Postgres pool helpers
│   │   ├── gemini.py                    # Gemini client factory
│   │   ├── http.py                      # Shared httpx client config
│   │   ├── lifespan.py                  # Startup/shutdown + background tasks
│   │   ├── rate_limit.py                # SlowAPI limiter singleton
│   │   └── redis_client.py              # Redis connection helpers
│   ├── health/                          # Health check endpoints
│   │   ├── __pycache__/                 # Auto-generated Python bytecode
│   │   ├── api-heatlh.py                # External API health checks (typo in filename)
│   │   ├── db-health.py                 # Neon Postgres health check
│   │   ├── gemini-health.py             # Gemini API health check
│   │   ├── redis-health.py              # Redis health check
│   │   └── sever-health.py              # Server liveness check (typo in filename)
│   ├── intel/                           # Gemini-driven market intelligence
│   │   ├── __pycache__/                 # Auto-generated Python bytecode
│   │   ├── _common.py                   # SWR cache orchestration utilities
│   │   ├── aggregator.py                # Aggregate sentiment for all assets
│   │   ├── btc.py                       # BTC/crypto sentiment fetcher
│   │   ├── cache.py                     # Postgres cache + history storage
│   │   ├── gold.py                      # Gold sentiment fetcher
│   │   ├── prompts.py                   # Analyst-grade prompt builders
│   │   ├── refresher.py                 # Hourly sentiment refresher task
│   │   ├── schema.py                    # DDL for intel cache/history tables
│   │   ├── silver.py                    # Silver sentiment fetcher
│   │   └── utils.py                     # Gemini response parsing + validation
│   ├── models/                          # Pydantic response models
│   │   ├── __pycache__/                 # Auto-generated Python bytecode
│   │   ├── __init__.py                  # Models package marker
│   │   ├── intel.py                     # Sentiment response schemas
│   │   └── prices.py                    # Prices response schema
│   ├── services/                        # Core business logic services
│   │   ├── __pycache__/                 # Auto-generated Python bytecode
│   │   ├── __init__.py                  # Services package marker
│   │   ├── aggregator.py                # Price aggregation logic
│   │   ├── chat.py                      # Gemini chat service + quota handling
│   │   └── providers/                   # Price data providers
│   │       ├── __init__.py              # Providers package marker
│   │       ├── binance.py               # Binance price fetcher
│   │       ├── coingecko.py             # CoinGecko price fetcher
│   │       ├── coinlore.py              # CoinLore price fetcher
│   │       ├── gold_api.py              # Gold API price fetcher
│   │       └── kitco.py                 # Kitco HTML parser for metal changes
│   └── yt_data_collector/               # YouTube ID + transcript ingestion
│       ├── __pycache__/                 # Auto-generated Python bytecode
│       ├── __init__.py                  # Package marker + overview docstring
│       ├── 1_month_video_ids.py         # CLI wrapper for last-month scraping
│       ├── one_month_video_ids.py       # Scraper for last-month video IDs
│       ├── yt_transcriber.py            # URL -> transcript resolver (YT/AssemblyAI)
│       ├── video_id_corn.py             # Hourly cron + transcript ingest (typo in filename)
│       └── archive/                     # Archived scripts / outputs
```

---

## Design Patterns

**Singleton Pattern**: Redis, HTTP client, DB pool (one per app lifetime)
**Dependency Injection**: FastAPI `Depends()` + `request.app.state`
**Multi-Provider Fallback**: Query 5 providers in parallel, use defaults on failure
**Async/Await**: All I/O is non-blocking

---

## Features

✅ Real-time price aggregation with multi-provider fallback
✅ AI chat with optional web search grounding
✅ Cloud-ready (Redis Cloud, Neon Postgres)
✅ Health checks for all services
✅ Production-ready error handling

---

## Troubleshooting

**Redis SSL Error**: Verify TLS port from Redis Cloud dashboard, try `REDIS_SSL_CERT_REQS=none`
**Gemini Quota Exceeded**: Upgrade plan or wait for reset
**Database Connection Fails**: Leave `NEON_DATABASE_URL` empty to disable

---

## Deployment

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## Support

- Check `.env.example` for configuration
- API docs at `http://localhost:8000/docs` (Swagger UI)
- Health endpoints for service status