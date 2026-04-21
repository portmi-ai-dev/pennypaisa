"""Price provider for CoinLore API."""

from typing import Any

import httpx


async def fetch_global_data(client: httpx.AsyncClient) -> dict[str, Any] | None:
    """Fetch global market data from CoinLore."""
    try:
        response = await client.get("https://api.coinlore.net/api/global/")
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError):
        return None


async def fetch_btc_ticker(client: httpx.AsyncClient) -> dict[str, Any] | None:
    """Fetch BTC ticker from CoinLore."""
    try:
        response = await client.get("https://api.coinlore.net/api/ticker/?id=90")
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError):
        return None
