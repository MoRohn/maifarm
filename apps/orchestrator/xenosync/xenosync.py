from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import portalocker

from ..observability.logging import get_logger
from ..observability.metrics import record_gauge, record_histogram
from ..settings import AppSettings
from .events import XenoSyncEvent
from .merge import auto_merge
from .storage import ContentAddressedStore

_logger = get_logger("xenosync")


@dataclass
class LockEntry:
    path: Path
    owner: str
    mode: str
    lease_expiry: datetime
    lock: portalocker.Lock


@dataclass
class FileClaim:
    path: Path
    owner: str
    mode: str
    store: ContentAddressedStore
    lock: portalocker.Lock

    async def write_bytes(self, data: bytes) -> Path:
        """Atomic write with full fsync (file + directory).

        Args:
            data: Bytes to write

        Returns:
            Path to stored CAS object
        """
        import os
        temp_file = self.path.with_name(f".{self.path.name}.tmp")
        temp_file.write_bytes(data)
        # Ensure data is synced to disk before atomic rename (WSL2 safety)
        with open(temp_file, 'rb') as f:
            os.fsync(f.fileno())

        # Atomic rename
        temp_file.replace(self.path)

        # Fsync directory to ensure rename is durable
        dir_fd = os.open(self.path.parent, os.O_RDONLY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)

        return self.store.store_bytes(data)

    async def write_text(self, data: str) -> Path:
        return await self.write_bytes(data.encode())

    async def read_text(self) -> str:
        if not self.path.exists():
            return ""
        return self.path.read_text()

    async def read_bytes(self) -> bytes:
        if not self.path.exists():
            return b""
        return self.path.read_bytes()

    async def store_artifact(self) -> Path:
        if not self.path.exists():
            raise FileNotFoundError(self.path)
        return self.store.store_file(self.path)

    async def merge_write(self, new_data: bytes, base_digest: str | None = None) -> Path:
        """Write with 3-way merge if file changed since base.

        Args:
            new_data: New content to write
            base_digest: SHA256 of expected base (from CAS)

        Returns:
            Path to CAS object
        """
        if not self.path.exists() or base_digest is None:
            # No conflict possible
            return await self.write_bytes(new_data)

        # Check if file changed
        current_data = await self.read_bytes()
        if base_digest:
            base_path = self.store.resolve(base_digest)
            if base_path:
                base_data = base_path.read_bytes()
                if current_data != base_data:
                    # File changed, need merge
                    merge_result = await auto_merge(self.path, base_data, new_data, current_data)
                    if merge_result.warnings:
                        for warning in merge_result.warnings:
                            _logger.warning("merge_warning", path=str(self.path), warning=warning)
                    return await self.write_bytes(merge_result.content)

        # No merge needed
        return await self.write_bytes(new_data)


class XenoSyncManager:
    def __init__(self, settings: AppSettings) -> None:
        self._settings = settings
        self._store = ContentAddressedStore(settings.cache_path)
        self._claims: dict[Path, LockEntry] = {}
        self._event_subscribers: list[asyncio.Queue[XenoSyncEvent]] = []
        self._lock = asyncio.Lock()
        self._heartbeat_task: asyncio.Task[None] | None = None
        self._running = False
        self._lock_wait_times: list[float] = []  # Track lock wait metrics
        self._merge_conflict_count = 0

    async def start_heartbeat(self) -> None:
        """Start lease heartbeat renewal task."""
        if self._heartbeat_task is None:
            self._running = True
            self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

    async def stop_heartbeat(self) -> None:
        """Stop lease heartbeat renewal task."""
        self._running = False
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except asyncio.CancelledError:
                pass
            self._heartbeat_task = None

    async def _heartbeat_loop(self) -> None:
        """Periodically renew lease expiry for active claims."""
        while self._running:
            try:
                await asyncio.sleep(self._settings.xenosync_lease_seconds / 2)
                async with self._lock:
                    now = datetime.now(timezone.utc)
                    for entry in self._claims.values():
                        # Renew lease before it expires
                        entry.lease_expiry = now + timedelta(
                            seconds=self._settings.xenosync_lease_seconds
                        )
                        _logger.debug(
                            "lease_renewed",
                            path=str(entry.path),
                            owner=entry.owner,
                            expiry=entry.lease_expiry.isoformat(),
                        )
            except asyncio.CancelledError:
                break
            except Exception as exc:  # noqa: BLE001
                _logger.exception("heartbeat_error", error=str(exc))

    @asynccontextmanager
    async def claim(self, path: Path | str, owner: str, mode: str = "rw") -> AsyncIterator[FileClaim]:
        import time
        target = Path(path).resolve()
        target.parent.mkdir(parents=True, exist_ok=True)
        lock = portalocker.Lock(str(target), timeout=self._settings.xenosync_lock_timeout)

        # Track lock acquisition time
        start_time = time.perf_counter()
        try:
            await asyncio.to_thread(lock.acquire)
        except Exception as exc:
            # Catch any lock acquisition failure (LockException, TimeoutError, etc.)
            await self._emit_event("xenosync.lock_conflict", target, owner, {"mode": mode, "error": str(exc)})
            raise
        wait_time = time.perf_counter() - start_time
        self._lock_wait_times.append(wait_time)
        record_histogram("xenosync_lock_wait_seconds", wait_time)

        entry = LockEntry(
            path=target,
            owner=owner,
            mode=mode,
            lease_expiry=datetime.now(timezone.utc) + timedelta(seconds=self._settings.xenosync_lease_seconds),
            lock=lock,
        )
        async with self._lock:
            self._claims[target] = entry
            record_gauge("xenosync_locks_held", len(self._claims))
        await self._emit_event("xenosync.lock_acquired", target, owner, {"mode": mode})
        claim = FileClaim(path=target, owner=owner, mode=mode, store=self._store, lock=lock)
        try:
            yield claim
        finally:
            await asyncio.to_thread(lock.release)
            async with self._lock:
                self._claims.pop(target, None)
                record_gauge("xenosync_locks_held", len(self._claims))
            await self._emit_event("xenosync.lock_released", target, owner)

    async def subscribe(self) -> asyncio.Queue[XenoSyncEvent]:
        queue: asyncio.Queue[XenoSyncEvent] = asyncio.Queue()
        async with self._lock:
            self._event_subscribers.append(queue)
        return queue

    async def _emit_event(
        self, event_type: str, path: Path, owner: str, detail: dict[str, Any] | None = None
    ) -> None:
        event = XenoSyncEvent(event_type=event_type, path=path, owner=owner, detail=detail or {})
        async with self._lock:
            subscribers = list(self._event_subscribers)
        for queue in subscribers:
            queue.put_nowait(event)
        _logger.debug("xenosync_event", event_type=event_type, path=str(path), owner=owner, detail=detail or {})

    async def get_debug_state(self) -> dict[str, Any]:
        """Get current XenoSync state for debugging.

        Returns:
            Dict with active claims, leases, and metrics
        """
        async with self._lock:
            claims_data = [
                {
                    "path": str(entry.path),
                    "owner": entry.owner,
                    "mode": entry.mode,
                    "lease_expiry": entry.lease_expiry.isoformat(),
                }
                for entry in self._claims.values()
            ]
            return {
                "active_claims": claims_data,
                "metrics": {
                    "locks_held": len(self._claims),
                    "merge_conflicts_total": self._merge_conflict_count,
                    "lock_wait_samples": len(self._lock_wait_times),
                    "avg_lock_wait_seconds": sum(self._lock_wait_times) / len(self._lock_wait_times)
                    if self._lock_wait_times
                    else 0.0,
                },
            }
