from __future__ import annotations

import asyncio
import os
import shutil
import uuid
from dataclasses import dataclass, field

from ..observability.debug import log_lifecycle_event
from ..observability.logging import get_logger
from ..settings import AppSettings
from ..ws.hub import WebsocketHub

_logger = get_logger("tmux.bridge")


@dataclass
class TmuxPane:
    pane_id: str
    session_id: str
    title: str
    command: str | None = None
    task: asyncio.Task[None] | None = None


@dataclass
class TmuxSession:
    session_id: str
    name: str
    panes: dict[str, TmuxPane] = field(default_factory=dict)


class TmuxBridge:
    def __init__(self, settings: AppSettings, hub: WebsocketHub) -> None:
        self._settings = settings
        self._hub = hub
        self._sessions: dict[str, TmuxSession] = {}
        self._tasks: set[asyncio.Task[None]] = set()
        self._lock = asyncio.Lock()
        self._use_pty_fallback = False

    def _track_task(self, task: asyncio.Task[None]) -> None:
        """Keep tabs on background tasks and drop them on completion."""
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def start(self) -> None:
        # Check if tmux is available
        tmux_path = shutil.which(self._settings.tmux_bin) or shutil.which("tmux")
        if not tmux_path:
            _logger.warning("tmux_not_found_using_pty_fallback", tmux_bin=self._settings.tmux_bin)
            log_lifecycle_event(_logger, "tmux_fallback", "tmux_bridge", fallback="PTY")
            self._use_pty_fallback = True
        else:
            log_lifecycle_event(_logger, "tmux_available", "tmux_bridge", tmux_bin=tmux_path)
            _logger.info("tmux_bridge_started", tmux_bin=tmux_path)

        await self._hub.emit_status("system", None, "tmux_ready" if not self._use_pty_fallback else "pty_fallback", f"Using {'tmux' if not self._use_pty_fallback else 'PTY fallback'}")

    async def stop(self) -> None:
        async with self._lock:
            sessions = list(self._sessions.values())
            self._sessions.clear()
        for session in sessions:
            for pane in session.panes.values():
                if pane.task:
                    pane.task.cancel()
        await asyncio.gather(*list(self._tasks), return_exceptions=True)
        self._tasks.clear()
        _logger.info("tmux_bridge_stopped")

    async def create_session(self, name: str | None = None) -> tuple[str, str]:
        session_id = uuid.uuid4().hex
        session_name = name or f"session-{session_id[:6]}"
        async with self._lock:
            self._sessions[session_id] = TmuxSession(session_id=session_id, name=session_name)
        _logger.info("tmux_session_created", session_id=session_id, name=session_name)
        return session_id, session_name

    async def create_pane(self, session_id: str, command: str | None, title: str | None) -> TmuxPane | None:
        async with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return None
            pane_id = uuid.uuid4().hex
            pane_title = title or f"pane-{pane_id[:6]}"
            pane = TmuxPane(pane_id=pane_id, session_id=session_id, title=pane_title, command=command)
            session.panes[pane_id] = pane
        if command:
            pane.task = asyncio.create_task(self._run_command(session_id, pane_id, command))
            self._track_task(pane.task)
        _logger.info("tmux_pane_created", session_id=session_id, pane_id=pane_id, command=command)
        return pane

    async def execute_command(
        self,
        pane_id: str,
        command: str,
        *,
        cwd: str | None = None,
        environment: dict[str, str] | None = None,
    ) -> bool:
        async with self._lock:
            pane = self._find_pane(pane_id)
            if pane is None:
                return False
            session_id = pane.session_id
        pane.task = asyncio.create_task(
            self._run_command(session_id, pane_id, command, cwd=cwd, environment=environment)
        )
        self._track_task(pane.task)
        _logger.info("tmux_command_started", pane_id=pane_id, command=command)
        return True

    async def relay_line(self, session_id: str, pane_id: str, line: str) -> None:
        await self._hub.emit_term_line(session_id=session_id, pane_id=pane_id, line=line)

    async def delete_session(self, session_id: str) -> bool:
        async with self._lock:
            session = self._sessions.pop(session_id, None)
        if not session:
            return False
        for pane in session.panes.values():
            if pane.task:
                pane.task.cancel()
        _logger.info("tmux_session_deleted", session_id=session_id)
        return True

    def _find_pane(self, pane_id: str) -> TmuxPane | None:
        for session in self._sessions.values():
            pane = session.panes.get(pane_id)
            if pane:
                return pane
        return None

    async def _run_command(
        self,
        session_id: str,
        pane_id: str,
        command: str,
        *,
        cwd: str | None = None,
        environment: dict[str, str] | None = None,
    ) -> None:
        proc = await asyncio.create_subprocess_shell(
            command,
            cwd=cwd,
            env={**os.environ, **(environment or {})},
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        assert proc.stdout is not None
        try:
            while True:
                line = await proc.stdout.readline()
                if not line:
                    break
                await self.relay_line(session_id, pane_id, line.decode(errors="ignore").rstrip("\n"))
        except asyncio.CancelledError:
            proc.terminate()
            try:
                await asyncio.wait_for(proc.wait(), timeout=5)
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()
            await self.relay_line(session_id, pane_id, "[process terminated]")
            raise
        finally:
            if proc.returncode is None:
                await proc.wait()
            await self.relay_line(session_id, pane_id, f"[process exited with code {proc.returncode}]")
