"""Monitoring endpoints for active agents and system state."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from ..agents.supervisor import AgentSupervisor
from ..deps import get_supervisor

router = APIRouter(prefix="/monitor", tags=["monitor"])


@router.get("/active")
async def get_active_agents(supervisor: AgentSupervisor = Depends(get_supervisor)) -> dict[str, Any]:
    """Get list of currently active agents with their state.

    Returns:
        Dictionary with active agents list and count
    """
    active = await supervisor.get_active_agents()
    return {
        "active_agents": active,
        "count": len(active),
    }


@router.get("/agents/{run_id}")
async def get_agent_status(run_id: str, supervisor: AgentSupervisor = Depends(get_supervisor)) -> dict[str, Any]:
    """Get status for a specific agent run.

    Args:
        run_id: Run identifier

    Returns:
        Agent status dictionary
    """
    status = await supervisor.get_agent_status(run_id)
    if not status:
        return {"error": "Agent not found", "run_id": run_id}
    return status
