from fastapi import FastAPI

from app.api import api_router
from app.api.chat import router as chat_router
from app.api.routes.prices import router as prices_router
from app.core.lifespan import lifespan

app = FastAPI(lifespan=lifespan)

app.include_router(api_router)
app.include_router(chat_router)
app.include_router(prices_router)


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "PennyPaisa backend is running"}