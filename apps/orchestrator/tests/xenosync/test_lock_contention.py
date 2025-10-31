"""Test XenoSync lock contention and event emission."""
import asyncio
from pathlib import Path

import pytest

from apps.orchestrator.settings import AppSettings
from apps.orchestrator.xenosync.xenosync import XenoSyncManager


@pytest.fixture
async def xenosync(tmp_path: Path) -> XenoSyncManager:
    settings = AppSettings(xenosync_cache_dir=str(tmp_path / "cache"), xenosync_lock_timeout=2.0)
    mgr = XenoSyncManager(settings)
    await mgr.start_heartbeat()
    yield mgr
    await mgr.stop_heartbeat()


@pytest.mark.asyncio
async def test_lock_contention_wait_and_succeed(xenosync: XenoSyncManager, tmp_path: Path) -> None:
    """Two writers contend; second waits then succeeds; events emitted."""
    test_file = tmp_path / "contention.txt"
    events: list[str] = []

    # Subscribe to events
    event_queue = await xenosync.subscribe()

    async def collect_events() -> None:
        while True:
            try:
                event = await asyncio.wait_for(event_queue.get(), timeout=0.5)
                events.append(event.event_type)
            except asyncio.TimeoutError:
                break

    collector_task = asyncio.create_task(collect_events())

    # Writer 1 acquires lock
    async def writer1() -> None:
        async with xenosync.claim(test_file, "writer1") as claim:
            await claim.write_text("writer1 data")
            await asyncio.sleep(0.5)  # Hold lock

    # Writer 2 waits for lock
    async def writer2() -> None:
        await asyncio.sleep(0.1)  # Let writer1 acquire first
        async with xenosync.claim(test_file, "writer2") as claim:
            await claim.write_text("writer2 data")

    await asyncio.gather(writer1(), writer2())

    # Collect remaining events
    await asyncio.sleep(0.1)
    collector_task.cancel()
    try:
        await collector_task
    except asyncio.CancelledError:
        pass

    # Verify events
    assert "xenosync.lock_acquired" in events
    assert "xenosync.lock_released" in events
    assert events.count("xenosync.lock_acquired") == 2
    assert events.count("xenosync.lock_released") == 2

    # Verify file has writer2's data (last writer wins)
    assert test_file.read_text() == "writer2 data"


@pytest.mark.asyncio
async def test_lock_metrics(xenosync: XenoSyncManager, tmp_path: Path) -> None:
    """Verify lock metrics are tracked correctly."""
    test_file = tmp_path / "metrics.txt"

    async with xenosync.claim(test_file, "test_owner") as claim:
        await claim.write_text("test data")

    state = await xenosync.get_debug_state()
    assert state["metrics"]["lock_wait_samples"] == 1
    assert state["metrics"]["avg_lock_wait_seconds"] >= 0.0
    assert "active_claims" in state
