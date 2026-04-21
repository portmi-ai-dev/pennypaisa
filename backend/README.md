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

## Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# Redis Cloud (required for chat caching)
REDIS_HOST=redis-xxxxx.cloud.redislabs.com
REDIS_PORT=12155
REDIS_USERNAME=default
REDIS_PASSWORD=your-password
REDIS_SSL=true
REDIS_SSL_CERT_REQS=required
REDIS_SSL_FALLBACK=true

# Neon Postgres (optional for persistence)
NEON_DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require

# Google Gemini (required for chat)
GEMINI_API_KEY=your-api-key
GEMINI_MODEL=gemini-2.5-flash
GEMINI_ENABLE_GROUNDING=true

# External API checks (optional)
EXTERNAL_API_URLS=https://api.example.com/health
```

### Configuration Details

#### Redis Cloud
- Use the **TLS port** (typically `6380`)
- `REDIS_SSL=true` for encrypted connections
- `REDIS_SSL_CERT_REQS=required` for cert validation (set to `none` if errors)
- `REDIS_SSL_FALLBACK=true` retries without TLS if handshake fails

#### Neon Postgres
- Leave empty to disable database features
- Full PostgreSQL support via async `asyncpg`

#### Google Gemini
- Get API key from [AI Studio](https://aistudio.google.com)
- `GEMINI_ENABLE_GROUNDING=true` enables real-time web search
- `GEMINI_MODEL=gemini-2.5-flash` (default, supports grounding)

---

## Project Structure

```
backend/
├── app/
│   ├── main.py                 # FastAPI app entry point
│   ├── api/
│   │   ├── router.py           # Health check routes
│   │   ├── chat.py             # Chat endpoint
│   │   └── routes/prices.py    # Price endpoint
│   ├── core/
│   │   ├── config.py           # Env settings
│   │   ├── lifespan.py         # Startup/shutdown
│   │   ├── http.py             # HTTP client
│   │   ├── redis_client.py     # Redis singleton
│   │   ├── database.py         # DB pool
│   │   └── gemini.py           # Gemini helper
│   ├── health/
│   │   ├── sever-health.py
│   │   ├── redis-health.py
│   │   ├── db-health.py
│   │   └── gemini-health.py
│   ├── models/prices.py        # Response models
│   └── services/
│       ├── chat.py             # Chat logic
│       ├── aggregator.py       # Price aggregation
│       └── providers/          # API providers
├── .env.example
├── requirements.txt
└── README.md
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