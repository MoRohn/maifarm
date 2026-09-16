"""Agent Supervisor for tracking active agents and their state."""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from ..observability.logging import get_logger

_logger = get_logger("agent.supervisor")


@dataclass
class AgentStatus:
    """Active agent tracking info."""

    run_id: str
    agent_id: str
    session_id: str
    phase: str  # created | queued | running | succeeded | failed | cancelled
    last_delta_ts: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    pane_id: str | None = None
    tokens_in: int = 0
    tokens_out: int = 0
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: dict[str, Any] = field(default_factory=dict)


class AgentSupervisor:
    """Tracks active agents across the system."""

    def __init__(self) -> None:
        self._agents: dict[str, AgentStatus] = {}
        self._lock = asyncio.Lock()
        self._heartbeat_task: asyncio.Task[None] | None = None
        self._running = False

    async def start(self) -> None:
        """Start supervisor and heartbeat task."""
        self._running = True
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
        _logger.info("supervisor_started")

    async def stop(self) -> None:
        """Stop supervisor."""
        self._running = False
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except asyncio.CancelledError:
                pass
        _logger.info("supervisor_stopped")

    async def _heartbeat_loop(self) -> None:
        """Emit lightweight heartbeat for idle agents."""
        while self._running:
            try:
                await asyncio.sleep(10)  # Every 10s
                async with self._lock:
                    now = datetime.now(timezone.utc)
                    for status in self._agents.values():
                        idle_seconds = (now - status.last_delta_ts).total_seconds()
                        if status.phase == "running" and idle_seconds > 10:
                            # Emit heartbeat for agents that haven't sent data recently
                            _logger.debug(
                                "agent_heartbeat",
                                run_id=status.run_id,
                                agent_id=status.agent_id,
                                idle_seconds=idle_seconds,
                            )
            except asyncio.CancelledError:
                break
            except Exception as exc:  # noqa: BLE001
                _logger.exception("heartbeat_error", error=str(exc))

    async def register_agent(
        self,
        run_id: str,
        agent_id: str,
        session_id: str,
        phase: str = "created",
        pane_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Register a new agent.

        Args:
            run_id: Unique run identifier
            agent_id: Agent identifier
            session_id: Session identifier
            phase: Initial phase
            pane_id: Optional tmux pane ID
            metadata: Additional metadata
        """
        async with self._lock:
            self._agents[run_id] = AgentStatus(
                run_id=run_id,
                agent_id=agent_id,
                session_id=session_id,
                phase=phase,
                pane_id=pane_id,
                metadata=metadata or {},
            )
        _logger.info("agent_registered", run_id=run_id, agent_id=agent_id, session_id=session_id)

    async def update_phase(self, run_id: str, phase: str) -> None:
        """Update agent phase.

        Args:
            run_id: Run identifier
            phase: New phase
        """
        async with self._lock:
            if run_id in self._agents:
                self._agents[run_id].phase = phase
                self._agents[run_id].last_delta_ts = datetime.now(timezone.utc)
        _logger.debug("agent_phase_updated", run_id=run_id, phase=phase)

    async def update_tokens(self, run_id: str, tokens_in: int = 0, tokens_out: int = 0) -> None:
        """Update token counts.

        Args:
            run_id: Run identifier
            tokens_in: Input tokens
            tokens_out: Output tokens
        """
        async with self._lock:
            if run_id in self._agents:
                self._agents[run_id].tokens_in += tokens_in
                self._agents[run_id].tokens_out += tokens_out
                self._agents[run_id].last_delta_ts = datetime.now(timezone.utc)

    async def record_delta(self, run_id: str) -> None:
        """Record that agent emitted a delta (update last_delta_ts).

        Args:
            run_id: Run identifier
        """
        async with self._lock:
            if run_id in self._agents:
                self._agents[run_id].last_delta_ts = datetime.now(timezone.utc)

    async def unregister_agent(self, run_id: str) -> None:
        """Unregister agent (remove from active list).

        Args:
            run_id: Run identifier
        """
        async with self._lock:
            removed = self._agents.pop(run_id, None)
        if removed:
            _logger.info("agent_unregistered", run_id=run_id, agent_id=removed.agent_id)

    async def get_active_agents(self) -> list[dict[str, Any]]:
        """Get list of active agents.

        Returns:
            List of agent status dicts
        """
        async with self._lock:
            return [
                {
                    "run_id": status.run_id,
                    "agent_id": status.agent_id,
                    "session_id": status.session_id,
                    "phase": status.phase,
                    "pane_id": status.pane_id,
                    "tokens_in": status.tokens_in,
                    "tokens_out": status.tokens_out,
                    "started_at": status.started_at.isoformat(),
                    "last_delta_ts": status.last_delta_ts.isoformat(),
                    "idle_seconds": (datetime.now(timezone.utc) - status.last_delta_ts).total_seconds(),
                }
                for status in self._agents.values()
            ]

    async def get_agent_status(self, run_id: str) -> dict[str, Any] | None:
        """Get status for specific agent.

        Args:
            run_id: Run identifier

        Returns:
            Agent status dict or None if not found
        """
        async with self._lock:
            status = self._agents.get(run_id)
            if not status:
                return None
            return {
                "run_id": status.run_id,
                "agent_id": status.agent_id,
                "session_id": status.session_id,
                "phase": status.phase,
                "pane_id": status.pane_id,
                "tokens_in": status.tokens_in,
                "tokens_out": status.tokens_out,
                "started_at": status.started_at.isoformat(),
                "last_delta_ts": status.last_delta_ts.isoformat(),
                "idle_seconds": (datetime.now(timezone.utc) - status.last_delta_ts).total_seconds(),
                "metadata": status.metadata,
            }
