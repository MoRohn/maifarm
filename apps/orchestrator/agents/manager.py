from __future__ import annotations

import asyncio
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import models as db_models
from ..observability.logging import get_logger
from ..observability.metrics import observe_run_duration, record_tokens
from ..observability.tracing import trace_span
from ..runengine.tasks import RunCancelled, RunRequest, RunResult
from ..settings import AppSettings
from ..tmux.bridge import TmuxBridge
from ..ws.hub import WebsocketHub
from ..xenosync.xenosync import XenoSyncManager
from .memory import AgentMemory
from .runner import AgentRunner, AgentStreamEvent
from .supervisor import AgentSupervisor

_logger = get_logger("agent.manager")


@dataclass
class RunHandle:
    request: RunRequest
    cancel_event: asyncio.Event
    started_at: datetime
    finished: asyncio.Event

    @classmethod
    def create(cls, request: RunRequest) -> RunHandle:
        return cls(
            request=request,
            cancel_event=asyncio.Event(),
            started_at=datetime.now(timezone.utc),
            finished=asyncio.Event(),
        )


class AgentManager:
    def __init__(
        self,
        settings: AppSettings,
        runner: AgentRunner,
        hub: WebsocketHub,
        memory: AgentMemory,
        session_factory: Callable[[], AbstractAsyncContextManager[AsyncSession]],
        xenosync: XenoSyncManager,
        tmux_bridge: TmuxBridge,
        supervisor: AgentSupervisor,
    ) -> None:
        self._settings = settings
        self._runner = runner
        self._hub = hub
        self._memory = memory
        self._session_factory = session_factory
        self._xenosync = xenosync
        self._tmux_bridge = tmux_bridge
        self._supervisor = supervisor
        self._handles: dict[str, RunHandle] = {}
        self._lock = asyncio.Lock()
        self._run_records: dict[str, dict[str, Any]] = {}

    async def register_run(self, request: RunRequest) -> RunHandle:
        handle = RunHandle.create(request)
        async with self._lock:
            self._handles[request.run_id] = handle
        await self._persist_run(request, status="queued")
        await self._hub.emit_status(request.session_id, request.agent_id, status="queued")

        # Register with supervisor for active tracking
        await self._supervisor.register_agent(
            run_id=request.run_id,
            agent_id=request.agent_id or "unknown",
            session_id=request.session_id,
            phase="queued",
            pane_id=request.tmux_pane_id,
            metadata=dict(request.metadata) if request.metadata else {},
        )

        return handle

    async def execute_run(self, request: RunRequest) -> RunResult:
        async with self._lock:
            handle = self._handles.get(request.run_id)
            if handle is None:
                handle = RunHandle.create(request)
                self._handles[request.run_id] = handle

        if handle.cancel_event.is_set():
            await self._persist_run(request, status="cancelled")
            await self._hub.emit_status(request.session_id, request.agent_id, status="cancelled")
            raise RunCancelled(request.run_id)

        await self._persist_run(request, status="running")
        await self._hub.emit_status(request.session_id, request.agent_id, status="running")
        await self._supervisor.update_phase(request.run_id, "running")

        start_time = datetime.now(timezone.utc)
        tokens_streamed = 0
        try:
            async with trace_span("agent_run", run_id=request.run_id, agent_id=request.agent_id):
                async for event in self._runner.stream(request, handle.cancel_event):
                    if handle.cancel_event.is_set():
                        raise RunCancelled(request.run_id)
                    await self._process_event(request, event)
                    if event.phase == "delta" and event.content_delta:
                        tokens = len(event.content_delta)
                        tokens_streamed += tokens
                        record_tokens(request.agent_id, tokens)
                        # Update supervisor on delta
                        await self._supervisor.record_delta(request.run_id)
        except RunCancelled:
            await self._persist_run(request, status="cancelled")
            await self._hub.emit_status(request.session_id, request.agent_id, status="cancelled")
            await self._supervisor.update_phase(request.run_id, "cancelled")
            raise
        except Exception as exc:  # noqa: BLE001
            await self._persist_run(request, status="failed", error=str(exc))
            await self._hub.emit_status(request.session_id, request.agent_id, status="failed", detail=str(exc))
            await self._supervisor.update_phase(request.run_id, "failed")
            _logger.exception("run_failed", run_id=request.run_id, error=str(exc))
            raise
        else:
            await self._persist_run(request, status="succeeded")
            await self._hub.emit_status(request.session_id, request.agent_id, status="succeeded")
            await self._supervisor.update_phase(request.run_id, "succeeded")
            duration = (datetime.now(timezone.utc) - start_time).total_seconds()
            observe_run_duration(duration)
        finally:
            handle.finished.set()
            async with self._lock:
                self._handles.pop(request.run_id, None)
            # Unregister from supervisor when done
            await self._supervisor.unregister_agent(request.run_id)
        return RunResult(run_id=request.run_id, status="succeeded", output=None, tokens=tokens_streamed)

    async def cancel_run(self, run_id: str) -> bool:
        async with self._lock:
            handle = self._handles.get(run_id)
            if not handle:
                return False
            handle.cancel_event.set()
            return True

    async def is_cancelled(self, run_id: str) -> bool:
        async with self._lock:
            handle = self._handles.get(run_id)
            return bool(handle and handle.cancel_event.is_set())

    async def get_run(self, run_id: str) -> db_models.AgentRunModel | None:
        try:
            async with self._session_factory() as session:
                result: db_models.AgentRunModel | None = await session.get(db_models.AgentRunModel, run_id)
        except SQLAlchemyError:
            result = None
        if result is not None:
            return result
        record = self._run_records.get(run_id)
        if record is None:
            return None
        return db_models.AgentRunModel(
            id=record["id"],
            agent_id=record["agent_id"],
            session_id=record["session_id"],
            status=record["status"],
            prompt=record["prompt"],
            system_prompt=record["system_prompt"],
            profile_id=record["profile_id"],
            error=record["error"],
        )

    async def list_session_runs(self, session_id: str) -> list[db_models.AgentRunModel]:
        runs: list[db_models.AgentRunModel] = []
        try:
            async with self._session_factory() as session:
                stmt = select(db_models.AgentRunModel).where(db_models.AgentRunModel.session_id == session_id)
                result = await session.execute(stmt)
                runs = list(result.scalars().all())
        except SQLAlchemyError:
            runs = []
        if runs:
            return runs
        fallback = [
            db_models.AgentRunModel(
                id=record["id"],
                agent_id=record["agent_id"],
                session_id=record["session_id"],
                status=record["status"],
                prompt=record["prompt"],
                system_prompt=record["system_prompt"],
                profile_id=record["profile_id"],
                error=record["error"],
            )
            for record in self._run_records.values()
            if record["session_id"] == session_id
        ]
        return sorted(
            fallback,
            key=lambda item: self._run_records[item.id]["created_at"],
            reverse=True,
        )

    async def _process_event(self, request: RunRequest, event: AgentStreamEvent) -> None:
        if event.phase == "start":
            await self._hub.emit_agent_event(request.session_id, request.agent_id, phase="start")
            await self._memory.append_event(request.run_id, "status", {"status": "start"})
            record = self._run_records.setdefault(request.run_id, {})
            record["status"] = "running"
        elif event.phase == "delta":
            await self._hub.emit_agent_event(
                request.session_id,
                request.agent_id,
                phase="delta",
                content_delta=event.content_delta or "",
                tool_call=event.tool_call,
            )
            if request.tmux_pane_id and event.content_delta:
                await self._tmux_bridge.relay_line(request.session_id, request.tmux_pane_id, event.content_delta)
        elif event.phase == "tool":
            await self._hub.emit_agent_event(
                request.session_id,
                request.agent_id,
                phase="tool",
                content_delta=event.content_delta,
                tool_call=event.tool_call,
            )
        elif event.phase == "end":
            await self._hub.emit_agent_event(request.session_id, request.agent_id, phase="end")
            await self._memory.append_event(request.run_id, "status", {"status": "end"})
            record = self._run_records.setdefault(request.run_id, {})
            record["status"] = "succeeded"
        elif event.phase == "error":
            await self._hub.emit_agent_event(
                request.session_id,
                request.agent_id,
                phase="error",
                content_delta=event.content_delta,
            )
            record = self._run_records.setdefault(request.run_id, {})
            record["status"] = "failed"

    async def _persist_run(self, request: RunRequest, status: str, error: str | None = None) -> None:
        async with self._session_factory() as session:
            try:
                run = await session.get(db_models.AgentRunModel, request.run_id)
                if run:
                    run.status = status
                    run.updated_at = datetime.now(timezone.utc)
                    run.error = error
                else:
                    run = db_models.AgentRunModel(
                        id=request.run_id,
                        agent_id=request.agent_id,
                        session_id=request.session_id,
                        status=status,
                        prompt=request.prompt,
                        system_prompt=request.system_prompt,
                        profile_id=request.profile_id,
                        error=error,
                    )
                    session.add(run)
                await session.commit()
            except SQLAlchemyError as exc:
                await session.rollback()
                message = str(exc)
                _logger.exception("persist_failed", run_id=request.run_id, error=message)
                if "no such table" not in message.lower():
                    raise
        self._run_records[request.run_id] = {
            "id": request.run_id,
            "agent_id": request.agent_id,
            "session_id": request.session_id,
            "status": status,
            "prompt": request.prompt,
            "system_prompt": request.system_prompt,
            "profile_id": request.profile_id,
            "error": error,
            "created_at": datetime.now(timezone.utc),
        }

    @property
    def active_runs(self) -> list[str]:
        return list(self._handles.keys())
