import sys
from pathlib import Path

import pytest
from fastapi import FastAPI

# Ensure repository root is on sys.path for absolute imports during collection.
ROOT = Path(__file__).resolve().parents[4]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from apps.orchestrator.main import create_app
from apps.orchestrator.settings import AppSettings


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
def test_app(tmp_path: Path) -> FastAPI:
    db_path = tmp_path / "test.db"
    settings = AppSettings(
        environment="test",
        database_url=f"sqlite+aiosqlite:///{db_path}",
        allowed_origins="http://test",
        runengine_worker_count=1,
    )
    app = create_app(settings)
    return app
