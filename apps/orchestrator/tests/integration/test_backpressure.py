"""Integration tests for WebSocket backpressure handling."""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from apps.orchestrator.settings import AppSettings
from apps.orchestrator.ws.hub import WS_SEND_QUEUE_SIZE, WebsocketHub
from apps.orchestrator.ws.schemas import HarvestEvent


@pytest.mark.asyncio
async def test_ws_backpressure_configuration():
    """Test that WebSocket backpressure is configured correctly."""
    settings = AppSettings()
    hub = WebsocketHub(settings=settings)

    # Create mock WebSocket
    mock_ws = AsyncMock()
    mock_ws.client_state = MagicMock()
    mock_ws.client = ("127.0.0.1", 12345)

    await hub.register_ws("test-session", mock_ws)

    # Verify connection has bounded queue
    async with hub._lock:
        connections = hub._sessions.get("test-session", [])
        assert len(connections) > 0
        conn = connections[0]
        # Verify queue has size limit
        assert conn.send_queue.maxsize == WS_SEND_QUEUE_SIZE
        # Initially no drops
        assert conn.dropped_count == 0


@pytest.mark.asyncio
async def test_ws_no_drops_on_fast_client():
    """Test that fast WebSocket clients don't trigger backpressure."""
    settings = AppSettings()
    hub = WebsocketHub(settings=settings)

    # Create mock WebSocket that accepts immediately
    mock_ws = AsyncMock()
    mock_ws.client_state = MagicMock()
    mock_ws.client = ("127.0.0.1", 12345)
    mock_ws.send_text = AsyncMock()  # Fast consumer

    await hub.register_ws("test-session", mock_ws)

    # Send reasonable number of messages
    for i in range(50):
        event = HarvestEvent.term_line("test-session", "pane-1", f"line {i}")
        await hub.broadcast(event, "test-session")

    # Give async tasks time to process
    await asyncio.sleep(0.5)

    # Check no drops occurred
    async with hub._lock:
        connections = hub._sessions.get("test-session", [])
        assert len(connections) > 0
        conn = connections[0]
        # Should not have dropped any messages
        assert conn.dropped_count == 0
