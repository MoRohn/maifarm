from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator, Awaitable
from dataclasses import dataclass
from typing import Callable

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse

from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from .agents.manager import AgentManager
from .agents.memory import AgentMemory
from .agents.runner import AgentRunner
from .agents.supervisor import AgentSupervisor
from .api import agents as agents_router
from .api import debug as debug_router
from .api import health as health_router
from .api import monitor as monitor_router
from .api import tmux as tmux_router
from .api import xenosync as xenosync_router
from .db.session import DatabaseSessionManager, create_session_factory
from .observability.debug import log_lifecycle_event, set_trace_id
from .observability.logging import configure_logging, get_logger
from .runengine.queue import RunEngine
from .settings import AppSettings, load_settings
from .tmux.bridge import TmuxBridge
from .ws.hub import HarvestSseSubscription, WebsocketHub
from .xenosync.xenosync import XenoSyncManager


@dataclass
class AppContainer:
    settings: AppSettings
    db_manager: DatabaseSessionManager
    hub: WebsocketHub
    agent_runner: AgentRunner
    agent_manager: AgentManager
    run_engine: RunEngine
    tmux_bridge: TmuxBridge
    xenosync: XenoSyncManager
    memory: AgentMemory
    supervisor: AgentSupervisor


def create_container(settings: AppSettings | None = None) -> AppContainer:
    config = settings or load_settings()
    configure_logging(config.log_level)
    logger = get_logger("container")

    db_manager = create_session_factory(config.async_database_url)
    hub = WebsocketHub(settings=config)
    memory = AgentMemory(db_manager.session)
    xenosync = XenoSyncManager(settings=config)
    supervisor = AgentSupervisor()
    tmux_bridge = TmuxBridge(settings=config, hub=hub)
    agent_runner = AgentRunner(settings=config)
    agent_manager = AgentManager(
        settings=config,
        runner=agent_runner,
        hub=hub,
        memory=memory,
        session_factory=db_manager.session,
        xenosync=xenosync,
        tmux_bridge=tmux_bridge,
        supervisor=supervisor,
    )
    run_engine = RunEngine(agent_manager=agent_manager, settings=config)
    logger.info("container_ready", environment=config.environment)

    return AppContainer(
        settings=config,
        db_manager=db_manager,
        hub=hub,
        agent_runner=agent_runner,
        agent_manager=agent_manager,
        run_engine=run_engine,
        tmux_bridge=tmux_bridge,
        xenosync=xenosync,
        memory=memory,
        supervisor=supervisor,
    )


def create_app(settings: AppSettings | None = None) -> FastAPI:
    container = create_container(settings=settings)
    app = FastAPI(title=container.settings.app_name, version="0.1.0")
    app.state.container = container
    app.state.ready = False

    # Readiness check middleware
    @app.middleware("http")
    async def check_readiness(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        if not app.state.ready and request.url.path not in ["/healthz", "/health", "/metrics"]:
            return Response("Service starting", status_code=503)
        return await call_next(request)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=container.settings.allowed_origin_list or ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(agents_router.router)
    app.include_router(tmux_router.router)
    app.include_router(health_router.router)
    app.include_router(debug_router.router)
    app.include_router(xenosync_router.router)
    app.include_router(monitor_router.router)

    @app.get("/metrics")
    async def metrics_endpoint() -> Response:
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

    @app.websocket("/ws/harvest")
    async def harvest_ws(websocket: WebSocket) -> None:
        session_id = websocket.query_params.get("session_id") or str(uuid.uuid4())
        set_trace_id(session_id)
        logger = get_logger("ws")
        try:
            log_lifecycle_event(logger, "ws_connect_start", "websocket", session_id=session_id)
            await container.hub.register_ws(session_id, websocket)
            log_lifecycle_event(logger, "ws_connected", "websocket", session_id=session_id, client=str(websocket.client))
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            log_lifecycle_event(logger, "ws_disconnect", "websocket", session_id=session_id)
        except Exception as exc:  # noqa: BLE001
            log_lifecycle_event(logger, "ws_error", "websocket", session_id=session_id, error=str(exc))
            logger.exception("ws_error", session_id=session_id, error=str(exc))
        finally:
            await container.hub.unregister_ws(session_id, websocket)
            log_lifecycle_event(logger, "ws_cleanup_complete", "websocket", session_id=session_id)

    @app.get("/sse/harvest")
    async def harvest_sse(request: Request, session_id: str) -> StreamingResponse:
        subscription: HarvestSseSubscription = await container.hub.register_sse(session_id)

        async def event_stream() -> AsyncIterator[str]:
            try:
                while True:
                    if await request.is_disconnected():
                        break
                    message = await subscription.queue.get()
                    yield f"data: {message}\n\n"
            finally:
                await container.hub.unregister_sse(subscription)

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    @app.on_event("startup")
    async def on_startup() -> None:
        logger = get_logger("startup")
        log_lifecycle_event(logger, "server_startup", "main", settings=container.settings.app_name)

        log_lifecycle_event(logger, "db_init_start", "database")
        # Database init with retry for production resilience
        max_attempts = 3
        for attempt in range(1, max_attempts + 1):
            try:
                await asyncio.wait_for(container.db_manager.init_models(), timeout=90.0)
                break  # Success
            except asyncio.TimeoutError:
                if attempt < max_attempts:
                    logger.warning("db_init_timeout_retry", attempt=attempt, max_attempts=max_attempts)
                    await asyncio.sleep(5)
                else:
                    logger.exception("db_init_timeout_final")
                    raise RuntimeError("Database initialization timed out after retries")
        log_lifecycle_event(logger, "db_init_complete", "database")

        log_lifecycle_event(logger, "xenosync_start", "xenosync")
        await container.xenosync.start_heartbeat()
        log_lifecycle_event(logger, "xenosync_ready", "xenosync")

        log_lifecycle_event(logger, "supervisor_start", "supervisor")
        await container.supervisor.start()
        log_lifecycle_event(logger, "supervisor_ready", "supervisor")

        log_lifecycle_event(logger, "tmux_start", "tmux_bridge")
        await container.tmux_bridge.start()
        log_lifecycle_event(logger, "tmux_ready", "tmux_bridge")

        log_lifecycle_event(logger, "runengine_start", "run_engine")
        await container.run_engine.start()
        log_lifecycle_event(logger, "runengine_ready", "run_engine")

        # Signal all components ready
        app.state.ready = True
        log_lifecycle_event(logger, "server_ready", "main")

    @app.on_event("shutdown")
    async def on_shutdown() -> None:
        await container.run_engine.stop()
        await container.supervisor.stop()
        await container.tmux_bridge.stop()
        await container.xenosync.stop_heartbeat()
        await container.hub.shutdown()
        await container.agent_runner.shutdown()
        await container.db_manager.dispose()

    return app


app = create_app()
