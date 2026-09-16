from __future__ import annotations

from prometheus_client import Counter, Gauge, Histogram

RUN_QUEUE_DEPTH = Gauge("maifarm_run_queue_depth", "Number of pending run engine jobs")
ACTIVE_WS_CONNECTIONS = Gauge("maifarm_ws_clients", "Connected Harvest WebSocket clients")
ACTIVE_SSE_CONNECTIONS = Gauge("maifarm_sse_clients", "Active Harvest SSE clients")
EMITTED_EVENTS = Counter("maifarm_events_emitted_total", "Events emitted to clients", ["event_type"])
AGENT_TOKENS = Counter("maifarm_agent_tokens_total", "Tokens streamed by agent", ["agent_id"])
AGENT_RUN_LATENCY = Histogram("maifarm_agent_run_duration_seconds", "Agent run duration in seconds")
AGENT_TOKENS_IN = Counter("maifarm_agent_tokens_in_total", "Input tokens by agent", ["agent_id", "model"])
AGENT_TOKENS_OUT = Counter("maifarm_agent_tokens_out_total", "Output tokens by agent", ["agent_id", "model"])
AGENT_RETRIES = Counter("maifarm_agent_retries_total", "Retry attempts by agent", ["agent_id", "reason"])
AGENT_COST_USD = Counter("maifarm_agent_cost_usd_total", "Total cost in USD by agent", ["agent_id", "model"])
AGENT_TOKENS_PER_SEC = Gauge("maifarm_agent_tokens_per_sec", "Current tokens/sec throughput", ["agent_id"])
XENOSYNC_LOCKS_HELD = Gauge("maifarm_xenosync_locks_held", "Currently held XenoSync locks")
XENOSYNC_LOCK_WAIT = Histogram("maifarm_xenosync_lock_wait_seconds", "Time waiting for lock acquisition")
XENOSYNC_MERGE_CONFLICTS = Counter("maifarm_xenosync_merge_conflicts_total", "Total merge conflicts encountered")


def update_run_queue_depth(depth: int) -> None:
    RUN_QUEUE_DEPTH.set(depth)


def update_ws_gauge(count: int) -> None:
    ACTIVE_WS_CONNECTIONS.set(count)


def update_sse_gauge(count: int) -> None:
    ACTIVE_SSE_CONNECTIONS.set(count)


def record_event_emission(event_type: str) -> None:
    EMITTED_EVENTS.labels(event_type=event_type).inc()


def record_tokens(agent_id: str | None, amount: int) -> None:
    AGENT_TOKENS.labels(agent_id=agent_id or "unknown").inc(amount)


def observe_run_duration(duration: float) -> None:
    AGENT_RUN_LATENCY.observe(duration)


def record_tokens_in(agent_id: str | None, model: str, amount: int) -> None:
    """Record input tokens for cost tracking."""
    AGENT_TOKENS_IN.labels(agent_id=agent_id or "unknown", model=model).inc(amount)


def record_tokens_out(agent_id: str | None, model: str, amount: int) -> None:
    """Record output tokens for cost tracking."""
    AGENT_TOKENS_OUT.labels(agent_id=agent_id or "unknown", model=model).inc(amount)


def record_retry(agent_id: str | None, reason: str) -> None:
    """Record retry attempt with reason (401/429/timeout)."""
    AGENT_RETRIES.labels(agent_id=agent_id or "unknown", reason=reason).inc()


def record_cost_usd(agent_id: str | None, model: str, cost: float) -> None:
    """Record cost in USD for this run."""
    AGENT_COST_USD.labels(agent_id=agent_id or "unknown", model=model).inc(cost)


def update_tokens_per_sec(agent_id: str | None, rate: float) -> None:
    """Update current tokens/sec throughput gauge."""
    AGENT_TOKENS_PER_SEC.labels(agent_id=agent_id or "unknown").set(rate)


def record_gauge(metric_name: str, value: float) -> None:
    """Record a generic gauge metric."""
    if metric_name == "xenosync_locks_held":
        XENOSYNC_LOCKS_HELD.set(value)


def record_histogram(metric_name: str, value: float) -> None:
    """Record a generic histogram observation."""
    if metric_name == "xenosync_lock_wait_seconds":
        XENOSYNC_LOCK_WAIT.observe(value)


def record_counter(metric_name: str, amount: float = 1.0) -> None:
    """Increment a generic counter."""
    if metric_name == "xenosync_merge_conflicts_total":
        XENOSYNC_MERGE_CONFLICTS.inc(amount)
