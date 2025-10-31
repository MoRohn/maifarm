# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

### Quick Start
```bash
# First-time setup
npm run setup:all        # Complete automated setup (PostgreSQL, Redis, dependencies)

# Start development
npm run start            # Recommended - checks dependencies & starts app
npm run dev              # Alternative - hot-reload mode (client 3000, server 4567)

# With environment variables
NODE_ENV=development BYPASS_AUTH=true PORT=4567 npm run dev
```

### Testing
```bash
npm test                                         # All tests
npm test -- path/to/test.ts                     # Single test file
npm run test:unit                               # Unit tests only
npm run test:integration                        # Integration tests
npm run test:server                             # Server-specific tests
npm run test:coverage                           # Coverage report

# Test graceful shutdown (critical)
npm test -- tests/integration/graceful-shutdown.test.ts

# Test terminal streaming
./scripts/trigger-harvest-refresh.sh <farm-id>  # Generate test terminal output
```

### Code Quality
```bash
npm run lint                                    # ESLint
npm run typecheck                               # TypeScript checking
npm run format                                  # Prettier formatting
npm run build                                   # Production build
```

### Troubleshooting
```bash
# Check tmux sessions
TMUX_TMPDIR=/tmp tmux list-sessions
TMUX_TMPDIR=/tmp tmux kill-session -t farm-<id>
TMUX_TMPDIR=/tmp tmux capture-pane -t farm-<id>:agents.0 -p

# Database operations (if auto-migration fails)
export PGPASSWORD=maifarm123
/opt/homebrew/Cellar/postgresql@15/15.13/bin/psql -U maifarm -d maifarm_dev -f apps/api/src/database/migrations/001_core_schema.sql

# WebSocket health
curl -s http://localhost:4567/api/websocket-health

# Farm status
curl -s http://localhost:4567/api/farms | jq '.'

# Terminal logs
ls -la var/maibarn/terminals/<farm-id>/
tail -f var/maibarn/terminals/<farm-id>/agent-0.log
```


## High-Level Architecture

MaiFarm orchestrates teams of AI agents using a monorepo structure:

```
apps/
├── api/           # Express backend (TypeScript, ESM)
├── dashboard/     # React frontend (Vite)
└── shared/        # Cross-app types and utilities

scripts/python/    # Python orchestrators (Claude Code launcher)
var/maibarn/       # Isolated agent workspaces (quarantine)
```

### Core System Flow
1. **Frontend (port 3000)** → User initiates farm/task via React dashboard
2. **Backend API (port 4567)** → Express handles request, manages state
3. **Orchestrator** → Python launcher creates tmux sessions with Claude Code agents
4. **Agents** → Work in isolated `/var/maibarn/workspaces/<farm-id>/` directories
5. **Terminal Streaming** → tmux pipe-pane captures output to log files
6. **WebSocket** → Socket.io streams real-time updates to frontend
7. **Harvest Collection** → Graceful 30-second shutdown collects outputs

### Security Isolation
```
maifarm/                     # Protected codebase
└── var/maibarn/            # Isolated storage (quarantine)
    ├── workspaces/         # ONE workspace per farm (shared by agents)
    │   └── <farm-id>/
    ├── terminals/          # Real-time terminal logs
    │   └── <farm-id>/
    │       ├── agent-0.log
    │       └── agent-1.log
    └── harvests/           # Collected outputs
```

**Critical**: Agent outputs are isolated in `var/maibarn/` to prevent codebase contamination.

### Key Services & Patterns

#### Orchestration Services
- `apps/api/src/services/UnifiedFarmLaunchOrchestrator.ts` - Main orchestration with agent name generation
- `apps/api/src/services/OrchestratorService.ts` - Tmux session management
- `apps/api/src/services/farmManager.ts` - Farm lifecycle & timeouts
- `apps/api/src/services/shutdownCoordinator.ts` - Graceful shutdown orchestration
- `scripts/python/orchestrator.py` - Multi-agent Claude Code launcher with mock fallback

#### Terminal Streaming Pipeline (100% Operational)
- `apps/api/src/services/terminalStreamService.ts` - Manages pipe-pane capture
- `apps/api/src/services/terminalFileWatcherService.ts` - Watches log files and emits changes
- `apps/api/src/utils/terminalCleaner.ts` - Strips ANSI codes and cleans terminal output for WebSocket streaming
- `apps/api/src/websocket/terminalHandlers.ts` - WebSocket event handlers
- Session format: `farm-{farmId.substring(0,8)}`
- Environment: `TMUX_TMPDIR=/tmp` required for all tmux operations
- WebSocket events: `terminal:join`, `terminal:output`, `terminal:change`

**Terminal Output Cleaning**: The `terminalCleaner.ts` utility provides:
1. `stripAnsi()` - Removes ANSI escape sequences (colors, cursor movement, etc.)
2. `expandBackspaces()` - Processes backspace characters
3. `processCarriageReturns()` - Handles terminal overwrites (keeps bracketed content like `[PIPE-PANE]`)
4. `filterShellPrompts()` - Removes shell prompts and command echoes
5. `cleanTerminalOutput()` - Complete cleaning pipeline for display-ready output

#### Agent Naming System
Agents are assigned unique farm-themed names to ensure proper identification:
```typescript
// Fixed pool of agent names (apps/api/src/services/UnifiedFarmLaunchOrchestrator.ts)
const farmAgentNames = [
  'Bessie the Cow',      // Agent 0 (Lead)
  'Cluck the Chicken',   // Agent 1
  'Wilbur the Pig',      // Agent 2
  'Charlotte the Spider', // Agent 3
  'Babe the Sheep',      // Agent 4
  'Donald the Duck',     // Agent 5
  'Henrietta the Hen',   // Agent 6
  'Ferdinand the Bull',  // Agent 7
  'Peggy the Goat'       // Agent 8
];
```

#### Agent Health & Recovery
- Health check: 30s interval, 2min timeout (lenient to prevent premature kills)
- Auto-recovery: Failed agents restart automatically (max 3 attempts)
- Mock agent fallback: When API keys unavailable, uses `enhanced_mock_agent.py`

### Execution Modes & Timeouts
- **Quick Task**: Fixed 5 minutes, 2 agents (XenoSync requirement)
- **Farm/Harvest**: User-configurable timeout (default 1 hour), 3 agents default
- **GoWild**: User-configurable timeout (default 30 minutes), 5 agents default

All modes implement 30-second graceful shutdown before timeout.

**Critical Orchestrator Requirements**:
- The orchestrator MUST be launched with `--coordination-dir` argument pointing to `var/maibarn/coordination`
- Without this, the orchestrator cannot write status files and will fail silently
- The session name format must be consistent: `farm-{farmId.substring(0,8)}` for Quick Task, `farm-{farmId}` for others
- TMUX_TMPDIR=/tmp must be set in the environment for all tmux operations

### Database & State Management
- **PostgreSQL**: Primary storage with auto-migration on startup
- **Redis**: Caching and sessions (optional but recommended)
- **Zustand stores**: `farmStore`, `agentStore`, `websocketStore` for frontend state
- **WebSocket**: Real-time bidirectional updates via Socket.io

### Path Aliases
```typescript
// Frontend (apps/dashboard/tsconfig.json)
'@/'           → src/
'@components/' → src/components/
'@services/'   → src/services/
'@hooks/'      → src/hooks/
'@types/'      → src/types/
'@utils/'      → src/utils/
'@store/'      → src/store/
'@shared/'     → ../shared/

// Backend (apps/api/tsconfig.json)
'@/'       → src/
'@shared/' → ../../shared/
```

## Critical Development Patterns

### File Operations
- **ALWAYS use `pathConfig` and `fileManager` services** for file operations
- **NEVER write directly to main codebase** from harvest outputs
- **Workspace sharing**: Each farm has ONE workspace shared by ALL agents

### Terminal Streaming Setup
```bash
# Pipe-pane must be set up IMMEDIATELY after pane creation
tmux pipe-pane -t "$SESSION_NAME:agents.$PANE_INDEX" -o "cat >> $LOG_FILE"

# Critical timing: Set up pipe-pane BEFORE sending commands
sleep 0.1  # Small delay ensures pane is ready
tmux send-keys -t "$SESSION_NAME:agents.$PANE_INDEX" "command" Enter
```

### Logger Usage
```typescript
// CORRECT: Include LogCategory as first parameter
logger.info(LogCategory.TERMINAL, `Message here`);

// WRONG: Will cause 'undefined' in logs
logger.info(`[ServiceName] Message here`);
```

### Tmux Session Management
- **ALWAYS use `TMUX_TMPDIR=/tmp`** for consistent session visibility
- **Session naming**: `farm-{farmId.substring(0,8)}`
- **Pane creation sequence**:
  1. Create base pane (0)
  2. Split horizontally for pane 1
  3. Split pane 1 vertically for pane 2
  4. Continue splitting for additional panes
- **Window detection**: Use `detectWindowTarget()` for 'agents' vs '0' window
- **Pipe-pane timing**: Set up IMMEDIATELY after pane creation, before commands

### Type System Challenges
The codebase uses both local types and unified types:
- **Farm.agents union**: Can be `Agent[]` or `string[]` - use `farmHelpers.ts` utilities
- **Helper functions**: Always use `getAgentsFromFarm()`, `getAgentCount()`, `isAgentArray()`
- **Import from unified types** when possible to avoid circular dependencies

### WebSocket Reliability
- **Auto-reconnection**: Exponential backoff with jitter
- **Message buffering**: Queues during disconnections
- **Singleton pattern**: Connection reuse
- **Test echo handler**: Only processes events with 'testMarker' field
- **Room joining**: Frontend must join `farm-${farmId}` room for terminal updates

### Collection & Shutdown
- **ShutdownCoordinator** is the ONLY place that should trigger harvest collection
- **BarnCollectionService**: Use `skipFinalCollection=true` to prevent premature collection
- **ProactiveCollectionEngine**: Should be disabled - collections only via ShutdownCoordinator

## Common Issues & Solutions

### Claude CLI Launch Issues
```python
# Fixed command in orchestrator.py:
claude --dangerously-skip-permissions -p {shlex.quote(prompt)}

# Mock fallback when no API keys:
if not api_key:
    run_mock_agent(agent_index, agent_name, workspace_path, pane_index, session_name)
```

### Agent Name Duplication
- **Problem**: All agents showing same name (e.g., "Billy")
- **Solution**: UnifiedFarmLaunchOrchestrator generates unique names in YAML
- **Location**: `generateAgentNames()` method in UnifiedFarmLaunchOrchestrator.ts

### Terminal Not Showing Output
1. Check tmux pipe-pane setup timing (must be immediate)
2. Verify session existence with `TMUX_TMPDIR=/tmp tmux list-sessions`
3. Check log files in `var/maibarn/terminals/<farm-id>/`
4. Ensure WebSocket room is joined: `farm-${farmId}`
5. Test with `./scripts/trigger-harvest-refresh.sh <farm-id>`

### Empty Log Files (0 bytes)
- **Cause**: Pipe-pane not set up before command execution
- **Fix**: Set up pipe-pane immediately after pane creation
- **Test**: Use trigger-harvest-refresh.sh to generate test output

### Orchestrator Launch Failures ("No tmux server running")
- **Symptoms**: Farm status shows "failed", no tmux session created, no terminal logs, no orchestrator status file
- **Root Cause**: Missing `--coordination-dir` argument when spawning orchestrator
- **Fix**: Ensure `UnifiedFarmLaunchOrchestrator.ts` includes coordination dir in orchestrator args:
  ```typescript
  '--coordination-dir', path.join(pathConfig.getPath('MAIBARN_ROOT'), 'coordination')
  ```
- **Diagnosis**: Check for orchestrator status file: `var/maibarn/coordination/orchestrator_status_{farmId}.json`
- **If missing**: The orchestrator never started - check spawn() arguments and Python errors

### Logger Undefined Errors
Ensure all logger calls include LogCategory as first parameter

### Type Errors with Farm.agents
Use utility functions from `farmHelpers.ts` instead of direct access

### Database Migration Failures
Run migrations manually if auto-migration fails (see troubleshooting commands above)

### WebSocket Connection Issues
```javascript
// Check WebSocket health
curl http://localhost:4567/api/websocket-health

// Frontend must join room
socket.emit('terminal:join', { farmId });

// Backend emits to room
io.to(`farm-${farmId}`).emit('terminal:output', data);
```

## AI Provider Configuration

```bash
# .env.development
AI_PROVIDER=claude              # Options: claude, openai, qwen, ollama
ANTHROPIC_API_KEY=your-key      # Required for Claude agents
OPENAI_API_KEY=your-key         # For OpenAI provider

# Mock agents used when no API keys present
```

## Testing Terminal Streaming

```bash
# Generate test activity for a farm
./scripts/trigger-harvest-refresh.sh <farm-id>

# Watch terminal output in real-time
tail -f var/maibarn/terminals/<farm-id>/agent-0.log

# Test WebSocket file watcher
node scripts/websocket-file-watcher.cjs <farm-id>
```

## Production Deployment

```bash
# Docker deployment (recommended)
npm run docker:build:prod
npm run docker:prod:up

# Manual deployment
NODE_ENV=production npm run build
npm run start:prod

# PM2 process management
pm2 start ecosystem.config.js --env production

# Validation
./scripts/production-validation.sh
```

## Port Configuration
- Frontend: 3000 (Vite, proxies to backend)
- Backend: 4567 (Express + Socket.io)
- PostgreSQL: 5432
- Redis: 6379
- LLM Proxy: 8001
- Ollama: 11434

## Important Instruction Reminders
- Do what has been asked; nothing more, nothing less
- NEVER create files unless they're absolutely necessary for achieving your goal
- ALWAYS prefer editing an existing file to creating a new one
- NEVER proactively create documentation files (*.md) or README files unless explicitly requested
- Use existing services and patterns - don't reinvent the wheel
- Respect the workspace isolation boundary - agents work in var/maibarn/ only
- remember xenosync requires at least two agents, quick task mode must create 2 agents