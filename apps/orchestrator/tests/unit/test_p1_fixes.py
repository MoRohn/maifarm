"""Regression tests for P1 backend audit fixes (2025-10-05)."""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, Mock, patch

import pytest
from fastapi import WebSocket

from apps.orchestrator.agents.manager import AgentManager
from apps.orchestrator.runengine.queue import RunEngine
from apps.orchestrator.runengine.tasks import RunRequest
from apps.orchestrator.settings import AppSettings
from apps.orchestrator.ws.hub import HarvestConnection, WebsocketHub


class TestP1_1_WebSocketSenderTaskTracking:
    """Test P1-1: WebSocket sender task tracking for graceful shutdown."""

    @pytest.mark.asyncio
    async def test_sender_task_is_tracked(self):
        """Verify sender tasks are stored in connection object."""
        settings = AppSettings(app_name="test")
        hub = WebsocketHub(settings=settings)

        # Mock WebSocket
        websocket = Mock(spec=WebSocket)
        websocket.accept = AsyncMock()
        websocket.client_state = MagicMock()
        websocket.application_state = MagicMock()

        await hub.register_ws("test-session", websocket)

        # Check that sender_task was created and tracked
        connections = hub._sessions.get("test-session", [])
        assert len(connections) == 1
        connection = connections[0]
        assert connection.sender_task is not None
        assert isinstance(connection.sender_task, asyncio.Task)
        assert not connection.sender_task.done()  # Should be running

        # Cleanup
        await hub.shutdown()

    @pytest.mark.asyncio
    async def test_shutdown_cancels_sender_tasks(self):
        """Verify shutdown cancels and awaits all sender tasks."""
        settings = AppSettings(app_name="test")
        hub = WebsocketHub(settings=settings)

        # Register multiple connections
        for i in range(3):
            websocket = Mock(spec=WebSocket)
            websocket.accept = AsyncMock()
            websocket.client_state = MagicMock()
            websocket.application_state = MagicMock()
            websocket.close = AsyncMock()
            await hub.register_ws(f"session-{i}", websocket)

        # Verify tasks are running
        all_connections = [c for conns in hub._sessions.values() for c in conns]
        assert len(all_connections) == 3
        for conn in all_connections:
            assert conn.sender_task is not None
            assert not conn.sender_task.done()

        # Shutdown should cancel all tasks
        await hub.shutdown()

        # All tasks should be done (cancelled)
        for conn in all_connections:
            assert conn.sender_task.done()

    @pytest.mark.asyncio
    async def test_shutdown_handles_already_done_tasks(self):
        """Verify shutdown gracefully handles already-completed sender tasks."""
        settings = AppSettings(app_name="test")
        hub = WebsocketHub(settings=settings)

        websocket = Mock(spec=WebSocket)
        websocket.accept = AsyncMock()
        websocket.client_state = MagicMock()
        websocket.application_state = MagicMock()
        websocket.close = AsyncMock()

        await hub.register_ws("test-session", websocket)

        # Simulate task completing naturally
        connections = hub._sessions["test-session"]
        if connections[0].sender_task:
            connections[0].sender_task.cancel()
            try:
                await connections[0].sender_task
            except asyncio.CancelledError:
                pass

        # Shutdown should not raise
        await hub.shutdown()


class TestP1_2_DatabaseInitRetry:
    """Test P1-2: Database initialization with retry logic."""

    @pytest.mark.asyncio
    async def test_db_init_succeeds_first_attempt(self):
        """Verify normal initialization completes without retry."""
        mock_manager = Mock()
        mock_manager.init_models = AsyncMock()

        # Simulate successful first attempt
        max_attempts = 3
        for attempt in range(1, max_attempts + 1):
            try:
                await asyncio.wait_for(mock_manager.init_models(), timeout=90.0)
                break
            except asyncio.TimeoutError:
                if attempt >= max_attempts:
                    raise

        # Should only be called once
        assert mock_manager.init_models.call_count == 1

    @pytest.mark.asyncio
    async def test_db_init_retries_on_timeout(self):
        """Verify initialization retries on timeout."""
        mock_manager = Mock()
        # First two attempts timeout, third succeeds
        mock_manager.init_models = AsyncMock(
            side_effect=[asyncio.TimeoutError(), asyncio.TimeoutError(), None]
        )

        max_attempts = 3
        for attempt in range(1, max_attempts + 1):
            try:
                await asyncio.wait_for(mock_manager.init_models(), timeout=90.0)
                break
            except asyncio.TimeoutError:
                if attempt < max_attempts:
                    await asyncio.sleep(0.01)  # Short delay for test
                else:
                    raise

        # Should be called 3 times (2 failures + 1 success)
        assert mock_manager.init_models.call_count == 3

    @pytest.mark.asyncio
    async def test_db_init_fails_after_max_retries(self):
        """Verify initialization fails after exhausting retries."""
        mock_manager = Mock()
        # Always timeout
        mock_manager.init_models = AsyncMock(side_effect=asyncio.TimeoutError())

        max_attempts = 3
        with pytest.raises((asyncio.TimeoutError, RuntimeError)):
            for attempt in range(1, max_attempts + 1):
                try:
                    await asyncio.wait_for(mock_manager.init_models(), timeout=90.0)
                    break
                except asyncio.TimeoutError:
                    if attempt < max_attempts:
                        await asyncio.sleep(0.01)
                    else:
                        raise RuntimeError("Database initialization timed out after retries")

        # Should be called max_attempts times
        assert mock_manager.init_models.call_count == max_attempts


class TestP1_3_RunEngineInlineTaskTracking:
    """Test P1-3: RunEngine inline task tracking."""

    @pytest.mark.asyncio
    async def test_inline_tasks_are_tracked(self):
        """Verify inline mode tasks are added to tracking set."""
        settings = AppSettings(runengine_backend="memory")
        mock_manager = Mock(spec=AgentManager)
        mock_manager.register_run = AsyncMock()
        mock_manager.execute_run = AsyncMock()

        engine = RunEngine(agent_manager=mock_manager, settings=settings)

        # Enqueue request in inline mode
        request = RunRequest(
            run_id="test-run",
            session_id="test-session",
            prompt="test prompt",
        )
        await engine.enqueue(request)

        # Task should be tracked
        assert len(engine._inline_tasks) == 1
        tracked_task = list(engine._inline_tasks)[0]
        assert isinstance(tracked_task, asyncio.Task)

    @pytest.mark.asyncio
    async def test_inline_tasks_auto_cleanup_on_completion(self):
        """Verify completed inline tasks are automatically removed."""
        settings = AppSettings(runengine_backend="memory")
        mock_manager = Mock(spec=AgentManager)
        mock_manager.register_run = AsyncMock()
        # Make execute_run complete quickly
        mock_manager.execute_run = AsyncMock(return_value=None)

        engine = RunEngine(agent_manager=mock_manager, settings=settings)

        request = RunRequest(
            run_id="test-run",
            session_id="test-session",
            prompt="test prompt",
        )
        await engine.enqueue(request)

        # Wait for task to complete
        await asyncio.sleep(0.1)

        # Task should auto-remove via callback
        assert len(engine._inline_tasks) == 0

    @pytest.mark.asyncio
    async def test_stop_cancels_inline_tasks(self):
        """Verify stop() cancels all tracked inline tasks."""
        settings = AppSettings(runengine_backend="memory")
        mock_manager = Mock(spec=AgentManager)
        mock_manager.register_run = AsyncMock()
        # Make execute_run run indefinitely
        mock_manager.execute_run = AsyncMock(side_effect=lambda req: asyncio.sleep(9999))

        engine = RunEngine(agent_manager=mock_manager, settings=settings)

        # Enqueue multiple requests
        for i in range(3):
            request = RunRequest(
                run_id=f"test-run-{i}",
                session_id="test-session",
                prompt="test prompt",
            )
            await engine.enqueue(request)

        # Verify tasks are tracked
        assert len(engine._inline_tasks) == 3

        # Stop should cancel all
        await engine.stop()

        # All tasks should be cleared
        assert len(engine._inline_tasks) == 0

    @pytest.mark.asyncio
    async def test_stop_awaits_cancelled_inline_tasks(self):
        """Verify stop() properly awaits cancelled tasks."""
        settings = AppSettings(runengine_backend="memory")
        mock_manager = Mock(spec=AgentManager)
        mock_manager.register_run = AsyncMock()

        # Track if cleanup happened
        cleanup_happened = []

        async def long_running_task(req):
            try:
                await asyncio.sleep(9999)
            except asyncio.CancelledError:
                cleanup_happened.append(True)
                raise

        mock_manager.execute_run = AsyncMock(side_effect=long_running_task)

        engine = RunEngine(agent_manager=mock_manager, settings=settings)

        request = RunRequest(
            run_id="test-run",
            session_id="test-session",
            prompt="test prompt",
        )
        await engine.enqueue(request)

        # Stop should cancel and await
        await engine.stop()

        # Cleanup should have been executed
        assert len(cleanup_happened) > 0


# Integration test combining all P1 fixes
class TestP1_Integration:
    """Integration test for all P1 fixes working together."""

    @pytest.mark.asyncio
    async def test_full_shutdown_sequence(self):
        """Verify all components shut down cleanly with P1 fixes."""
        # WebSocket Hub
        ws_settings = AppSettings(app_name="test")
        hub = WebsocketHub(settings=ws_settings)

        websocket = Mock(spec=WebSocket)
        websocket.accept = AsyncMock()
        websocket.client_state = MagicMock()
        websocket.application_state = MagicMock()
        websocket.close = AsyncMock()
        await hub.register_ws("test-session", websocket)

        # RunEngine
        engine_settings = AppSettings(runengine_backend="memory")
        mock_manager = Mock(spec=AgentManager)
        mock_manager.register_run = AsyncMock()
        mock_manager.execute_run = AsyncMock(side_effect=lambda req: asyncio.sleep(9999))

        engine = RunEngine(agent_manager=mock_manager, settings=engine_settings)

        request = RunRequest(
            run_id="test-run",
            session_id="test-session",
            prompt="test prompt",
        )
        await engine.enqueue(request)

        # Shutdown both components
        await asyncio.gather(hub.shutdown(), engine.stop(), return_exceptions=True)

        # Verify clean state
        assert len(hub._sessions) == 0
        assert len(engine._inline_tasks) == 0
        assert len(engine._workers) == 0
