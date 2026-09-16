from __future__ import annotations

from collections import deque
from contextlib import AbstractAsyncContextManager
from typing import Any, Callable

from sqlalchemy import insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import models as db_models


class AgentMemory:
    def __init__(self, session_factory: Callable[[], AbstractAsyncContextManager[AsyncSession]]) -> None:
        self._session_factory = session_factory
        self._fallback_event_cap = 200
        self._events: dict[str, deque[dict[str, Any]]] = {}

    async def append_event(self, run_id: str, event_type: str, payload: dict[str, Any]) -> None:
        async with self._session_factory() as session:
            stmt = insert(db_models.StreamEventModel).values(
                run_id=run_id,
                event_type=event_type,
                payload=payload,
            )
            try:
                await session.execute(stmt)
                await session.commit()
            except Exception:  # noqa: BLE001
                buffer = self._events.setdefault(run_id, deque(maxlen=self._fallback_event_cap))
                buffer.append({"event_type": event_type, "payload": payload})

    async def list_events(self, run_id: str) -> list[dict[str, Any]]:
        async with self._session_factory() as session:
            stmt = (
                select(db_models.StreamEventModel)
                .where(db_models.StreamEventModel.run_id == run_id)
                .order_by(db_models.StreamEventModel.id)
            )
            try:
                result = await session.execute(stmt)
            except Exception:  # noqa: BLE001
                return [event["payload"] for event in self._events.get(run_id, deque())]
            records = result.scalars().all()
            if records:
                return [record.payload for record in records]
            return [event["payload"] for event in self._events.get(run_id, deque())]

    async def store_conversation(self, run_id: str, role: str, content: str) -> None:
        """Store conversation message for short-term memory.

        Args:
            run_id: Agent run ID
            role: Message role ("user", "assistant", "system")
            content: Message content
        """
        await self.append_event(
            run_id=run_id,
            event_type="conversation",
            payload={"role": role, "content": content}
        )

    async def store_artifact(self, run_id: str, artifact_type: str, artifact_ref: str, metadata: dict[str, Any] | None = None) -> None:
        """Store artifact reference for this run.

        Args:
            run_id: Agent run ID
            artifact_type: Type of artifact ("file", "code", "output")
            artifact_ref: Reference to artifact (path, digest, etc.)
            metadata: Additional metadata about artifact
        """
        await self.append_event(
            run_id=run_id,
            event_type="artifact",
            payload={
                "type": artifact_type,
                "ref": artifact_ref,
                "metadata": metadata or {}
            }
        )

    async def get_conversation(self, run_id: str) -> list[dict[str, str]]:
        """Get conversation history for a run.

        Args:
            run_id: Agent run ID

        Returns:
            List of conversation messages with role and content
        """
        events = await self.list_events(run_id)
        return [
            {"role": event["role"], "content": event["content"]}
            for event in events
            if event.get("role") and event.get("content")
        ]

    async def get_artifacts(self, run_id: str) -> list[dict[str, Any]]:
        """Get artifacts created during a run.

        Args:
            run_id: Agent run ID

        Returns:
            List of artifact references with metadata
        """
        events = await self.list_events(run_id)
        return [
            event
            for event in events
            if event.get("type") in ("file", "code", "output")
        ]
