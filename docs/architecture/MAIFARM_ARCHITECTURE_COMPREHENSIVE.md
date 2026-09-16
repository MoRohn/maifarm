# MaiFarm Codebase Architecture Analysis

## Executive Summary

**MaiFarm** is a sophisticated TypeScript-based multi-agent orchestration system (v2.5.0) that enables collaborative AI development teams through:
- Tmux-based agent coordination with WebSocket real-time communication
- Multi-mode operation (Harvest, Quick Task, GoWild, etc.)
- Production-grade streaming, monitoring, and resilience patterns
- XenoSync integration for advanced orchestration
- Comprehensive database schema with 40+ migrations

**Key Metrics:**
- ~150+ API endpoints
- 50+ database tables with JSONB flexibility
- 30+ core services with specialized responsibilities
- Python orchestrator with robust tmux management
- Full-stack React dashboard with real-time updates

---

## High-Level Architecture

### Monorepo Structure

```
maifarm/
├── apps/
│   ├── api/                    # Backend Express server (TypeScript, ESM)
│   │   └── src/
│   │       ├── api/            # REST endpoints (50+ files)
│   │       ├── services/       # Business logic (100+ files)
│   │       ├── database/       # PostgreSQL with 40+ migrations
│   │       ├── websocket/      # Socket.io handlers
│   │       ├── middleware/     # Auth, validation, rate limiting
│   │       ├── config/         # Centralized configuration
│   │       ├── types/          # TypeScript type definitions
│   │       └── utils/          # Shared utilities
│   │
│   ├── dashboard/              # React 18 + Vite frontend (port 3000)
│   │   └── src/
│   │       ├── components/     # 45+ React components
│   │       ├── hooks/          # 50+ custom hooks
│   │       ├── pages/          # Route pages
│   │       └── services/       # API client services
│   │
│   ├── orchestrator/           # Python orchestration engine
│   │   ├── api/                # Python FastAPI endpoints
│   │   ├── agents/             # Agent lifecycle management
│   │   ├── tmux/               # Tmux session control
│   │   ├── xenosync/           # XenoSync integration
│   │   └── runengine/          # Task execution
│   │
│   └── shared/                 # Shared types and utilities
│       └── types/
│           └── unified.ts      # Unified type definitions
│
├── maibarn/                    # Isolated runtime storage (NOT in git)
│   ├── workspaces/            # Farm workspaces (shared by all agents)
│   ├── harvests/              # Collected outputs
│   ├── terminals/             # Terminal output logs
│   ├── barn/items/            # Shared resources
│   └── coordination/          # Inter-process coordination files
│
└── scripts/
    ├── python/                # Python orchestrators
    └── *.sh                   # Bash deployment and test scripts
```

### Technology Stack

**Backend:**
- Express 4.18 + TypeScript 5.3
- PostgreSQL 15 + Redis 6.2
- Socket.io 4.7 for WebSocket communication
- ESM modules with `"type": "module"` in package.json
- Winston 3.17 for structured logging

**Frontend:**
- React 18.2 + TypeScript
- Vite 5.4 (not Webpack)
- Socket.io-client for real-time updates
- Zustand for state management
- Tailwind CSS for styling
- React Router v6 for navigation

**Python Orchestrator:**
- Python 3.8+
- FastAPI for REST API
- Tmux management via subprocess
- XenoSync for multi-agent orchestration
- Pydantic for data validation

**Database:**
- PostgreSQL as primary store
- Redis for caching and pub/sub
- pg-promise for connection pooling (20 connections)

---

## Core Domain Models

### 1. Farm Model

A **Farm** is the central orchestration unit representing a collaborative AI team execution.

**Key Fields:**
```typescript
interface Farm {
  id: UUID;
  name: string;
  status: 'idle' | 'launching' | 'active' | 'harvesting' | 'completed' | 'failed';
  
  // Agent Management
  agents: Agent[] | string[]; // Union type: full objects or IDs
  agentCount?: number;
  
  // Configuration
  config: {
    yaml?: string;                    // Agent YAML configuration
    timeout?: number;                 // In seconds
    maxAgents?: number;
    orchestrationStrategy?: string;   // round-robin, least-loaded, priority
  };
  
  // Session Management
  tmuxSession: string;               // e.g., "farm-{id}"
  sessionName: string;
  workspacePath: string;
  harvestId?: UUID;
  
  // Timestamps
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}
```

**Farm Status Flow:**
```
idle → launching → active → harvesting → completed
              ↓
            failed
```

**Farm Modes:**
- **Harvest**: Multi-agent collaborative development (default)
- **Quick Task**: Fixed 5-minute timeout with 2 agents
- **Go Wild**: Autonomous mode, 30-minute timeout, 3-20 agents
- **Collaborative**: Explicit workflow orchestration
- **Sequential**: Linear task execution

### 2. Agent Model

Represents an AI agent instance within a farm.

**Key Fields:**
```typescript
interface Agent {
  id: UUID;
  farmId: UUID;
  name: string;
  displayName?: string;              // "Bessie the Cow" (farm animal names)
  agentNumber: number;               // 1-based display index
  
  status: AgentStatus;               // idle, active, working, busy, completed, error, failed
  health?: 'healthy' | 'degraded' | 'unhealthy';
  
  // Tmux Integration
  sessionName: string;               // Same as farm
  paneId: number;                    // 0-based pane index
  
  // Resource Usage
  resources: {
    cpu: number;
    memory: number;
    gpu?: number;
  };
  
  // Monitoring
  lastHeartbeat: Date;
  lastActivity: Date;
  
  metrics: {
    tasksCompleted: number;
    tasksFailed: number;
    averageExecutionTime: number;
    efficiency: number;
  };
}
```

**Agent Naming Convention:**
- Automatically generated farm animal names: "Bessie the Cow", "Wilbur the Pig", etc.
- Stored in `displayName` field
- Agent numbering starts from 1 (not 0)

### 3. Harvest Model

Represents the output collection and processing system.

**Key Fields:**
```typescript
interface Harvest {
  id: UUID;
  farmId: UUID;
  status: 'pending' | 'collecting' | 'processing' | 'completed' | 'failed';
  
  // Collection Data
  files: HarvestFile[];
  fileCount: number;
  totalSize: bigint;
  
  // Phases
  phase: 'scanning' | 'collecting' | 'validating' | 'packaging' | 'finalizing';
  
  // Results
  summary?: string;
  metrics: {
    filesCollected: number;
    totalSize: number;
    duration: number;
  };
  
  createdAt: Date;
  completedAt?: Date;
}
```

**Harvest Collection Pipeline:**
1. **Scanning** (5%) - Identify all files
2. **Collecting** (40%) - Transfer files with deduplication
3. **Validating** (20%) - Verify integrity
4. **Packaging** (25%) - Archive and compress
5. **Finalizing** (10%) - Metadata and cleanup

### 4. Terminal Output

Real-time streaming of tmux pane output.

**Key Fields:**
```typescript
interface TerminalOutput {
  farmId: string;
  agentId: string;          // Normalized to number
  agentName?: string;
  sessionName: string;
  lines: string[];          // Array of output lines
  timestamp: Date;
}
```

---

## Database Schema

### Core Tables

**1. farms**
- Primary orchestration unit
- Foreign key: users(created_by)
- Indexes on: status, created_at, session_name
- JSONB columns: config, metrics, tags

**2. agents**
- Individual agent instances
- Foreign key: farms(id) ON DELETE CASCADE
- Indexes on: farm_id, status, last_heartbeat
- JSONB columns: resources, metrics, config

**3. tasks**
- Work units assigned to agents
- Foreign keys: farms(id), agents(id)
- Status tracking: queued → assigned → processing → completed/failed
- Retry logic: max_retries, retries, timeout

**4. sessions**
- User authentication sessions
- Token-based with expiration
- JSONB data column for session state

**5. harvests**
- Output collection records
- Foreign key: farms(id) ON DELETE CASCADE
- File tracking: file_count, total_size
- JSONB columns: data, summary, results, metadata

**6. seeds**
- Reusable farm templates
- Foreign keys: users(id), harvests(id)
- Version tracking via source_seed_id
- Rating and usage metrics

**7. barn_items**
- Shared resources accessible to all farms
- Symlinked into farm workspaces
- Sync status tracking: pending, syncing, synced, failed

**8. barn_sync_log**
- Audit trail for barn synchronization
- Tracks sync_id, operation, status, details
- Timestamps for performance analysis

**9. token_usage**
- AI provider token tracking
- Cost calculation: prompt_cost, completion_cost
- Aggregation by provider, model, farm, agent

**10. metrics**
- Time-series metrics data
- Labels JSONB for flexible tagging
- Source: agent, farm, system

**11. health_checks**
- Service health status
- Per-service tracking: database, redis, api, agents
- Response time measurements

**12. logs**
- Structured application logs
- Log level, source, correlation_id
- Correlation with farms, agents, users

**13. alerts**
- System alerts with acknowledgment
- Severity levels: info, warning, error, critical
- Linked to alert_rules via rule_id

**14. security_audits**
- Authentication and permission events
- User action tracking
- Compliance audit trail

### Key Constraints

- **Cascade deletes**: farms → agents, tasks, harvests
- **Status enums**: Constraints on status columns
- **Foreign key integrity**: All references properly defined
- **Temporal tracking**: created_at, updated_at on all tables
- **Soft deletes**: Status='deleted' instead of actual deletion

### Indexing Strategy

```sql
-- Performance indexes
CREATE INDEX idx_farms_status ON farms(status);
CREATE INDEX idx_farms_session_name ON farms(session_name);
CREATE INDEX idx_agents_farm_id ON agents(farm_id);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_tasks_farm_id ON tasks(farm_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_harvests_farm_id ON harvests(farm_id);
CREATE INDEX idx_token_usage_farm_id ON token_usage(farm_id);

-- Full-text search indexes
CREATE INDEX idx_farms_name_search ON farms USING gin(to_tsvector('english', name));
```

---

## WebSocket Architecture

### Real-Time Communication Pattern

**Socket.io Configuration:**
```typescript
interface SocketIOServerConfig {
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
    credentials: true
  };
  pingTimeout: 60000;
  pingInterval: 25000;
  transports: ['websocket', 'polling'];
  perMessageDeflate: { threshold: 1024 };
  maxHttpBufferSize: 10MB;
  connectionStateRecovery: {
    maxDisconnectionDuration: 2min;
    skipMiddlewares: false;
  };
}
```

### Event System

**Core Events:**
```typescript
// Agent Events
'agent:created'              // New agent spawned
'agent:updated'              // Agent state change
'agent:status'               // Status update
'agent:health:status'        // Health check result
'agent:recovered'            // Auto-recovery succeeded
'agent:terminated'           // Agent shutdown

// Farm Events
'farm:created'               // New farm initialized
'farm:status'                // Status change
'farm:creation-started'      // Creation pipeline initiated
'farm:creation-progress'     // Multi-phase progress (6 phases)
'farm:preflight-complete'    // Pre-flight validation done
'farm:launch-progress'       // Launch phase progress (7 stages)
'farm:recovery-started'      // Auto-recovery initiated
'farm:recovery-completed'    // Recovery succeeded

// Terminal Events
'terminal:output'            // Real-time pane output (10ms flush)
'terminal:joined'            // Client joined terminal room
'terminal:streaming:ready'   // Streaming initialized
'terminal:stream:error'      // Streaming failure

// Harvest Events
'harvest:started'            // Collection initiated
'harvest:progress'           // Real-time progress (5 phases)
'harvest:completed'          // Collection finished
'harvest:failed'             // Collection error

// System Events
'request:state-sync'         // Client requests state snapshot
'state:synced'               // Server sends full state
'ack:event'                  // Event acknowledgment
'metrics:update'             // Metrics broadcast
```

### Room-Based Broadcasting

**Architecture:**
```typescript
// Rooms by context
`farm:{farmId}`              // All updates for a farm
`farm:{farmId}:agents`       // Agent-specific updates
`farm:{farmId}:terminal`     // Terminal output
`farm:{farmId}:harvest`      // Harvest progress
`user:{userId}`              // User-specific messages
`system:alerts`              // System-wide alerts
```

### Guaranteed Delivery Pattern

**Critical Events with ACK:**
```typescript
// Send with confirmation
const result = await unifiedWebSocketManager.broadcastWithAck(
  'farm:created',
  { farm: farmData },
  {
    farmId,
    retryAttempts: 3,         // Retry up to 3 times
    timeout: 5000,            // 5 second per attempt
    requiresAck: true         // Must be acknowledged
  }
);
// Returns: { success, delivered, failed, details }
```

**Delivery Tracking:**
- Event IDs for deduplication
- Sequence numbers for ordering
- Delivery status per socket
- Automatic retry with exponential backoff

### State Recovery on Reconnection

**Protocol:**
1. Client emits `request:state-sync` with optional farmIds
2. Server fetches complete state from database
3. Server responds with snapshot including sequence numbers
4. Client reconciles local state automatically

---

## Core Services Architecture

### Service Layers

#### 1. Unified Services (`apps/api/src/services/unified/`)

Singleton pattern services providing core functionality:

**CacheManager.ts**
```typescript
export class CacheManager {
  private static instance: CacheManager;
  
  // LRU cache implementation
  getOrCompute<K, V>(key: K, fn: () => Promise<V>): Promise<V>;
  invalidate(pattern: string): void;
  
  // Multi-level caching: memory → Redis → database
}
```

**MemoryManager.ts**
```typescript
export class MemoryManager extends EventEmitter {
  // Memory leak prevention
  registerService(name: string, service: ManagedService): void;
  getMemoryUsage(): MemoryStats;
  triggerCleanup(): void;
  
  // Monitoring and alerts
  onThresholdExceeded: (stats: MemoryStats) => void;
}
```

**MonitoringService.ts**
```typescript
export class MonitoringService extends EventEmitter {
  // System-wide metrics collection
  recordMetric(name: string, value: number, tags?: Record<string, string>): void;
  recordDuration(operation: string, durationMs: number): void;
  getMetrics(filter?: MetricFilter): Metric[];
}
```

**ServiceRegistry.ts**
```typescript
export const serviceRegistry = {
  // Central service locator
  initialize(): Promise<void>;
  getService<T>(name: string): T;
  registerService(name: string, instance: any): void;
};
```

#### 2. Farm Management Services

**UnifiedFarmLaunchOrchestrator.ts**
```typescript
// 7-phase launch pipeline
export class UnifiedFarmLaunchOrchestrator {
  async launch(config: FarmLaunchConfig): Promise<LaunchResult>;
  
  // Phases:
  // 1. PREFLIGHT - Validation
  // 2. WORKSPACE - Directory setup
  // 3. HARVEST - Initialize collection
  // 4. TMUX - Session creation
  // 5. AGENTS - Agent spawning
  // 6. STREAMING - Terminal setup
  // 7. FINALIZE - Cleanup and status
}
```

**UnifiedFarmService.ts**
```typescript
export class UnifiedFarmService extends EventEmitter {
  // Farm lifecycle management
  async createFarm(config: FarmConfig): Promise<Farm>;
  async launchFarm(farmId: string): Promise<void>;
  async completeFarm(farmId: string, status: FarmStatus): Promise<void>;
  async getFarmStatus(farmId: string): Promise<FarmStatus>;
  
  // Auto-recovery
  async checkAndRecoverFarm(farmId: string): Promise<boolean>;
}
```

**farmHealthMonitor.ts**
```typescript
export class FarmHealthMonitor {
  // Continuous health monitoring
  monitorFarm(farmId: string): void;
  
  // Detects:
  // - Stuck farms (10min no activity)
  // - Orphaned farms (no tmux session)
  // - Long-running farms (>24h)
  
  // Auto-recovery actions:
  // - Cleanup
  // - Kill tmux
  // - Force complete
  // - Reset agents
}
```

#### 3. Terminal Streaming Services

**UnifiedTerminalStreamService.ts** (10ms flush interval)
```typescript
export class UnifiedTerminalStreamService extends EventEmitter {
  // Production-grade terminal output capture
  async setupStreamingForFarm(farmId: string, agentCount: number): Promise<void>;
  
  // Methods:
  // 1. Preferred: tmux pipe-pane (real-time)
  // 2. Fallback: capture-pane polling (1.5s interval)
  
  // Features:
  // - Chokidar file watching
  // - Circuit breaker for error recovery
  // - Output cleaning (9-stage pipeline)
  // - Health monitoring (30s interval)
  // - Performance metrics
}
```

**Output Cleaning Pipeline (terminalCleaner.ts):**
1. Strip ANSI escape sequences (CSI, OSC, SGR codes)
2. Remove Claude Code UI chrome (headers, dividers, prompts)
3. Expand backspaces (\b character simulation)
4. Fix duplicate keystrokes (eecho→echo, ccd→cd)
5. Normalize line endings (\r\n → \n)
6. Process carriage returns (terminal overwrites)
7. Filter shell prompts and timestamps
8. Deduplicate consecutive identical lines
9. Trim optional empty lines

#### 4. Harvest & Collection Services

**UnifiedHarvestService.ts**
```typescript
export class UnifiedHarvestService extends EventEmitter {
  // Output collection pipeline
  async startHarvest(farmId: string): Promise<Harvest>;
  async collectFiles(harvestId: string): Promise<FileCollection>;
  async updateProgress(harvestId: string, progress: HarvestProgress): Promise<void>;
  async completeHarvest(harvestId: string): Promise<Harvest>;
}
```

**Phases:**
1. **Scanning** - Identify files in workspace
2. **Collecting** - Transfer with integrity checks
3. **Validating** - Verify all files present
4. **Packaging** - Archive and compress
5. **Finalizing** - Metadata and cleanup

**ShutdownCoordinator.ts**
```typescript
export class ShutdownCoordinator {
  // Graceful shutdown orchestration (30s timeout)
  async coordinateShutdown(farmId: string, timeout: number): Promise<void>;
  
  // Sequence:
  // 1. Send termination signal to agents
  // 2. Wait for graceful completion (25s window)
  // 3. Force kill stragglers if needed
  // 4. Trigger harvest collection
  // 5. Cleanup tmux session
}
```

**Quick Task Timeout:**
- Fixed 5 minutes (300000ms) - NOT configurable
- Conversion: seconds → milliseconds handled by ShutdownCoordinator
- No grace period for Quick Task

#### 5. Agent Management Services

**agentHealthMonitor.ts**
```typescript
export class AgentHealthMonitor {
  // Lenient health monitoring
  // Settings:
  // - Heartbeat interval: 30 seconds
  // - Heartbeat timeout: 2 minutes
  // - Failure threshold: 5 attempts
  // - Activity timeout: 5 minutes
  // - Max recovery attempts: 3 per agent
  
  checkAgentHealth(agentId: string): AgentHealth;
  recoverAgent(agentId: string): Promise<boolean>;
}
```

**agentRecoveryService.ts**
```typescript
export class AgentRecoveryService {
  // Automatic agent restart on failure
  async recoverFailedAgent(agentId: string): Promise<boolean>;
  
  // Recovery actions:
  // 1. Kill agent process
  // 2. Clear resources
  // 3. Respawn agent
  // 4. Re-register with farm
  // 5. Resume assigned tasks
}
```

#### 6. AI Provider Services

**UnifiedAIProviderService.ts**
```typescript
export class UnifiedAIProviderService {
  // Multi-provider abstraction
  async sendMessage(
    provider: 'claude' | 'openai',
    messages: Message[],
    options: AIOptions
  ): Promise<AIResponse>;
  
  // Features:
  // - Token usage tracking
  // - Cost calculation
  // - Rate limiting
  // - Error recovery
  // - Retry logic
}
```

**Supported Providers:**
- Claude (Anthropic) - 200K context
- OpenAI - 128K context
- Qwen (Alibaba) - 480B parameters
- Ollama - Local models

#### 7. Barn & Resource Services

**UnifiedBarnService.ts**
```typescript
export class UnifiedBarnService {
  // Shared resource management
  async addItem(item: BarnItem): Promise<BarnItem>;
  async getItem(itemId: string): Promise<BarnItem>;
  async syncWorkspace(farmId: string): Promise<void>;
  
  // Features:
  // - Symlink to workspace
  // - Version tracking
  // - Deduplication
  // - Sync status monitoring
}
```

---

## Terminal Streaming Architecture

### Dual-Mode Capture Strategy

**Mode 1: Tmux Pipe-Pane (Preferred)**
```bash
# Setup: Send all pane output to a file
tmux pipe-pane -t farm-{id}:agents.{index} \
  'cat >> /path/to/maibarn/terminals/{farmId}/agent-{index}.log'
```

**Advantages:**
- Real-time capture (no polling)
- Zero CPU overhead
- Complete output integrity

**Mode 2: Capture-Pane Polling (Fallback)**
```bash
# Fallback: Poll pane contents every 1.5 seconds
tmux capture-pane -t farm-{id}:agents.{index} -p
```

**Advantages:**
- Works when pipe-pane fails
- Simple and robust
- No file system required

### Chokidar File Watching

```typescript
// Real-time file change detection
const watcher = watch(outputFilePath, {
  persistent: true,
  awaitWriteFinish: {
    stabilityThreshold: 100,  // Wait 100ms for write completion
    pollInterval: 100
  }
});

watcher.on('change', async (path) => {
  // Read new content
  // Clean output (9-stage pipeline)
  // Broadcast via WebSocket (10ms flush)
});
```

### Health Monitoring

**Check Every 30 Seconds:**
```typescript
interface TerminalStreamHealth {
  isHealthy: boolean;
  errorRate: number;          // %
  latency: number;            // ms
  throughput: number;         // bytes/s
}
```

**Targets:**
- Latency: <50ms (excellent), <100ms (good), <200ms (fair)
- Error rate: <5% (healthy), <20% (degraded), >20% (unhealthy)
- Success rate: >99.9% (excellent), >99% (good), >95% (fair)

### Circuit Breaker Pattern

**States:**
- **Closed** (normal): Accept requests
- **Open** (error threshold exceeded): Reject requests for 60 seconds
- **Half-Open** (recovery): Allow test request

**Threshold:** 5 consecutive failures triggers open state

---

## Farm Launch Pipeline

### 7-Phase Architecture

**Phase 1: PREFLIGHT (5%)**
```typescript
// 9 validation checks
checks: [
  'Farm name validation',
  'Database connectivity',
  'API keys availability',
  'Tmux availability',
  'Workspace directory',
  'Agent count validation',
  'Resource availability',
  'Duplicate farm detection',
  'Timeout validation'
]
```

**Phase 2: WORKSPACE (25%)**
```typescript
// Parallel operations
await Promise.all([
  createWorkspaceDirectory(),
  generateYAMLConfiguration(),
  setupBarnSymlinks()
]);
```

**Phase 3: HARVEST (50%)**
```typescript
// Initialize output collection
harvest = await harvestService.startHarvest(farmId);
// Create output directories
// Register harvest in database
```

**Phase 4: TMUX (75%)**
```typescript
// Create tmux session
tmux new-session -d -s farm-{id} -x 250 -y 50;

// Create window and panes
tmux new-window -t farm-{id} -n agents;
for agent in 0..N:
  tmux split-window -t farm-{id}:agents;
```

**Phase 5: AGENTS (85%)**
```typescript
// Spawn agents
for agent in agents:
  spawn(orchestrator.py, [agent_config]);
  
// Broadcast agents immediately BEFORE database save
await websocketManager.broadcast('agent:registered', { agents });
```

**CRITICAL TIMING**: Agent registration broadcast happens BEFORE database operations to ensure frontend receives agent info before terminal output arrives.

**Phase 6: STREAMING (90%)**
```typescript
// Setup terminal streaming
await unifiedTerminalStreamService.setupStreaming(farmId);

// Monitor output
chokidar.watch(outputFiles).on('change', broadcastTerminal);
```

**Phase 7: FINALIZE (100%)**
```typescript
// Farm status update
await db.query('UPDATE farms SET status = $1 WHERE id = $2', 
  ['active', farmId]);

// Broadcast completion
await websocketManager.broadcast('farm:launch-progress', {
  phase: LaunchPhase.FINALIZE,
  status: 'completed'
});
```

### Performance Optimizations

**Fast-Launch Mode** (`--fast-launch` flag):
- Skips stagger delays between agent startups
- Parallel workspace and YAML creation
- Reduces launch time: 5-8s → <2s
- Perceived improvement: <500ms (optimistic UI)

**Optimistic UI Updates:**
```typescript
// Set status immediately
farm.status = 'active';

// Map session before launch
sessionMap.set(farmId, sessionName);

// Users see results immediately
```

---

## Python Orchestrator (`orchestrator.py`)

### Key Components

**OrchestratorConfig**
```python
@dataclass
class OrchestratorConfig:
    session_name: str              # farm-{farmId}
    farm_id: str
    workspace_dir: Path
    num_agents: int
    provider: str                  # claude, openai
    prompt: str
    agent_names: List[str]         # Farm animal names
    agent_configs: List[Dict]      # Full YAML configs
    context_files: List[Path]
    harvest_id: Optional[str]
    max_runtime: Optional[int]
    stagger_seconds: int = 0
    reuse_session: bool = False
```

**AgentOrchestrator**
```python
class AgentOrchestrator:
    def run(self):
        # 1. Check required binaries (tmux, provider CLI)
        # 2. Create or reuse tmux session
        # 3. Spawn N agents in panes
        # 4. Monitor execution
        # 5. Graceful shutdown on timeout/signal
        
    def _write_orchestrator_status(status: str):
        # Write coordination file for Node.js
        # Location: maibarn/coordination/orchestrator_status_{farmId}.json
```

### Key Design Patterns

**Atomic JSON Writes**
```python
def atomic_write_json(path: Path, data: Any):
    # Write to temp file
    # fsync() for durability
    # Atomic rename
    # Prevents partial/corrupt files
```

**Subprocess Safety**
```python
# No shell=True (security risk)
subprocess.run(args, shell=False, env=env)

# Proper quoting with shlex
cmd = ['tmux', 'send-keys', '-t', pane, shlex.quote(prompt), 'Enter']
```

**TMUX_TMPDIR Environment Variable**
```bash
# Set for cross-process session visibility
export TMUX_TMPDIR=/tmp
```

**Signal Handling**
```python
signal.signal(signal.SIGINT, self._on_signal)
signal.signal(signal.SIGTERM, self._on_signal)
# Graceful shutdown on CTRL+C or SIGTERM
```

---

## Configuration System

### Environment Variables Hierarchy

**By Environment:**
```
development: .env.development
production:  .env
test:        .env.test
```

**Key Configuration Groups:**

**Server:**
```env
PORT=4567
NODE_ENV=development
BYPASS_AUTH=true
```

**Database:**
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=maifarm_dev
DB_USER=maifarm
DB_PASSWORD=maifarm123
DB_MAX_CONNECTIONS=20
```

**Redis:**
```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_URL=redis://localhost:6379
```

**AI Providers:**
```env
AI_PROVIDER=claude
CLAUDE_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-3-opus-20240229
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4-turbo-preview
```

**Logging:**
```env
LOG_LEVEL=DEBUG
LOG_FORMAT=compact
LOG_CONSOLE=true
LOG_FILE=false
LOG_COLORIZE=true
```

### Path Configuration (`config/paths.ts`)

**Key Paths:**
```typescript
const paths = {
  BARN_ROOT: resolve(process.cwd(), 'maibarn'),
  WORKSPACES: resolve(process.cwd(), 'maibarn/workspaces'),
  HARVESTS: resolve(process.cwd(), 'maibarn/harvests'),
  TERMINALS: resolve(process.cwd(), 'maibarn/terminals'),
  COORDINATION: resolve(process.cwd(), 'maibarn/coordination'),
  BARN_ITEMS: resolve(process.cwd(), 'maibarn/barn/items'),
  TMUX_TMP_DIR: '/tmp'
};
```

**Path Isolation:**
- All farm outputs go to `maibarn/` (NOT in git)
- Listed in `.gitignore` to prevent codebase contamination
- Each farm has isolated workspace
- Shared barn items symlinked into workspaces

---

## Graceful Shutdown System

### Timeout Configuration

**Quick Task Mode:**
- Fixed: 5 minutes (300000ms) - NOT configurable
- Format: Passed as seconds to ShutdownCoordinator
- No grace period
- Hard timeout after 5 minutes

**Farm Mode:**
- Default: 1 hour (3600 seconds)
- User-configurable
- Format: Passed as seconds to ShutdownCoordinator

**GoWild Mode:**
- Default: 45 minutes (2700 seconds)
- User-configurable
- Format: Passed as seconds to ShutdownCoordinator

### Shutdown Sequence (30-second window)

```typescript
// Phase 1: Signal agents (0s)
agents.forEach(agent => sendTerminationSignal(agent));

// Phase 2: Wait for graceful completion (0-25s)
await waitForCompletion(25000);  // 25 seconds

// Phase 3: Force kill stragglers (25s)
agents.forEach(agent => {
  if (!agent.completed) forceKill(agent);
});

// Phase 4: Harvest collection (25-28s)
await harvestService.collectFiles(farmId);  // 25-second timeout window

// Phase 5: Cleanup (28-30s)
tmux.killSession(sessionName);
database.updateFarmStatus('completed');
```

**Key Points:**
- Total shutdown time: 30 seconds
- Harvest collection gets 25-second window
- No graceful shutdown for Quick Task (hard 5-minute cutoff)
- All timeouts passed as seconds to ShutdownCoordinator

---

## API Endpoints

### Farm Endpoints

```
GET    /api/farms                    # List all farms
GET    /api/farms/:id                # Get farm details
POST   /api/farms                    # Create new farm
PUT    /api/farms/:id                # Update farm
DELETE /api/farms/:id                # Delete farm (soft delete)
POST   /api/farms/:id/launch         # Launch farm
POST   /api/farms/:id/harvest        # Force harvest
POST   /api/farms/:id/recover        # Manual recovery
GET    /api/farms/:id/health         # Farm health status
GET    /api/farms/:id/agents         # List farm agents
POST   /api/farms/:id/stop           # Stop farm
```

### Agent Endpoints

```
GET    /api/agents                   # List agents
GET    /api/agents/:id               # Get agent details
POST   /api/agents                   # Register new agent
PUT    /api/agents/:id               # Update agent
DELETE /api/agents/:id               # Terminate agent
GET    /api/agents/:id/health        # Agent health
POST   /api/agents/:id/recover       # Recover agent
```

### Terminal Endpoints

```
GET    /api/terminal-health/health           # Overall health
GET    /api/terminal-health/metrics          # Performance metrics
GET    /api/terminal-health/health/:farmId   # Farm-specific health
POST   /api/terminal-health/reset/:farmId/:agentId  # Reset circuit breaker
GET    /api/terminal/:farmId/:agentId        # Get terminal output
```

### Harvest Endpoints

```
GET    /api/harvests                 # List harvests
GET    /api/harvests/:id             # Get harvest details
POST   /api/harvests/:id/collect     # Start collection
GET    /api/harvests/:id/progress    # Get progress
POST   /api/harvests/:id/complete    # Force complete
GET    /api/harvests/:id/download    # Download harvest files
```

### Metrics & Monitoring

```
GET    /api/metrics/delivery         # Event delivery stats
GET    /api/metrics/performance      # Performance metrics
GET    /api/metrics/traces           # Distributed traces
GET    /api/metrics/errors           # Error statistics
GET    /api/metrics/terminals        # Terminal coordination
GET    /api/metrics/system           # System health
GET    /api/metrics/dashboard        # Combined dashboard data
```

---

## Testing Architecture

### Test Configuration

**Jest Configuration** (`tools/testing/jest.config.cjs`)
- Coverage thresholds: 80%
- Test environments: jsdom (frontend), node (API)
- Mocking strategy: MSW for integration tests

**Test Locations:**
- API tests: `apps/api/src/tests/`
- Frontend tests: `apps/dashboard/src/tests/`
- E2E tests: `cypress/`

### Test Types

```bash
npm test                          # All tests
npm test -- path/to/test.ts       # Single file
npm run test:server               # API tests only
npm run test:integration          # Integration tests
npm run test:e2e                  # Cypress E2E
npm run test:coverage             # Coverage report
npm run test:watch                # Watch mode

# Specialized tests
npm run test:barn                 # Barn-specific
npm run test:providers            # AI provider tests
npm run test:openai               # OpenAI integration
npm run test:critical-path        # Critical user paths
```

---

## Frontend Architecture

### Component Structure

**Layout Components:**
- `DashboardLayout` - Main authenticated layout
- `ThemedHeader` - Navigation (shared across all pages)
- `Sidebar` - Navigation menu

**Farm Components:**
- `FarmCreation` - Multi-step farm creation
- `FarmDashboard` - Main farm management
- `FarmStatus` - Status display
- `AgentMonitoring` - Agent health tracking
- `TerminalViewer` - Terminal output display (multiple view modes)
- `HarvestProgressTracker` - Collection progress

**Custom Hooks:**
- `useFarmWebSocket` - WebSocket connection
- `useFarmState` - Zustand store integration
- `useTerminalOutput` - Terminal data streaming
- `useAgentHealth` - Health monitoring
- `useCostTracking` - Token/cost tracking
- `useTimeElapsed` - Duration formatting

### State Management (Zustand)

**Stores:**
```typescript
// Farm store
const farmStore = create((set) => ({
  farms: [],
  activeFarm: null,
  setFarms: (farms) => set({ farms }),
  setActiveFarm: (farm) => set({ activeFarm: farm })
}));

// Agent store
const agentStore = create((set) => ({
  agents: {},
  setAgents: (farmId, agents) => set({ agents })
}));

// WebSocket store
const websocketStore = create((set) => ({
  isConnected: false,
  setConnected: (connected) => set({ isConnected: connected })
}));

// Harvest store
const harvestStore = create((set) => ({
  harvests: {},
  setHarvest: (harvestId, harvest) => set({ harvests })
}));
```

### Real-Time Features

**WebSocket Integration:**
```typescript
// Connect on mount
useEffect(() => {
  socket.on('farm:status', (data) => {
    farmStore.setActiveFarm(data.farm);
  });
  
  socket.on('terminal:output', (data) => {
    terminalStore.appendLine(data.farmId, data.agentId, data.lines);
  });
}, []);
```

**Terminal Output Cleaning:**
```typescript
import { cleanTerminalOutput } from '@/utils/ansiParser';

const cleanedOutput = cleanTerminalOutput(rawOutput);
// Removes: Box drawing, ANSI codes, control characters
// Preserves: Regular text and formatting
```

---

## Deployment & Operations

### Quick Start

```bash
# First-time setup
npm run setup:all

# Start development
npm run start              # Handles process management

# Production build
npm run build

# Database setup
npm run migrate:up

# Start with PM2
pm2 start ecosystem.config.js --env production
```

### Production Checks

```bash
# System dependencies
npm run setup:doctor

# Database health
npm run db:health

# Production validation
./scripts/deploy/production-validation.sh

# Health check endpoints
curl http://localhost:4567/api/health
curl http://localhost:4567/api/terminal-health/health
```

### Monitoring

**Health Check Endpoints:**
```bash
# API health
GET /api/healthz

# Terminal health
GET /api/terminal-health/health

# WebSocket health
GET /api/websocket-health

# Metrics
GET /api/metrics/system
GET /api/metrics/dashboard
```

**Tmux Session Management:**
```bash
# List sessions
TMUX_TMPDIR=/tmp tmux list-sessions

# Check panes
TMUX_TMPDIR=/tmp tmux list-panes -t farm-{id}:agents

# Kill session
TMUX_TMPDIR=/tmp tmux kill-session -t farm-{id}
```

---

## Critical Implementation Patterns

### Agent Registration Timing (CRITICAL)

**File:** `UnifiedFarmLaunchOrchestrator.ts:348-358`

**Pattern:**
```typescript
// Register agents BEFORE database save
await unifiedWebSocketManager.broadcast('agent:registered', { agents });

// Wait for frontend to receive (100ms buffer)
await sleep(100);

// Then save to database
await db.query('INSERT INTO agents ...', agentData);
```

**Why:** Ensures frontend receives agent info before terminal output arrives, preventing "unknown agent" errors.

### Path Isolation (CRITICAL)

**Pattern:**
```typescript
// ALWAYS use pathConfig
import { pathConfig } from '../config/paths';

const workspacePath = pathConfig.getPath('WORKSPACE', farmId);

// NEVER hardcode paths
// const workspacePath = resolve(process.cwd(), 'maibarn/workspaces', farmId);
```

### Logger Usage

**Pattern:**
```typescript
// CORRECT: Include LogCategory
logger.info(LogCategory.FARM, 'Message here');
logger.error(LogCategory.TERMINAL, 'Error', { context });

// WRONG: Will cause 'undefined' in logs
logger.info(`[ServiceName] Message here`);
```

### Database Retry Logic

**Pattern:**
```typescript
import { withDatabaseRetry } from '../utils/retry';

await withDatabaseRetry(async () => {
  await db.query('UPDATE farms SET status = $1 WHERE id = $2', [status, farmId]);
}, {
  maxAttempts: 3,
  delayMs: 1000
});
```

### Service Initialization

**Pattern:**
```typescript
// Create singleton with lazy initialization
export const myService = (() => {
  let instance: MyService;
  
  return {
    getInstance(): MyService {
      if (!instance) {
        instance = new MyService();
      }
      return instance;
    }
  };
})();
```

---

## Key Metrics & Performance

### Typical Performance Targets

| Metric | Target | Actual |
|--------|--------|--------|
| API latency | <200ms | ~50-100ms |
| Terminal output latency | <50ms | ~10ms (10ms flush) |
| Farm launch time | <5s | ~2s (with optimizations) |
| Harvest collection | <2min for 100 files | ~1.5min |
| Database query | <100ms | ~20-50ms |
| WebSocket delivery | >99% | >99.9% with ACK |

### Resource Usage

**Memory:**
- API server: ~200-300MB
- Frontend: ~150-200MB per user
- Redis: ~100-200MB
- PostgreSQL: ~500MB-1GB

**CPU:**
- Idle: <5%
- Active farm: 20-40%
- Terminal streaming: 2-5%

**Disk:**
- Database: ~1-5GB for typical usage
- Harvests: ~100MB per average harvest
- Logs: ~50-100MB (rotated weekly)

---

## Troubleshooting Guide

### Common Issues & Fixes

**Farm Launch Hanging:**
- Check database migration status
- Verify tmux installation
- Check workspace directory permissions
- Review orchestrator logs

**Terminal Not Showing Output:**
- Verify tmux session exists
- Check pipe-pane setup
- Review terminal streaming logs
- Fallback to capture-pane mode

**WebSocket Disconnections:**
- Check network connectivity
- Verify Redis running
- Review rate limiting settings
- Check browser console for errors

**Agent Failures:**
- Check agent health status
- Review agent logs
- Check resource availability
- Verify API key validity

**Harvest Not Collecting:**
- Verify farm status
- Check workspace permissions
- Review harvest logs
- Check disk space availability

---

## Summary

MaiFarm is a sophisticated, production-grade system for orchestrating collaborative AI development teams. Its key strengths:

1. **Multi-Mode Operation**: Supports Harvest, Quick Task, GoWild, and custom modes
2. **Real-Time Communication**: WebSocket with guaranteed delivery for critical events
3. **Robust Terminal Streaming**: 10ms latency with dual-mode capture
4. **Comprehensive Monitoring**: Health checks, metrics, and distributed tracing
5. **Graceful Degradation**: Circuit breakers and automatic recovery
6. **Type Safety**: Full TypeScript with unified type definitions
7. **Database-Backed**: PostgreSQL with comprehensive schema and migrations
8. **Production-Ready**: Logging, security, rate limiting, and RBAC

The architecture emphasizes isolation (maibarn), resilience, performance, and user experience through optimistic UI updates and real-time feedback.

