"""Test agent streaming with ordered deltas and proper end event."""
from __future__ import annotations

import asyncio

import pytest

from apps.orchestrator.agents.runner import AgentRunner, AgentStreamEvent, EchoClaudeClient
from apps.orchestrator.runengine.tasks import RunRequest
from apps.orchestrator.settings import AppSettings


@pytest.mark.asyncio
async def test_stream_deltas_ordered():
    """Verify stream returns ordered delta events followed by end."""
    settings = AppSettings(
        app_name="test",
        environment="test",
        log_level="INFO",
        async_database_url="sqlite+aiosqlite:///:memory:",
        cache_path="/tmp/test-cache"
    )

    runner = AgentRunner(settings, client=EchoClaudeClient(latency=0.001))
    cancel = asyncio.Event()

    request = RunRequest(
        run_id="test-123",
        session_id="test-session",
        agent_id="agent-1",
        prompt="Hello world test message for streaming"
    )

    events: list[AgentStreamEvent] = []
    async for event in runner.stream(request, cancel):
        events.append(event)

    # Verify event order
    assert len(events) > 0
    assert events[0].phase == "start"
    assert events[-1].phase == "end"

    # Verify deltas in middle
    deltas = [e for e in events if e.phase == "delta"]
    assert len(deltas) > 0
    assert all(e.content_delta is not None for e in deltas)


@pytest.mark.asyncio
async def test_stream_cancel_mid_stream():
    """Verify cancellation emits error event and raises CancelledError."""
    settings = AppSettings(
        app_name="test",
        environment="test",
        log_level="INFO",
        async_database_url="sqlite+aiosqlite:///:memory:",
        cache_path="/tmp/test-cache"
    )

    runner = AgentRunner(settings, client=EchoClaudeClient(latency=0.05))
    cancel = asyncio.Event()

    request = RunRequest(
        run_id="test-cancel",
        session_id="test-session",
        agent_id="agent-1",
        prompt="Hello " * 100  # Long message to ensure we can cancel mid-stream
    )

    events: list[AgentStreamEvent] = []

    with pytest.raises(asyncio.CancelledError):
        async for event in runner.stream(request, cancel):
            events.append(event)
            if event.phase == "delta":
                # Cancel after first delta
                cancel.set()

    # Verify we got start and at least one delta before cancel
    assert len(events) >= 2
    assert events[0].phase == "start"
    assert any(e.phase == "delta" for e in events)


@pytest.mark.asyncio
async def test_stream_empty_prompt():
    """Verify stream handles empty prompt gracefully."""
    settings = AppSettings(
        app_name="test",
        environment="test",
        log_level="INFO",
        async_database_url="sqlite+aiosqlite:///:memory:",
        cache_path="/tmp/test-cache"
    )

    runner = AgentRunner(settings, client=EchoClaudeClient())
    cancel = asyncio.Event()

    request = RunRequest(
        run_id="test-empty",
        session_id="test-session",
        agent_id="agent-1",
        prompt=""
    )

    events: list[AgentStreamEvent] = []
    async for event in runner.stream(request, cancel):
        events.append(event)

    # Should still get start and end
    assert len(events) >= 2
    assert events[0].phase == "start"
    assert events[-1].phase == "end"
