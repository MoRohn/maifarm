import asyncio

import pytest

from apps.orchestrator.runengine.queue import RunEngine
from apps.orchestrator.runengine.tasks import RunCancelled, RunRequest
from apps.orchestrator.settings import AppSettings


class FakeAgentManager:
    def __init__(self) -> None:
        self.registered: list[str] = []
        self.executed: list[str] = []
        self.cancelled: set[str] = set()

    async def register_run(self, request: RunRequest):
        self.registered.append(request.run_id)
        return None

    async def execute_run(self, request: RunRequest):
        if request.run_id in self.cancelled:
            raise RunCancelled(request.run_id)
        self.executed.append(request.run_id)

    async def cancel_run(self, run_id: str) -> bool:
        self.cancelled.add(run_id)
        return True

    async def is_cancelled(self, run_id: str) -> bool:
        return run_id in self.cancelled


@pytest.mark.asyncio
async def test_runengine_enqueue_and_cancel():
    manager = FakeAgentManager()
    settings = AppSettings(runengine_worker_count=1)
    engine = RunEngine(agent_manager=manager, settings=settings)

    await engine.start()
    request = RunRequest(
        run_id="run-1",
        session_id="session",
        agent_id="agent",
        prompt="hello",
    )
    await engine.enqueue(request)
    await asyncio.sleep(0.1)
    assert "run-1" in manager.executed

    request2 = RunRequest(
        run_id="run-2",
        session_id="session",
        agent_id="agent",
        prompt="world",
    )
    await engine.enqueue(request2)
    await engine.cancel("run-2")
    await asyncio.sleep(0.1)
    assert "run-2" not in manager.executed

    await engine.stop()
