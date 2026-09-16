from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from .models import Base


class DatabaseSessionManager:
    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine
        self._sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
        self._initialised = False
        self._lock = asyncio.Lock()

    async def init_models(self) -> None:
        if self._initialised:
            return
        async with self._lock:
            if self._initialised:
                return
            async with self._engine.begin() as connection:
                await connection.run_sync(Base.metadata.create_all)
            self._initialised = True

    @asynccontextmanager
    async def session(self) -> AsyncIterator[AsyncSession]:
        async with self._sessionmaker() as session:
            yield session

    async def dispose(self) -> None:
        await self._engine.dispose()


def create_session_factory(database_url: str) -> DatabaseSessionManager:
    connect_args = {}
    poolclass = None
    if database_url.startswith("sqlite"):
        connect_args["timeout"] = 30
        poolclass = NullPool
    try:
        engine = create_async_engine(database_url, echo=False, connect_args=connect_args, poolclass=poolclass)
    except ModuleNotFoundError as exc:  # pragma: no cover - defensive fallback
        if "asyncpg" not in str(exc):
            raise
        fallback_url = "sqlite+aiosqlite:///./maifarm-fallback.db"
        engine = create_async_engine(fallback_url, echo=False, connect_args={"timeout": 30}, poolclass=NullPool)
    return DatabaseSessionManager(engine)
