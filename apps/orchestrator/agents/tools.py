from __future__ import annotations

import asyncio
import os
import subprocess
from collections.abc import Awaitable
from pathlib import Path
from typing import Any, Callable

from ..xenosync.xenosync import XenoSyncManager

ToolHandler = Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]

# Safe shell commands whitelist
SAFE_COMMANDS = {
    "ls", "pwd", "echo", "cat", "grep", "find", "wc", "head", "tail",
    "tree", "du", "df", "date", "whoami", "uname"
}


class ToolRegistry:
    def __init__(self, xenosync: XenoSyncManager | None = None, workspace_root: Path | None = None) -> None:
        self._registry: dict[str, ToolHandler] = {}
        self._lock = asyncio.Lock()
        self._xenosync = xenosync
        self._workspace_root = workspace_root.resolve() if workspace_root else Path.cwd()

    def _validate_path(self, path_str: str) -> Path:
        """Validate and resolve path within workspace.

        Args:
            path_str: Path string to validate

        Returns:
            Resolved absolute path within workspace

        Raises:
            ValueError: If path is outside workspace or symlink points outside
        """
        # Normalize and resolve path
        if os.path.isabs(path_str):
            path = Path(path_str).resolve()
        else:
            path = (self._workspace_root / path_str).resolve()

        # Check if resolved path is within workspace
        try:
            path.relative_to(self._workspace_root)
        except ValueError as exc:
            raise ValueError(f"Path {path} is outside workspace {self._workspace_root}") from exc

        # If it's a symlink, verify target is also within workspace
        if path.is_symlink():
            target = path.readlink()
            if target.is_absolute():
                target_resolved = target.resolve()
            else:
                target_resolved = (path.parent / target).resolve()
            try:
                target_resolved.relative_to(self._workspace_root)
            except ValueError as exc:
                raise ValueError(f"Symlink {path} points outside workspace") from exc

        return path

    async def _read_file(self, args: dict[str, Any]) -> dict[str, Any]:
        """Read file within workspace (read-only).

        Args:
            args: {"path": str}

        Returns:
            {"content": str, "path": str}
        """
        path = self._validate_path(args["path"])

        if not path.exists():
            raise FileNotFoundError(f"File not found: {path}")

        if not path.is_file():
            raise ValueError(f"Not a file: {path}")

        content = path.read_text(encoding="utf-8")
        return {"content": content, "path": str(path)}

    async def _write_file(self, args: dict[str, Any]) -> dict[str, Any]:
        """Write file using XenoSync atomic write.

        Args:
            args: {"path": str, "content": str}

        Returns:
            {"path": str, "bytes_written": int}
        """
        if not self._xenosync:
            raise RuntimeError("XenoSync not configured for write operations")

        path = self._validate_path(args["path"])
        content = args["content"]

        # Use XenoSync claim for atomic write
        async with self._xenosync.claim(path, "agent_write", mode="exclusive") as claim:
            await claim.write_text(content)

        return {"path": str(path), "bytes_written": len(content.encode("utf-8"))}

    async def _shell_exec(self, args: dict[str, Any]) -> dict[str, Any]:
        """Execute safe shell command and capture output.

        Args:
            args: {"cmd": str}

        Returns:
            {"stdout": str, "stderr": str, "returncode": int}
        """
        cmd = args["cmd"]

        # Parse command
        parts = cmd.split()
        if not parts:
            raise ValueError("Empty command")

        # Check if command is in safe list
        base_cmd = parts[0]
        if base_cmd not in SAFE_COMMANDS:
            raise ValueError(f"Command '{base_cmd}' not in safe list: {sorted(SAFE_COMMANDS)}")

        # Execute with timeout
        try:
            result = subprocess.run(
                parts,
                capture_output=True,
                text=True,
                timeout=30.0,
                cwd=self._workspace_root,
                check=False
            )
            return {
                "stdout": result.stdout,
                "stderr": result.stderr,
                "returncode": result.returncode
            }
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(f"Command timed out after 30s: {cmd}") from exc

    async def register(self, name: str, handler: ToolHandler) -> None:
        async with self._lock:
            self._registry[name] = handler

    async def invoke(self, name: str, payload: dict[str, Any]) -> dict[str, Any]:
        async with self._lock:
            if name not in self._registry:
                raise KeyError(f"Tool {name} not registered")
            handler = self._registry[name]
        return await handler(payload)

    async def list_tools(self) -> list[str]:
        async with self._lock:
            return list(self._registry.keys())

    async def register_defaults(self) -> None:
        """Register default file and shell tools."""
        await self.register("read_file", self._read_file)
        await self.register("write_file", self._write_file)
        await self.register("shell_exec", self._shell_exec)


# Global registry (can be configured with XenoSync at runtime)
tool_registry = ToolRegistry()
