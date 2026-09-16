# Environment Variable Parity Audit

_Date: 2025-11-02_

This audit compares environment-variable usage between the TypeScript services (MaiFarm API + Dashboard) and the Python orchestrator helpers so we can align configuration across the stack.

## Snapshot

| Scope | Source Paths | Unique Vars | Notes |
|-------|--------------|-------------|-------|
| Node.js services | `apps/api`, `apps/dashboard`, `scripts`, `tools/` | 219 | Covers API server, web dashboard, CI scripts, and feature flags |
| Python orchestrator | `apps/orchestrator`, `scripts/python/` | 16 (direct reads) | Excludes additional optional settings loaded via `pydantic.BaseSettings` defaults |
| Intersection | — | 7 | Shared provider + runtime settings |

## Shared Variables (Parity Confirmed)

| Variable | Purpose |
|----------|---------|
| `AI_PROVIDER` | Selects Claude/OpenAI/Qwen/Ollama providers for both Node API and Python helpers |
| `USE_LLM_PROXY` | Enables routing through the shared proxy service |
| `LLM_PROXY_URL` | Points to proxy endpoint used by both stacks when `USE_LLM_PROXY=true` |
| `ANTHROPIC_API_KEY`, `CLAUDE_API_KEY`, `OPENAI_API_KEY` | Provider credentials consumed by API and orchestrator agents |
| `MAIBARN_ROOT` | Shared filesystem root for farm runtime artifacts |

**Status**: These values are consumed in both runtimes today. Ensure they live in `.env`, `.env.development`, and deployment secrets.

## Python-Only Variables

| Variable | Observed In | Purpose | Node Counterpart | Action |
|----------|-------------|---------|------------------|--------|
| `AGENT_ID`, `AGENT_NAME`, `AGENT_PROMPT`, `SESSION_NAME`, `FARM_ID` | `apps/orchestrator/xenosync/*`, `scripts/python/simple_mock_agent.py` | Injected per-agent metadata and prompts | Runtime only (not persisted in env files) | Document in CLAUDE.md and ensure launcher always sets them |
| `MAIFARM_WORKSPACE` | `apps/orchestrator/xenosync/launcher.py` | Overrides workspace directory when launching agents | Node uses `MAIFARM_ROOT`/`MAIBARN_ROOT` | Add alias in Node launcher or ensure this var is exported when orchestrator runs |
| `NODE_MEMORY_PER_AGENT` | `apps/orchestrator/xenosync/resource_limits.py` | Memory cap (MB) for orchestrated agents | Node exposes `MAX_HEAP_SIZE` but not per-agent | Decide on canonical name; expose from API if per-agent budgeting is required |
| `DEBUG`, `DEBUG_LOG_PATH` | `apps/orchestrator/observability/logger.py` | Enables verbose logging + custom log location | Node uses `LOG_LEVEL`, `LOG_DIR` | Add bridging so orchestrator honors `LOG_LEVEL` & `LOG_DIR` instead |

## Node-Only Categories (Highlights)

Rather than list all 212 Node-only variables, the table below groups them by domain with examples.

| Domain | Example Variables | Notes |
|--------|-------------------|-------|
| Database | `DATABASE_URL`, `DB_HOST`, `DB_POOL_MAX`, `DB_SSL_*` | Only Node manages pooled connections; orchestrator relies on API |
| Redis & Queues | `REDIS_HOST`, `REDIS_PORT`, `REDIS_MAX_QUEUE_SIZE` | Orchestrator does not talk to Redis directly |
| Logging & Observability | `LOG_LEVEL`, `LOG_AUTH`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `GRAFANA_*` | Python side currently exposes only `DEBUG`/`DEBUG_LOG_PATH` |
| Runtime Paths | `MAIFARM_ROOT`, `MAIFARM_VAR_ROOT`, `TMUX_TMPDIR`, `TRUSTED_PROXIES` | Consider mapping critical ones (`TMUX_TMPDIR`) into orchestrator when required |
| Feature Flags | `ENABLE_RATE_LIMIT`, `ENABLE_PYTHON_ORCHESTRATOR_PROXY`, `USE_V2_SERVICES` | Need central registry to avoid drift |
| Dashboard/Vite | `VITE_API_URL`, `VITE_WS_URL`, `ANALYZE`, `USE_CDN` | Browser-only; no parity required |

## Orchestrator `AppSettings`

`apps/orchestrator/settings.py` loads configuration via `pydantic.BaseSettings`. Any upper-case variant of those fields (e.g. `APP_NAME`, `DATABASE_URL`, `REDIS_URL`, `ALLOWED_ORIGINS`) will override the defaults even though they do not appear in direct `os.environ` calls. Keep this in mind when adding or renaming env vars.

## Recommendations

1. **Add cross-runtime aliases**:
   - Export `MAIFARM_WORKSPACE` alongside `MAIBARN_ROOT` whenever the API launches Python agents.
   - Map `NODE_MEMORY_PER_AGENT` to existing Node-side capacity controls (or drop if unused).
2. **Unify logging knobs**: Update orchestrator logging to respect `LOG_LEVEL` / `LOG_DIR`, deprecating `DEBUG` and `DEBUG_LOG_PATH` for consistency.
3. **Document agent runtime variables**: Extend `CLAUDE.md` (Agent Launch section) with the `AGENT_*` and `SESSION_NAME` variables so operations understands they must be injected at launch.
4. **Sync `.env.example` and `.env.development`**: Ensure shared variables (`AI_PROVIDER`, `MAIBARN_ROOT`, etc.) and orchestrator-only knobs have defaults or comments in both files.
5. **Add parity test**: Introduce a smoke test (Node or Python) that asserts required shared keys are present before booting both runtimes (e.g., fail fast if `AI_PROVIDER` or `MAIFARM_WORKSPACE` missing).

Tracking these gaps prevents configuration drift between the orchestrator and the main Node services.
