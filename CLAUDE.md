# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
/opt/homebrew/Cellar/postgresql@15/15.13/bin/psql -U maifarm -d maifarm_dev -f server/database/migrations/001_core_schema.sql
/opt/homebrew/Cellar/postgresql@15/15.13/bin/psql -U maifarm -d maifarm_dev -f server/database/migrations/002_monitoring_analytics.sql
/opt/homebrew/Cellar/postgresql@15/15.13/bin/psql -U maifarm -d maifarm_dev -f server/database/migrations/003_harvest_workflow.sql
/opt/homebrew/Cellar/postgresql@15/15.13/bin/psql -U maifarm -d maifarm_dev -f server/database/migrations/004_security_api.sql
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
- **Path Validation**: `server/config/paths.ts` enforces isolation
- **File Operations**: Always use `pathConfig` and `fileManager` services
- **Legacy Migration**: `/tmp/claude_coordination/` migrated to `maibarn/coordination/`

### Graceful Shutdown System

**All modes implement 30-second graceful shutdown before timeout:**

- **Quick Task**: Fixed 5 minutes (300000ms) - NOT configurable
- **Farm Mode**: User-configurable timeout (default 1 hour)
- **GoWild Mode**: User-configurable timeout (default 30 minutes)

```typescript
// Key files:
server/services/shutdownCoordinator.ts   // Centralized shutdown orchestration
server/constants/timing.ts               // QUICK_TASK_TIMEOUT = 300000
server/services/harvestFileCollector.ts  // Retry logic for file collection
```

**Important**: Farm/GoWild pass timeout in seconds to shutdownCoordinator, which converts to ms internally.

### Terminal Streaming Architecture

Real-time terminal output uses tmux pipe-pane for capture:

```typescript
server/services/terminalStreamService.ts  // Manages pipe-pane and file watching
server/services/terminalOutputWatcher.ts  // Watches for terminal output changes
server/websocket/terminalHandlers.ts      // WebSocket event handlers
```

**Key Details**:
- Pane targeting: `${sessionName}:${windowTarget}.${agentIndex}` format
  - XenoSync uses 'agents' window, standard uses '0' window
  - Window detection via `detectWindowTarget()` helper
- Waits for tmux session creation before setting up pipe-pane
- Streams output via WebSocket events: `terminal:output`
- Fallback to capture-pane if pipe-pane fails
- TMUX_TMPDIR=/tmp required for cross-process session visibility

### Agent Health & Recovery System

Lenient health monitoring to prevent premature termination:

```typescript
server/services/agentHealthMonitor.ts    // Health checks (30s interval, 2min timeout)
server/services/agentRecoveryService.ts  // Auto-restart failed agents
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
server/utils/farmAgentNames.ts           // Farm animal name generator
// Returns names like "Bessie the Cow", "Wilbur the Pig"
// Agent numbering starts from 1, not 0 (Agent 1, Agent 2, etc.)
```

### Key Orchestration Files

```typescript
// Core orchestration
server/services/OrchestratorService.ts    // Tmux session management
server/services/farmManager.ts            // Farm lifecycle & timeouts
server/services/quickTaskService.ts       // Quick Task implementation
server/services/goWildManager.ts          // GoWild autonomous mode

// Python orchestrators
scripts/python/orchestrator.py            // Multi-agent launcher (main)
scripts/python/multi_claude.py            // Claude-specific multi-agent
scripts/python/multi_qwen.py              // Qwen-specific orchestrator
llm_proxy.py                              // LLM proxy server

// Production services
server/services/sessionManager.ts         // Session lifecycle management
server/services/terminalStreamEnhanced.ts // Robust terminal streaming
server/services/memoryManager.ts          // Memory leak prevention
server/services/sessionCleanupService.ts  // Orphaned resource cleanup
server/monitoring/productionMonitor.ts    // Real-time production monitoring
server/security/securityHardening.ts      // Security middleware

### WebSocket Event System

```typescript
// Key events (server/types/api.ts):
'agent:updated', 'agent:status'      // Agent state changes
'farm:status', 'farm:created'         // Farm operations  
'metrics:update'                      // Real-time metrics
'harvest:ready', 'harvest:collected'  // Harvest operations
'task:progress', 'task:completed'     // Task updates
'terminal:output', 'terminal:joined'  // Terminal streaming
'agent:recovered'                      // Agent recovery events
```

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
'@/'           // src/
'@components/' // src/components/
'@services/'   // src/services/
'@hooks/'      // src/hooks/
'@types/'      // src/types/
'@utils/'      // src/utils/
'@store/'      // src/store/
```

### Database Configuration

- **Migration System**: Uses `UnifiedMigrationRunner` at `server/database/unifiedMigrationRunner.ts`
  - Auto-runs on startup via `server/database/connection.ts`
  - Migration 000 runs without transaction wrapper (contains existence checks)
  - Migrations tracked in `schema_migrations` table
- **Connection Management**:
  - PostgreSQL pool size: 20 connections
  - Redis connection with automatic reconnection strategy
  - Health checks with 1-second timeouts
- **Core tables**: farms, agents, harvests, seeds, token_usage, api_keys, farm_lifecycle_events, security_audits, barn_sync_log, metrics, alerts, tasks

### Test Configurations

- **Jest**: `tools/testing/jest.config.cjs` (unified), `tools/testing/jest.config.server.cjs` (server)
- **Coverage thresholds**: 80% for branches, functions, lines, statements
- **Mock strategy**: API mocks in `tests/__mocks__/`, MSW for integration tests
- **Test environment**: jsdom for frontend, node for server tests

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
// src/utils/ansiParser.ts - cleanTerminalOutput()
// Removes: Box drawing characters (⏵◆✻✽·╭─╮│╰╯)
// Removes: ANSI escape sequences and control characters
// Preserves: Regular text and basic formatting
```

### WebSocket Test Echo Handler

For testing terminal isolation and agent ID normalization:

```typescript
// server/websocket/socketServer.ts
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
20. **Terminal output has special characters**: Use `ansiParser.cleanTerminalOutput()` to remove box drawing and control characters
21. **Session naming inconsistencies**: Use SessionManager for normalized session lookups
22. **Terminal streaming failures**: TerminalStreamEnhanced provides automatic retry and recovery
23. **Migration failures**: Check migration 000 doesn't reference non-existent tables in transactions
24. **Redis "Socket already opened"**: Connection state checked before reconnection attempts
25. **Farm launch hanging**: Usually caused by database tables not existing - run migrations manually if needed

### Type System Challenges

The codebase uses both local types (`src/types/`) and unified types (`shared/types/unified.ts`):

- **Farm.agents union type**: Can be `Agent[]` or `string[]` - use `farmHelpers.ts` utility functions
- **Resource properties**: Unified types use flat numbers, components may expect nested objects
- **Metrics mismatch**: Components and unified types have different metric structures
- **Helper functions**: Always use `getAgentsFromFarm()`, `getAgentCount()`, `isAgentArray()` for type-safe access
- **FarmConfig duplicates**: Watch for duplicate/contradictory property definitions
- **Type imports**: Import from unified types when possible to avoid circular dependencies

### Error Handling & Validation

- **Always validate inputs** before processing (use zod schemas when available)
- **Use structured error types** from `server/types/errors.ts`
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