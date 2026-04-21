"""Price provider for CoinGecko API."""

from typing import Any

import httpx


async def fetch_global_data(client: httpx.AsyncClient) -> dict[str, Any] | None:
    """Fetch global market data from CoinGecko."""
    try:
        response = await client.get("https://api.coingecko.com/api/v3/global")
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError):
        return None


async def fetch_btc_simple_price(client: httpx.AsyncClient) -> dict[str, Any] | None:
    """Fetch BTC simple price from CoinGecko."""
    try:
        response = await client.get(
            "https://api.coingecko.com/api/v3/simple/price"
            "?ids=bitcoin&vs_currencies=usd"
            "&include_24hr_vol=true&include_24hr_change=true"
        )
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError):
        return None
