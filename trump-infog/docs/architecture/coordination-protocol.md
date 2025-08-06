# Trump Infog Agent Coordination Protocol

## Overview
This document defines the coordination protocol for multi-agent collaboration in the Trump Infog project. It establishes communication patterns, state sharing mechanisms, and synchronization strategies.

## Communication Channels

### 1. WebSocket Real-Time Events
Primary channel for immediate notifications and status updates.

```typescript
// Event structure
interface CoordinationEvent {
  timestamp: string;
  agentId: string;
  eventType: string;
  payload: any;
  correlationId?: string;
}
```

### 2. Redis Pub/Sub
For broadcasting updates to all agents.

```typescript
// Channel naming convention
const channels = {
  tasks: 'trump-infog:tasks',
  status: 'trump-infog:status',
  alerts: 'trump-infog:alerts',
  sync: 'trump-infog:sync'
};
```

### 3. File-Based Coordination
For persistent state and offline coordination.

```bash
/tmp/claude_coordination/trump_infog/
├── agents/
│   ├── agent_1_status.json
│   ├── agent_2_status.json
│   ├── agent_3_status.json
│   └── agent_4_status.json
├── tasks/
│   ├── queue.json
│   ├── in_progress/
│   └── completed/
└── state/
    ├── project.json
    └── dependencies.json
```

## State Sharing Protocol

### 1. Agent Registration
When an agent starts, it must register its presence:

```typescript
interface AgentRegistration {
  agentId: string;
  agentType: 'backend' | 'frontend' | 'data' | 'qa';
  capabilities: string[];
  status: 'initializing' | 'ready' | 'busy' | 'error';
  startTime: string;
  resources: {
    cpu: string;
    memory: string;
  };
}

// POST /api/v1/coordination/agents/register
```

### 2. Task Management

#### Task Structure
```typescript
interface Task {
  id: string;
  type: 'feature' | 'bug' | 'refactor' | 'test' | 'docs';
  priority: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  requirements: string[];
  dependencies: string[];
  assignedTo?: string;
  status: 'pending' | 'claimed' | 'in_progress' | 'completed' | 'failed';
  createdAt: string;
  claimedAt?: string;
  completedAt?: string;
  estimatedTime?: string;
  actualTime?: string;
  outputs?: {
    files: string[];
    apis: string[];
    tests: string[];
  };
}
```

#### Task Lifecycle
1. **Task Creation**: Any agent can create tasks
2. **Task Discovery**: Agents query available tasks
3. **Task Claiming**: Atomic claim with lock
4. **Task Execution**: Progress updates every 5 minutes
5. **Task Completion**: Mark complete with outputs

### 3. Dependency Management

```typescript
interface Dependency {
  id: string;
  type: 'blocking' | 'soft' | 'optional';
  source: string;  // task or component
  target: string;  // task or component
  status: 'pending' | 'satisfied' | 'failed';
  metadata?: any;
}

// Dependency graph maintained in Redis
// Agents check dependencies before claiming tasks
```

## Synchronization Mechanisms

### 1. Distributed Locks
For critical sections and exclusive operations:

```typescript
class DistributedLock {
  async acquire(resource: string, ttl: number): Promise<boolean> {
    // Redis-based lock with auto-expiry
    const key = `lock:${resource}`;
    const token = generateToken();
    const acquired = await redis.set(key, token, 'NX', 'EX', ttl);
    return acquired === 'OK';
  }

  async release(resource: string, token: string): Promise<void> {
    // Lua script for atomic release
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await redis.eval(script, 1, `lock:${resource}`, token);
  }
}
```

### 2. Optimistic Concurrency Control
For shared resource updates:

```typescript
interface VersionedResource {
  id: string;
  version: number;
  data: any;
  lastModifiedBy: string;
  lastModifiedAt: string;
}

// Updates require version matching
async function updateResource(id: string, version: number, data: any) {
  const current = await getResource(id);
  if (current.version !== version) {
    throw new ConcurrencyError('Version mismatch');
  }
  // Proceed with update
}
```

### 3. Event Ordering
Ensuring consistent event processing:

```typescript
interface OrderedEvent extends CoordinationEvent {
  sequenceNumber: number;
  previousHash: string;
}

// Events processed in order
// Missing events trigger resync
```

## Conflict Resolution

### 1. Task Conflicts
When multiple agents claim the same task:
- First valid claim wins
- Failed claimants notified immediately
- Task reassignment if agent fails

### 2. Code Conflicts
When agents modify same files:
- Git-based merge strategies
- Clear ownership boundaries
- Integration branches for testing

### 3. State Conflicts
When distributed state diverges:
- Last-write-wins for status updates
- Consensus for critical decisions
- Eventual consistency model

## Health Monitoring

### 1. Heartbeat Protocol
```typescript
interface Heartbeat {
  agentId: string;
  timestamp: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  metrics: {
    tasksCompleted: number;
    tasksInProgress: number;
    cpuUsage: number;
    memoryUsage: number;
    lastTaskCompletedAt?: string;
  };
}

// Heartbeat every 30 seconds
// Missing 3 heartbeats = agent considered down
```

### 2. Circuit Breaker
For handling agent failures:

```typescript
class AgentCircuitBreaker {
  private failures: Map<string, number> = new Map();
  private threshold = 5;
  private timeout = 60000; // 1 minute

  async callAgent(agentId: string, operation: Function) {
    if (this.isOpen(agentId)) {
      throw new Error(`Agent ${agentId} circuit breaker is open`);
    }

    try {
      const result = await operation();
      this.onSuccess(agentId);
      return result;
    } catch (error) {
      this.onFailure(agentId);
      throw error;
    }
  }
}
```

## Message Formats

### 1. Task Assignment
```json
{
  "type": "task:assigned",
  "agentId": "agent_1",
  "task": {
    "id": "task_123",
    "type": "feature",
    "description": "Implement news API integration"
  },
  "timestamp": "2025-08-05T09:15:00Z"
}
```

### 2. Progress Update
```json
{
  "type": "task:progress",
  "agentId": "agent_1",
  "taskId": "task_123",
  "progress": 75,
  "message": "Completed API endpoints, testing in progress",
  "timestamp": "2025-08-05T10:00:00Z"
}
```

### 3. Resource Request
```json
{
  "type": "resource:request",
  "agentId": "agent_2",
  "resource": "database:schema:news",
  "operation": "read",
  "timestamp": "2025-08-05T10:15:00Z"
}
```

### 4. Sync Request
```json
{
  "type": "sync:request",
  "agentId": "agent_3",
  "target": "all",
  "data": {
    "schemaVersion": "1.2.0",
    "migrations": ["001_initial", "002_add_news_table"]
  },
  "timestamp": "2025-08-05T10:30:00Z"
}
```

## Error Handling

### 1. Retry Strategy
```typescript
const retryConfig = {
  maxAttempts: 3,
  backoffMultiplier: 2,
  initialDelay: 1000,
  maxDelay: 30000
};
```

### 2. Error Propagation
```typescript
interface CoordinationError {
  code: string;
  message: string;
  agentId: string;
  taskId?: string;
  severity: 'warning' | 'error' | 'critical';
  timestamp: string;
  context?: any;
}
```

### 3. Recovery Procedures
- Automatic task reassignment on agent failure
- State rollback on critical errors
- Manual intervention alerts

## Performance Considerations

### 1. Message Batching
- Batch status updates every 5 seconds
- Aggregate progress reports
- Compress large payloads

### 2. Caching Strategy
- Cache task assignments for 5 minutes
- Cache agent capabilities
- Invalidate on changes

### 3. Resource Limits
- Max 100 concurrent tasks per agent
- Max 1MB message size
- Max 1000 events/minute per agent

## Security

### 1. Authentication
- JWT tokens for agent identity
- Mutual TLS for inter-agent communication
- API key rotation every 24 hours

### 2. Authorization
- Role-based task access
- Resource-level permissions
- Audit logging for all operations

### 3. Data Protection
- Encrypt sensitive data in transit
- Sanitize log outputs
- Secure credential storage