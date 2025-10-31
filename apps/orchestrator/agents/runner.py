from __future__ import annotations

import asyncio
import json
import textwrap
import time
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import Any, Protocol, cast

import httpx

from ..observability.debug import log_lifecycle_event
from ..observability.logging import get_logger
from ..observability.metrics import (
    record_cost_usd,
    record_retry,
    record_tokens_in,
    record_tokens_out,
    update_tokens_per_sec,
)
from ..runengine.tasks import RunRequest
from ..settings import AppSettings
from .cost import calculate_cost

_logger = get_logger("agent.runner")


@dataclass
class AgentStreamEvent:
    phase: str
    content_delta: str | None = None
    tool_call: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = None


class ClaudeClientProtocol(Protocol):
    def stream_completion(
        self,
        request: RunRequest,
        cancel_event: asyncio.Event,
    ) -> AsyncGenerator[AgentStreamEvent, None]:
        ...


class EchoClaudeClient(ClaudeClientProtocol):
    def __init__(self, latency: float = 0.02) -> None:
        self._latency = latency

    async def stream_completion(
        self,
        request: RunRequest,
        cancel_event: asyncio.Event,
    ) -> AsyncGenerator[AgentStreamEvent, None]:
        yield AgentStreamEvent(phase="start")
        chunks = textwrap.wrap(request.prompt, 32) or [""]
        for chunk in chunks:
            if cancel_event.is_set():
                raise asyncio.CancelledError
            await asyncio.sleep(self._latency)
            yield AgentStreamEvent(phase="delta", content_delta=chunk)
        yield AgentStreamEvent(phase="end")


class ClaudeAPIClient(ClaudeClientProtocol):
    def __init__(self, settings: AppSettings) -> None:
        # Increase timeout for long-running agent operations
        timeout = httpx.Timeout(
            connect=10.0,
            read=120.0,  # 2 min for agent streaming
            write=10.0,
            pool=10.0
        )
        self._client = httpx.AsyncClient(timeout=timeout)
        self._settings = settings
        self._max_retries = 3
        self._base_delay = 1.0

    async def _retry_with_backoff(
        self,
        request: RunRequest,
        cancel_event: asyncio.Event,
    ) -> AsyncGenerator[AgentStreamEvent, None]:
        """Execute request with exponential backoff retry."""
        last_error: Exception | None = None
        yield AgentStreamEvent(phase="start")

        for attempt in range(self._max_retries):
            if cancel_event.is_set():
                raise asyncio.CancelledError

            try:
                async for event in self._do_stream(request, cancel_event):
                    yield event
                yield AgentStreamEvent(phase="end")
                return  # Success - exit retry loop
            except (httpx.HTTPStatusError, httpx.ReadTimeout) as exc:
                last_error = exc
                status_code = getattr(exc.response, "status_code", None) if hasattr(exc, "response") else "timeout"

                # Record retry metric
                reason = str(status_code) if status_code else "timeout"
                record_retry(request.metadata.get("agent_id") if request.metadata else None, reason)

                log_lifecycle_event(
                    _logger,
                    "claude_retry",
                    "agent_runner",
                    run_id=request.run_id,
                    attempt=attempt + 1,
                    max_retries=self._max_retries,
                    status=status_code
                )

                if attempt < self._max_retries - 1:
                    delay = min(self._base_delay * (2 ** attempt), 10.0)
                    await asyncio.sleep(delay)
                else:
                    # Final attempt failed
                    log_lifecycle_event(
                        _logger,
                        "claude_error",
                        "agent_runner",
                        run_id=request.run_id,
                        status=status_code,
                        all_retries_exhausted=True
                    )
                    raise

        if last_error:
            raise last_error

    async def _do_stream(
        self,
        request: RunRequest,
        cancel_event: asyncio.Event,
    ) -> AsyncGenerator[AgentStreamEvent, None]:
        """Perform single streaming request attempt."""
        headers = {
            "x-api-key": self._settings.claude_api_key or "",
            "anthropic-version": self._settings.claude_api_version,
        }
        model = request.metadata.get("model", "claude-3-opus-20240229") if request.metadata else "claude-3-opus-20240229"
        agent_id = request.metadata.get("agent_id") if request.metadata else None

        payload: dict[str, Any] = {
            "model": model,
            "system": request.system_prompt or "",
            "messages": [
                {"role": "user", "content": request.prompt},
            ],
            "stream": True,
            "max_tokens": request.metadata.get("max_tokens", 2048) if request.metadata else 2048,
        }
        if request.tools:
            payload["tools"] = request.tools

        # Track metrics
        tokens_in = 0
        tokens_out = 0
        start_time = time.perf_counter()

        log_lifecycle_event(_logger, "claude_start", "agent_runner", run_id=request.run_id)
        async with self._client.stream("POST", self._settings.claude_api_url, headers=headers, json=payload) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if cancel_event.is_set():
                    raise asyncio.CancelledError
                if not line or not line.startswith("data:"):
                    continue
                data = line[5:]
                if data.strip() == "[DONE]":
                    break
                try:
                    chunk = json.loads(data)
                except json.JSONDecodeError:
                    continue
                event_type = chunk.get("type")

                # Track usage from Claude API
                if "usage" in chunk:
                    usage = chunk["usage"]
                    tokens_in = usage.get("input_tokens", tokens_in)
                    tokens_out = usage.get("output_tokens", tokens_out)

                if event_type == "completion.delta":
                    delta = chunk.get("delta", {}).get("text", "")
                    if delta:
                        tokens_out += len(delta.split())  # Rough estimate
                        yield AgentStreamEvent(phase="delta", content_delta=delta)
                elif event_type == "completion.message_delta":
                    delta = chunk.get("delta", {}).get("text", "")
                    if delta:
                        tokens_out += len(delta.split())  # Rough estimate
                        yield AgentStreamEvent(phase="delta", content_delta=delta)
                elif event_type == "completion.stop":
                    break

        # Record final metrics
        duration = time.perf_counter() - start_time
        if duration > 0 and tokens_out > 0:
            tokens_per_sec = tokens_out / duration
            update_tokens_per_sec(agent_id, tokens_per_sec)

        record_tokens_in(agent_id, model, tokens_in)
        record_tokens_out(agent_id, model, tokens_out)

        # Calculate and record cost
        cost = calculate_cost(model, tokens_in, tokens_out)
        record_cost_usd(agent_id, model, cost)

        log_lifecycle_event(_logger, "claude_end", "agent_runner", run_id=request.run_id, tokens_in=tokens_in, tokens_out=tokens_out, cost_usd=cost)

    async def stream_completion(
        self,
        request: RunRequest,
        cancel_event: asyncio.Event,
    ) -> AsyncGenerator[AgentStreamEvent, None]:
        """Main entry point with retry logic."""
        # _do_stream doesn't yield start/end, _retry_with_backoff does
        async for event in self._retry_with_backoff(request, cancel_event):
            yield event

    async def close(self) -> None:
        await self._client.aclose()


class AgentRunner:
    def __init__(self, settings: AppSettings, client: ClaudeClientProtocol | None = None) -> None:
        self._settings = settings
        self._client: ClaudeClientProtocol
        if client is not None:
            self._client = client
            self._owns_client = False
        elif settings.claude_api_key:
            self._client = cast(ClaudeClientProtocol, ClaudeAPIClient(settings))
            self._owns_client = True
        else:
            self._client = cast(ClaudeClientProtocol, EchoClaudeClient())
            self._owns_client = False

    async def stream(
        self,
        request: RunRequest,
        cancel_event: asyncio.Event,
    ) -> AsyncGenerator[AgentStreamEvent, None]:
        try:
            async for event in self._client.stream_completion(request, cancel_event):
                yield event
        except asyncio.CancelledError:
            _logger.info("stream_cancelled", run_id=request.run_id)
            yield AgentStreamEvent(phase="error", content_delta="Run cancelled")
            raise
        except httpx.HTTPError as exc:
            _logger.exception("claude_http_error", run_id=request.run_id, error=str(exc))
            fallback = EchoClaudeClient()
            async for event in fallback.stream_completion(request, cancel_event):
                yield event
        except Exception as exc:  # noqa: BLE001
            _logger.exception("claude_error", run_id=request.run_id, error=str(exc))
            fallback = EchoClaudeClient()
            async for event in fallback.stream_completion(request, cancel_event):
                yield event

    async def shutdown(self) -> None:
        client = getattr(self._client, "close", None)
        if self._owns_client and callable(client):
            await client()
