"""Price provider for Kitco API."""

import json
import re
from typing import Any

import httpx


async def fetch_kitco_html(client: httpx.AsyncClient) -> str | None:
    """Fetch Kitco homepage HTML."""
    try:
        response = await client.get("https://www.kitco.com/")
        response.raise_for_status()
        return response.text
    except httpx.HTTPError:
        return None


def parse_kitco_change(html: str | None, metal: str) -> tuple[float | None, float | None]:
    """Parse Kitco HTML for metal price changes."""
    if not html:
        return None, None

    match = re.search(rf'"{re.escape(metal)}":\{{"results":\[(.*?)\]\}}', html)
    if not match:
        return None, None

    try:
        data = json.loads(match.group(1))
    except json.JSONDecodeError:
        return None, None

    return data.get("change"), data.get("changePercentage")
