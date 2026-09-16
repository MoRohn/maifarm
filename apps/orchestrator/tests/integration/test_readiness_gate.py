"""Integration tests for server readiness gate."""
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from apps.orchestrator.main import create_app
from apps.orchestrator.settings import AppSettings


@pytest.mark.asyncio
async def test_server_returns_503_before_ready():
    """Test that server returns 503 before startup complete."""
    settings = AppSettings()
    app = create_app(settings)

    # Server not ready yet
    app.state.ready = False

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Should return 503 for non-health endpoints
        response = await client.post("/agents/run", json={"session_id": "test", "prompt": "test"})
        assert response.status_code == 503
        assert "starting" in response.text.lower()


@pytest.mark.asyncio
async def test_server_health_available_before_ready():
    """Test that health endpoints are available even before ready."""
    settings = AppSettings()
    app = create_app(settings)

    # Server not ready yet
    app.state.ready = False

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Health endpoint should still work
        response = await client.get("/healthz")
        # May return 200 or error depending on if database is up, but shouldn't be 503
        assert response.status_code != 503


@pytest.mark.asyncio
async def test_server_allows_requests_after_ready():
    """Test that server accepts requests after ready."""
    settings = AppSettings()
    app = create_app(settings)

    # Mark as ready
    app.state.ready = True

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Should not return 503 (may return other errors due to validation, but not 503)
        response = await client.post("/agents/run", json={"session_id": "test", "prompt": "test"})
        assert response.status_code != 503
