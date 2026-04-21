import os
from http import HTTPStatus
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import APIRouter

router = APIRouter(prefix="/health", tags=["health"])


def _check_url(url: str, timeout: float = 3.0) -> dict[str, str | int]:
	request = Request(url=url, method="GET")
	try:
		with urlopen(request, timeout=timeout) as response:
			return {
				"url": url,
				"status": "up" if response.status < HTTPStatus.INTERNAL_SERVER_ERROR else "degraded",
				"status_code": response.status,
			}
	except HTTPError as exc:
		return {
			"url": url,
			"status": "down",
			"status_code": exc.code,
			"error": str(exc.reason),
		}
	except URLError as exc:
		return {
			"url": url,
			"status": "down",
			"status_code": 0,
			"error": str(exc.reason),
		}


@router.get("/apis")
def apis_status() -> dict[str, list[dict[str, str | int]]]:
	"""
	Health check for configured external APIs.

	Configure URLs with EXTERNAL_API_URLS env var (comma-separated).
	"""
	raw_urls = os.getenv("EXTERNAL_API_URLS", "")
	urls = [url.strip() for url in raw_urls.split(",") if url.strip()]

	return {
		"apis": [_check_url(url) for url in urls],
		"count": len(urls),
	}
