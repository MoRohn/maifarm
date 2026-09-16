from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any, cast

from fastapi import WebSocket
from starlette.websockets import WebSocketState

from ..observability.logging import get_logger
from ..observability.metrics import record_event_emission, update_sse_gauge, update_ws_gauge
from ..settings import AppSettings
from .schemas import AgentPhase, HarvestEvent

_logger = get_logger("ws.hub")

# Backpressure constants
WS_SEND_QUEUE_SIZE = 1000  # Increased for high-throughput streams
WS_SEND_TIMEOUT = 1.0
WS_PING_INTERVAL = 15  # Ping every 15 seconds
WS_PING_TIMEOUT = 20  # Disconnect if no pong in 20 seconds


@dataclass
class HarvestConnection:
    kind: str
    session_id: str
    websocket: WebSocket | None = None
    queue: asyncio.Queue[str] | None = None
    send_queue: asyncio.Queue[str] = field(default_factory=lambda: asyncio.Queue(maxsize=WS_SEND_QUEUE_SIZE))
    dropped_count: int = 0
    sender_task: asyncio.Task[None] | None = None

    async def send(self, message: str) -> None:
        if self.websocket:
            try:
                await asyncio.wait_for(
                    self.send_queue.put(message),
                    timeout=WS_SEND_TIMEOUT
                )
            except asyncio.TimeoutError:
                # Drop message under backpressure
                self.dropped_count += 1
                _logger.warning("ws_backpressure_drop", session_id=self.session_id, dropped=self.dropped_count)
        elif self.queue:
            try:
                self.queue.put_nowait(message)
            except asyncio.QueueFull:
                _ = self.queue.get_nowait()
                self.queue.put_nowait(message)


@dataclass
class HarvestSseSubscription:
    session_id: str
    queue: asyncio.Queue[str]
    _hub: WebsocketHub
    _connection: HarvestConnection

    async def close(self) -> None:
        await self._hub.unregister_sse(self)


class WebsocketHub:
    def __init__(self, settings: AppSettings) -> None:
        self._settings = settings
        self._sessions: dict[str, list[HarvestConnection]] = {}
        self._lock = asyncio.Lock()
        self._ws_count = 0
        self._sse_count = 0

    async def register_ws(self, session_id: str, websocket: WebSocket) -> None:
        max_connections = getattr(self._settings, "websocket_max_connections", 0)
        await websocket.accept()
        connection = HarvestConnection(kind="ws", session_id=session_id, websocket=websocket)
        connection.sender_task = asyncio.create_task(self._ws_sender_loop(connection))

        reject_connection = False
        async with self._lock:
            if max_connections and self._ws_count >= max_connections:
                reject_connection = True
            else:
                self._sessions.setdefault(session_id, []).append(connection)
                self._ws_count += 1
                update_ws_gauge(self._ws_count)

        if reject_connection:
            if connection.sender_task and not connection.sender_task.done():
                connection.sender_task.cancel()
                try:
                    await connection.sender_task
                except asyncio.CancelledError:
                    pass
            await websocket.close(code=1001, reason="Max websocket connections reached")
            _logger.warning(
                "ws_rejected_over_capacity",
                session_id=session_id,
                max_connections=max_connections,
            )
            return

        _logger.info("ws_registered", session_id=session_id, total_ws=self._ws_count)

    async def unregister_ws(self, session_id: str, websocket: WebSocket) -> None:
        connection: HarvestConnection | None = None
        removed = False
        async with self._lock:
            connections = self._sessions.get(session_id, [])
            remaining: list[HarvestConnection] = []
            for conn in connections:
                if conn.websocket is websocket:
                    connection = conn
                    removed = True
                else:
                    remaining.append(conn)
            if remaining:
                self._sessions[session_id] = remaining
            else:
                self._sessions.pop(session_id, None)
            if removed:
                self._ws_count = max(0, self._ws_count - 1)
                update_ws_gauge(self._ws_count)
            else:
                update_ws_gauge(self._ws_count)
        if connection and connection.sender_task and not connection.sender_task.done():
            connection.sender_task.cancel()
            try:
                await connection.sender_task
            except asyncio.CancelledError:
                pass
        if websocket.client_state != WebSocketState.DISCONNECTED:
            await websocket.close()
        _logger.info("ws_unregistered", session_id=session_id, total_ws=self._ws_count)

    async def register_sse(self, session_id: str) -> HarvestSseSubscription:
        queue: asyncio.Queue[str] = asyncio.Queue(maxsize=self._settings.sse_queue_size)
        connection = HarvestConnection(kind="sse", session_id=session_id, queue=queue)
        async with self._lock:
            self._sessions.setdefault(session_id, []).append(connection)
            self._sse_count += 1
            update_sse_gauge(self._sse_count)
        _logger.info("sse_registered", session_id=session_id, total_sse=self._sse_count)
        return HarvestSseSubscription(session_id=session_id, queue=queue, _hub=self, _connection=connection)

    async def unregister_sse(self, subscription: HarvestSseSubscription) -> None:
        async with self._lock:
            connections = self._sessions.get(subscription.session_id, [])
            self._sessions[subscription.session_id] = [c for c in connections if c is not subscription._connection]
            if not self._sessions[subscription.session_id]:
                self._sessions.pop(subscription.session_id, None)
            self._sse_count = max(0, self._sse_count - 1)
            update_sse_gauge(self._sse_count)
        _logger.info("sse_unregistered", session_id=subscription.session_id, total_sse=self._sse_count)

    async def broadcast(self, event: HarvestEvent, session_id: str | None = None) -> None:
        message = event.model_dump_json()
        record_event_emission(event.type)
        async with self._lock:
            if session_id:
                targets = list(self._sessions.get(session_id, []))
            else:
                targets = [conn for conn_list in self._sessions.values() for conn in conn_list]
        coroutines = [self._send_safe(connection, message) for connection in targets]
        if coroutines:
            await asyncio.gather(*coroutines, return_exceptions=True)

    async def emit_term_line(self, session_id: str, pane_id: str, line: str, agent_id: str | None = None) -> None:
        event = HarvestEvent.term_line(session_id=session_id, pane_id=pane_id, line=line, agent_id=agent_id)
        await self.broadcast(event, session_id=session_id)

    async def emit_agent_event(
        self,
        session_id: str,
        agent_id: str | None,
        phase: str,
        content_delta: str | None = None,
        tool_call: dict[str, Any] | None = None,
    ) -> None:
        event = HarvestEvent.agent_event(
            session_id=session_id,
            agent_id=agent_id,
            phase=cast(AgentPhase, phase),
            content_delta=content_delta,
            tool_call=tool_call,
        )
        await self.broadcast(event, session_id=session_id)

    async def emit_status(
        self,
        session_id: str,
        agent_id: str | None,
        status: str,
        detail: str | None = None,
    ) -> None:
        event = HarvestEvent.status(session_id=session_id, agent_id=agent_id, status=status, detail=detail)
        await self.broadcast(event, session_id=session_id)

    async def emit_metrics(self, session_id: str, counters: dict[str, float], gauges: dict[str, float]) -> None:
        event = HarvestEvent.metrics(session_id=session_id, counters=counters, gauges=gauges)
        await self.broadcast(event, session_id=session_id)

    async def shutdown(self) -> None:
        async with self._lock:
            sessions = list(self._sessions.items())
            self._sessions.clear()
            self._ws_count = 0
            self._sse_count = 0
            update_ws_gauge(0)
            update_sse_gauge(0)
        # Cancel and await all sender tasks
        all_tasks: list[asyncio.Task[None]] = []
        for session_id, connections in sessions:
            for connection in connections:
                # Cancel sender task if running
                if connection.sender_task and not connection.sender_task.done():
                    connection.sender_task.cancel()
                    all_tasks.append(connection.sender_task)
                # Close WebSocket connection
                if connection.websocket and connection.websocket.application_state != WebSocketState.DISCONNECTED:
                    await connection.websocket.close()
        # Await all cancelled tasks (graceful cleanup)
        if all_tasks:
            await asyncio.gather(*all_tasks, return_exceptions=True)
        _logger.info("hub_shutdown", cancelled_tasks=len(all_tasks))

    async def _send_safe(self, connection: HarvestConnection, message: str) -> None:
        try:
            await connection.send(message)
        except Exception as exc:  # noqa: BLE001
            _logger.warning("send_failed", session_id=connection.session_id, kind=connection.kind, error=str(exc))

    async def _ws_sender_loop(self, connection: HarvestConnection) -> None:
        """Dedicated sender loop to prevent blocking on slow clients."""
        if not connection.websocket:
            return
        try:
            while connection.websocket.client_state != WebSocketState.DISCONNECTED:
                message = await connection.send_queue.get()
                await connection.websocket.send_text(message)
        except Exception as exc:  # noqa: BLE001
            _logger.warning("ws_sender_error", session_id=connection.session_id, error=str(exc))
