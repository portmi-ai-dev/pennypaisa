import asyncio
from contextlib import asynccontextmanager
from typing import AsyncIterator

from app.core.arq_client import close_arq, connect_arq
from app.core.config import settings
from app.core.database import close_db, connect_db
from app.core.http import create_http_client
from app.core.redis_client import close_redis, connect_redis
from app.sentiment.refresher import run_refresher
from app.sentiment.schema import ensure_schema
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
            await ensure_schema()
            # Keep yt schema bootstrap in the API too — the API can still
            # serve read-only queries against video_ids/video_transcripts
            # even though scraping itself runs in the worker.
            try:
                await ensure_yt_schema()
            except Exception as exc:
                print(f"YouTube schema bootstrap failed: {exc}")
        except Exception as exc:
            print(f"Database connection failed on startup: {exc}")
    await connect_redis()

    # arq pool — used by yt routes to enqueue jobs onto the worker.
    try:
        await connect_arq()
    except Exception as exc:
        print(f"arq pool init failed: {exc}")

    # Gemini intel refresher stays in-process (cheap, single API call per
    # asset per hour). YouTube cron has been moved to the arq worker.
    refresher_task: asyncio.Task | None = None
    if db_ready:
        refresher_task = asyncio.create_task(run_refresher(http_client))

    try:
        yield
    finally:
        if refresher_task is not None:
            refresher_task.cancel()
            try:
                await refresher_task
            except (asyncio.CancelledError, Exception):
                pass
        await close_arq()
        await close_redis()
        if db_ready:
            await close_db()
        await http_client.aclose()
