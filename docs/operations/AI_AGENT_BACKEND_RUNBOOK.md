MaiFarm AI Agent Backend Runbook
How to Use This With Claude Code / Codex
	•	Who this is for: Any AI coding agent (Claude Code, “Codex” agent, etc.) working on the MaiFarm repo.
	•	Primary reference: The agent must always treat CLAUDE.md as the source of truth for architecture, critical pitfalls, and invariants.
	•	Order of operations:
	1	Phase 1 – Backend Stabilization & Core FixesUse this when the backend is obviously broken or only partially working.
	2	Phase 2 – Issue Sweep & HardeningUse this once core flows (farms, agents, terminal streaming, harvests, auth) are functioning end-to-end.
	3	Phase 3 – Performance & ObservabilityUse this once functionality and stability are solid and you want better performance + visibility.
	•	When to re-run phases:
	◦	If a later change introduces new backend breakage → go back to Phase 1.
	◦	If you fix major bugs or add new backend features → run Phase 2 again for a cleanup pass.
	◦	If you change anything affecting streaming, events, or resource usage → re-run Phase 3 focusing on performance/observability impacts.
	•	Frontend guidance:UI in apps/dashboard/ is mostly complete. Agents should avoid frontend changes unless required to fix a backend API / event contract mismatch.

Phase 1 – Backend Stabilization & Core Fixes
When to use:First pass after pulling the repo / current branch when backend is in a broken or partially working state.
Prompt to give the agent:
You are a senior TypeScript/Node backend engineer working on the MaiFarm monorepo.
	1	First step: Open and carefully read CLAUDE.md at the repo root and fully internalize the architecture, critical pitfalls, and development rules. Strictly follow:
	◦	CRITICAL sections (agent registration timing, logger usage with LogCategory, harvest collection via ShutdownCoordinator only, tmux session management with TMUX_TMPDIR=/tmp, file isolation via maibarn/, WebSocket broadcastWithAck for critical events, JSONB array population in UnifiedFarmLaunchOrchestrator.ts, migration 000 rules).
	◦	File creation policy (prefer editing existing files; do not create new .md docs unless explicitly asked).
	2	Scope & focus:
	◦	UI in apps/dashboard/ is mostly complete; do not change frontend unless absolutely required to fix a backend contract or event mismatch.
	◦	Focus on backend in apps/api/src/ (Express ESM, PostgreSQL, Redis, Socket.io) and shared types in apps/shared/types/.
	◦	Your goal is to make the backend production-grade, stable, and fully functional: farms can be created/launched, agents run, terminal streaming works, harvests are collected reliably, auth works, and WebSocket events are delivered with proper state sync.
	3	How to work:
	◦	Use Glob/Grep to locate implementations before editing (e.g., UnifiedFarmLaunchOrchestrator, terminal streaming services, shutdown coordinator, health/recovery services, AI engines, auth).
	◦	Work incrementally by feature area: identify failures, trace their root cause, propose a minimal fix, then implement it.
	◦	For each change:
	▪	Respect all CRITICAL Pitfalls in CLAUDE.md (no race conditions, no premature collection, correct logger usage, correct JSONB arrays, etc.).
	▪	Keep changes localized; avoid large refactors.
	▪	Use pathConfig and fileManager for file operations; never write farm outputs into the main codebase (use maibarn/ only).
	4	Validation & quality:
	◦	After each logical batch of fixes, run:
	▪	npm run typecheck
	▪	npm test (plus targeted integration tests where relevant)
	◦	Ensure passwordless auth flows, farm creation pipeline, terminal streaming, health/recovery endpoints, event ACKs, and AI provider selection all work as described in CLAUDE.md.
	◦	Add or update tests as needed to lock in fixes and prevent regressions.
Your final outcome should be a backend where all core flows described in CLAUDE.md run end-to-end without crashes, race conditions, or silent failures, with clear logging and passing tests.

Phase 2 – Issue Sweep & Hardening
When to use:After Phase 1 succeeds and core flows are working, to find and fix remaining defects, edge cases, and code smells that affect stability.
Prompt to give the agent:
You are the same senior TypeScript/Node backend engineer working on the MaiFarm monorepo.
Assume a first pass of backend fixes has already been completed using the guidance in CLAUDE.md. Your new goal is to systematically hunt down and resolve any remaining functional, stability, or integration issues so the app is robust in real-world use.
	1	Re-orient with CLAUDE.md:
	◦	Re-read it, focusing again on:
	▪	All CRITICAL Pitfalls, especially: agent registration timing; logger usage with LogCategory; harvest collection via ShutdownCoordinator only; tmux + TMUX_TMPDIR=/tmp; file isolation via maibarn/ + pathConfig/fileManager; WebSocket broadcastWithAck; JSONB arrays; migration 000 constraints.
	▪	File creation policy: do not create new .md docs; prefer editing existing files.
	2	Systematic backend health check (no major refactors):
	◦	Focus on apps/api/src/ and shared types; assume the UI is largely correct.
	◦	Use search tools to find:
	▪	Remaining TODOs/FIXMEs and obvious temporary hacks.
	▪	Any code still violating the critical patterns above.
	◦	Review in particular:
	▪	Farm lifecycle (creation, launch, timeout, shutdown, recovery).
	▪	Terminal streaming (tmux integration, UnifiedTerminalStreamService, cleaners).
	▪	Harvest collection (progress tracking, completion, error handling).
	▪	Auth (passwordless + password modes, error codes, email verification).
	▪	AI engine selection (Claude/OpenAI/GPT-OSS/Ollama) and configuration paths.
	3	Detect and fix remaining issues:For each issue you find:
	◦	Clearly identify the root cause and user-visible impact (e.g., stuck farms, missing terminal output, wrong statuses, undelivered events).
	◦	Implement the minimal, precise fix that:
	▪	Respects all CRITICAL rules in CLAUDE.md.
	▪	Keeps changes localized—no broad rewrites.
	▪	Uses existing helpers (pathConfig, fileManager, farm helpers, unified types).
	◦	Do not:
	▪	Trigger collection anywhere except via ShutdownCoordinator.
	▪	Break multi-provider AI engine support.
	4	Validation & regression protection:
	◦	Run:
	▪	npm run typecheck
	▪	npm test
	▪	Any relevant integration/e2e tests (passwordless flow, production enhancements, etc.).
	◦	Confirm that:
	▪	Farm creation → launch → run → shutdown → harvest → recovery flows all work end-to-end.
	▪	WebSocket state sync and request:state-sync behavior match CLAUDE.md.
	▪	Health and recovery services correctly detect and fix stuck/orphaned farms.
	▪	Terminal streaming is stable and cleaned output matches expectations.
Your final objective is to leave the backend in a state where no known major or recurring issues remain, core flows are reliable under normal and failure conditions, and tests enforce the critical invariants described in CLAUDE.md, without unnecessary refactoring or new documentation files.

Phase 3 – Performance & Observability
When to use:After Phase 2, when functionality and stability are solid, and you want better performance + better visibility into the system.
Prompt to give the agent:
You are a senior TypeScript/Node backend engineer working on the MaiFarm monorepo.
Assume two earlier passes have already:
	•	Fixed major backend functionality issues.
	•	Cleaned up remaining stability and integration bugs based on CLAUDE.md.
Your goal now is to optimize performance and strengthen observability of the existing backend, without major refactors.
	1	Re-read CLAUDE.md with a performance/observability lens:
	◦	Respect all CRITICAL Pitfalls (agent registration timing, logger LogCategory usage, harvest collection via ShutdownCoordinator only, tmux + TMUX_TMPDIR=/tmp, maibarn/ isolation, WebSocket broadcastWithAck for critical events, JSONB arrays, migration 000 constraints).
	◦	Follow the file policy: do not create new .md docs; prefer editing existing files.
	2	Targets (backend only: apps/api/src/ + shared types):Focus on:
	◦	Terminal streaming & WebSockets
	▪	Confirm UnifiedTerminalStreamService and related handlers use efficient intervals, batching, and terminalCleaner correctly.
	▪	Ensure critical events (farm:created, agent:registered, harvest:completed, etc.) consistently use broadcastWithAck() where required.
	▪	Look for performance pitfalls (tight loops, redundant queries, unbounded listeners, excessive logging).
	◦	Farm lifecycle & recovery
	▪	Verify timers, intervals, and health checks are not overly aggressive and do not cause unnecessary load.
	▪	Ensure recovery logic is efficient and avoids heavy repeated operations.
	◦	Database & Redis usage
	▪	Look for N+1 patterns, unnecessary round-trips, and missing indices on hot paths.
	▪	Confirm proper use of connection pooling and parameterized queries.
	◦	AI engine orchestration
	▪	Ensure engine selection/dispatch paths avoid redundant or expensive synchronous work in hot paths.
	3	Observability improvements:
	◦	Use existing logging and metrics patterns to:
	▪	Add or refine structured logs around key flows (farm creation/launch, terminal streaming, harvest collection, recovery).
	▪	Reduce noisy or redundant logs; keep logs high-signal and categorized via LogCategory.
	◦	Where appropriate, integrate or tidy hooks for:
	▪	Latency measurements (farm creation steps, terminal latency, WebSocket delivery).
	▪	Error and retry counts for WebSockets, terminal streaming, and farm recovery.
	◦	Ensure any existing OpenTelemetry/metrics hooks are correctly used and not duplicated.
	4	Guardrails:
	◦	Do not:
	▪	Rewrite core architectures (terminal streaming, farm lifecycle, AI engines) unless absolutely necessary for performance.
	▪	Change frontend code except where a backend contract/shape change is unavoidable.
	▪	Introduce new .md documentation files.
	◦	Do:
	▪	Keep changes small and directly tied to performance or observability.
	▪	Preserve all invariants and critical behaviors documented in CLAUDE.md.
	5	Validation:
	◦	Run:
	▪	npm run typecheck
	▪	npm test
	▪	Any existing integration tests related to production enhancements, performance, or health checks.
	◦	Confirm:
	▪	Terminal latency and WebSocket delivery behave as designed (low-latency streaming, reliable ACKs).
	▪	Farm creation/launch/shutdown/harvest/recovery flows remain correct and stable.
	▪	No new regressions or race conditions are introduced.
Your end state: the backend behaves as described in CLAUDE.md, but with tighter performance characteristics, clearer and more actionable observability (logs/metrics), and no added complexity or unnecessary refactors.