"""XenoSync API endpoints for debugging and monitoring."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from ..deps import get_xenosync
from ..xenosync.xenosync import XenoSyncManager

router = APIRouter(prefix="/xenosync", tags=["xenosync"])


@router.get("/debug")
async def get_xenosync_debug(xenosync: XenoSyncManager = Depends(get_xenosync)) -> dict[str, Any]:
    """Get XenoSync debug information including active claims and metrics.

    Returns:
        Dictionary with active_claims (list of claim details) and metrics (counters/gauges)
    """
    return await xenosync.get_debug_state()
