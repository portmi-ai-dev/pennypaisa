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
├── backend/                  # FastAPI service
│   ├── app/
│   ├── requirements.txt
│   └── .env.example
├── package.json              # Monorepo scripts
└── README.md
```

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

Frontend runs at `http://localhost:5173` and the backend at `http://127.0.0.1:8000`.

---

## 📝 Notes

- The frontend uses a Vite proxy to reach the FastAPI backend in development.
- Health check: `GET /health/server`.
- If you don’t have a database configured, startup continues with a warning.
