from fastapi import FastAPI
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api import api_router
from app.api.chat import router as chat_router
from app.api.routes.prices import router as prices_router
from app.api.routes.intel import router as intel_router
from app.api.routes.yt_backfill import router as yt_router
from app.core.lifespan import lifespan
from app.core.rate_limit import limiter

app = FastAPI(lifespan=lifespan)

# slowapi: per-IP rate limiting. Routes opt in via @limiter.limit(...).
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.include_router(api_router)
app.include_router(chat_router)
app.include_router(prices_router)
app.include_router(intel_router)
app.include_router(yt_router)


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "PennyPaisa backend is running"}
