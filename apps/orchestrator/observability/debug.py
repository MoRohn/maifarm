"""Deep debug and tracing infrastructure for MaiFarm orchestrator."""
from __future__ import annotations

import logging
import os
import sys
from contextvars import ContextVar
from datetime import datetime
from pathlib import Path
from typing import Any

import structlog

# Trace ID context for request correlation
trace_id_var: ContextVar[str | None] = ContextVar("trace_id", default=None)

DEBUG_ENABLED = os.environ.get("DEBUG", "0") == "1"
DEBUG_LOG_PATH = Path(os.environ.get("DEBUG_LOG_PATH", "./run/maifarm-debug.log"))


def is_debug_enabled() -> bool:
    """Check if deep debug mode is enabled."""
    return DEBUG_ENABLED


def get_trace_id() -> str | None:
    """Get current trace ID from context."""
    return trace_id_var.get()


def set_trace_id(trace_id: str) -> None:
    """Set trace ID in context."""
    trace_id_var.set(trace_id)


def clear_trace_id() -> None:
    """Clear trace ID from context."""
    trace_id_var.set(None)


class DebugFileHandler(logging.Handler):
    """Custom handler that writes debug logs to file."""

    def __init__(self, log_path: Path) -> None:
        super().__init__()
        self.log_path = log_path
        log_path.parent.mkdir(parents=True, exist_ok=True)
        self.file_handle = open(log_path, "a", encoding="utf-8")
        self.setFormatter(logging.Formatter("%(message)s"))

    def emit(self, record: logging.LogRecord) -> None:
        try:
            msg = self.format(record)
            self.file_handle.write(msg + "\n")
            self.file_handle.flush()
        except Exception:
            self.handleError(record)

    def close(self) -> None:
        self.file_handle.close()
        super().close()


def add_trace_id(logger: Any, method_name: str, event_dict: dict[str, Any]) -> dict[str, Any]:
    """Structlog processor to inject trace_id into log events."""
    tid = get_trace_id()
    if tid:
        event_dict["trace_id"] = tid
    return event_dict


def configure_debug_logging(log_level: str = "INFO") -> None:
    """Configure logging with debug enhancements when DEBUG=1."""
    if DEBUG_ENABLED:
        # Force DEBUG level when DEBUG=1
        resolved_level = logging.DEBUG

        # Set up file handler for debug logs
        file_handler = DebugFileHandler(DEBUG_LOG_PATH)
        file_handler.setLevel(logging.DEBUG)

        # Configure root logger
        root_logger = logging.getLogger()
        root_logger.setLevel(logging.DEBUG)
        root_logger.addHandler(file_handler)

        # Also keep console output
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(logging.INFO)
        console_handler.setFormatter(logging.Formatter("%(message)s"))
        root_logger.addHandler(console_handler)

        # Configure structlog with trace ID injection
        # Reset to ensure processors are applied fresh
        if hasattr(structlog, 'reset_defaults'):
            structlog.reset_defaults()
        structlog.configure(
            processors=[
                structlog.processors.TimeStamper(fmt="iso"),
                structlog.stdlib.add_log_level,
                add_trace_id,
                structlog.processors.StackInfoRenderer(),
                structlog.processors.format_exc_info,
                structlog.processors.JSONRenderer(),
            ],
            wrapper_class=structlog.make_filtering_bound_logger(logging.DEBUG),
            cache_logger_on_first_use=True,
        )

        print(f"[DEBUG MODE ENABLED] Trace logs writing to: {DEBUG_LOG_PATH.absolute()}", file=sys.stderr)
    else:
        # Normal logging configuration
        level_name = log_level.upper() if isinstance(log_level, str) else log_level
        resolved_level = getattr(logging, level_name, logging.INFO) if isinstance(level_name, str) else level_name
        logging.basicConfig(level=resolved_level, format="%(message)s")
        structlog.configure(
            processors=[
                structlog.processors.TimeStamper(fmt="iso"),
                structlog.stdlib.add_log_level,
                add_trace_id,
                structlog.processors.StackInfoRenderer(),
                structlog.processors.format_exc_info,
                structlog.processors.JSONRenderer(),
            ],
            wrapper_class=structlog.make_filtering_bound_logger(resolved_level),
            cache_logger_on_first_use=True,
        )


def log_lifecycle_event(
    logger: structlog.BoundLogger,
    event_type: str,
    component: str,
    **kwargs: Any,
) -> None:
    """Log a lifecycle event with consistent formatting."""
    logger.info(
        "lifecycle_event",
        event_type=event_type,
        component=component,
        timestamp=datetime.utcnow().isoformat(),
        **kwargs,
    )
