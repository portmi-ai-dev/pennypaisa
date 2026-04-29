import asyncio
from contextlib import asynccontextmanager
from typing import AsyncIterator

from app.core.config import settings
from app.core.database import close_db, connect_db
from app.core.http import create_http_client
from app.core.redis_client import close_redis, connect_redis
from app.intel.refresher import run_refresher
from app.intel.schema import ensure_schema
from app.yt_data_collector.video_id_corn import (
    ensure_schema as ensure_yt_schema,
    resolve_channel_urls_from_env,
    run_video_id_corn,
)


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
        except Exception as exc:
            print(f"Database connection failed on startup: {exc}")
    await connect_redis()

    refresher_task: asyncio.Task | None = None
    yt_video_task: asyncio.Task | None = None
    if db_ready:
        refresher_task = asyncio.create_task(run_refresher(http_client))
        try:
            await ensure_yt_schema()
            yt_video_task = asyncio.create_task(
                run_video_id_corn(channel_urls=resolve_channel_urls_from_env())
            )
        except Exception as exc:
            print(f"YouTube video-id cron failed to start: {exc}")

    try:
        yield
    finally:
        if refresher_task is not None:
            refresher_task.cancel()
            try:
                await refresher_task
            except (asyncio.CancelledError, Exception):
                pass
        if yt_video_task is not None:
            yt_video_task.cancel()
            try:
                await yt_video_task
            except (asyncio.CancelledError, Exception):
                pass
        await close_redis()
        if db_ready:
            await close_db()
        await http_client.aclose()
