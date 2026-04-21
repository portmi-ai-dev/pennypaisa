"""Price provider for Gold API."""

from typing import Any

import httpx


async def fetch_gold_price(client: httpx.AsyncClient) -> dict[str, Any] | None:
    """Fetch gold price from Gold API."""
    try:
        response = await client.get("https://api.gold-api.com/price/XAU")
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError):
        return None


async def fetch_silver_price(client: httpx.AsyncClient) -> dict[str, Any] | None:
    """Fetch silver price from Gold API."""
    try:
        response = await client.get("https://api.gold-api.com/price/XAG")
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError):
        return None
