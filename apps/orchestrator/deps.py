from __future__ import annotations

from collections.abc import AsyncIterator
from typing import TYPE_CHECKING, cast

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

if TYPE_CHECKING:
    from .agents.manager import AgentManager
    from .agents.supervisor import AgentSupervisor
    from .main import AppContainer
    from .runengine.queue import RunEngine
    from .tmux.bridge import TmuxBridge
    from .xenosync.xenosync import XenoSyncManager


def get_container(request: Request) -> AppContainer:
    container = getattr(request.app.state, "container", None)
    if container is None:
        raise RuntimeError("Application container not initialised")
    return cast("AppContainer", container)


async def get_db_session(container: AppContainer = Depends(get_container)) -> AsyncIterator[AsyncSession]:
    async with container.db_manager.session() as session:
        yield session


def get_agent_manager(container: AppContainer = Depends(get_container)) -> AgentManager:
    return container.agent_manager


def get_run_engine(container: AppContainer = Depends(get_container)) -> RunEngine:
    return container.run_engine


def get_tmux_bridge(container: AppContainer = Depends(get_container)) -> TmuxBridge:
    return container.tmux_bridge


def get_xenosync(container: AppContainer = Depends(get_container)) -> XenoSyncManager:
    return container.xenosync


def get_supervisor(container: AppContainer = Depends(get_container)) -> AgentSupervisor:
    return container.supervisor
