from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal, Union

from pydantic import BaseModel, Field

EventType = Literal["term_line", "agent_event", "status", "metrics"]
AgentPhase = Literal["start", "delta", "end", "error", "tool"]


class TermLinePayload(BaseModel):
    pane_id: str
    line: str


class AgentEventPayload(BaseModel):
    phase: AgentPhase
    content_delta: str | None = None
    tool_call: dict[str, Any] | None = None


class StatusPayload(BaseModel):
    status: str
    detail: str | None = None


class MetricsPayload(BaseModel):
    counters: dict[str, float] = Field(default_factory=dict)
    gauges: dict[str, float] = Field(default_factory=dict)
    tokens_per_second: float | None = None
    queue_depth: int | None = None


PayloadType = Union[TermLinePayload, AgentEventPayload, StatusPayload, MetricsPayload]


class HarvestEvent(BaseModel):
    v: Literal[1] = 1
    type: EventType
    agent_id: str | None
    session_id: str
    ts: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    payload: PayloadType

    @classmethod
    def term_line(cls, session_id: str, pane_id: str, line: str, agent_id: str | None = None) -> HarvestEvent:
        return cls(
            type="term_line",
            session_id=session_id,
            agent_id=agent_id,
            payload=TermLinePayload(pane_id=pane_id, line=line),
        )

    @classmethod
    def agent_event(
        cls,
        session_id: str,
        agent_id: str | None,
        phase: AgentPhase,
        content_delta: str | None,
        tool_call: dict[str, Any] | None = None,
    ) -> HarvestEvent:
        return cls(
            type="agent_event",
            session_id=session_id,
            agent_id=agent_id,
            payload=AgentEventPayload(phase=phase, content_delta=content_delta, tool_call=tool_call),
        )

    @classmethod
    def status(
        cls,
        session_id: str,
        agent_id: str | None,
        status: str,
        detail: str | None = None,
    ) -> HarvestEvent:
        return cls(
            type="status",
            session_id=session_id,
            agent_id=agent_id,
            payload=StatusPayload(status=status, detail=detail),
        )

    @classmethod
    def metrics(
        cls,
        session_id: str,
        counters: dict[str, float],
        gauges: dict[str, float],
        tokens_per_second: float | None = None,
        queue_depth: int | None = None,
        agent_id: str | None = None,
    ) -> HarvestEvent:
        return cls(
            type="metrics",
            session_id=session_id,
            agent_id=agent_id,
            payload=MetricsPayload(
                counters=counters,
                gauges=gauges,
                tokens_per_second=tokens_per_second,
                queue_depth=queue_depth,
            ),
        )
