from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any


@dataclass
class RunRequest:
    run_id: str
    session_id: str
    agent_id: str
    prompt: str
    system_prompt: str | None = None
    profile_id: str | None = None
    tools: Sequence[dict[str, Any]] = field(default_factory=list)
    files: Sequence[str] = field(default_factory=list)
    metadata: Mapping[str, Any] | None = None
    tmux_pane_id: str | None = None


@dataclass
class RunResult:
    run_id: str
    status: str
    output: str | None = None
    error: str | None = None
    tokens: int | None = None


class RunCancelled(Exception):
    """Raised when a run is cancelled before completion."""
