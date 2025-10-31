"""Minimal aiosqlite facade backed by sqlite3 for test environments."""
from __future__ import annotations

import asyncio
import sqlite3
from types import TracebackType
from typing import Any, Iterable, Iterator, Optional, cast


async def _run(func: Any, *args: Any, **kwargs: Any) -> Any:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, lambda: func(*args, **kwargs))


Error = sqlite3.Error
DatabaseError = sqlite3.DatabaseError
IntegrityError = sqlite3.IntegrityError
OperationalError = sqlite3.OperationalError
ProgrammingError = sqlite3.ProgrammingError
NotSupportedError = sqlite3.NotSupportedError
InterfaceError = sqlite3.InterfaceError
InternalError = sqlite3.InternalError
sqlite_version = sqlite3.sqlite_version
sqlite_version_info = sqlite3.sqlite_version_info


class Cursor:
    def __init__(self, cursor: sqlite3.Cursor) -> None:
        self._cursor = cursor
        self.arraysize = self._cursor.arraysize
        self.lastrowid: int | None = None
        self.rowcount: int = -1

    @property
    def description(self) -> Any:
        return self._cursor.description

    async def execute(self, sql: str, parameters: Iterable[Any] | None = None) -> "Cursor":
        await _run(self._cursor.execute, sql, tuple(parameters or []))
        self.lastrowid = self._cursor.lastrowid
        self.rowcount = self._cursor.rowcount
        return self

    async def executemany(self, sql: str, seq_of_parameters: Iterable[Iterable[Any]]) -> "Cursor":
        await _run(self._cursor.executemany, sql, seq_of_parameters)
        self.lastrowid = self._cursor.lastrowid
        self.rowcount = self._cursor.rowcount
        return self

    async def fetchone(self) -> Optional[tuple[Any, ...]]:
        return cast(Optional[tuple[Any, ...]], await _run(self._cursor.fetchone))

    async def fetchall(self) -> list[tuple[Any, ...]]:
        return cast(list[tuple[Any, ...]], await _run(self._cursor.fetchall))

    async def fetchmany(self, size: int | None = None) -> list[tuple[Any, ...]]:
        size = size or self.arraysize
        return cast(list[tuple[Any, ...]], await _run(self._cursor.fetchmany, size))

    async def close(self) -> None:
        await _run(self._cursor.close)


class Connection:
    def __init__(self, database: str, **kwargs: Any) -> None:
        self._conn = sqlite3.connect(database, check_same_thread=False)
        self._conn.row_factory = kwargs.get("row_factory", sqlite3.Row)
        self.daemon = False

    async def cursor(self) -> Cursor:
        cursor = await _run(self._conn.cursor)
        return Cursor(cursor)

    async def execute(self, sql: str, parameters: Iterable[Any] | None = None) -> Cursor:
        cursor = await self.cursor()
        await cursor.execute(sql, parameters)
        return cursor

    async def executemany(self, sql: str, seq_of_parameters: Iterable[Iterable[Any]]) -> Cursor:
        cursor = await self.cursor()
        await cursor.executemany(sql, seq_of_parameters)
        return cursor

    async def commit(self) -> None:
        await _run(self._conn.commit)

    async def rollback(self) -> None:
        await _run(self._conn.rollback)

    async def create_function(
        self,
        name: str,
        num_params: int,
        func: Any,
        deterministic: bool = False,
    ) -> None:
        await _run(self._conn.create_function, name, num_params, func, deterministic=deterministic)

    async def close(self) -> None:
        await _run(self._conn.close)

    async def __aenter__(self) -> "Connection":
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        if exc:
            await self.rollback()
        else:
            await self.commit()
        await self.close()

    def __await__(self) -> Iterator[Any]:  # pragma: no cover - simple compatibility shim
        async def _self() -> "Connection":
            return self

        return _self().__await__()


def connect(database: str, **kwargs: Any) -> Connection:
    return Connection(database, **kwargs)


__all__ = ["connect", "Connection", "Cursor"]
