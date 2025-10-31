from __future__ import annotations

import asyncio
import time
from typing import Any

from ..agents.manager import AgentManager
from ..observability.debug import log_lifecycle_event
from ..observability.logging import get_logger
from ..observability.metrics import update_run_queue_depth
from ..settings import AppSettings
from .tasks import RunCancelled, RunRequest

_logger = get_logger("runengine")


class RunEngine:
    def __init__(self, agent_manager: AgentManager, settings: AppSettings) -> None:
        self._agent_manager = agent_manager
        self._settings = settings
        self._queue: asyncio.Queue[RunRequest] = asyncio.Queue()
        self._workers: list[asyncio.Task[None]] = []
        self._inline_tasks: set[asyncio.Task[Any]] = set()  # Accept tasks with any return type
        self._running = False

    @property
    def worker_count(self) -> int:
        return self._settings.runengine_worker_count

    def pending_count(self) -> int:
        return self._queue.qsize()

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        for idx in range(self.worker_count):
            task = asyncio.create_task(self._worker_loop(), name=f"runengine-worker-{idx}")
            self._workers.append(task)
        _logger.info("runengine_started", workers=self.worker_count)

    async def stop(self) -> None:
        if not self._running:
            return
        self._running = False
        # Cancel inline tasks first
        inline_tasks_snapshot = list(self._inline_tasks)
        for task in inline_tasks_snapshot:
            task.cancel()
        if inline_tasks_snapshot:
            await asyncio.gather(*inline_tasks_snapshot, return_exceptions=True)
        self._inline_tasks.clear()
        # Cancel worker tasks
        for task in self._workers:
            task.cancel()
        await asyncio.gather(*self._workers, return_exceptions=True)
        self._workers.clear()
        update_run_queue_depth(0)
        _logger.info("runengine_stopped", cancelled_inline=len(inline_tasks_snapshot))

    async def enqueue(self, request: RunRequest) -> str:
        log_lifecycle_event(_logger, "queue_push", "runengine", run_id=request.run_id)
        if self._settings.runengine_backend == "memory":
            await self._agent_manager.register_run(request)
            task = asyncio.create_task(self._agent_manager.execute_run(request))
            self._inline_tasks.add(task)
            task.add_done_callback(self._inline_tasks.discard)
            _logger.info("run_enqueued_inline", run_id=request.run_id)
            log_lifecycle_event(_logger, "queue_pop", "runengine", run_id=request.run_id, inline=True)
            return request.run_id
        if not self._running:
            await self.start()
        await self._agent_manager.register_run(request)
        await self._queue.put(request)
        update_run_queue_depth(self._queue.qsize())
        _logger.info("run_enqueued", run_id=request.run_id, qsize=self._queue.qsize())
        return request.run_id

    async def cancel(self, run_id: str) -> bool:
        removed = await self._remove_from_queue(run_id)
        cancelled = await self._agent_manager.cancel_run(run_id)
        if removed or cancelled:
            _logger.info("run_cancelled", run_id=run_id)
        return removed or cancelled

    async def _remove_from_queue(self, run_id: str) -> bool:
        removed = False
        items: list[RunRequest] = []
        try:
            while True:
                item = self._queue.get_nowait()
                if item.run_id == run_id:
                    removed = True
                    self._queue.task_done()
                    continue
                items.append(item)
        except asyncio.QueueEmpty:
            pass
        for item in items:
            await self._queue.put(item)
        if removed:
            update_run_queue_depth(self._queue.qsize())
        return removed

    async def _worker_loop(self) -> None:
        while self._running:
            try:
                request = await self._queue.get()
                log_lifecycle_event(_logger, "queue_pop", "runengine", run_id=request.run_id)
            except asyncio.CancelledError:
                break
            update_run_queue_depth(self._queue.qsize())
            start = time.perf_counter()
            try:
                if await self._agent_manager.is_cancelled(request.run_id):
                    _logger.info("skip_cancelled", run_id=request.run_id)
                    continue
                log_lifecycle_event(_logger, "run_start", "runengine", run_id=request.run_id)
                await self._agent_manager.execute_run(request)
                log_lifecycle_event(_logger, "run_end", "runengine", run_id=request.run_id)
            except RunCancelled:
                _logger.info("run_cancelled_worker", run_id=request.run_id)
                log_lifecycle_event(_logger, "run_cancelled", "runengine", run_id=request.run_id)
            except Exception as exc:  # noqa: BLE001
                _logger.exception("run_execution_failed", run_id=request.run_id, error=str(exc))
                log_lifecycle_event(_logger, "run_error", "runengine", run_id=request.run_id, error=str(exc))
            finally:
                self._queue.task_done()
                duration = time.perf_counter() - start
                _logger.debug("run_processed", run_id=request.run_id, duration=duration)
                update_run_queue_depth(self._queue.qsize())
