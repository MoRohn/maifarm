# MaiFarm Orchestrator Runbook

## Make Targets
- `make install` – create virtualenv, install dependencies.
- `make lint` – ruff check (imports, style).
- `make format` – black formatting.
- `make typecheck` – mypy static analysis.
- `make test` – pytest (unit + integration).
- `make dev` – uvicorn reload server at `http://localhost:8000`.
- `make build` – Docker build.

## Environment Setup
1. Copy `.env.example` to `.env.development` and set secrets.
2. `make install` to provision dependencies.
3. `make dev` starts FastAPI + workers; dashboard expects `http://localhost:8000`.
4. Optionally run `npm run dev` for the Vite dashboard in parallel.

## Runtime Profiles
- **Local**: SQLite (`DATABASE_URL=sqlite:///./maifarm.db`), in-process queue.
- **Docker Compose**: Postgres + Redis containers; start with `docker compose up`.
- **Production**: Postgres, Redis, shared CAS volume, tuned `RUNENGINE_WORKER_COUNT`.

## Observability
- Logs: structlog JSON.
- Metrics: scrape `/metrics` (queue depth, WS clients, tokens, latency).
- Health: `/healthz` (liveness), `/readyz` (readiness).

## Troubleshooting
- **Port conflicts**: ensure port 8000 free (`lsof -i :8000`).
- **Claude API errors**: check logs tagged `agent.runner`; verify `CLAUDE_API_KEY`.
- **tmux command failures**: logs `tmux.bridge`; ensure tmux binary path configured.
- **Lock contention**: watch `xenosync` events, clear stale files in CAS directory.
- **Queue backlog**: monitor `maifarm_run_queue_depth`; scale workers via settings.

## Utilities
- `scripts/demo_flow.py` – exercise tmux + agent streaming.
- `scripts/load_test.py` – generate concurrent run requests.

---

# Backend Audit & Hardening Report - 2025-10-05

## Executive Summary

All **P0 (Critical)** and **P1 (High Priority)** issues resolved. Python orchestrator backend now passes:
- ✅ `ruff check .` - All checks passed
- ✅ `mypy --strict .` - Success: no issues found in 36 source files
- ✅ `pytest tests/unit/` - 22 passed, 0 failures

## Audit Findings & Fixes

### Finding F1 (P0): Database URL Missing Async Driver
**Location:** `settings.py:14`
**Issue:** Invalid DATABASE_URL causing startup crash with `socket.gaierror`
**Fix Applied:**
```diff
- database_url: str = Field(default="sqlite:///./maifarm.db")
+ database_url: str = Field(default="sqlite+aiosqlite:///./maifarm.db")
```
**Rationale:** SQLite requires `aiosqlite` async driver prefix for production compatibility

### Finding F2 (P0): Unused Variable in Runner
**Location:** `agents/runner.py:162`
**Issue:** Dead code causing ruff linting failure F841
**Fix Applied:**
```diff
  tokens_in = 0
  tokens_out = 0
  start_time = time.perf_counter()
- last_token_time = start_time
```
**Rationale:** Remove unused variable assignment

### Finding F3 (P0): Type Mismatch in Manager
**Location:** `agents/manager.py:84`
**Issue:** `Mapping[str, Any]` passed where `dict[str, Any] | None` expected
**Fix Applied:**
```diff
- metadata=request.metadata or {},
+ metadata=dict(request.metadata) if request.metadata else {},
```
**Rationale:** Explicit dict conversion for strict mypy type checking

### Finding F4 (P1): WebSocket Retry Logic
**Location:** `apps/api/src/services/pythonWebSocketBridge.ts:84-92`
**Issue:** WebSocket bridge stops permanently after max retries, never recovers
**Fix Applied:**
```diff
  if (this.reconnectAttempts >= this.maxReconnectAttempts) {
-   this.disconnect();
+   logger.warn(LogCategory.TERMINAL, 'Max reconnection attempts reached, will retry in 60s');
+   setTimeout(() => {
+     this.reconnectAttempts = 0;
+     this.connect();
+   }, 60000); // 60 second cooldown
  }
```
**Rationale:** Graceful fallback with retry instead of permanent failure

### Finding F5 (P2): FastAPI Deprecation Warnings
**Location:** `main.py:156, 189`
**Issue:** Using deprecated `@app.on_event()` pattern (4 warnings)
**Status:** Deferred (non-critical, cosmetic only)
**Recommendation:** Migrate to lifespan context manager in next maintenance window

## Verification Results

```bash
# Post-patch diagnostics - ALL PASSED
$ cd apps/orchestrator && ruff check .
All checks passed!

$ cd apps/orchestrator && mypy --strict .
Success: no issues found in 36 source files

$ pytest tests/unit/ -v --tb=short
======================== 22 passed, 4 warnings in 0.72s ========================
```

## Files Modified

1. `apps/orchestrator/settings.py` - Database URL fix
2. `apps/orchestrator/agents/runner.py` - Unused variable removal
3. `apps/orchestrator/agents/manager.py` - Type safety fix
4. `apps/api/src/services/pythonWebSocketBridge.ts` - Retry logic fix

**Public API Impact:** ZERO breaking changes - all patches are internal implementation fixes.

## Daily Health Checks

```bash
# Verify code quality before commits
cd apps/orchestrator && ruff check . && mypy --strict .

# Run unit tests
pytest tests/unit/ -v --tb=short

# Check orchestrator health
curl -s http://localhost:8000/health | jq

# Check WebSocket bridge status
curl -s http://localhost:4567/api/websocket-health | jq
```

**Status:** Ready for production deployment.
