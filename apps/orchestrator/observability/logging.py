from __future__ import annotations

from typing import cast

import structlog

from .debug import configure_debug_logging


def configure_logging(log_level: str = "INFO") -> None:
    # Use debug-aware configuration
    configure_debug_logging(log_level)


def get_logger(name: str) -> structlog.BoundLogger:
    return cast(structlog.BoundLogger, structlog.get_logger(name))
