"""Test agent cancellation and retry behavior."""
from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator
from typing import Any

import httpx
import pytest

from apps.orchestrator.agents.runner import AgentRunner, AgentStreamEvent, ClaudeClientProtocol
from apps.orchestrator.runengine.tasks import RunRequest
from apps.orchestrator.settings import AppSettings


class FailingClaudeClient(ClaudeClientProtocol):
    """Mock client that fails with specific errors."""

    def __init__(self, fail_count: int = 2, error_type: str = "429") -> None:
        self.fail_count = fail_count
        self.error_type = error_type
        self.attempt = 0

    async def stream_completion(
        self,
        request: RunRequest,
        cancel_event: asyncio.Event,
    ) -> AsyncGenerator[AgentStreamEvent, None]:
        self.attempt += 1
        if self.attempt <= self.fail_count:
            # Simulate error
            if self.error_type == "429":
                response = httpx.Response(status_code=429, request=httpx.Request("POST", "http://test"))
                raise httpx.HTTPStatusError("Rate limited", request=response.request, response=response)
            elif self.error_type == "timeout":
                raise httpx.ReadTimeout("Request timed out")
        # Success on final attempt
        yield AgentStreamEvent(phase="start")
        yield AgentStreamEvent(phase="delta", content_delta="Success after retry")
        yield AgentStreamEvent(phase="end")


@pytest.mark.asyncio
async def test_retry_on_429():
    """Verify 429 errors trigger fallback to echo client."""
    settings = AppSettings(
        app_name="test",
        environment="test",
        log_level="INFO",
        async_database_url="sqlite+aiosqlite:///:memory:",
        cache_path="/tmp/test-cache"
    )

    # Fail with 429 - should fallback to echo
    client = FailingClaudeClient(fail_count=10, error_type="429")
    runner = AgentRunner(settings, client=client)
    cancel = asyncio.Event()

    request = RunRequest(
        run_id="test-retry",
        session_id="test-session",
        agent_id="agent-1",
        prompt="Test retry"
    )

    events: list[AgentStreamEvent] = []
    async for event in runner.stream(request, cancel):
        events.append(event)

    # Should fallback and succeed with echo client
    assert len(events) > 0
    assert events[-1].phase == "end"
    # Should have tried once then fallen back
    assert client.attempt == 1


@pytest.mark.asyncio
async def test_retry_on_timeout():
    """Verify timeout errors trigger fallback."""
    settings = AppSettings(
        app_name="test",
        environment="test",
        log_level="INFO",
        async_database_url="sqlite+aiosqlite:///:memory:",
        cache_path="/tmp/test-cache"
    )

    # Timeout - should fallback to echo
    client = FailingClaudeClient(fail_count=10, error_type="timeout")
    runner = AgentRunner(settings, client=client)
    cancel = asyncio.Event()

    request = RunRequest(
        run_id="test-timeout",
        session_id="test-session",
        agent_id="agent-1",
        prompt="Test timeout"
    )

    events: list[AgentStreamEvent] = []
    async for event in runner.stream(request, cancel):
        events.append(event)

    # Should fallback and succeed
    assert len(events) > 0
    assert events[-1].phase == "end"
    assert client.attempt == 1


@pytest.mark.asyncio
async def test_cancel_with_echo_client():
    """Verify cancellation works with echo client."""
    settings = AppSettings(
        app_name="test",
        environment="test",
        log_level="INFO",
        async_database_url="sqlite+aiosqlite:///:memory:",
        cache_path="/tmp/test-cache"
    )

    # Use echo client directly to test cancellation
    from apps.orchestrator.agents.runner import EchoClaudeClient
    client = EchoClaudeClient(latency=0.05)
    runner = AgentRunner(settings, client=client)
    cancel = asyncio.Event()

    request = RunRequest(
        run_id="test-cancel",
        session_id="test-session",
        agent_id="agent-1",
        prompt="Hello " * 50  # Long message
    )

    # Cancel after first delta
    events: list[AgentStreamEvent] = []

    with pytest.raises(asyncio.CancelledError):
        async for event in runner.stream(request, cancel):
            events.append(event)
            if event.phase == "delta":
                cancel.set()

    # Should have some events before cancel
    assert len(events) >= 2


@pytest.mark.asyncio
async def test_fallback_on_error():
    """Verify fallback to echo client on persistent errors."""
    settings = AppSettings(
        app_name="test",
        environment="test",
        log_level="INFO",
        async_database_url="sqlite+aiosqlite:///:memory:",
        cache_path="/tmp/test-cache"
    )

    # Always fail - should fallback to echo
    client = FailingClaudeClient(fail_count=10, error_type="429")
    runner = AgentRunner(settings, client=client)
    cancel = asyncio.Event()

    request = RunRequest(
        run_id="test-exhaust",
        session_id="test-session",
        agent_id="agent-1",
        prompt="Test fallback behavior"
    )

    # Should fallback to echo client
    events: list[AgentStreamEvent] = []
    async for event in runner.stream(request, cancel):
        events.append(event)

    # Should succeed with echo fallback
    assert len(events) > 0
    assert events[-1].phase == "end"
    assert client.attempt == 1  # Tried once, then fell back
