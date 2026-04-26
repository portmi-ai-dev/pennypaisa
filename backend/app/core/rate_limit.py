"""Per-IP rate limiter built on slowapi.

Wired into the FastAPI app in ``main.py``. Routes opt in by decorating
themselves with ``@limiter.limit("...")``. The limiter is exported as a
module-level singleton so the same instance is shared across workers
(each worker has its own in-memory bucket — fine for abuse protection,
not for strict global limits).

For strict global limits across workers we'd back slowapi with Redis,
but the current goal is just to stop a single client from hammering
the sentiment endpoint and burning Gemini quota.
"""

from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
