"""Price provider for Binance API."""

from typing import Any

import httpx


async def fetch_btc_ticker(client: httpx.AsyncClient) -> dict[str, Any] | None:
    """Fetch BTC ticker from Binance."""
    try:
        response = await client.get(
            "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT"
        )
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError):
        return None
