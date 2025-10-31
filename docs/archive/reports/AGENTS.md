# AGENTS.md

Guidance for Codex agents working inside the MaiFarm repository. Read this alongside `README.md`, `CLAUDE.md`, and project-specific docs under `docs/`.

## Quick Orientation
- MaiFarm is a TypeScript multi-agent orchestration platform with a React (Vite) frontend and an Express backend sharing `apps/shared/` types.
- Core services rely on PostgreSQL, Redis, and tmux-backed terminal sessions; most scripts assume Node.js 18+.
- Frontend code lives in `apps/dashboard/src/`; backend logic in `apps/api/src/`; shared utilities and schemas sit in `apps/shared/`.
- Automated setup scripts live under `scripts/`; operations assets reside in `ops/` (deployment, infrastructure, Docker, Nginx).

## Environment & Setup
- Preferred bootstrap: `npm run setup:all` (installs dependencies, provisions Postgres + Redis, runs migrations).
- Alternative manual flow: `npm install`, copy `.env.example` to `.env.development`, then run targeted setup commands (see `CLAUDE.md`).
- Python helpers: `poetry install` (installs dependencies for `scripts/python`; install Poetry via `brew install poetry`).
- Development entry points:
  - `npm run start` for full stack (uses `scripts/startup.sh`, performs dependency checks).
  - `npm run dev` for hot reload (frontend on port 3000, backend on 4567, WebSocket on 4567).
- Keep `BYPASS_AUTH=true` in local `.env.development` for agent-driven testing when authentication is not under test.

## Everyday Commands
```bash
npm run lint          # ESLint with project rules
npm run typecheck     # TypeScript strict mode
npm run build         # Production bundles
npm test              # Jest + integration suites
npm run test:e2e      # Cypress headless E2E
npm run test:coverage # Coverage report for server + client
```
- Use targeted scripts from `CLAUDE.md` for specialty suites (Barn, provider integrations, performance, security, accessibility).
- For orchestrating agent swarms, prefer `python scripts/python/orchestrator.py` with provider flags rather than ad-hoc shell loops.

## Repository Tour
- `apps/dashboard/` – React UI, Zustand stores, hooks, schemas, workers, and feature recipes.
- `apps/api/` – Express API, WebSocket gateways, orchestrators, database layer, security policies, monitoring.
- `apps/shared/` – Cross-layer types, validation helpers, and utility constants shared across apps.
- `scripts/` – Startup helpers, health checks, backup/restore automation, tmux diagnostics, and tooling entry points.
- `ops/` – Consolidated operations assets (deployment, infrastructure, Docker, PM2, Nginx, IaC).
- `docs/` – Architecture deep dives (`HARVEST_TERMINAL_ARCHITECTURE.md`), API migration guide, provider setup guides.
- `development/` – Examples, templates, and manual test fixtures for exploratory workflows.

## Implementation Guidelines
- Respect strict typing: leverage helpers in `apps/shared/` and `apps/shared/utils/farmHelpers.ts` (`getAgentsFromFarm`, `isAgentArray`, etc.) to avoid union-type pitfalls.
- Never reference filesystem paths directly; use services in `apps/api/src/security/pathConfig` or equivalent abstractions for isolation.
- When touching terminal streaming, prefer `TerminalStreamEnhanced` utilities and clean output with `ansiParser.cleanTerminalOutput()`.
- Maintain logging standards: include `LogCategory` as the first argument when using server loggers, and propagate correlation IDs where available.
- UI performance: favor memoization (`React.memo`, `useMemo`, `useCallback`), virtualized lists, and code splitting for heavy routes.
- Follow security best practices: sanitize user content with DOMPurify, enforce JWT/RBAC checks via existing middleware, and honor rate-limiting helpers.
- Keep migrations idempotent; if automation fails, fall back to the manual commands listed in `CLAUDE.md`.

## Testing & Validation
- Default validation sequence before opening PRs: `npm run lint`, `npm run typecheck`, `npm test`.
- Exercise orchestration flows with `node test-terminal-simple.js` or `node test-normalization.js` for quick regression checks.
- Critical integration verifications:
  - `npm test -- tests/integration/graceful-shutdown.test.ts`
  - `npm run test:providers` when editing provider adapters
  - `npm run test:performance` for hot paths in orchestrators
- Manual fixtures for exploratory debugging reside in `development/manual-tests/` (see the README in that folder for structure).
- Capture screenshots or terminal transcripts for UI/terminal changes to aid review.

## Troubleshooting Highlights
- If `npm run start` stalls, confirm ports 3000/4567 are free; the script will attempt to clean stale tmux sessions.
- Agent launches failing usually mean pending migrations; run the manual Postgres SQL files in `apps/api/src/database/migrations/`.
- WebSocket anomalies: inspect `/api/websocket-health`, review Socket.io server logs, and ensure reconnection logic in `websocketStore` is intact.
- Tmux session drift: run `./scripts/test-pipe-pane.sh` and inspect sessions under `farm-<id>` using the `TMUX_TMPDIR=/tmp` helpers.
- Redis connection errors (`Socket already opened`) often clear after verifying connection state checks in Redis clients.

## Collaboration Etiquette
- Do not overwrite or revert changes authored by others unless explicitly instructed.
- Keep documentation in sync when altering workflows, scripts, or developer experience.
- Surface open questions or risks in PR descriptions; favor incremental, well-tested commits over large unreviewed drops.
- Log significant decisions or architectural changes in `docs/` or project ADRs if they exist.

Stay aligned with existing MaiFarm practices and coordinated agent workflows to keep the farm healthy.
