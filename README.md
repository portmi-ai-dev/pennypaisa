# Asset Intelligence Dashboard 🚀

An immersive 3D market intelligence platform for Gold, Silver, and Bitcoin. The frontend renders real-time 3D assets and sentiment panels, while the backend aggregates live pricing data and exposes a FastAPI-powered `/api/prices` endpoint.

---

## 🧰 Tech Stack

### Frontend
- **Framework**: [React 19](https://react.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **3D Engine**: [Three.js](https://threejs.org/) + [@react-three/fiber](https://docs.pmnd.rs/react-three-fiber)
- **Animation**: [Motion](https://www.framer.com/motion/)

### Backend
- **Framework**: [FastAPI](https://fastapi.tiangolo.com/)
- **Runtime**: Python 3.11+
- **HTTP Client**: [httpx](https://www.python-httpx.org/)
- **Background Worker**: [arq](https://arq-docs.helpmanual.io/) on Redis — runs YouTube scraping (yt-dlp + AssemblyAI + transcript ingest) out of the FastAPI process so the API stays responsive under heavy compute.

---

## ✨ Key Features

- Real-time bullion and BTC pricing with multi-source fallbacks.
- Interactive 3D bullion bars, BTC volume cuboids, and sentiment panels.
- Weekly change metrics and weekend detection for consistent UI states.
- Gemini-powered sentiment summaries (optional, via API key).

---

## 📂 Project Structure

```text
├── frontend/                 # Vite + React client
│   ├── src/
│   └── vite.config.ts
├── backend/                  # FastAPI service + arq worker (same package)
│   ├── app/
│   │   ├── main.py           # FastAPI entrypoint (api.gilver.ai)
│   │   ├── worker.py         # arq worker entrypoint (internal, no DNS)
│   │   └── ...
│   ├── requirements.txt
│   └── .env.example
├── package.json              # Monorepo scripts (api + worker + web)
└── README.md
```

### Process model

In production we run **three** processes off the same `backend/` package:

| Process       | Binds to              | Public? | Command                                  |
|---------------|-----------------------|---------|------------------------------------------|
| Frontend      | `gilver.ai`           | Yes     | static build served from CDN             |
| API           | `api.gilver.ai`       | Yes     | `uvicorn app.main:app`                   |
| Worker        | _(internal-only)_     | No      | `arq app.worker.WorkerSettings`          |
| Redis         | _(internal-only)_     | No      | managed (Redis Cloud) or VPC instance    |

The **worker** owns all heavy YouTube workloads — transcript fetches,
AssemblyAI fallbacks, and the hourly channel-sync cron. The **API**
only enqueues jobs onto Redis and reads results back, so a long-running
scrape never pins the API event loop. Other workloads (Gemini intel
refresher, price aggregation, chat) still live inside the FastAPI
process.

In dev we mirror this layout via `concurrently` — a single `npm run
dev` boots all three locally against the same Redis the worker uses in
prod.

---

## 📡 API Reference

### `GET /api/prices`
Returns a unified JSON payload:
- `gold`, `silver`, `btc`
- `btcMarketCap`, `btcDominance`
- `goldChange`, `silverChange`, `btcChange`
- `goldWeeklyChangePercent`, `silverWeeklyChangePercent`, `btcWeeklyChangePercent`
- `btcVolume24h`, `btcVolumeChangePercent`
- `isWeekend`, `timestamp`, `source`

### YouTube scraping (worker-backed, async)

All YouTube routes follow an **enqueue + poll** contract — the API
returns a `job_id` immediately, the arq worker does the heavy lifting,
and the client polls for the result.

| Method | Path                                            | Action                                                              |
|--------|-------------------------------------------------|---------------------------------------------------------------------|
| POST   | `/api/yt/transcript`                            | Enqueue transcript fetch for a single video URL → `{job_id}`        |
| GET    | `/api/yt/transcript/{job_id}`                   | Poll status / retrieve single-URL transcript                        |
| POST   | `/api/yt/backfill_scrape?days=N`                | Enqueue scrape of recent video IDs only (no transcripts). Default 10 days. |
| GET    | `/api/yt/job/backfill_scrape/{job_id}`          | Poll a `backfill_scrape` job                                         |
| POST   | `/api/yt/backfill_transcript?days=N`            | Enqueue transcripts for DB rows missing one. Default 10 days.       |
| GET    | `/api/yt/backfill_transcript/{job_id}`          | Poll a `backfill_transcript` job                                    |

Status response shape (shared by every poll endpoint):
```json
{ "job_id": "...",
  "status": "queued|in_progress|completed|failed|not_found",
  "result": { ... } | null,
  "error": "..." | null }
```

**Two-stage backfill** lets callers spend the cheap "scrape IDs"
budget separately from the expensive "fetch transcripts" budget:

1. `POST /api/yt/backfill_scrape` → only inserts into `video_ids`.
2. `POST /api/yt/backfill_transcript` → reads candidates straight from
   Postgres (no YouTube re-scrape) and fills `video_transcripts`.

The hourly channel-sync that used to run inside FastAPI now runs as an
arq cron at minute `:05` of every hour inside the worker process — it
runs the combined sync (scrape + transcribe) so steady-state ingestion
needs no manual triggers.

---

## 🚀 Getting Started

### 1. Install Node dependencies
```bash
npm install
```

### 2. Backend setup
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

### 3. Run everything together
```bash
npm run dev
```

`npm run dev` boots **three** processes via `concurrently`:

- `api`     → `uvicorn app.main:app --reload` on `http://127.0.0.1:8000`
- `worker`  → `arq app.worker.WorkerSettings` (consumes YouTube jobs from Redis)
- `web`     → `vite` on `http://localhost:5173`

The worker needs the same Redis credentials the API already uses (see
`backend/.env`) — no extra config required for dev.

Run individual pieces during debugging:
```bash
npm run dev:backend   # API only
npm run dev:worker    # arq worker only
npm run dev:frontend  # Vite only
```

Production:
```bash
npm run start         # API   (api.gilver.ai)
npm run start:worker  # Worker (internal)
```

---

## 📝 Notes

- The frontend uses a Vite proxy to reach the FastAPI backend in development.
- Health check: `GET /health/server`.
- If you don’t have a database configured, startup continues with a warning.
- The arq worker shares Redis with the API; if Redis is down the YouTube
  routes return `503` from the enqueue call — the API itself stays up.
