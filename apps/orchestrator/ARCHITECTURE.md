# MaiFarm Orchestrator Architecture

## Overview
```
[Dashboard] ⇄ HTTP/WS ⇄ [FastAPI Gateway]
                               │
                               ├─ WebsocketHub (WS/SSE fanout)
                               ├─ RunEngine (async queue, workers)
                               ├─ AgentManager (lifecycle, persistence)
                               ├─ AgentRunner (Claude streaming)
                               ├─ TmuxBridge (session/pane streams)
                               └─ XenoSync (locks, CAS, events)
```
- **Gateway** exposes REST (`/agents`, `/tmux`, `/healthz`), WebSockets (`/ws/harvest`), SSE fallback.
- **RunEngine** executes queued runs with cancellation/backpressure.
- **AgentManager** persists status, forwards deltas, mirrors to tmux, stores stream events.
- **XenoSync** guarantees orderly file writes via advisory locks + atomic renames.
- **Observability**: structlog JSON logs, Prometheus metrics, tracing spans.

## Data Flow
1. `POST /agents/run` → AgentRun row (status=queued) → queued for workers.
2. Worker calls AgentRunner; streaming deltas forwarded to WebsocketHub and persisted.
3. Terminals and tmux panes receive `term_line`, `agent_event`, `status`, `metrics` envelopes.
4. XenoSync locks wrap tool/file writes; CAS ensures deterministic artifacts.

## Failure Handling
- **Worker crash**: jobs remain queued; status updated via retries.
- **Claude/API failure**: AgentManager marks run `failed`, emits status event.
- **WebSocket drop**: connection removed, metrics decremented; clients reconnect.
- **Lock conflict**: XenoSync times out and emits conflict event, preserving artifacts.

## Scaling
- Stateless FastAPI nodes behind load balancer; RunEngine can switch to Redis backend.
- Shared Postgres + CAS directories; sticky sessions or pub/sub for WebSocket scale out.
- Metrics/health endpoints support container orchestration readiness checks.
