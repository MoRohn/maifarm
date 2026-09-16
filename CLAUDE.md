# CLAUDE.md

Guidance for Claude Code when working with this repository.

## Quick Reference

### Prerequisites
- **Node.js**: 18+ | **PostgreSQL**: 15+ | **Redis**: 6.2+ | **Python**: 3.9+ | **tmux**: 3.0+

### Critical Rules
- ✅ Always use `LogCategory` as first logger parameter: `logger.info(LogCategory.TERMINAL, 'msg')`
- ✅ Broadcast agents BEFORE database save (race condition fix)
- ✅ Never write to main codebase from farm outputs (use `maibarn/`)
- ✅ Use `TMUX_TMPDIR=/tmp` for cross-process tmux visibility
- ✅ Email verification is DISABLED - users login without verification
- ⚠️ Never modify .pbxproj files (iOS compatibility)
- ⚠️ Prefer editing existing files over creating new ones
- ⚠️ Never create *.md files unless explicitly requested

### File Structure
```
apps/api/src/          # Backend (Express + TypeScript ESM, port 4567)
apps/dashboard/src/    # Frontend (React 18 + Vite, port 3000)
apps/shared/types/     # Shared types
cli/                   # CLI tool
scripts/python/        # Python orchestrators
scripts/<category>/    # setup, dev, db, deploy, diagnostics, testing, maintenance, xcode, demo
tests/manual/          # Ad-hoc scripted tests (not run by Jest)
maibarn/               # Isolated runtime storage (NOT in git)
```

### Path Aliases (Frontend)
`@/` → `apps/dashboard/src/` | `@components/` | `@services/` | `@hooks/` | `@types/` | `@utils/` | `@store/`

---

## Common Commands

```bash
# Development
npm run start              # Start full stack (recommended)
npm run setup:all          # Complete automated setup
npm run setup:doctor       # Diagnose setup issues
npm run typecheck          # TypeScript checking
npm test                   # Run all tests

# Farm CLI (install: ./install-farm-command.sh)
farm                       # Open dashboard UI
farm create "name"         # Create new farm
farm quick "task"          # 5-minute quick task
farm wild "goal"           # GoWild autonomous mode

# Debugging
curl -s http://localhost:4567/api/farms | jq
TMUX_TMPDIR=/tmp tmux list-sessions
npm run db:health

# Fixes
curl -X POST http://localhost:4567/api/farms/:id/recover
npm run db:health:fix
lsof -ti:4567 | xargs kill -9
```

---

## Execution Modes

| Mode | Duration | Agents | Command | Use Case |
|------|----------|--------|---------|----------|
| **Quick Task** | 15 min | 2 (XenoSync min) | `farm quick "task"` | Bug fixes, reviews |
| **Farm** | 2 hours (default) | 2-10 | `farm create "name" --agents 3` | Features, refactoring |
| **GoWild** | 1.5 hours | 3-20 | `farm wild "goal"` | Research, exploration |

---

## Critical Pitfalls

1. **Agent Registration Timing** - Broadcast agents BEFORE database save (`UnifiedFarmLaunchOrchestrator.ts:348-358`)

2. **Logger Usage** - Always include LogCategory: `logger.info(LogCategory.TERMINAL, 'msg')`

3. **Harvest Collection** - Only trigger via `ShutdownCoordinator`, never directly from BarnCollectionService

4. **Tmux Sessions** - Use `TMUX_TMPDIR=/tmp`, format: `${sessionName}:${windowTarget}.${paneIndex}`

5. **File Isolation** - All farm outputs go to `maibarn/`, use `pathConfig` and `fileManager` services

6. **WebSocket Events** - Use `broadcastWithAck()` for critical events (farm:created, agent:registered)

7. **Migration 000** - Runs WITHOUT transaction wrapper, existence checks must run outside transactions

8. **JSONB Arrays** - Explicitly type for PostgreSQL: `const arr: Array<{id: string, ...}> = []`

---

## Architecture

### Tech Stack
- Frontend: React 18 + TypeScript + Vite + Zustand
- Backend: Express + TypeScript ESM + Socket.io
- Database: PostgreSQL (pool: 20) + Redis
- Ports: Frontend (3000), Backend (4567), PostgreSQL (5432), Redis (6379)

### Security Isolation
```
maibarn/                  # Quarantine zone for farm outputs
├── workspaces/<farm-id>/ # ONE shared workspace per farm (all agents collaborate)
├── harvests/             # Collected outputs
├── terminals/            # Terminal logs
└── barn/items/           # Shared resources
```

### Key Services
```typescript
// Core orchestration
apps/api/src/services/UnifiedFarmLaunchOrchestrator.ts  // Farm creation
apps/api/src/services/shutdownCoordinator.ts            // Graceful shutdown
apps/api/src/services/farmRecoveryService.ts            // Auto-recovery (every 2 min)

// Terminal streaming
apps/api/src/services/UnifiedTerminalStreamService.ts   // 10ms flush, circuit breaker
apps/api/src/utils/terminalCleaner.ts                   // Output cleaning

// Python orchestrators
scripts/python/orchestrator.py                          // Multi-agent launcher
```

### Farm Status Flow
`idle → launching → running/active → completed/failed`

### WebSocket Events
- Farm: `farm:created`, `farm:status`, `farm:creation-progress`
- Agent: `agent:updated`, `agent:status`, `agent:registered`
- Harvest: `harvest:started`, `harvest:progress`, `harvest:completed`
- Terminal: `terminal:output`, `terminal:joined`

---

## AI Providers

```bash
# .env.development
AI_PROVIDER=claude        # Options: claude, openai, gpt_oss, ollama
ANTHROPIC_API_KEY=...     # Claude
OPENAI_API_KEY=...        # OpenAI
OLLAMA_HOST=http://localhost:11434  # Ollama
```

| Provider | Cost | Privacy | Setup |
|----------|------|---------|-------|
| Claude | API | Cloud | `ANTHROPIC_API_KEY` |
| OpenAI | API | Cloud | `OPENAI_API_KEY` |
| GPT-OSS | Free | Private | `./scripts/setup/setup-gpt-oss-models.sh` |
| Ollama | Free | Private | Local install |

---

## Blerbz Plugins (Inference Intelligence)

MaiFarm integrates [blerbz-plugins](https://github.com/Blerbz/blerbz-plugins) for confidence scoring, auto-continuation, and multi-agent planning.

### Plugins Included

| Plugin | Description | Skills |
|--------|-------------|--------|
| **inference-confidenz** | Real-time confidence scoring (0-99%) | `/inference-confidenz:status`, `:configure` |
| **inference-continuez** | Auto-continue based on confidence threshold | `/inference-continuez:continuez`, `:confidence` |
| **inference-planz** | Multi-agent research/survey/plan workflow | `/inference-planz:run <prompt>`, `:status` |

### Configuration

Plugins are configured via `OrchestratorConfig` in `scripts/python/orchestrator.py`:

```python
plugins_enabled: bool = True
confidenz_enabled: bool = True
continuez_enabled: bool = True
continuez_threshold: int = 80  # 0-99, auto-continue if >= threshold
planz_enabled: bool = False    # Enable for GoWild pre-planning
```

### Mode-Specific Defaults

| Mode | Confidence Threshold | Planz Enabled |
|------|---------------------|---------------|
| Quick Task | 85% | No |
| Farm/Harvest | 80% | No |
| GoWild | 60% | Yes (pre-launch survey) |

### Upgrade Plugins

```bash
npm run plugins:update       # Update from GitHub (preserves local changes)
npm run plugins:check        # Check for updates without applying
npm run plugins:version      # Show current version info
./scripts/maintenance/update-blerbz-plugins.sh --force  # Force update (discard local changes)
```

### Confidence Data Flow

1. Python orchestrator parses confidence from agent output (`CZ 87%` or heuristic)
2. Scores written to `maibarn/coordination/agent_<idx>_confidence.json`
3. Farm summary in `maibarn/coordination/confidence_summary.json`
4. Backend reads coordination files and broadcasts via WebSocket

### Key Files

```
blerbz-plugins/                 # Plugin source (upgradable from GitHub)
├── inference-confidenz/        # Confidence scoring
├── inference-continuez/        # Auto-continuation
└── inference-planz/            # Planning workflow

scripts/python/orchestrator.py  # Confidence parsing (lines 1488-1631)
scripts/maintenance/update-blerbz-plugins.sh # Upgrade script
```

---

## Authentication

**Dual modes**: Passwordless (email-only) and Password-based.

**Email verification is DISABLED** - users login immediately after registration.

Key files:
- `apps/api/src/api/auth.ts` - Endpoints with error codes
- `apps/api/src/services/userAccountService.ts` - Verification check removed (line 246)
- `apps/dashboard/src/components/Auth/EnhancedLogin.tsx` - Login/register form

Error codes: `EMAIL_EXISTS`, `USER_NOT_FOUND`, `INVALID_CREDENTIALS`, `VALIDATION_ERROR`

---

## Emergency Recovery

### Complete Reset
```bash
npm run setup:clean && pkill -f "maifarm|tmux"
rm -rf maibarn/ node_modules/.vite
dropdb maifarm_dev && createdb maifarm_dev
redis-cli FLUSHALL
npm run setup:all && npm run start
```

### Targeted Fixes
```bash
# Database
npm run db:health:fix
dropdb maifarm_dev && createdb maifarm_dev && npm run start

# Ports
lsof -ti:4567 | xargs kill -9
lsof -ti:3000 | xargs kill -9

# Stuck farms
TMUX_TMPDIR=/tmp tmux kill-session -t farm-<id>
curl -X POST http://localhost:4567/api/farms/<id>/recover
psql maifarm_dev -c "UPDATE farms SET status='completed' WHERE status='running';"

# Redis
brew services restart redis  # macOS
redis-cli PING               # Test (should return PONG)

# Zombies
ps aux | grep claude | grep -v grep | awk '{print $2}' | xargs kill -9
```

---

## Troubleshooting

### Common Issues
| Issue | Solution |
|-------|----------|
| Port in use | `npm run start` auto-kills, or `lsof -ti:PORT \| xargs kill -9` |
| WebSocket issues | Check port 4567, CORS settings |
| Database errors | Check PostgreSQL running, verify `.env` credentials |
| Tmux not visible | Use `TMUX_TMPDIR=/tmp` prefix |
| Terminal no output | Check pipe-pane setup, session exists |
| Agents failing fast | Health monitor: 30s interval, 2min timeout |
| Claude hangs at `quote>` | Fixed with `shlex.quote()` in orchestrator.py |
| Farm stuck | `POST /api/farms/:id/recover` or auto-recovery (2 min) |
| Unknown agents | Agent broadcast now BEFORE database save |
| Logger undefined | Must include LogCategory as first parameter |
| farms.agents empty | Use typed array, RETURNING clause verification |
| Login fails | Email verification disabled; check error codes in console |

### Type System
- `Farm.agents` can be `Agent[]` or `string[]` - use `getAgentsFromFarm()`, `isAgentArray()` helpers
- Import from `apps/shared/types/unified.ts` when possible

---

## Production Deployment

```bash
cp .env.example .env.production
npm run build
npm run migrate:prod
pm2 start ecosystem.config.js --env production
```

Docker: `docker-compose -f docker-compose.production.yml up -d`

---

## Performance Expectations

| Metric | Target |
|--------|--------|
| API GET | < 100ms |
| API POST | < 500ms |
| Terminal latency | < 50ms |
| WebSocket latency | < 100ms |
| DB simple query | < 10ms |
| Startup time | 10-15s |

Health indicators:
- ✅ Healthy: API < 100ms, DB < 50ms, Redis PING < 10ms
- ⚠️ Degraded: API > 500ms, errors 1-5%
- 🚨 Unhealthy: Services down, errors > 10%
