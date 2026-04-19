"""Logging setup for the FastAPI app.

Uvicorn doesn't configure non-uvicorn loggers, so without this every
`log.info(...)` we write inside `app.*` modules silently disappears. This
module wires a simple, readable console format and applies sensible levels
to noisy third-party loggers.

Call `configure_logging()` once at startup (we do it in `app.main.lifespan`).
"""

from __future__ import annotations

import logging
import sys
from typing import Final

from app.core.config import get_settings

_CONFIGURED = False

# Format mirrors uvicorn's "INFO: ..." style but adds the logger name and a
# millisecond timestamp so we can read deploy traces by eye.
_FORMAT: Final = "%(asctime)s.%(msecs)03d %(levelname)-7s [%(name)s] %(message)s"
_DATEFMT: Final = "%H:%M:%S"

_THIRD_PARTY_LOGGERS: Final = (
    "httpx",
    "httpcore",
    "modal",
    "modal-utils",
    "modal.client",
    "anthropic",
    "sqlalchemy.engine",
    "watchfiles",
    "asyncio",
)


def configure_logging() -> None:
    """Install our handler on the root logger. Idempotent."""
    global _CONFIGURED
    if _CONFIGURED:
        return
    settings = get_settings()

    handler = logging.StreamHandler(stream=sys.stdout)
    handler.setFormatter(logging.Formatter(_FORMAT, datefmt=_DATEFMT))

    root = logging.getLogger()
    # Wipe any pre-existing handlers (e.g. uvicorn's default basicConfig)
    # so we don't double-print.
    for h in list(root.handlers):
        root.removeHandler(h)
    root.addHandler(handler)
    root.setLevel(_level(settings.log_level))

    # Also set level on our own top-level logger so child loggers inherit.
    logging.getLogger("app").setLevel(_level(settings.log_level))

    third_party_level = _level(settings.log_level_third_party)
    for name in _THIRD_PARTY_LOGGERS:
        logging.getLogger(name).setLevel(third_party_level)

    # Make sure uvicorn's loggers go through our handler too.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        ulog = logging.getLogger(name)
        ulog.handlers.clear()
        ulog.propagate = True

    _CONFIGURED = True


def _level(name: str) -> int:
    return getattr(logging, name.upper(), logging.INFO)
