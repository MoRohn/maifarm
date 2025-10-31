from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..agents.manager import AgentManager
from ..db import models as db_models
from ..deps import get_agent_manager, get_db_session, get_run_engine
from ..runengine.queue import RunEngine
from ..runengine.tasks import RunRequest

router = APIRouter(prefix="/agents", tags=["agents"])


class RunRequestBody(BaseModel):
    session_id: str
    prompt: str
    agent_id: str | None = None
    profile_id: str | None = None
    system: str | None = None
    tools: list[dict[str, Any]] = Field(default_factory=list)
    files: list[str] = Field(default_factory=list)
    tmux_pane_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class RunResponse(BaseModel):
    run_id: str
    session_id: str
    status: str


class RunDetail(BaseModel):
    id: str
    agent_id: str | None
    session_id: str
    status: str
    prompt: str
    system_prompt: str | None
    profile_id: str | None
    error: str | None

    model_config = {"from_attributes": True}


@router.post("/run", response_model=RunResponse, status_code=status.HTTP_202_ACCEPTED)
async def run_agent(
    request_body: RunRequestBody,
    run_engine: RunEngine = Depends(get_run_engine),
) -> RunResponse:
    run_id = uuid.uuid4().hex
    run_request = RunRequest(
        run_id=run_id,
        session_id=request_body.session_id,
        agent_id=request_body.agent_id or "agent-default",
        prompt=request_body.prompt,
        system_prompt=request_body.system,
        profile_id=request_body.profile_id,
        tools=request_body.tools,
        files=request_body.files,
        metadata=request_body.metadata,
        tmux_pane_id=request_body.tmux_pane_id,
    )
    await run_engine.enqueue(run_request)
    return RunResponse(run_id=run_id, session_id=request_body.session_id, status="queued")


@router.post("/cancel/{run_id}")
async def cancel_run(run_id: str, run_engine: RunEngine = Depends(get_run_engine)) -> dict[str, str]:
    cancelled = await run_engine.cancel(run_id)
    if not cancelled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found or already finished")
    return {"run_id": run_id, "status": "cancelled"}


@router.get("/runs/{run_id}", response_model=RunDetail)
async def get_run(
    run_id: str,
    session: AsyncSession = Depends(get_db_session),
    manager: AgentManager = Depends(get_agent_manager),
) -> RunDetail:
    stmt = select(db_models.AgentRunModel).where(db_models.AgentRunModel.id == run_id)
    try:
        result = await session.execute(stmt)
        run = result.scalar_one_or_none()
    except SQLAlchemyError:
        run = await manager.get_run(run_id)
    else:
        if run is None:
            run = await manager.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    return RunDetail.model_validate(run)


@router.get("/sessions/{session_id}")
async def list_session_runs(
    session_id: str,
    session: AsyncSession = Depends(get_db_session),
    manager: AgentManager = Depends(get_agent_manager),
) -> list[RunDetail]:
    stmt = (
        select(db_models.AgentRunModel)
        .where(db_models.AgentRunModel.session_id == session_id)
        .order_by(db_models.AgentRunModel.created_at.desc())
    )
    try:
        result = await session.execute(stmt)
        runs = result.scalars().all()
    except SQLAlchemyError:
        runs = await manager.list_session_runs(session_id)
    else:
        if not runs:
            runs = await manager.list_session_runs(session_id)
    return [RunDetail.model_validate(run) for run in runs]
