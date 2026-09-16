# MaiFarm Quick Reference Guide

## Directory Structure at a Glance

```
apps/api/src/
├── api/              → REST endpoints (50+ files)
├── services/         → Business logic (100+ files)
├── database/         → PostgreSQL + 40+ migrations
├── websocket/        → Socket.io real-time events
├── middleware/       → Auth, validation, rate limits
├── config/           → Centralized configuration
├── types/            → TypeScript definitions
└── utils/            → Shared utilities

apps/dashboard/       → React 18 + Vite frontend
apps/orchestrator/    → Python orchestration engine
maibarn/              → Runtime storage (NOT in git)
```

## Key Files to Know

### Core Architecture
- **index.ts** - Server entry point
- **config/index.ts** - Configuration validation
- **database/connection.ts** - PostgreSQL + Redis pools
- **types/api.ts** - Re-exports unified types
- **shared/types/unified.ts** - Master type definitions

### Farm Management
- **services/UnifiedFarmLaunchOrchestrator.ts** - 7-phase launch
- **services/unified/farmService.ts** - Farm lifecycle
- **services/farmHealthMonitor.ts** - Health monitoring
- **api/farms.ts** - Farm endpoints (50+ methods)

### Terminal Streaming
- **services/UnifiedTerminalStreamService.ts** - 10ms flush output
- **utils/terminalCleaner.ts** - 9-stage output cleaning
- **websocket/unifiedTerminalHandlers.ts** - WebSocket broadcasting

### Harvest & Collection
- **services/unified/harvestService.ts** - Collection pipeline
- **services/shutdownCoordinator.ts** - Graceful shutdown (30s)

### Agent Management
- **services/agentHealthMonitor.ts** - Health checks (30s interval)
- **services/agentRecoveryService.ts** - Auto-recovery

### Database
- **database/migrations/** - 40+ migrations
- **database/client.ts** - Connection pooling (20 connections)
- **database/unifiedMigrationRunner.ts** - Auto-migration

## Common Tasks

### Check System Health
```bash
# Overall health
curl -s http://localhost:4567/api/healthz | jq '.'

# Terminal streaming health
curl -s http://localhost:4567/api/terminal-health/health | jq '.'

# Database health
npm run db:health

# Metrics dashboard
curl -s http://localhost:4567/api/metrics/dashboard | jq '.'
```

### Manage Farms
```bash
# List all farms
curl -s http://localhost:4567/api/farms | jq '.data[] | {id, name, status}'

# Get farm status
curl -s http://localhost:4567/api/farms/{farmId} | jq '.data.status'

# Force harvest
curl -X POST http://localhost:4567/api/farms/{farmId}/harvest

# Manual recovery
curl -X POST http://localhost:4567/api/farms/{farmId}/recover
```

### Manage Tmux Sessions
```bash
# List sessions
TMUX_TMPDIR=/tmp tmux list-sessions

# List panes for farm
TMUX_TMPDIR=/tmp tmux list-panes -t farm-{id}:agents

# Kill session
TMUX_TMPDIR=/tmp tmux kill-session -t farm-{id}
```

### Database Operations
```bash
# Check health and fix issues
npm run db:health
npm run db:fix
npm run db:fix:validate

# Manual migration
npm run migrate:up

# Test database
export PGPASSWORD=maifarm123
psql -U maifarm -d maifarm_dev -c "SELECT COUNT(*) FROM farms;"
```

### Testing
```bash
# All tests
npm test

# Specific test file
npm test -- apps/api/src/tests/farms.test.ts

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# Test coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Development
```bash
# Start full stack (recommended)
npm run start

# Alternative: hot-reload dev server
npm run dev

# Type checking
npm run typecheck

# Lint code
npm run lint

# Format code
npm run format
```

## Core Domain Models Quick Reference

### Farm
- **Status**: idle → launching → active → harvesting → completed/failed
- **Modes**: Harvest, Quick Task (5min), Go Wild (45min), Collaborative, Sequential
- **Key Fields**: id, name, status, agents[], config, tmuxSession, workspacePath, harvestId
- **Timeout Format**: Passed in SECONDS to ShutdownCoordinator

### Agent
- **Status**: idle, active, working, busy, completed, error, failed, terminated
- **Health**: healthy, degraded, unhealthy
- **Names**: Farm animals (Bessie the Cow, Wilbur the Pig, etc.)
- **Numbering**: 1-based display index
- **Monitoring**: 30s heartbeat interval, 2min timeout, 5 failures = unhealthy

### Harvest
- **Phases**: scanning → collecting → validating → packaging → finalizing
- **Status**: pending, collecting, processing, completed, failed
- **Timeout**: 25 seconds (within 30-second graceful shutdown window)

### Terminal Output
- **Streaming**: Tmux pipe-pane (preferred) or capture-pane (fallback, 1.5s)
- **Flush**: 10ms interval for broadcasts
- **Cleaning**: 9-stage pipeline (ANSI codes, duplicates, etc.)
- **Health**: <50ms latency target, <5% error rate target

## WebSocket Events Quick Reference

### Room Names
```
farm:{farmId}              # All farm updates
farm:{farmId}:agents       # Agent-specific
farm:{farmId}:terminal     # Terminal output
farm:{farmId}:harvest      # Harvest progress
user:{userId}              # User-specific
system:alerts              # System-wide
```

### Critical Events (with ACK)
```
farm:created
farm:launched
agent:registered
harvest:started
harvest:completed
```

### Common Events
```
farm:status                # Status changes
agent:updated              # Agent state changes
terminal:output            # Real-time output
harvest:progress           # Collection progress
metrics:update             # Metrics broadcast
```

## Database Tables Quick Reference

**Core Tables**: farms, agents, tasks, sessions, users
**Harvest Tables**: harvests, seeds, harvest_yield, harvest_manifests, barn_items, barn_sync_log
**Monitoring**: metrics, health_checks, agent_health_checks, logs, alerts
**Operations**: token_usage, security_audits, sessions

## Configuration Priority

1. **Environment Variables** (highest priority)
   - By NODE_ENV: .env.development, .env, .env.test
   
2. **defaults** in config/index.ts

3. **Type Validation** - ConfigurationValidationResult checks all required vars

## Key Numbers to Remember

| Item | Value |
|------|-------|
| Quick Task Timeout | 5 minutes (fixed) |
| Farm Default Timeout | 1 hour (configurable) |
| GoWild Default Timeout | 45 minutes (configurable) |
| Graceful Shutdown Window | 30 seconds |
| Harvest Collection Window | 25 seconds |
| Agent Heartbeat Interval | 30 seconds |
| Agent Heartbeat Timeout | 2 minutes |
| Terminal Flush Interval | 10 milliseconds |
| Health Check Interval | 30 seconds |
| Database Pool Size | 20 connections |
| Terminal Streaming Fallback | 1.5 seconds (capture-pane) |
| Circuit Breaker Threshold | 5 failures |
| Circuit Breaker Timeout | 60 seconds |
| Agent Numbering | 1-based (not 0-based) |

## Critical Patterns to Follow

### Path Usage
```typescript
// CORRECT
import { pathConfig } from '../config/paths';
const path = pathConfig.getPath('WORKSPACE', farmId);

// WRONG - Never hardcode
const path = resolve(process.cwd(), 'maibarn/workspaces', farmId);
```

### Logger Usage
```typescript
// CORRECT
logger.info(LogCategory.FARM, 'Message here');
logger.error(LogCategory.TERMINAL, 'Error', { context });

// WRONG - Creates 'undefined' in logs
logger.info(`[ServiceName] Message here`);
```

### Service Registration
```typescript
// Register agents BEFORE database save
await websocketManager.broadcast('agent:registered', { agents });
await sleep(100);  // Wait for frontend
await db.query('INSERT INTO agents ...', agentData);
```

### Timeout Handling
```typescript
// Quick Task: 5 minutes FIXED
const timeout = 300;  // seconds

// Farm/GoWild: User-configurable
const timeout = config.timeout;  // seconds

// Pass to ShutdownCoordinator
await shutdownCoordinator.coordinate(farmId, timeout);  // seconds → converted to ms
```

## Troubleshooting Checklist

- [ ] Check TMUX_TMPDIR=/tmp is set for tmux commands
- [ ] Verify database migration 000 ran without errors
- [ ] Check agent registration broadcast happens before database save
- [ ] Verify terminal output cleaning pipeline is active
- [ ] Check graceful shutdown timeout is properly configured
- [ ] Verify farm workspace has correct permissions
- [ ] Check orchestrator status file in maibarn/coordination/
- [ ] Verify Redis connection is active
- [ ] Check API key encryption key is set
- [ ] Review logs for correlation IDs

## Port Configuration

- Frontend: 3000 (Vite dev server)
- Backend: 4567 (Express + Socket.io)
- PostgreSQL: 5432
- Redis: 6379
- LLM Proxy: 8001 (optional)
- Ollama: 11434 (optional)

## Environment File Template

```env
# Server
PORT=4567
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=maifarm_dev
DB_USER=maifarm
DB_PASSWORD=maifarm123

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# AI Provider
AI_PROVIDER=claude
CLAUDE_API_KEY=sk-ant-...

# Logging
LOG_LEVEL=DEBUG
LOG_FORMAT=compact

# Development
BYPASS_AUTH=true
```

## Performance Targets

- API latency: <200ms (typical: 50-100ms)
- Terminal output latency: <50ms (actual: ~10ms)
- Farm launch time: <5s (with optimizations: ~2s)
- Harvest collection: <2min for 100 files
- WebSocket delivery rate: >99.9%
- Terminal success rate: >99.9%

## Resources & Links

- CLAUDE.md - Original project instructions
- MAIFARM_ARCHITECTURE_COMPREHENSIVE.md - Full architecture analysis
- apps/api/src/database/migrations/ - Database schema evolution
- scripts/python/orchestrator.py - Agent orchestrator implementation
- apps/shared/types/unified.ts - Master type definitions

