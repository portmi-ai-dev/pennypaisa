"""Centralised logging configuration.

Configures the root logger once on app startup so every ``logger.info(...)``
call across the codebase produces visible output (default Python root logger
level is WARNING — without this setup most INFO logs are silently dropped).

Picks up ``LOG_LEVEL`` from env (DEBUG / INFO / WARNING / ERROR).
"""

from __future__ import annotations

import logging
import os
import sys


_FORMAT = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
_DATEFMT = "%Y-%m-%d %H:%M:%S"

_CONFIGURED = False


def configure_logging() -> None:
    """Idempotent root logger setup. Safe to call multiple times."""
    global _CONFIGURED
    if _CONFIGURED:
        return

    level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    root = logging.getLogger()
    # Remove existing handlers so uvicorn/gunicorn's own handlers don't dupe.
    for h in list(root.handlers):
        root.removeHandler(h)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(_FORMAT, datefmt=_DATEFMT))
    root.addHandler(handler)
    root.setLevel(level)

    # Quiet noisy third-party libs unless explicitly debugging.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("asyncpg").setLevel(logging.WARNING)
    logging.getLogger("watchfiles").setLevel(logging.WARNING)

    # Ensure uvicorn loggers propagate to the root configured above so
    # access logs and our own app logs both appear in the same stream.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        lg = logging.getLogger(name)
        lg.handlers = []
        lg.propagate = True

    _CONFIGURED = True
    root.info("logging configured: level=%s", level_name)
