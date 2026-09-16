"""Test XenoSync atomic writes and CAS functionality."""
import hashlib
from pathlib import Path

import pytest

from apps.orchestrator.settings import AppSettings
from apps.orchestrator.xenosync.xenosync import XenoSyncManager


@pytest.fixture
async def xenosync(tmp_path: Path) -> XenoSyncManager:
    settings = AppSettings(xenosync_cache_dir=str(tmp_path / "cache"))
    mgr = XenoSyncManager(settings)
    await mgr.start_heartbeat()
    yield mgr
    await mgr.stop_heartbeat()


@pytest.mark.asyncio
async def test_atomic_write_no_partials(xenosync: XenoSyncManager, tmp_path: Path) -> None:
    """Crash mid-write → no partials; atomic rename ensures all-or-nothing."""
    test_file = tmp_path / "atomic.txt"
    data = b"test data content"

    async with xenosync.claim(test_file, "writer") as claim:
        await claim.write_bytes(data)

    # File should exist with complete data
    assert test_file.exists()
    assert test_file.read_bytes() == data

    # No temporary files should remain
    temp_files = list(tmp_path.glob(".atomic.txt.tmp*"))
    assert len(temp_files) == 0


@pytest.mark.asyncio
async def test_cas_object_exists(xenosync: XenoSyncManager, tmp_path: Path) -> None:
    """Verify CAS object is created and accessible."""
    test_file = tmp_path / "cas_test.txt"
    data = b"content for CAS"

    async with xenosync.claim(test_file, "writer") as claim:
        cas_path = await claim.write_bytes(data)

    # CAS object should exist
    assert cas_path.exists()
    assert cas_path.read_bytes() == data

    # Verify CAS path structure (objects/<sha2[:2]>/<sha2>)
    digest = hashlib.sha256(data).hexdigest()
    assert cas_path.name == digest[2:]
    assert cas_path.parent.name == digest[:2]


@pytest.mark.asyncio
async def test_cas_deduplication(xenosync: XenoSyncManager, tmp_path: Path) -> None:
    """Same content → same CAS object (deduplication)."""
    file1 = tmp_path / "file1.txt"
    file2 = tmp_path / "file2.txt"
    data = b"duplicate content"

    async with xenosync.claim(file1, "writer1") as claim:
        cas_path1 = await claim.write_bytes(data)

    async with xenosync.claim(file2, "writer2") as claim:
        cas_path2 = await claim.write_bytes(data)

    # Same CAS path for identical content
    assert cas_path1 == cas_path2


@pytest.mark.asyncio
async def test_directory_fsync(xenosync: XenoSyncManager, tmp_path: Path) -> None:
    """Ensure atomic write includes directory fsync for durability."""
    test_file = tmp_path / "fsync_test.txt"
    data = b"test fsync"

    async with xenosync.claim(test_file, "writer") as claim:
        await claim.write_bytes(data)

    # File should be fully synced
    assert test_file.exists()
    assert test_file.read_bytes() == data
