"""Security middleware for MaiFarm orchestrator."""
from __future__ import annotations

import secrets
from collections.abc import Awaitable
from typing import Any, Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.status import HTTP_401_UNAUTHORIZED, HTTP_403_FORBIDDEN

from ..observability.logging import get_logger
from ..settings import AppSettings

_logger = get_logger("security")


class SecurityMiddleware(BaseHTTPMiddleware):
    """Security middleware for API authentication and CORS."""

    def __init__(self, app: Any, settings: AppSettings) -> None:
        super().__init__(app)
        self._settings = settings
        self._api_key = settings.api_key if hasattr(settings, "api_key") else None

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        # Public endpoints
        if request.url.path in ["/healthz", "/health", "/metrics", "/docs", "/openapi.json"]:
            return await call_next(request)

        # Require API key for POST/PUT/DELETE operations
        if request.method in ["POST", "PUT", "DELETE", "PATCH"]:
            if self._api_key:
                auth_header = request.headers.get("X-API-Key") or request.headers.get("Authorization")
                if not auth_header:
                    _logger.warning("missing_api_key", path=request.url.path, method=request.method)
                    return Response("API key required", status_code=HTTP_401_UNAUTHORIZED)

                # Support both "X-API-Key: key" and "Authorization: Bearer key"
                provided_key = auth_header.replace("Bearer ", "").strip()
                if not secrets.compare_digest(provided_key, self._api_key):
                    _logger.warning("invalid_api_key", path=request.url.path, method=request.method)
                    return Response("Invalid API key", status_code=HTTP_403_FORBIDDEN)

        return await call_next(request)
