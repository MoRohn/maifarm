from __future__ import annotations

from collections.abc import Awaitable, Iterable
from typing import Callable, TypeVar

from tenacity import AsyncRetrying, retry_if_exception_type, stop_after_attempt, wait_exponential

T = TypeVar("T")


async def retry_async(
    operation: Callable[[], Awaitable[T]],
    *,
    exceptions: Iterable[type[BaseException]] = (Exception,),
    attempts: int = 3,
    base: float = 0.2,
) -> T:
    async for attempt in AsyncRetrying(
        reraise=True,
        stop=stop_after_attempt(attempts),
        wait=wait_exponential(multiplier=base),
        retry=retry_if_exception_type(tuple(exceptions)),
    ):
        with attempt:
            return await operation()
    raise RuntimeError("retry_async reached unexpected state")
