import asyncio

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient


@pytest.mark.anyio
async def test_agent_run_lifecycle(test_app: FastAPI) -> None:
    # Mark app as ready to bypass readiness gate
    test_app.state.ready = True

    transport_kwargs = {"app": test_app}
    import inspect

    if "lifespan" in inspect.signature(ASGITransport.__init__).parameters:
        transport_kwargs["lifespan"] = "on"
    transport = ASGITransport(**transport_kwargs)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/agents/run",
            json={"session_id": "session-x", "prompt": "stream some tokens"},
        )
        response.raise_for_status()
        run_id = response.json()["run_id"]

        status = None
        for _ in range(20):
            await asyncio.sleep(0.05)
            detail = await client.get(f"/agents/runs/{run_id}")
            if detail.status_code == 200:
                status = detail.json()["status"]
                if status in {"succeeded", "failed"}:
                    break

        assert status in {"succeeded", "running"}

        cancel_response = await client.post(f"/agents/cancel/{run_id}")
        assert cancel_response.status_code in (200, 404)
