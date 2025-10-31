# Farm Launch Process Analysis & Robustness Implementation

## Executive Summary
The farm launch process has multiple failure points causing Claude agents to not launch correctly or display messages. This document provides a comprehensive analysis and implementation plan to achieve >95% success rate across all farm modes.

## Critical Issues Identified

### 1. **Race Conditions in Launch Sequence**
**Problem**: Terminal streaming setup happens before tmux panes are fully ready
- `terminalStreamService.registerPendingSession()` called before session exists
- `setupPipePaneWithRetry()` attempts to attach before panes are created
- File watchers initialized before log files exist

**Impact**: 30-second timeouts, "Session not ready after 30 attempts" errors

### 2. **Orchestrator → Terminal Service Hand-off Gap**
**Problem**: No synchronization between Python orchestrator and Node.js services
- Orchestrator creates panes asynchronously
- Node.js services poll for panes without coordination
- `waitForSessionReady()` uses tight 100ms polling for 30 seconds (300 checks!)

**Impact**: CPU thrashing, delayed detection, timeout failures

### 3. **Multiple Terminal Service Layers**
**Problem**: Three competing terminal services:
- `terminalStreamService.ts` (legacy)
- `unified/terminalService.ts` (newer)
- `TerminalStreamingFix.ts` (band-aid)

**Impact**: Inconsistent state, duplicate attempts, resource contention

### 4. **Inconsistent Error Recovery**
**Problem**: Failures cascade without proper recovery
- Pipe-pane failures don't trigger session cleanup
- Health monitoring restarts can create duplicate sessions
- Agent failures don't propagate to farm status

**Impact**: Zombie sessions, stuck farms, UI showing "waiting for output"

### 5. **Mode-Specific Configuration Issues**
**Problem**: Different farm modes use different code paths
- Quick Task: Uses `launchQuickTaskAgent()` - direct tmux commands
- New Farm/Harvest: Uses `launchXenoSyncAgents()` - Python orchestrator
- Go Wild: Uses `launchStandardAgents()` - direct tmux commands

**Impact**: Inconsistent behavior, mode-specific bugs, hard to maintain

## Root Cause Analysis

### Launch Pipeline Flow (Current)
```
┌─────────────────────────────────────────────────────────────┐
│ 1. UnifiedFarmLaunchOrchestrator.launch()                   │
│    ├─ Preflight checks                                      │
│    ├─ Create harvest record                                 │
│    └─ Setup tmux session (mode-dependent)                   │
└─────────────────────────────────────────────────────────────┘
                     ↓ (Race condition here)
┌─────────────────────────────────────────────────────────────┐
│ 2. Terminal Service Registration (TOO EARLY)                │
│    ├─ terminalStreamService.registerPendingSession()        │
│    ├─ terminalStreamService.startStream() (fails)           │
│    └─ terminalFileWatcherService.watchFarm() (files don't exist)│
└─────────────────────────────────────────────────────────────┘
                     ↓ (Gap - no coordination)
┌─────────────────────────────────────────────────────────────┐
│ 3. Python Orchestrator (Async, No Feedback)                 │
│    ├─ Creates tmux session                                  │
│    ├─ Spawns Claude CLI processes                           │
│    ├─ Writes session_verified.json (not checked!)           │
│    └─ Writes orchestrator_heartbeat.json                    │
└─────────────────────────────────────────────────────────────┘
                     ↓ (Tight polling loop)
┌─────────────────────────────────────────────────────────────┐
│ 4. Session Verification (INEFFICIENT)                       │
│    ├─ tmuxSessionVerifier.verifyAndRecover()                │
│    ├─ Polls every 100ms for 30 seconds (300 attempts!)      │
│    ├─ No event-driven notification                          │
│    └─ Times out if orchestrator slow                        │
└─────────────────────────────────────────────────────────────┘
                     ↓ (If successful)
┌─────────────────────────────────────────────────────────────┐
│ 5. Pipe-Pane Setup (Can Fail Silently)                      │
│    ├─ setupPipePaneWithRetry() - 3 attempts                 │
│    ├─ Falls back to capture-pane polling                    │
│    └─ No verification that output is flowing                │
└─────────────────────────────────────────────────────────────┘
```

### Key Failure Points

1. **T+0s to T+2s**: Race window where terminal services expect panes that don't exist yet
2. **T+2s to T+6s**: Orchestrator creates panes but Node.js still polling blindly
3. **T+6s to T+30s**: If orchestrator slow (API rate limits, system load), verification times out
4. **T+30s+**: Timeout triggers, but no cleanup - zombie sessions accumulate

## Comprehensive Solution

### Phase 1: Event-Driven Coordination (High Priority)

#### 1.1 Orchestrator Status File
```python
# orchestrator.py - After pane creation
status = {
    "status": "ready",  # pending | initializing | ready | error
    "session_name": self.cfg.session_name,
    "panes_created": self.cfg.num_agents,
    "panes_ready": [],  # List of pane indices with active shells
    "timestamp": datetime.now().isoformat(),
    "orchestrator_pid": os.getpid()
}
atomic_write_json(coordination_dir / "orchestrator_status.json", status)
```

#### 1.2 Node.js Status Watcher
```typescript
// New service: OrchestratorBridge.ts
class OrchestratorBridge extends EventEmitter {
  async waitForOrchestratorReady(farmId: string, timeout: number = 60000): Promise<void> {
    const statusFile = path.join(
      pathConfig.getPath('COORDINATION_DIR'),
      farmId,
      'orchestrator_status.json'
    );

    // Watch file with chokidar instead of polling
    const watcher = watch(statusFile, { persistent: false });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        watcher.close();
        reject(new Error(`Orchestrator not ready after ${timeout}ms`));
      }, timeout);

      watcher.on('add', () => this.checkStatus(statusFile, resolve, reject, timer));
      watcher.on('change', () => this.checkStatus(statusFile, resolve, reject, timer));
    });
  }
}
```

### Phase 2: Unified Terminal Service (Medium Priority)

#### 2.1 Consolidate Services
Merge `terminalStreamService.ts` + `unified/terminalService.ts` → `EnhancedTerminalService.ts`

```typescript
class EnhancedTerminalService {
  async initializeStreaming(farmId: string, sessionName: string, agentCount: number): Promise<void> {
    // Stage 1: Wait for orchestrator signal
    await orchestratorBridge.waitForOrchestratorReady(farmId);

    // Stage 2: Verify panes exist
    const panes = await this.verifyPanes(sessionName, agentCount);

    // Stage 3: Setup pipe-pane (atomic, all-or-nothing)
    await this.setupPipePanesAtomic(sessionName, panes, farmId);

    // Stage 4: Start file watchers
    await this.startFileWatchers(farmId, agentCount);

    // Stage 5: Notify clients
    websocketManager.broadcastToFarm(farmId, 'terminal:ready', { sessionName, agentCount });
  }
}
```

#### 2.2 Atomic Pipe-Pane Setup
```typescript
async setupPipePanesAtomic(sessionName: string, panes: PaneInfo[], farmId: string): Promise<void> {
  // Create all log files first
  for (const pane of panes) {
    const logFile = path.join(terminalsDir, farmId, `agent-${pane.index}.log`);
    await fs.writeFile(logFile, ''); // Empty file
  }

  // Setup all pipe-panes in single batch
  const commands = panes.map(pane =>
    `tmux pipe-pane -t ${sessionName}:agents.${pane.index} -o "cat >> ${logFile}"`
  );

  // Execute all in parallel
  await Promise.all(commands.map(cmd => execAsync(cmd, { env: { TMUX_TMPDIR: '/tmp' } })));

  // Verify all succeeded
  const verifications = await Promise.all(
    panes.map(pane => this.verifyPipePaneActive(sessionName, pane.index))
  );

  if (!verifications.every(v => v === true)) {
    throw new Error('Pipe-pane setup verification failed');
  }
}
```

### Phase 3: Robust Error Recovery (High Priority)

#### 3.1 Health Monitoring with Auto-Recovery
```typescript
class FarmHealthMonitor {
  async monitorFarm(farmId: string): Promise<void> {
    const interval = setInterval(async () => {
      const health = await this.checkFarmHealth(farmId);

      if (health.status === 'degraded') {
        // Attempt recovery
        await this.recoverFarm(farmId, health.issues);
      } else if (health.status === 'failed') {
        // Cleanup and mark failed
        await this.cleanupFailedFarm(farmId);
        clearInterval(interval);
      }
    }, 30000); // Every 30s
  }

  async recoverFarm(farmId: string, issues: HealthIssue[]): Promise<void> {
    for (const issue of issues) {
      switch (issue.type) {
        case 'pipe-pane-dead':
          await terminalService.restartPipePane(farmId, issue.agentId);
          break;
        case 'orchestrator-dead':
          await this.restartOrchestrator(farmId);
          break;
        case 'agent-unresponsive':
          // Log but don't restart - let timeout handle it
          logger.warn(`Agent ${issue.agentId} unresponsive in farm ${farmId}`);
          break;
      }
    }
  }
}
```

#### 3.2 Graceful Degradation
```typescript
// If pipe-pane fails, fall back to capture-pane polling
async fallbackToCapturePanePolling(sessionName: string, agentId: number): Promise<void> {
  logger.warn(`Falling back to capture-pane polling for ${sessionName}:${agentId}`);

  const interval = setInterval(async () => {
    try {
      const output = await this.capturePaneOutput(sessionName, agentId);
      if (output) {
        websocketManager.broadcastToFarm(farmId, 'terminal:output', {
          agentId,
          content: output,
          source: 'capture-pane' // Mark as fallback source
        });
      }
    } catch (error) {
      logger.error(`Capture-pane polling failed for ${sessionName}:${agentId}`);
      clearInterval(interval);
    }
  }, 1000); // Poll every 1s
}
```

### Phase 4: Mode-Specific Optimizations

#### 4.1 Quick Task Mode
```typescript
// Optimized for single agent, fast turnaround
async launchQuickTask(config: QuickTaskConfig): Promise<void> {
  // Skip orchestrator overhead - direct tmux commands
  await tmuxManager.createSession(config.sessionName, '0');
  await tmuxManager.sendKeys(config.sessionName, 0, config.claudeCommand);

  // Simple file-based streaming (no pipe-pane complexity)
  await this.setupSimpleStreaming(config.sessionName, config.farmId);
}
```

#### 4.2 New Farm / Go Wild Mode
```typescript
// Use orchestrator with optimized timeouts
async launchHarvestFarm(config: HarvestConfig): Promise<void> {
  // Longer timeouts for multi-agent coordination
  const orchestrator = await this.launchOrchestrator(config);

  // Wait for orchestrator signal with generous timeout
  await orchestratorBridge.waitForOrchestratorReady(config.farmId, 90000); // 90s

  // Full streaming setup
  await enhancedTerminalService.initializeStreaming(
    config.farmId,
    config.sessionName,
    config.agentCount
  );
}
```

## Implementation Plan

### Sprint 1: Foundation (Days 1-2)
- [ ] Create `OrchestratorBridge.ts` with file-based coordination
- [ ] Update `orchestrator.py` to write status files
- [ ] Add status file watcher to launch pipeline
- [ ] Test with single-agent farm

### Sprint 2: Terminal Service Refactor (Days 3-4)
- [ ] Create `EnhancedTerminalService.ts` consolidating all terminal logic
- [ ] Implement atomic pipe-pane setup
- [ ] Add pipe-pane verification
- [ ] Test with 3-agent farm

### Sprint 3: Error Recovery (Days 5-6)
- [ ] Implement comprehensive health monitoring
- [ ] Add auto-recovery for common failures
- [ ] Implement graceful degradation fallbacks
- [ ] Test failure scenarios

### Sprint 4: Mode Optimization (Day 7)
- [ ] Optimize Quick Task path
- [ ] Tune timeouts for each mode
- [ ] Add mode-specific telemetry
- [ ] Full regression testing

### Sprint 5: Integration & Testing (Days 8-9)
- [ ] End-to-end testing all modes
- [ ] Load testing (10 concurrent farms)
- [ ] Chaos testing (kill orchestrator mid-launch)
- [ ] Performance profiling

### Sprint 6: Monitoring & Observability (Day 10)
- [ ] Add structured logging
- [ ] Create launch metrics dashboard
- [ ] Alert on failure patterns
- [ ] Document troubleshooting procedures

## Success Metrics

### Primary KPIs
- **Launch Success Rate**: >95% (currently ~60%)
- **Time to First Output**: <10s (currently 15-30s)
- **Recovery Success Rate**: >80% of degraded farms
- **Zero Zombie Sessions**: 0 orphaned tmux sessions after 24h

### Secondary Metrics
- **CPU Usage During Launch**: <30% (currently spikes to 70%)
- **Memory Overhead**: <100MB per farm (currently ~150MB)
- **WebSocket Latency**: <100ms for terminal output
- **Log File Growth**: <1MB/min per agent

## Testing Strategy

### Unit Tests
```typescript
describe('EnhancedTerminalService', () => {
  it('should wait for orchestrator before setup');
  it('should setup all pipe-panes atomically');
  it('should recover from single pipe-pane failure');
  it('should fall back to capture-pane if all retries fail');
});
```

### Integration Tests
```typescript
describe('Farm Launch Pipeline', () => {
  it('should launch Quick Task in <10s');
  it('should launch 5-agent Harvest in <30s');
  it('should handle orchestrator crash gracefully');
  it('should recover from tmux server restart');
});
```

### Load Tests
- 10 farms launched concurrently
- 100 farms launched sequentially
- Sustained operation for 24 hours

## Rollout Plan

### Phase 1: Dark Launch (Week 1)
- Deploy behind feature flag
- Monitor metrics vs old system
- Fix critical issues

### Phase 2: Canary (Week 2)
- 10% of new farms use new system
- A/B test success rates
- Gather user feedback

### Phase 3: Full Rollout (Week 3)
- 100% of new farms
- Deprecate old terminal services
- Archive legacy code

## Rollback Plan
If success rate drops below 90%:
1. Disable feature flag immediately
2. Restore old terminal services
3. Analyze failure logs
4. Fix issues in staging
5. Re-launch with fixes

---

**Next Steps**: Begin Sprint 1 - Create OrchestratorBridge and update Python orchestrator
