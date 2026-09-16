import asyncio

import pytest

from apps.orchestrator.settings import AppSettings
from apps.orchestrator.ws.hub import HarvestSseSubscription, WebsocketHub
from apps.orchestrator.ws.schemas import HarvestEvent


class DummyWebSocket:
    def __init__(self) -> None:
        self.accepted = False
        self.sent: list[str] = []
        self.closed = False
        self.client = ("127.0.0.1", 0)
        self.application_state = None
        self.client_state = None

    async def accept(self) -> None:
        self.accepted = True

    async def receive_text(self) -> str:
        await asyncio.sleep(0.01)
        return ""

    async def send_text(self, data: str) -> None:
        self.sent.append(data)

    async def close(self) -> None:
        self.closed = True


@pytest.mark.asyncio
async def test_hub_broadcasts_to_ws_and_sse() -> None:
    settings = AppSettings()
    hub = WebsocketHub(settings=settings)

    ws = DummyWebSocket()
    await hub.register_ws("session1", ws)

    subscription: HarvestSseSubscription = await hub.register_sse("session1")
    event = HarvestEvent.term_line(session_id="session1", pane_id="p1", line="hello")

    await hub.broadcast(event, session_id="session1")

    assert ws.sent, "WebSocket should receive payload"
    message = await subscription.queue.get()
    assert "hello" in message

    await hub.unregister_sse(subscription)
    await hub.unregister_ws("session1", ws)
    await hub.shutdown()
