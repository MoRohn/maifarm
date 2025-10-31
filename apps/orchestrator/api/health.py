from __future__ import annotations

from typing import TYPE_CHECKING, Union

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..deps import get_container

if TYPE_CHECKING:
    from ..main import AppContainer

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str


@router.get("/healthz", response_model=HealthResponse)
async def healthz() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/readyz")
async def readyz(container: AppContainer = Depends(get_container)) -> dict[str, Union[str, int]]:
    return {
        "status": "ready",
        "environment": container.settings.environment,
        "worker_count": container.run_engine.worker_count,
    }
