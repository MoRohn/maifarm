from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from ..deps import get_tmux_bridge
from ..tmux.bridge import TmuxBridge

router = APIRouter(prefix="/tmux", tags=["tmux"])


class CreateSessionRequest(BaseModel):
    name: str | None = None


class CreateSessionResponse(BaseModel):
    session_id: str
    name: str


class CreatePaneRequest(BaseModel):
    session_id: str
    command: str | None = None
    title: str | None = None


class CreatePaneResponse(BaseModel):
    pane_id: str
    session_id: str
    command: str | None


class SendCommandRequest(BaseModel):
    command: str
    cwd: str | None = None
    environment: dict[str, str] = Field(default_factory=dict)


@router.post("/session", response_model=CreateSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    payload: CreateSessionRequest,
    bridge: TmuxBridge = Depends(get_tmux_bridge),
) -> CreateSessionResponse:
    session_id, name = await bridge.create_session(payload.name)
    return CreateSessionResponse(session_id=session_id, name=name)


@router.post("/pane", response_model=CreatePaneResponse, status_code=status.HTTP_201_CREATED)
async def create_pane(
    payload: CreatePaneRequest,
    bridge: TmuxBridge = Depends(get_tmux_bridge),
) -> CreatePaneResponse:
    pane = await bridge.create_pane(payload.session_id, payload.command, payload.title)
    if pane is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return CreatePaneResponse(pane_id=pane.pane_id, session_id=pane.session_id, command=pane.command)


@router.post("/pane/{pane_id}/send")
async def send_command(
    pane_id: str,
    payload: SendCommandRequest,
    bridge: TmuxBridge = Depends(get_tmux_bridge),
) -> dict[str, str]:
    ok = await bridge.execute_command(pane_id, payload.command, cwd=payload.cwd, environment=payload.environment)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pane not found")
    return {"pane_id": pane_id, "status": "running"}


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(session_id: str, bridge: TmuxBridge = Depends(get_tmux_bridge)) -> Response:
    deleted = await bridge.delete_session(session_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
