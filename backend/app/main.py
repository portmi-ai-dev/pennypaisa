from fastapi import FastAPI, HTTPException
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api import api_router
from app.api.chat import router as chat_router
from app.api.routes.prices import router as prices_router
from app.api.routes.sentiment import router as sentiment_router
from app.api.routes.sentiment_gemini import router as sentiment_gemini_router
from app.api.routes.yt_backfill import router as yt_router
from app.api.routes.yt_transcriber import router as yt_transcriber_router
from app.core.lifespan import lifespan
from app.core.logging_config import configure_logging
from app.core.rate_limit import limiter
from app.core.redis_client import get_redis
from app.core.database import get_db
from app.core.request_logger import RequestLoggerMiddleware

# Configure root logger BEFORE anything imports loggers, so every
# logger.info(...) across the codebase produces visible output.
configure_logging()

app = FastAPI(lifespan=lifespan)

# Request/response logger — runs before SlowAPI so rate-limit rejections
# also get logged.
app.add_middleware(RequestLoggerMiddleware)

# slowapi: per-IP rate limiting. Routes opt in via @limiter.limit(...).
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.include_router(api_router)
app.include_router(chat_router)
app.include_router(prices_router)
app.include_router(sentiment_router)
app.include_router(sentiment_gemini_router)
app.include_router(yt_router)
app.include_router(yt_transcriber_router)


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "PennyPaisa backend is running"}


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready")
async def ready() -> dict[str, str]:
    try:
        async with get_db() as conn:
            await conn.fetchval("SELECT 1")
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"db_not_ready: {exc}") from exc

    try:
        redis = get_redis()
        await redis.ping()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"redis_not_ready: {exc}") from exc

    return {"status": "ready"}
