from pathlib import Path

import pytest

from apps.orchestrator.settings import AppSettings
from apps.orchestrator.xenosync.xenosync import XenoSyncManager


@pytest.mark.asyncio
async def test_xenosync_claim_and_store(tmp_path: Path) -> None:
    settings = AppSettings(xenosync_cache_dir=str(tmp_path / "cache"))
    manager = XenoSyncManager(settings=settings)
    target = tmp_path / "artifact.txt"

    async with manager.claim(target, owner="test-owner") as claim:
        await claim.write_text("hello world")
        cached_path = await claim.store_artifact()
        assert cached_path.exists()

    assert target.read_text() == "hello world"
