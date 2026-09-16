from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from time import perf_counter
from typing import Any

from .logging import get_logger


@asynccontextmanager
async def trace_span(name: str, **kwargs: Any) -> AsyncIterator[None]:
    logger = get_logger("trace")
    start = perf_counter()
    logger.info("span_start", span=name, **kwargs)
    try:
        yield
    finally:
        duration = perf_counter() - start
        logger.info("span_end", span=name, duration=duration, **kwargs)
