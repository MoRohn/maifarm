"""Simplified portalocker replacement for environments without the real package."""
from __future__ import annotations

import threading
from pathlib import Path
from types import TracebackType
from typing import Optional, Type


class Lock:
    def __init__(self, path: str, timeout: float = 0) -> None:
        self._path = Path(path)
        self._timeout = timeout
        self._lock = threading.Lock()
        self._acquired = False

    def acquire(self, timeout: float | None = None) -> bool:
        effective_timeout = timeout if timeout is not None else self._timeout
        if effective_timeout is None or effective_timeout == 0:
            acquired = self._lock.acquire()
        else:
            acquired = self._lock.acquire(timeout=effective_timeout)
        self._acquired = acquired
        return acquired

    def release(self) -> None:
        if self._acquired:
            self._lock.release()
            self._acquired = False

    def __enter__(self) -> "Lock":
        self.acquire()
        return self

    def __exit__(
        self,
        exc_type: Optional[Type[BaseException]],
        exc: Optional[BaseException],
        tb: Optional[TracebackType],
    ) -> Optional[bool]:
        self.release()
        return None
