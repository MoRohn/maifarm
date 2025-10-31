"""Debug state endpoint for operational monitoring."""
from __future__ import annotations

import asyncio
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime
from typing import TYPE_CHECKING, Any

from fastapi import APIRouter, Depends

from ..deps import get_container
from ..observability.debug import is_debug_enabled

if TYPE_CHECKING:
    pass

router = APIRouter(prefix="/debug", tags=["debug"])

# Global event log for debugging
_event_log: deque[dict[str, Any]] = deque(maxlen=20)
_event_log_lock = asyncio.Lock()


async def log_debug_event(event_type: str, **kwargs: Any) -> None:
    """Log an event to the debug event log."""
    async with _event_log_lock:
        _event_log.append(
            {
                "timestamp": datetime.utcnow().isoformat(),
                "type": event_type,
                **kwargs,
            }
        )


@dataclass
class SystemState:
    """Snapshot of system state for debugging."""

    timestamp: str
    debug_enabled: bool
    ws_connections: int
    sse_connections: int
    queue_depth: int
    active_sessions: int
    active_panes: int
    tmux_sessions: list[str] = field(default_factory=list)
    recent_events: list[dict[str, Any]] = field(default_factory=list)
    uptime_seconds: float = 0.0
    worker_count: int = 0


_start_time = time.time()


@router.get("/state")
async def get_debug_state(container: Any = Depends(get_container)) -> dict[str, Any]:
    """
    Get lightweight system state snapshot.

    Returns:
        - queue_depth: Number of pending runs in queue
        - active_runs: Count of active run executions
        - ws_clients: Count of WebSocket connections
        - tmux_sessions: List of active tmux session IDs
        - last_20_events: Recent lifecycle events
    """
    # Gather state from various components
    async with _event_log_lock:
        recent_events = list(_event_log)

    # Get WS hub state
    ws_count = container.hub._ws_count
    sse_count = container.hub._sse_count
    async with container.hub._lock:
        active_sessions = len(container.hub._sessions)

    # Get run engine state
    queue_depth = container.run_engine.pending_count()
    worker_count = container.run_engine.worker_count

    # Get tmux bridge state
    async with container.tmux_bridge._lock:
        tmux_sessions = list(container.tmux_bridge._sessions.keys())
        total_panes = sum(len(session.panes) for session in container.tmux_bridge._sessions.values())

    state = SystemState(
        timestamp=datetime.utcnow().isoformat(),
        debug_enabled=is_debug_enabled(),
        ws_connections=ws_count,
        sse_connections=sse_count,
        queue_depth=queue_depth,
        active_sessions=active_sessions,
        active_panes=total_panes,
        tmux_sessions=tmux_sessions,
        recent_events=recent_events,
        uptime_seconds=time.time() - _start_time,
        worker_count=worker_count,
    )

    return {
        "timestamp": state.timestamp,
        "debug_enabled": state.debug_enabled,
        "uptime_seconds": state.uptime_seconds,
        "connections": {
            "websocket": state.ws_connections,
            "sse": state.sse_connections,
            "total_sessions": state.active_sessions,
        },
        "queue": {"depth": state.queue_depth, "workers": state.worker_count},
        "tmux": {"sessions": state.tmux_sessions, "total_panes": state.active_panes},
        "recent_events": state.recent_events,
    }
