"""Request/response logging middleware.

Logs every HTTP request handled by the FastAPI app with:
  * client IP
  * method + path
  * response status
  * elapsed time (ms)
  * any exception raised

Designed to be cheap and never break the request flow on logging errors.
"""

from __future__ import annotations

import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("app.request")


class RequestLoggerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        rid = uuid.uuid4().hex[:8]
        start = time.perf_counter()
        client_ip = request.client.host if request.client else "-"
        method = request.method
        path = request.url.path
        query = request.url.query
        full_path = f"{path}?{query}" if query else path

        try:
            response: Response = await call_next(request)
        except Exception as exc:
            elapsed_ms = (time.perf_counter() - start) * 1000
            logger.exception(
                "rid=%s %s %s %s status=500 elapsed=%.1fms ERROR=%s",
                rid, client_ip, method, full_path, elapsed_ms, exc,
            )
            raise

        elapsed_ms = (time.perf_counter() - start) * 1000
        status = response.status_code
        log_fn = logger.info if status < 500 else logger.error
        log_fn(
            "rid=%s %s %s %s status=%d elapsed=%.1fms",
            rid, client_ip, method, full_path, status, elapsed_ms,
        )
        response.headers["X-Request-Id"] = rid
        return response
