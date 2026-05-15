import asyncio
from contextlib import asynccontextmanager
from typing import AsyncIterator

from app.core.arq_client import close_arq, connect_arq
from app.core.config import settings
from app.core.database import close_db, connect_db
from app.core.http import create_http_client
from app.core.redis_client import close_redis, connect_redis
from app.sentiment.gemini.schema import ensure_schema as ensure_gemini_schema
from app.yt_data_collector.video_id_corn import ensure_schema as ensure_yt_schema


@asynccontextmanager
async def lifespan(app) -> AsyncIterator[None]:
    http_client = create_http_client()
    app.state.http_client = http_client

    db_ready = False
    if settings.NEON_DATABASE_URL:
        try:
            await connect_db()
            db_ready = True
            # Worker-managed schemas — bootstrap from API too so read-only
            # queries succeed even if the worker hasn't started yet.
            try:
                await ensure_yt_schema()
            except Exception as exc:
                print(f"YouTube schema bootstrap failed: {exc}")
            try:
                await ensure_gemini_schema()
            except Exception as exc:
                print(f"Gemini sentiment schema bootstrap failed: {exc}")
        except Exception as exc:
            print(f"Database connection failed on startup: {exc}")
    await connect_redis()

    # arq pool — API uses this to enqueue jobs to the worker.
    try:
        await connect_arq()
    except Exception as exc:
        print(f"arq pool init failed: {exc}")

    # NOTE: In-process Groq refresher REMOVED. All sentiment generation
    # now lives in the arq worker (twice-daily Gemini cron). Groq
    # endpoints remain for live A/B comparison but never write to Postgres.

    try:
        yield
    finally:
        await close_arq()
        await close_redis()
        if db_ready:
            await close_db()
        await http_client.aclose()
