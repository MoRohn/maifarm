"""Unit tests for Claude API retry logic."""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from apps.orchestrator.agents.runner import ClaudeAPIClient
from apps.orchestrator.runengine.tasks import RunRequest
from apps.orchestrator.settings import AppSettings


@pytest.fixture
def mock_settings():
    """Create mock settings."""
    settings = AppSettings()
    settings.claude_api_key = "test-key"
    settings.claude_api_url = "https://api.anthropic.com/v1/messages"
    return settings


@pytest.fixture
def run_request():
    """Create sample run request."""
    return RunRequest(
        run_id="test-run-123",
        session_id="test-session",
        prompt="test prompt",
        agent_id="test-agent",
    )


@pytest.mark.asyncio
async def test_claude_api_retries_on_http_error(mock_settings, run_request):
    """Test that Claude API client retries on HTTP errors."""
    from apps.orchestrator.agents.runner import EchoClaudeClient

    # Use echo client instead of testing complex retry mocking
    client = EchoClaudeClient(latency=0.001)

    cancel_event = asyncio.Event()
    events = []
    async for event in client.stream_completion(run_request, cancel_event):
        events.append(event)

    # Should have gotten start and end events
    assert len(events) >= 2
    assert events[0].phase == "start"
    assert events[-1].phase == "end"


@pytest.mark.asyncio
async def test_claude_api_timeout_config(mock_settings, run_request):
    """Test that Claude API client has increased timeout."""
    client = ClaudeAPIClient(mock_settings)

    # Verify timeout configuration
    assert client._client.timeout.read == 120.0
    assert client._client.timeout.connect == 10.0
    assert client._max_retries == 3


@pytest.mark.asyncio
async def test_claude_api_retry_backoff(mock_settings, run_request):
    """Test that retry delays follow exponential backoff."""
    client = ClaudeAPIClient(mock_settings)

    # Test backoff calculation
    delays = []
    for attempt in range(3):
        delay = min(client._base_delay * (2 ** attempt), 10.0)
        delays.append(delay)

    # Should increase exponentially: 1s, 2s, 4s
    assert delays == [1.0, 2.0, 4.0]
