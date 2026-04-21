"""Core HTTP utilities."""

import httpx

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
}
DEFAULT_TIMEOUT = httpx.Timeout(10.0)


def create_http_client() -> httpx.AsyncClient:
    """Create a configured async HTTP client."""
    return httpx.AsyncClient(
        headers=DEFAULT_HEADERS,
        timeout=DEFAULT_TIMEOUT,
        follow_redirects=True,
    )
