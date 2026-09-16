from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class AppSettings(BaseSettings):
    app_name: str = "MaiFarm Orchestrator"
    environment: str = Field(default="development")
    log_level: str = Field(default="INFO")
    database_url: str = Field(default="sqlite+aiosqlite:///./maifarm.db")
    redis_url: str = Field(default="redis://localhost:6379/0")
    claude_api_key: str | None = None
    claude_api_url: str = Field(default="https://api.anthropic.com/v1/messages")
    claude_api_version: str = Field(default="2023-06-01")
    allowed_origins: str = Field(default="http://localhost:5173")
    api_key: str | None = Field(default=None, description="API key for write operations")
    metrics_namespace: str = Field(default="maifarm")
    tmux_bin: str = Field(default="/usr/bin/tmux")
    xenosync_cache_dir: str = Field(default="./.maifarm_cache")
    xenosync_lock_timeout: float = Field(default=8.0)
    xenosync_lease_seconds: int = Field(default=30)
    runengine_worker_count: int = Field(default=2)
    runengine_backend: str = Field(default="memory")
    websocket_max_connections: int = Field(default=500)
    sse_queue_size: int = Field(default=256)
    request_timeout_seconds: int = Field(default=60)
    metrics_push_interval: float = Field(default=15.0)

    model_config = SettingsConfigDict(
        env_file=(".env.development", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def async_database_url(self) -> str:
        url = self.database_url
        if url.startswith("sqlite:///"):
            return url.replace("sqlite:///", "sqlite+aiosqlite:///")
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+asyncpg://")
        if url.startswith("postgresql+psycopg://"):
            return url.replace("postgresql+psycopg://", "postgresql+asyncpg://")
        return url

    @property
    def allowed_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    @property
    def cache_path(self) -> Path:
        return Path(self.xenosync_cache_dir).resolve()


@lru_cache(maxsize=1)
def load_settings() -> AppSettings:
    return AppSettings()
