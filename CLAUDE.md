# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ Current Codebase State (January 2025)

**Branch**: `chore/local-cleanup-maifarm`
**Status**: Major codebase reorganization in progress

**Key Changes in Progress**:
- ✅ Monorepo structure consolidated with `apps/` directory
- ✅ Backend moved: `server/` → `apps/api/src/`
- ✅ Frontend moved: `src/` → `apps/dashboard/src/`
- ✅ Many files showing as renamed (R) or renamed-modified (RM) in git
- ✅ Documentation consolidation (many `.md` files removed/archived)
- ✅ Migration system updated (new: `044_event_outbox_and_dlq.sql`)

**Working with this branch**:
- All file paths in this guide use the NEW structure (`apps/api/`, `apps/dashboard/`)
- If you encounter "file not found", the file may have been moved or removed
- Use `Glob` or `Grep` tools to locate files if path seems incorrect
- Check git status for context on specific file changes

---

## 🚨 Critical Pitfalls to Avoid

**Read this section before making any changes to prevent common mistakes:**

1. **Agent Registration Timing** ⚠️ CRITICAL
   - ALWAYS broadcast agents BEFORE database save
   - Location: `UnifiedFarmLaunchOrchestrator.ts:348-358`
   - Why: Frontend must receive agent info before terminal output arrives
   - Never broadcast agents after database operations (causes race conditions)

2. **Logger Usage** ⚠️ CRITICAL
   - ALWAYS include `LogCategory` as first parameter
   - ✅ Correct: `logger.info(LogCategory.TERMINAL, 'Message')`
   - ❌ Wrong: `logger.info('[ServiceName] Message')` (causes 'undefined' in logs)

3. **Harvest Collection Timing** ⚠️ CRITICAL
   - ONLY trigger harvest collection via `ShutdownCoordinator`
   - Never call from `BarnCollectionService` or `ProactiveCollectionEngine` directly
   - Premature collection causes incomplete harvests

4. **Tmux Session Management** ⚠️ CRITICAL
   - ALWAYS use `TMUX_TMPDIR=/tmp` for cross-process session visibility
   - Use `detectWindowTarget()` to determine window name (XenoSync uses 'agents', standard uses '0')
   - Format: `${sessionName}:${windowTarget}.${paneIndex}`

5. **File Operations & Isolation** ⚠️ CRITICAL
   - NEVER write directly to main codebase from farm outputs
   - ALWAYS use isolated `maibarn/` storage
   - ALWAYS use `pathConfig` and `fileManager` services for file operations

6. **WebSocket Event Delivery** ⚠️ CRITICAL
   - Use `broadcastWithAck()` for critical events requiring confirmation
   - Standard `emit()` has no delivery guarantees
   - Critical events: farm:created, agent:registered, harvest:completed

7. **Database Migration 000** ⚠️ CRITICAL
   - Migration 000 runs WITHOUT transaction wrapper
   - Contains existence checks that must run outside transactions
   - Never add table reference checks inside migration 000 transactions

8. **File Creation Policy** ⚠️ IMPORTANT
   - ALWAYS prefer editing existing files over creating new ones
   - NEVER create documentation files (*.md, README) unless explicitly requested
   - Only create files when absolutely necessary for the task

9. **JSONB Array Population** ⚠️ CRITICAL (Bug #9 Fix - 2025-01-31)
   - ALWAYS use explicit TypeScript typing for arrays that will be JSON-serialized to PostgreSQL JSONB
   - Location: `UnifiedFarmLaunchOrchestrator.ts:365-453`
   - Build arrays during database transaction loops (not after)
   - Include error handling for JSON.stringify operations
   - Use RETURNING clauses to verify UPDATE operations succeeded
   - ✅ Correct: `const arr: Array<{id: string, ...}> = []; ... arr.push(data);`
   - ❌ Wrong: `const arr = []; ... arr.push(data);` (TypeScript may infer wrong type)

---

## Quick Reference (Most Common Commands)

### Daily Development
```bash
npm run start       # Start development (recommended - handles process management)
npm run dev         # Alternative: hot-reload dev server
npm run typecheck   # TypeScript type checking
npm test            # Run all tests
npm run lint        # ESLint code quality checks
```

### Debugging & Monitoring
```bash
# Check system status
curl -s http://localhost:4567/api/farms | jq '.'                    # All farms
curl -s http://localhost:4567/api/websocket-health                   # WebSocket health
npm run db:health                                                    # Database health

# Tmux session management
TMUX_TMPDIR=/tmp tmux list-sessions                                  # List all sessions
TMUX_TMPDIR=/tmp tmux list-panes -t farm-<id>:agents                # List farm panes
TMUX_TMPDIR=/tmp tmux kill-session -t farm-<id>                     # Kill farm session

# Terminal streaming
curl -s http://localhost:4567/api/terminal-health/health             # Overall health
curl -s http://localhost:4567/api/terminal-health/metrics            # Performance metrics
```

### Common Fixes
```bash
# Farm issues
curl -X POST http://localhost:4567/api/farms/:id/recover             # Recover stuck farm
curl -X POST http://localhost:4567/api/farms/:id/harvest             # Force harvest

# Database issues
npm run db:fix                                                       # Fix database issues
npm run db:fix:validate                                              # Validate database

# Kill orphaned processes
TMUX_TMPDIR=/tmp tmux kill-session -t farm-<id>                     # Kill tmux session
lsof -ti:4567 | xargs kill -9                                       # Kill port 4567
```

### Farm Command Structure
```bash
# MaiFarm provides two interfaces:
farm              # Web Dashboard (http://localhost:3000)
farm cli          # Command-line interface

# Most Used CLI Commands
farm cli create <name>     # Create new farm
farm cli list              # List all farms
farm cli watch <id>        # Watch farm progress
farm cli harvest <id>      # Harvest results
farm cli quick "task"      # 5-minute sprint
farm cli wild "goal"       # Autonomous mode

# For complete CLI documentation, run:
farm cli help
```

---

## Quick Setup & Running
```bash
# First-time setup (PostgreSQL, Redis, dependencies)
npm run setup:all   # Complete automated setup
npm run setup       # Alternative setup command

# Start development (recommended - handles process management)
npm run start       # Uses ./scripts/startup.sh, checks dependencies
npm run dev         # Alternative: hot-reload (client port 3000, server port 4567)

# Individual setup commands
npm run setup:postgres  # PostgreSQL setup only
npm run setup:doctor    # Verify system dependencies
npm run setup:clean     # Clean setup (removes existing data)

# With environment variables
NODE_ENV=development BYPASS_AUTH=true PORT=4567 npm run dev
```

## Essential Commands

### Code Quality
```bash
npm run lint         # ESLint
npm run typecheck    # TypeScript type checking
npm run format       # Prettier formatting
npm run build        # Production build
```

### Testing
```bash
npm test                      # Run all tests
npm test -- path/to/test.ts   # Run single test file
npm run test:server           # Server-specific tests
npm run test:integration      # Integration tests only
npm run test:e2e              # Cypress E2E tests (run)
npm run test:e2e:open         # Cypress E2E tests (UI)
npm run test:coverage         # Coverage report
npm run test:watch            # Watch mode for development

# Specialized testing
npm run test:barn             # Barn-specific tests
npm run test:barn:integration # Barn integration tests
npm run test:providers        # All AI provider tests
npm run test:openai           # OpenAI integration tests
npm run test:playwright       # Playwright tests
npm run test:accessibility    # A11y tests
npm run test:security         # Security vulnerability scans
npm run test:performance      # Performance benchmarks

# Test graceful shutdown (critical for harvest collection)
npm test -- tests/integration/graceful-shutdown.test.ts

# Test terminal isolation and WebSocket events
node test-terminal-simple.js     # Basic terminal join test
node test-normalization.js       # Agent ID normalization test
open test-terminal-socketio.html # Full browser-based test suite
```

### Production Commands
```bash
# Backup and restore
./scripts/backup-automation.sh       # Full backup
./scripts/restore-backup.sh latest   # Restore from latest backup

# PM2 process management
pm2 start ecosystem.config.js --env production
pm2 reload ecosystem.config.js --env production
pm2 status

# Production validation
./scripts/production-validation.sh   # Comprehensive health checks
```

### Troubleshooting Scripts
```bash
# Test tmux pipe-pane with XenoSync sessions
./scripts/test-pipe-pane.sh

# Check tmux sessions and windows
TMUX_TMPDIR=/tmp tmux list-sessions
TMUX_TMPDIR=/tmp tmux list-windows -t farm-<id>
TMUX_TMPDIR=/tmp tmux list-panes -t farm-<id>:agents

# Kill orphaned tmux sessions
TMUX_TMPDIR=/tmp tmux kill-session -t farm-<id>

# Debug WebSocket connections
curl -s http://localhost:4567/api/websocket-health

# Check farm status
curl -s http://localhost:4567/api/farms | jq '.'

# Force harvest collection
curl -X POST http://localhost:4567/api/farms/<id>/harvest

# Manually run database migrations (if auto-migration fails)
export PGPASSWORD=maifarm123
/opt/homebrew/Cellar/postgresql@15/15.13/bin/psql -U maifarm -d maifarm_dev -f apps/api/src/database/migrations/001_core_schema.sql
/opt/homebrew/Cellar/postgresql@15/15.13/bin/psql -U maifarm -d maifarm_dev -f apps/api/src/database/migrations/002_monitoring_analytics.sql
/opt/homebrew/Cellar/postgresql@15/15.13/bin/psql -U maifarm -d maifarm_dev -f apps/api/src/database/migrations/003_harvest_workflow.sql
/opt/homebrew/Cellar/postgresql@15/15.13/bin/psql -U maifarm -d maifarm_dev -f apps/api/src/database/migrations/004_security_api.sql
```

### Multi-Agent Orchestration
```bash
# Launch multiple Claude Code agents
python scripts/python/orchestrator.py -n 5 -p "Fix all TypeScript errors"
python scripts/python/orchestrator.py -n 3 --prompt-file feature.yaml
python scripts/python/orchestrator.py -n 3 -p "Build feature" --fast-launch  # Skip stagger delays

# With different AI providers
AI_PROVIDER=openai python scripts/python/orchestrator.py -n 3 -p "Build feature"
```

## High-Level Architecture

MaiFarm is a TypeScript-based multi-agent orchestration system for managing collaborative AI development teams.

### Monorepo Structure

The codebase is organized as a monorepo with clear separation of concerns:

```
maifarm/
├── apps/
│   ├── api/              # Backend API server (formerly server/)
│   │   └── src/
│   │       ├── api/      # REST endpoints
│   │       ├── services/ # Business logic
│   │       ├── database/ # Migrations and models
│   │       ├── websocket/# WebSocket handlers
│   │       └── ...
│   ├── dashboard/        # Frontend React app (formerly src/)
│   │   └── src/
│   │       ├── components/
│   │       ├── services/
│   │       └── ...
│   └── shared/           # Shared types and utilities
├── maibarn/              # Isolated runtime storage (NOT in git)
│   ├── workspaces/       # Farm workspaces
│   ├── harvests/         # Collected outputs
│   ├── terminals/        # Terminal logs
│   └── barn/items/       # Shared resources
└── scripts/              # Python orchestrators and utilities
```

**IMPORTANT**: `maibarn/` is isolated storage created at runtime and is NOT part of the git repository. It's listed in `.gitignore` to prevent accidental commits of agent outputs.

### Core System Design
- **Frontend**: React 18 + TypeScript + Vite (port 3000) → Proxies to backend
- **Backend**: Express + TypeScript with ESM modules (port 4567)
- **WebSocket**: Socket.io for real-time bidirectional communication
- **Database**: PostgreSQL (primary) + Redis (caching/sessions)
- **State Management**: Zustand stores (farmStore, agentStore, websocketStore)
- **Module System**: ESM with `"type": "module"` in package.json

### Security Isolation Architecture

**CRITICAL**: All farm outputs are isolated to prevent codebase contamination.

```
maifarm/                    # Main codebase (protected)
└── maibarn/               # Isolated storage (quarantine zone)
    ├── coordination/      # Agent coordination files
    ├── harvests/         # Harvest collection
    ├── workspaces/       # Farm workspaces (ONE per farm, shared by ALL agents)
    │   └── <farm-id>/    # Shared workspace for all agents in this farm
    │       ├── barn/     # Symlink to Barn items (shared resources)
    │       ├── src/      # Shared source code
    │       ├── docs/     # Shared documentation
    │       └── .agents/  # Agent tracking markers
    ├── terminals/        # Terminal output logs
    └── barn/items/       # Shared resources accessible to all farms
```

- **WORKSPACE SHARING**: Each farm has ONE workspace shared by ALL agents (not per-agent workspaces)
- **BARN ACCESS**: Each workspace has automatic access to Barn contents via symlink
- **Path Validation**: `apps/api/src/config/paths.ts` enforces isolation
- **File Operations**: Always use `pathConfig` and `fileManager` services
- **Legacy Migration**: `/tmp/claude_coordination/` migrated to `maibarn/coordination/`

### Graceful Shutdown System

**All modes implement 30-second graceful shutdown before timeout:**

- **Quick Task**: Fixed 5 minutes (300000ms) - NOT configurable
- **Farm Mode**: User-configurable timeout (default 1 hour)
- **GoWild Mode**: User-configurable timeout (default 30 minutes)

```typescript
// Key files:
apps/api/src/services/shutdownCoordinator.ts   // Centralized shutdown orchestration
apps/api/src/constants/timing.ts               // QUICK_TASK_TIMEOUT = 300000
apps/api/src/services/harvestFileCollector.ts  // Retry logic for file collection
```

**Important**: Farm/GoWild pass timeout in seconds to shutdownCoordinator, which converts to ms internally.

### Terminal Streaming Architecture

**Unified Terminal Streaming System** - Production-grade terminal output capture and delivery:

```typescript
// Core Services
apps/api/src/services/UnifiedTerminalStreamService.ts  // Main streaming service (10ms flush)
apps/api/src/services/terminalStreamService.ts         // Legacy service (10ms flush)
apps/api/src/websocket/unifiedTerminalHandlers.ts      // WebSocket handlers
apps/api/src/utils/terminalCleaner.ts                  // Output cleaning utility

// Integration Points
apps/api/src/services/UnifiedFarmLaunchOrchestrator.ts // Farm launch integration
apps/api/src/api/terminal-health.ts                    // Health monitoring API
```

**Architecture Features**:
- **Sub-10ms Latency**: Flush interval optimized to 10ms (~100fps) for perceived real-time streaming
- **Zero-Delay Broadcasting**: Streams immediately to WebSocket with minimal buffering (10 lines)
- **Circuit Breaker Pattern**: Automatic error recovery with exponential backoff (5 failures = 60s timeout)
- **Chokidar File Watching**: Real-time file change detection with zero polling delay
- **Health Monitoring**: 30-second interval health checks with performance metrics (latency <50ms target)
- **Enhanced Output Cleaning**: Removes ANSI codes, duplicate keystrokes, control characters, UI chrome, orchestrator debug messages
- **System Message Filtering**: Filters out `[Farm...]`, `[DEBUG]`, `INFO:orchestrator`, `[tmux]` messages

**Terminal Output Cleaning Pipeline**:

The `terminalCleaner` utility processes raw tmux output through 9 stages:

1. **Strip ANSI Escape Sequences**: Remove CSI, OSC, SGR codes, cursor control
2. **Strip Claude Code UI Chrome**: Remove headers, dividers, repeated prompts, system messages
3. **Expand Backspaces**: Simulate terminal behavior for \b characters
4. **Fix Duplicate Keystrokes**: Convert "eecho" → "echo", "cclear" → "clear", "ccd" → "cd"
5. **Normalize Line Endings**: Convert \r\n and \r to \n
6. **Process Carriage Returns**: Handle terminal overwrites from \r without \n
7. **Filter Shell Prompts**: Remove command echoes, timestamps, usernames, shell artifacts
8. **Remove Duplicate Lines**: Deduplicate consecutive identical lines from screen redraws
9. **Trim Empty Lines**: Optional whitespace normalization

```typescript
// Usage in UnifiedTerminalStreamService
import { cleanTerminalOutput } from '../utils/terminalCleaner';

private cleanOutput(content: string): string {
  return cleanTerminalOutput(content, {
    preserveColor: false,           // Remove all color codes
    normalizeLineEndings: true,     // Normalize to \n
    trimEmpty: false                // Keep empty lines for formatting
  });
}
```

**Tmux Integration Details**:
- Pane targeting: `${sessionName}:${windowTarget}.${agentIndex}` format
  - XenoSync uses 'agents' window, standard uses '0' window
  - Window detection via `detectWindowTarget()` helper
- Waits for tmux session creation before setting up pipe-pane
- Streams output via WebSocket events: `terminal:output`
- Fallback to capture-pane if pipe-pane fails
- TMUX_TMPDIR=/tmp required for cross-process session visibility

**Health Monitoring Endpoints**:
- `GET /api/terminal-health/health` - Overall system health
- `GET /api/terminal-health/metrics` - Detailed performance metrics
- `GET /api/terminal-health/health/farm/:farmId` - Farm-specific health
- `POST /api/terminal-health/health/reset/:farmId/:agentId` - Manual circuit breaker reset

**Performance Metrics**:
- Target latency: <50ms (excellent), <100ms (good), <200ms (fair)
- Target error rate: <5% (healthy), <20% (degraded), >20% (unhealthy)
- Target success rate: >99.9% (excellent), >99% (good), >95% (fair)

### Agent Health & Recovery System

Lenient health monitoring to prevent premature termination:

```typescript
apps/api/src/services/agentHealthMonitor.ts    // Health checks (30s interval, 2min timeout)
apps/api/src/services/agentRecoveryService.ts  // Auto-restart failed agents
```

**Health Check Settings**:
- Heartbeat interval: 30 seconds (not 5s)
- Heartbeat timeout: 2 minutes (not 15s)
- Failure threshold: 5 attempts (not 3)
- Activity timeout: 5 minutes (not 30s)
- Max recovery attempts: 3 per agent (prevents endless loops)
- Farm timeout check: Stops monitoring agents after farm timeout exceeded

### Claude CLI Launch Issues & Fixes

**Common Problems**:
1. **Hanging at quote> prompt**: Fixed by proper shell escaping with `shlex.quote()`
2. **API key not found**: Ensure ANTHROPIC_API_KEY in .env.development
3. **Tmux pane not created**: Session monitoring checks every 100ms for fast detection

```python
# orchestrator.py launch command (fixed):
claude --dangerously-skip-permissions -p {shlex.quote(prompt)}
```

### Agent Naming System

Farm-themed agent names are generated automatically:

```typescript
apps/api/src/utils/farmAgentNames.ts     // Farm animal name generator
// Returns names like "Bessie the Cow", "Wilbur the Pig"
// Agent numbering starts from 1, not 0 (Agent 1, Agent 2, etc.)
```

### Key Orchestration Files

```typescript
// Core orchestration
apps/api/src/services/OrchestratorService.ts    // Tmux session management
apps/api/src/services/farmManager.ts            // Farm lifecycle & timeouts
apps/api/src/services/quickTaskService.ts       // Quick Task implementation
apps/api/src/services/goWildManager.ts          // GoWild autonomous mode

// Python orchestrators
scripts/python/orchestrator.py                  // Multi-agent launcher (main)
scripts/python/multi_claude.py                  // Claude-specific multi-agent
scripts/python/multi_qwen.py                    // Qwen-specific orchestrator
scripts/python/llm_proxy.py                     // LLM proxy server

// Production services
apps/api/src/services/sessionManager.ts         // Session lifecycle management
apps/api/src/services/terminalStreamEnhanced.ts // Robust terminal streaming
apps/api/src/services/memoryManager.ts          // Memory leak prevention
apps/api/src/services/sessionCleanupService.ts  // Orphaned resource cleanup
apps/api/src/monitoring/productionMonitor.ts    // Real-time production monitoring
apps/api/src/security/securityHardening.ts      // Security middleware
```

### WebSocket Event System

**Production-Grade Event Architecture** with guaranteed delivery and state recovery:

```typescript
// Core Events (apps/api/src/types/api.ts)
'agent:updated', 'agent:status'           // Agent state changes
'farm:status', 'farm:created'              // Farm operations
'farm:creation-started'                    // Farm creation initiated
'farm:creation-progress'                   // Progressive creation (6 phases)
'farm:preflight-complete'                  // Preflight validation results
'farm:creation-complete'                   // Farm ready
'farm:launch-progress'                     // Launch phases (7 stages)
'harvest:started', 'harvest:progress'      // Harvest with progress tracking
'harvest:completed'                        // Harvest ready with stats
'terminal:output', 'terminal:joined'       // Terminal streaming
'farm:recovery-started'                    // Auto-recovery initiated
'farm:recovery-completed'                  // Recovery success
'request:state-sync'                       // Client requests state sync
'state:synced'                             // Server sends full state
'ack:event'                                // Event acknowledgment
```

**Guaranteed Delivery Pattern** (apps/api/src/websocket/UnifiedWebSocketManager.ts:404-567):
```typescript
// Use for critical events requiring confirmation
const result = await unifiedWebSocketManager.broadcastWithAck(
  'farm:created',
  { farm: farmData },
  { farmId, retryAttempts: 3, timeout: 5000 }
);
// Returns: { success: true, delivered: 5, failed: 0, details: [...] }
```

**State Recovery on Reconnection**:
- Client emits `request:state-sync` with optional `farmIds`
- Server fetches complete farm/agent state from database
- Server responds with state snapshot including sequence numbers
- Client reconciles local state automatically

### AI Provider Configuration

```bash
# .env configuration
AI_PROVIDER=claude        # Options: claude, openai

# Claude (200K context)
CLAUDE_API_KEY=your-anthropic-key
CLAUDE_MODEL=claude-3-sonnet-20240229

# OpenAI GPT-4 (128K context)
OPENAI_API_KEY=your-key
OPENAI_MAX_CONTEXT=128000
OPENAI_MODEL=gpt-4-turbo-preview
```

### Path Aliases (tsconfig.json & vite.config.ts)

```typescript
'@/'           // apps/dashboard/src/
'@components/' // apps/dashboard/src/components/
'@services/'   // apps/dashboard/src/services/
'@hooks/'      // apps/dashboard/src/hooks/
'@types/'      // apps/dashboard/src/types/
'@utils/'      // apps/dashboard/src/utils/
'@store/'      // apps/dashboard/src/store/
```

### Database Configuration

- **Migration System**: Uses `UnifiedMigrationRunner` at `apps/api/src/database/unifiedMigrationRunner.ts`
  - Auto-runs on startup via `apps/api/src/database/connection.ts`
  - Migration 000 runs without transaction wrapper (contains existence checks)
  - Migrations tracked in `schema_migrations` table
  - Migrations located at `apps/api/src/database/migrations/`
- **Connection Management**:
  - PostgreSQL pool size: 20 connections
  - Redis connection with automatic reconnection strategy
  - Health checks with 1-second timeouts
- **Core tables**: farms, agents, harvests, seeds, token_usage, api_keys, farm_lifecycle_events, security_audits, barn_sync_log, metrics, alerts, tasks

### Test Configurations

- **Jest**: `tools/testing/jest.config.cjs` (unified), `tools/testing/jest.config.server.cjs` (API tests)
- **Coverage thresholds**: 80% for branches, functions, lines, statements
- **Mock strategy**: API mocks in `apps/api/src/tests/__mocks__/`, MSW for integration tests
- **Test environment**: jsdom for frontend, node for API tests
- **Test locations**: `apps/api/src/tests/` for API tests, `apps/dashboard/src/tests/` for frontend tests

### Port Configuration

- **Frontend**: 3000 (Vite dev server, proxies to backend)
- **Backend**: 4567 (Express + Socket.io)
- **PostgreSQL**: 5432
- **Redis**: 6379
- **LLM Proxy**: 8001
- **Ollama**: 11434

## Critical Development Patterns

### Farm Status Flow
```
idle → launching → running/active → completed/failed
```

### Component Layout Rules

- **DashboardLayout** wraps all authenticated pages
- **Never add ThemedHeader** to individual page components (causes duplicates)
- **Z-index hierarchy**: Header (z-100) > Sidebar (z-20) > Content (z-10)

### Farm Launch Optimizations

- **Fast-launch mode**: `--fast-launch` flag skips stagger delays
- **Parallel operations**: Workspace and YAML creation simultaneously
- **Optimistic UI**: Farm status set to 'active' immediately
- **Session pre-mapping**: Maps farm to session before launch for instant UI
- **Result**: Launch time reduced from 5-8s to <2s (perceived <500ms)

### WebSocket Reliability

- **Auto-reconnection**: Exponential backoff with jitter
- **Message buffering**: Queues during disconnections
- **Health monitoring**: Regular heartbeat checks
- **Fallback**: HTTP polling when WebSocket fails
- **Singleton**: Connection reuse pattern

### Harvest Terminal Views

- **Grid View**: Multiple terminals in grid layout
- **Stacked View**: Vertically stacked terminals with fixed height (h-48)
- **Single View**: One terminal at a time with agent selector
- **Terminal themes**: Matrix, Classic, Ocean, Dracula, etc.

### Development Environment

```bash
# Required environment variables (.env.development)
PORT=4567
BYPASS_AUTH=true           # Skip auth for development
NODE_ENV=development
DB_NAME=maifarm_dev
DB_USER=maifarm
DB_PASSWORD=maifarm123
AI_PROVIDER=claude         # Options: claude, openai, qwen, ollama
API_KEY_ENCRYPTION_KEY=your-encryption-key  # For API key storage
```

## Important Implementation Notes

### File Operations
- **ALWAYS prefer editing existing files** over creating new ones
- **NEVER create documentation files** (*.md, README) unless explicitly requested
- **Use pathConfig and fileManager services** for all file operations
- **Never write directly to main codebase** from harvest outputs

### Critical Service Patterns

#### Agent Registration Timing (CRITICAL)
- **UnifiedFarmLaunchOrchestrator.ts:348-358**: Agent registration broadcast happens BEFORE database save
- This ensures frontend receives agent info BEFORE terminal output arrives
- **Never** broadcast agents after database operations - causes race conditions

#### Preflight Validation (Production-Grade)
- **preflightValidationService.ts**: Run 9 validation checks before farm creation
- Validates: farm name, database, API keys, tmux, workspace, agent count, resources, duplicates, timeout
- Returns: `{ success, canProceed, checks, errors, warnings }`
- Integrated at farms.ts:428-465 - fails fast before resource allocation

#### Harvest Collection Progress
- **harvestService.ts**: Use `updateProgress(harvestId, progress)` for real-time tracking
- Phases: scanning → collecting → validating → packaging → finalizing
- Emits `harvest:progress` events with file counts and bytes transferred
- Always call `updateProgress()` during collection phases

#### Farm Recovery (Auto-Healing)
- **farmRecoveryService.ts**: Monitors farms every 2 minutes for issues
- Auto-recovers: stuck farms (10min no activity), orphaned farms (no tmux), long-running (>24h)
- API endpoints: `POST /api/farms/:id/recover`, `GET /api/farms/:id/health`
- Recovery actions: cleanup, kill-tmux, force-complete, reset-agents

#### Collection Timing
- **BarnCollectionService**: Has `stopCollection(workspaceId, skipFinalCollection)` - use skipFinalCollection=true to prevent premature collection
- **ProactiveCollectionEngine**: Idle detection should be disabled - collections only via ShutdownCoordinator
- **ShutdownCoordinator**: The ONLY place that should trigger harvest collection at farm timeout

#### Logger Usage
```typescript
// CORRECT: Include LogCategory as first parameter
logger.info(LogCategory.TERMINAL, `Message here`);

// WRONG: Will cause 'undefined' in logs
logger.info(`[ServiceName] Message here`);
```

#### Tmux Session Management
- Always use `TMUX_TMPDIR=/tmp` for consistent session visibility
- Window detection is critical for XenoSync compatibility
- Use `detectWindowTarget()` to determine if using 'agents' or '0' window
- Pane references must use correct window: `${sessionName}:${windowTarget}.${paneIndex}`

### XenoSync Integration (v2.1+)

XenoSync provides an alternative Python-based orchestration engine:

- **Session Naming**: Uses standard `farm-{farmId}` convention (NOT `xenosync-hive`)
- **Activation**: Set `USE_XENOSYNC=true` or `GO_WILD_USE_XENOSYNC=true`
- **Requirements**: Claude provider only, minimum 2 agents
- **Launchers**: `xenosync-maifarm-launcher.py` for Harvest Terminal compatibility
- **Session Management**: Properly integrated with MaiFarm's tmux health monitoring

### Terminal Output Cleaning

Terminal output is cleaned to remove control characters and special formatting:

```typescript
// apps/dashboard/src/utils/ansiParser.ts - cleanTerminalOutput()
// Removes: Box drawing characters (⏵◆✻✽·╭─╮│╰╯)
// Removes: ANSI escape sequences and control characters
// Preserves: Regular text and basic formatting
```

### WebSocket Test Echo Handler

For testing terminal isolation and agent ID normalization:

```typescript
// apps/api/src/websocket/socketServer.ts
// Test echo handler registered early in connection flow
// Only processes events with 'testMarker' field
// Normalizes string agent IDs to numbers
// Routes isolation test events to appropriate rooms
```

## Production Deployment

### Quick Production Setup
```bash
# 1. Environment setup
cp .env.example .env.production
# Edit .env.production with production values

# 2. Build application
npm run build

# 3. Database setup
npm run migrate:up

# 4. Start with PM2
pm2 start ecosystem.config.js --env production

# 5. Setup Nginx (optional)
sudo cp nginx/maifarm.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/maifarm.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 6. Setup automated backups
sudo ./scripts/backup-cron.sh

# 7. Validate deployment
./scripts/production-validation.sh
```

### Docker Production Deployment
```bash
# Build and run with Docker
docker build -f Dockerfile.production -t maifarm:latest .
docker run -d -p 4567:4567 --env-file .env.production maifarm:latest

# Or use Docker Compose
docker-compose -f docker-compose.production.yml up -d
```

**IMPORTANT**: See [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md) for comprehensive production deployment instructions including:
- System requirements and hardware specifications
- Environment configuration and secrets management
- Database setup and optimization
- Redis configuration for high availability
- PM2 cluster mode configuration
- Nginx reverse proxy setup
- Performance tuning and optimization
- Monitoring and alerting setup
- Security hardening procedures
- Disaster recovery planning

### Common Troubleshooting

1. **Port already in use**: `npm run start` handles killing existing processes
2. **WebSocket issues**: Check port 4567 accessibility and CORS
3. **Database errors**: Verify PostgreSQL running and `.env` credentials
4. **TypeScript errors**: Run `npm run typecheck`
5. **Vite dev server**: Configured for port 3000 (not default 5173)
6. **File isolation errors**: Use `pathConfig` services, not direct paths
7. **Graceful shutdown issues**: Check `shutdownCoordinator` logs
8. **Timeout bugs**: Farm/GoWild pass seconds to shutdownCoordinator (fixed v2.0)
9. **PWA reload loop**: Service Worker disabled in vite.config.ts
10. **Terminal not showing output**: Check tmux pipe-pane setup and session existence
11. **Agent names incorrect**: Farm animal names used by default, numbering starts from 1
12. **Agents failing quickly**: Health monitor uses 30s interval, 2min timeout (not aggressive)
13. **Claude hanging at quote>**: Fixed with proper shell escaping in orchestrator.py
14. **Auto-recovery**: Failed agents restart automatically via agentRecoveryService
15. **XenoSync sessions not visible**: Ensure using `farm-{farmId}` naming, not `xenosync-hive`
16. **Pipe-pane failures**: XenoSync uses 'agents' window - fixed with window detection
17. **Premature collection**: Collection should only happen at farm timeout via ShutdownCoordinator
18. **Logger undefined errors**: Ensure all logger calls include LogCategory as first parameter
19. **WebSocket test events not echoing**: Test echo handler must be registered early in connection flow before terminal handlers
20. **Terminal output has special characters or duplicate keystrokes**: Fixed by `terminalCleaner.cleanTerminalOutput()` which removes ANSI codes, duplicate keystrokes (eecho→echo), control characters, and UI chrome. Integrated into UnifiedTerminalStreamService.
21. **Session naming inconsistencies**: Use SessionManager for normalized session lookups
22. **Terminal streaming failures**: TerminalStreamEnhanced provides automatic retry and recovery
23. **Migration failures**: Check migration 000 doesn't reference non-existent tables in transactions
24. **Redis "Socket already opened"**: Connection state checked before reconnection attempts
25. **Farm launch hanging**: Usually caused by database tables not existing - run migrations manually if needed
26. **Unknown agents in terminal**: Agent registration now broadcasts BEFORE database save (UnifiedFarmLaunchOrchestrator.ts:348-358)
27. **Stuck farms**: Use recovery endpoint `POST /api/farms/:id/recover` or wait for automatic recovery (runs every 2 minutes)
28. **Preflight validation failures**: Check API keys, tmux, workspace permissions, and database connectivity
29. **WebSocket events not delivered**: Critical events use `broadcastWithAck()` with automatic retry (3 attempts, 5s timeout)
30. **State lost on reconnect**: Client should emit `request:state-sync` to fetch complete farm/agent state
31. **farms.agents JSONB array empty**: Fixed in UnifiedFarmLaunchOrchestrator.ts:365-453 - Uses explicitly typed array, builds during agent INSERT loop, includes comprehensive error handling and verification with RETURNING clause. Verify with: `SELECT jsonb_array_length(agents) FROM farms WHERE id='...'`

### Type System Challenges

The codebase uses both local types and unified types (`apps/shared/types/unified.ts`):

- **Farm.agents union type**: Can be `Agent[]` or `string[]` - use `farmHelpers.ts` utility functions
- **Resource properties**: Unified types use flat numbers, components may expect nested objects
- **Metrics mismatch**: Components and unified types have different metric structures
- **Helper functions**: Always use `getAgentsFromFarm()`, `getAgentCount()`, `isAgentArray()` for type-safe access
- **FarmConfig duplicates**: Watch for duplicate/contradictory property definitions
- **Type imports**: Import from unified types when possible to avoid circular dependencies

### Error Handling & Validation

- **Always validate inputs** before processing (use zod schemas when available)
- **Use structured error types** from `apps/api/src/types/errors.ts`
- **Include correlation IDs** in error logs for debugging
- **Never expose sensitive data** in error messages

### Database Best Practices

- **Transaction usage**: Use transactions for multi-table operations
- **Connection pooling**: Reuse connections from pool (size: 20)
- **Query optimization**: Use indexed columns in WHERE clauses
- **Migration strategy**: Migrations auto-run on startup
- **Error recovery**: Implement retry logic for transient failures
- **Prepared statements**: Use parameterized queries to prevent SQL injection

### State Management Patterns

#### Zustand Stores
- **farmStore**: Farm lifecycle and status management
- **agentStore**: Agent state and health tracking
- **websocketStore**: WebSocket connection and events
- **harvestStore**: Harvest collection and status
- **Store updates**: Always use immutable updates with spread operator
- **Async actions**: Handle loading/error states properly

#### WebSocket State Sync
- **Optimistic updates**: Update UI immediately, reconcile with server
- **Event batching**: Batch multiple updates to reduce re-renders
- **Connection recovery**: Restore subscriptions after reconnection
- **State reconciliation**: Handle conflicts between local and server state

### Performance Optimization Patterns

- **React.memo**: Use for expensive component renders
- **useMemo/useCallback**: Prevent unnecessary recalculations
- **Virtual scrolling**: Use react-window for long lists
- **Code splitting**: Lazy load routes and heavy components
- **Image optimization**: Use WebP format, lazy loading
- **Bundle size**: Monitor with webpack-bundle-analyzer

### Security Patterns

- **Input sanitization**: Use DOMPurify for user-generated content
- **XSS prevention**: Escape HTML in dynamic content
- **CSRF protection**: Include CSRF tokens in forms
- **API authentication**: JWT tokens with refresh mechanism
- **File uploads**: Validate MIME types and file sizes
- **Rate limiting**: Implement per-endpoint rate limits

## Production-Grade Enhancements (v2.5+)

### Progressive Farm Creation Pipeline

6-phase creation with real-time feedback (apps/api/src/api/farms.ts:417-675):

1. **Preflight** (5%) - Validation checks via preflightValidationService
2. **YAML Generation** (25%) - Agent configuration
3. **Workspace Setup** (50%) - Directory and file creation
4. **Orchestrator Ready** (75%) - Launch preparation
5. **Database Committed** (90%) - Persistence
6. **Creation Complete** (100%) - Success

**Events**: `farm:creation-started`, `farm:creation-progress`, `farm:preflight-complete`, `farm:creation-complete`

### Guaranteed Event Delivery

**WebSocket Delivery with ACK** (apps/api/src/websocket/UnifiedWebSocketManager.ts:404-567):
- Automatic retry: Up to 3 attempts with exponential backoff (500ms × attempt)
- Timeout: 5 seconds per attempt
- Sequence numbers: For event ordering guarantee
- Event IDs: For deduplication tracking
- Delivery tracking: Per-socket acknowledgment status

**Critical Events Using broadcastWithAck()**:
- `farm:created`, `farm:launched`, `agent:registered`
- `harvest:started`, `harvest:completed`
- `terminal:joined`, `farm:status` (critical updates)

### Farm Health & Recovery

**Automatic Health Monitoring** (apps/api/src/services/farmRecoveryService.ts):
- Runs every 2 minutes checking for stuck/orphaned farms
- Detects: No activity (10min), missing tmux session, long-running (>24h)
- Auto-recovery actions: cleanup, kill-tmux, force-complete, reset-agents
- **API Endpoints**:
  - `GET /api/farms/:id/health` - Health status and recovery suggestions
  - `POST /api/farms/:id/recover` - Manual recovery trigger

**Health Check Details**:
```typescript
{
  isStuck: boolean,           // No activity for 10 minutes
  isOrphaned: boolean,        // No tmux session but status=running
  issues: string[],           // List of detected problems
  tmuxSessionExists: boolean,
  runningTime: number,        // Total seconds since creation
  lastActivity: Date
}
```

### Harvest Collection Progress

**Real-time Progress Tracking** (apps/api/src/services/harvestService.ts:99-188):
- Phases: scanning → collecting → validating → packaging → finalizing
- Metrics: filesScanned, filesCollected, totalBytes, errors
- **Event**: `harvest:progress` with real-time file counts
- **Completion**: `harvest:completed` with final stats (artifact count, total bytes)

**Usage**:
```typescript
await harvestService.updateProgress(harvestId, {
  phase: 'collecting',
  filesCollected: 45,
  filesScanned: 50,
  totalBytes: 1024000,
  currentFile: 'src/main.ts'
});
```

### Performance Metrics Achieved

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Terminal Latency | 50-100ms | 10ms | 80-90% faster |
| Agent Registration | Race condition | Immediate | 100% guaranteed |
| Farm Creation Perceived | ~2000ms | <500ms | 75% faster |
| Terminal Output Quality | 60-70% | 95% | +35 points |
| WebSocket Delivery | ~95% | >99.9% | +4.9 points |
| Event Ordering | None | Guaranteed | Sequence numbers |
| Recovery MTTR | Manual | <30s | Automatic |

## v2.5 Production Enhancement Patterns

**For comprehensive v2.5 documentation, see**:
- `PRODUCTION_ENHANCEMENTS_V2.5.md` - Full technical specification (6,000+ lines)
- `V2.5_ENHANCEMENTS_SUMMARY.md` - Executive summary
- `MULTI_AGENT_TERMINAL_FIX.md` - Terminal coordination deep-dive (1,000+ lines)
- `QUICKSTART_ENHANCEMENTS.md` - Installation and verification (800+ lines)

### Event Outbox Pattern (Guaranteed Delivery)

**Core Service**: `apps/api/src/services/EventOutboxService.ts` (500 lines)

Use for mission-critical events that must be delivered exactly once:

```typescript
import { eventOutboxService } from '../services/EventOutboxService';

// Publish with idempotency (prevents duplicates)
const eventId = await eventOutboxService.publishIdempotent(
  'farm:created',
  { farmId: 'xxx', name: 'My Farm', agentCount: 5 },
  {
    aggregateId: 'xxx',        // For deduplication
    aggregateType: 'farm',     // Entity type
    priority: 1,               // 1-10 (1 = highest)
    maxAttempts: 3,            // Retry attempts
    targetRoom: 'farm:xxx'     // WebSocket room
  }
);
```

**When to Use**:
- Critical farm/agent lifecycle events
- Events that affect billing or audit trail
- Events that must maintain ordering
- Events that need retry with exponential backoff

**Database Schema**: Migration `044_event_outbox_and_dlq.sql` creates:
- `event_outbox` - Pending events with retry tracking
- `event_dead_letter_queue` - Permanently failed events
- `event_delivery_log` - Delivery audit trail
- Automatic DLQ movement via PostgreSQL trigger

### Multi-Agent Terminal Coordination

**Core Service**: `apps/api/src/services/MultiAgentTerminalCoordinator.ts` (600 lines)

Guarantees 100% agent visibility by using file-based streaming:

```typescript
import { multiAgentTerminalCoordinator } from '../services/MultiAgentTerminalCoordinator';

// Register farm with all agents (in UnifiedFarmLaunchOrchestrator)
await multiAgentTerminalCoordinator.registerFarm(
  farmId,
  sessionName,
  agentCount,
  agentNames  // ['Bessie the Cow', 'Wilbur the Pig', ...]
);
```

**Architecture**:
- Uses chokidar file watchers on `/var/maibarn/terminals/{farmId}/agent-{N}.log`
- Health monitoring every 5 seconds with auto-recovery
- Works independently of tmux (fallback when pipe-pane fails)
- Broadcasts to WebSocket room: `farm:{farmId}`
- Cleans ANSI codes, duplicate keystrokes, UI chrome

**Integration**: Already integrated in `UnifiedFarmLaunchOrchestrator.ts:361-377`

### OpenTelemetry Distributed Tracing

**Core Service**: `apps/api/src/services/OpenTelemetryTracing.ts` (400 lines)

Add distributed tracing to any operation:

```typescript
import { openTelemetryTracing } from '../services/OpenTelemetryTracing';

// Automatic span lifecycle with traced()
const result = await openTelemetryTracing.traced(
  'farm.harvest',
  async (span) => {
    span.setAttribute('harvest.id', harvestId);
    const files = await collectFiles();
    span.setAttribute('harvest.fileCount', files.length);
    return files;
  },
  { kind: 'internal' }
);
```

**Database Schema**: Spans persisted to `telemetry_spans` table with trace ID, parent-child relationships, start/end times, duration, status codes, and attributes.

**Performance Monitoring API**: 9 endpoints at `/api/metrics/*`

### Enhanced RBAC & JWT Authentication

**Core Middleware**: `apps/api/src/middleware/enhancedRBAC.ts` (700 lines)

Role-based access control with 5-level hierarchy:

```typescript
import { verifyToken, requireRole, requirePermission, Role, Permission } from '../middleware/enhancedRBAC';

// Apply to routes
router.post('/farms',
  verifyToken,                              // JWT validation
  requirePermission(Permission.FARM_CREATE), // Check permission
  async (req, res) => {
    const farm = await createFarm(req.user.id, req.body);
    res.json(farm);
  }
);
```

**Audit Logging**: All auth events logged to `security_audits` table
**Development Bypass**: Set `BYPASS_AUTH=true` for development (grants SUPERADMIN)

### Performance Metrics API

**API Routes**: `apps/api/src/api/performance-metrics.ts` (600 lines)

9 monitoring endpoints for production observability:

```bash
GET /api/metrics/delivery        # Event delivery statistics
GET /api/metrics/performance     # Performance metrics with percentiles
GET /api/metrics/traces/:traceId # Distributed trace details
GET /api/metrics/errors          # Recent error spans
GET /api/metrics/terminals       # Multi-agent terminal coordination stats
GET /api/metrics/system          # System health and resource usage
GET /api/metrics/dashboard       # Comprehensive dashboard data
POST /api/metrics/outbox/retry   # Retry failed events
POST /api/metrics/cleanup        # Cleanup old telemetry data
```

**All endpoints require authentication**: `verifyToken` + `requirePermission(Permission.SYSTEM_MONITOR)`

### Frontend Real-time Progress Components

**Harvest Progress Tracker**: `apps/dashboard/src/components/Harvest/HarvestProgressTracker.tsx` (350 lines)

Real-time harvest collection visualization with 5-phase progress bar, live statistics, animated phase transitions, and error handling.

### Integration Tests

**Test Suite**: `apps/api/src/tests/integration/production-enhancements.test.ts` (600 lines)

21 comprehensive integration tests covering all v2.5 enhancements:

```bash
npm test -- apps/api/src/tests/integration/production-enhancements.test.ts
```

### Key Patterns Summary

1. **Guaranteed Delivery**: Use `EventOutboxService.publishIdempotent()` for critical events
2. **Terminal Visibility**: `MultiAgentTerminalCoordinator` ensures 100% agent visibility
3. **Observability**: Wrap operations with `openTelemetryTracing.traced()` for tracing
4. **Security**: Apply `verifyToken` + `requirePermission()` to all sensitive routes
5. **Monitoring**: Use `/api/metrics/*` endpoints for production monitoring
6. **Frontend**: Use `HarvestProgressTracker` for real-time progress visualization
7. **Testing**: Run integration test suite to verify all enhancements

---

## Additional Documentation

**Comprehensive Documentation Files**:
- `README.md` - Project overview and getting started
- `PRODUCTION_DEPLOYMENT.md` - Production deployment guide
- `PRODUCTION_ENHANCEMENTS_V2.5.md` - Full v2.5 technical specification
- `PRODUCTION_ENHANCEMENTS_SUMMARY.md` - Production enhancements summary
- `HARVEST_PAGE_FIXES_COMPLETE.md` - Terminal streaming and farm recovery fixes
- `LOGGING_STANDARDS.md` - Professional logging standards and best practices
- `LOGGING_UPGRADE_COMPLETE.md` - Production logging system implementation guide
- `QUICKSTART_ENHANCEMENTS.md` - v2.5 installation and verification
- `MULTI_AGENT_TERMINAL_FIX.md` - Terminal coordination deep-dive
- `V2.5_ENHANCEMENTS_SUMMARY.md` - Executive summary of v2.5 features
