"""Test agent tools use XenoSync atomic writes for file safety."""
from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory

import pytest

from apps.orchestrator.agents.tools import ToolRegistry
from apps.orchestrator.settings import AppSettings
from apps.orchestrator.xenosync.xenosync import XenoSyncManager


@pytest.mark.asyncio
async def test_write_file_uses_xenosync():
    """Verify write_file uses XenoSync atomic write."""
    settings = AppSettings(
        app_name="test",
        environment="test",
        log_level="INFO",
        async_database_url="sqlite+aiosqlite:///:memory:",
        cache_path="/tmp/test-cache",
        xenosync_lease_seconds=30
    )

    with TemporaryDirectory() as tmpdir:
        workspace = Path(tmpdir)
        xenosync = XenoSyncManager(settings=settings)
        await xenosync.start_heartbeat()

        try:
            registry = ToolRegistry(xenosync=xenosync, workspace_root=workspace)
            await registry.register_defaults()

            # Write a file
            result = await registry.invoke("write_file", {
                "path": str(workspace / "test.txt"),
                "content": "Hello XenoSync!"
            })

            # Resolve paths for comparison (macOS /var -> /private/var)
            expected_path = (workspace / "test.txt").resolve()
            actual_path = Path(result["path"]).resolve()
            assert actual_path == expected_path
            assert result["bytes_written"] == len("Hello XenoSync!".encode())

            # Verify file exists and content is correct
            assert expected_path.exists()
            assert expected_path.read_text() == "Hello XenoSync!"
        finally:
            await xenosync.stop_heartbeat()


@pytest.mark.asyncio
async def test_read_file_within_workspace():
    """Verify read_file only reads from workspace."""
    with TemporaryDirectory() as tmpdir:
        workspace = Path(tmpdir)
        test_file = workspace / "readable.txt"
        test_file.write_text("Safe content")

        registry = ToolRegistry(workspace_root=workspace)
        await registry.register_defaults()

        # Should succeed - file is in workspace
        result = await registry.invoke("read_file", {"path": "readable.txt"})
        assert result["content"] == "Safe content"

        # Should fail - file outside workspace
        with pytest.raises(ValueError, match="outside workspace"):
            await registry.invoke("read_file", {"path": "/etc/passwd"})


@pytest.mark.asyncio
async def test_symlink_validation():
    """Verify symlinks pointing outside workspace are rejected."""
    with TemporaryDirectory() as tmpdir:
        workspace = Path(tmpdir)
        outside = Path(tmpdir).parent / "outside.txt"
        outside.write_text("Outside content")

        symlink = workspace / "link.txt"
        symlink.symlink_to(outside)

        registry = ToolRegistry(workspace_root=workspace)
        await registry.register_defaults()

        # Should fail - symlink points outside workspace
        with pytest.raises(ValueError, match="outside workspace"):
            await registry.invoke("read_file", {"path": "link.txt"})


@pytest.mark.asyncio
async def test_path_traversal_blocked():
    """Verify path traversal attempts are blocked."""
    with TemporaryDirectory() as tmpdir:
        workspace = Path(tmpdir) / "workspace"
        workspace.mkdir()

        registry = ToolRegistry(workspace_root=workspace)
        await registry.register_defaults()

        # Try various path traversal attacks
        attacks = [
            "../etc/passwd",
            "../../etc/passwd",
            "./../../etc/passwd",
            "foo/../../etc/passwd",
        ]

        for attack in attacks:
            with pytest.raises(ValueError, match="outside workspace"):
                await registry.invoke("read_file", {"path": attack})
