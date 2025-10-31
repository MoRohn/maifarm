# Farm Launch Flow Analysis & Standardization Plan

**Date:** 2025-10-06
**Status:** 🔍 **ANALYSIS COMPLETE - ISSUES IDENTIFIED**

---

## Executive Summary

The farm launch process has **critical timing and coordination issues** that prevent reliable, repeatable launches. This document provides a complete analysis of the launch sequence and identifies concrete improvements needed.

### 🚨 Critical Issues Found:

1. **Race condition in session creation** - TypeScript creates session, Python may try to recreate it
2. **Premature health checks** - Agents marked "dead" before they finish initializing
3. **Inconsistent timing** - No standardized delays between launch phases
4. **Missing error recovery** - Limited retry logic when pipe-panes fail
5. **Complex launch flow** - Multiple services with unclear dependencies

---

## Current Launch Sequence

### Phase 1: TypeScript Orchestration (UnifiedFarmLaunchOrchestrator.ts)

```
1. User triggers farm creation via API
   ↓
2. UnifiedFarmLaunchOrchestrator.launchFarm(config)
   ↓
3. setupTmuxSession() - Creates tmux session with 'agents' window
   ↓ (optimization.timing.sessionCreationDelay - varies by mode)
4. Verify session exists (tmuxSessionVerifier)
   ↓
5. Generate agent names (Bessie, Cluck, Wilbur, etc.)
   ↓
6. Write YAML config file to xenosync-sessions/
   ↓
7. Register session with terminalService
   ↓
8. Launch Python orchestrator via spawn()
```

**Critical Parameters Passed:**
- `--prompt-file` - Path to YAML config
- `--num-agents` - Number of agents (2-12)
- `--farm-id` - UUID for tracking
- `--session` - Tmux session name (farm-{id.substring(0,8)})
- `--workspace-dir` - Base workspace directory
- `--coordination-dir` - **CRITICAL** - Status file location
- `--reuse-session` - **CRITICAL** - Don't recreate tmux session
- `--no-kill-on-exit` - Keep session alive after orchestrator exits
- `--fast-launch` - Skip extra checks

**Timing by Mode:**
```typescript
HARVEST: {
  sessionCreationDelay: 2000ms,
  agentInitDelay: 3000ms,
  healthCheckInterval: 30000ms,
  defaultTimeout: 600s  // 10 minutes total runtime
}

QUICK_TASK: {
  sessionCreationDelay: 1000ms,  // Faster
  agentInitDelay: 2000ms,        // Faster
  healthCheckInterval: 30000ms,
  defaultTimeout: 300s  // 5 minutes total runtime
}

GO_WILD: {
  sessionCreationDelay: 3000ms,  // Slower (more agents)
  agentInitDelay: 4000ms,        // Slower
  healthCheckInterval: 30000ms,
  defaultTimeout: 600s  // 10 minutes total runtime
}
```

---

### Phase 2: Python Orchestrator (orchestrator.py)

```
1. Parse CLI arguments and initialize OrchestratorConfig
   ↓
2. Verify tmux session exists (--reuse-session prevents recreation)
   ↓
3. _create_session() OR skip if --reuse-session
   │
   ├─> If creating: new-session -d -s {session} -n agents
   ├─> Split panes: split-window -h/-v for each agent
   └─> Set up pipe-pane IMMEDIATELY: pipe-pane -t {session}:agents.{i} -o "cat >> {log_file}"
   ↓
4. _verify_session() - Wait up to 30s for panes to appear
   │
   ├─> Check pane count matches num_agents
   ├─> Verify pipe-pane working for each pane
   └─> Write session_verified.json + orchestrator_heartbeat.json
   ↓
5. _prepare_steps() - Parse YAML and assign tasks
   ↓
6. _label_panes() - Set pane titles with agent names
   ↓
7. _launch_agent(i, pane) for each agent
   │
   ├─> Build agent prompt with role, tasks, coordination info
   ├─> Check provider (claude, openai, mock)
   │
   ├─> IF MOCK:
   │   ├─> Set environment variables (AGENT_ID, AGENT_NAME, etc.)
   │   └─> Launch simple_mock_agent.py
   │
   └─> IF CLAUDE:
       ├─> Write prompt to agent_{i}_prompt.txt
       ├─> Export ANTHROPIC_API_KEY
       ├─> Export NODE_OPTIONS with memory limit
       ├─> Launch: claude --dangerously-skip-permissions
       ├─> Wait 6 seconds for Claude initialization
       ├─> Send prompt via tmux set-buffer + paste-buffer
       ├─> _verify_agent_ready() - Check for output (30s timeout)
       └─> Write agent_{i}_status.json
   ↓
8. _monitor_agents() - Write active_agents.json
   ↓
9. Orchestrator stays running, monitoring via heartbeat
```

**Critical Timing in Python:**
```python
# After clear/cd commands
time.sleep(0.1)  # Ensure command completes

# After exporting environment variables
time.sleep(0.2)  # Let vars propagate

# After launching Claude
time.sleep(6)    # Claude initialization (CRITICAL)

# After sending prompt
time.sleep(2)    # Processing time

# Agent ready verification
timeout=20       # Max wait for agent to show output
```

---

### Phase 3: Health Monitoring (Node.js)

```
1. OrchestratorHealthMonitor starts 10 seconds after launch
   ↓
2. Check each agent pane every 30 seconds:
   ↓
   ├─> tmux list-panes -t {session}:agents
   ├─> Verify pane exists
   └─> Report status to database
   ↓
3. Agent shows as "dead - Pane does not exist" if:
   - Health check runs before agent fully initialized
   - Pane index doesn't match expectation
   - Session window mismatch ('0' vs 'agents')
```

**Current Health Check Settings:**
```typescript
INITIAL_DELAY: 10000ms        // 10 seconds - TOO EARLY
HEALTH_CHECK_INTERVAL: 30000ms // 30 seconds
MAX_FAILED_CHECKS: 2
RECOVERY_ENABLED: true
```

---

## 🚨 Critical Issues Identified

### Issue 1: Race Condition in Session Creation ⚠️ HIGH PRIORITY

**Problem:**
- TypeScript creates tmux session in `setupTmuxSession()`
- Python orchestrator tries to verify/recreate session
- If `--reuse-session` flag not passed, Python kills and recreates session
- This breaks pipe-pane setup from TypeScript side

**Evidence:**
```typescript
// UnifiedFarmLaunchOrchestrator.ts:988
'--reuse-session',  // CRITICAL FIX: Reuse the already-created tmux session
```

**Root Cause:**
- TypeScript and Python don't have clear ownership of session lifecycle
- No atomic "claim" mechanism for session ownership

**Impact:** ❌ Farm launch fails or agents lose terminal output

**Fix Required:**
1. TypeScript should ONLY create base session
2. Python should ALWAYS use `--reuse-session`
3. Add session lock file to prevent concurrent modifications

---

### Issue 2: Premature Health Checks ⚠️ HIGH PRIORITY

**Problem:**
- Health monitoring starts 10 seconds after orchestrator spawn
- Claude takes 6+ seconds to initialize
- Agent ready verification takes up to 20 seconds
- Health check runs BEFORE agents finish launching

**Timeline:**
```
T+0s:  Orchestrator spawned
T+6s:  Claude launched in pane
T+8s:  Prompt sent to Claude
T+10s: ❌ HEALTH CHECK RUNS - Agent not ready yet!
T+20s: Agent actually becomes ready
T+40s: Next health check - Agent shown as recovered
```

**Evidence:**
```typescript
// OrchestratorHealthMonitor.ts
const HEALTH_CHECK_CONFIG = {
  INITIAL_DELAY: 10000,  // TOO EARLY
  ...
}
```

**Impact:** ❌ Agents marked as "dead" prematurely, causing false alarms

**Fix Required:**
1. Increase `INITIAL_DELAY` from 10s to 30s
2. Add "launching" status to distinguish from "dead"
3. Wait for `agent_{i}_status.json` file before checking pane

---

### Issue 3: Inconsistent Timing Dependencies

**Problem:**
- Different delays scattered across TypeScript and Python
- No clear timing contract between services
- Hard-coded sleep values without explanation

**Examples:**
```python
time.sleep(0.1)   # Why 0.1?
time.sleep(0.2)   # Why 0.2?
time.sleep(6)     # Why 6? (Actually needed for Claude)
```

**Impact:** 🟡 Unreliable launches, hard to debug timing issues

**Fix Required:**
1. Document all timing dependencies
2. Create named constants with explanations
3. Make delays configurable per mode

---

### Issue 4: Pipe-Pane Recovery Gaps

**Problem:**
- Pipe-pane set up in `_create_session()`
- If pipe fails, limited recovery attempt in `_verify_and_recover_pipe_pane()`
- No monitoring after initial setup

**Evidence:**
```python
# orchestrator.py:406
if not self._verify_and_recover_pipe_pane(i, self.cfg.session_name):
    all_pipes_working = False
# WARNING logged but no retry or abort
```

**Impact:** 🟡 Silent terminal output loss, agents appear active but no logs

**Fix Required:**
1. Continuous pipe-pane health monitoring
2. Auto-recovery if pipe breaks
3. Alert if pipe cannot be restored

---

### Issue 5: Complex Multi-Service Coordination

**Problem:**
- Farm launch involves 5+ services:
  1. UnifiedFarmLaunchOrchestrator (TypeScript)
  2. orchestrator.py (Python)
  3. OrchestratorHealthMonitor (TypeScript)
  4. terminalStreamService (TypeScript)
  5. farmManager (TypeScript)
- Each service has its own timing and state
- No single source of truth for launch status

**Impact:** 🟡 Difficult to debug, unclear which service failed

**Fix Required:**
1. Create centralized launch state machine
2. Add detailed launch phases in database
3. Event-driven coordination instead of polling

---

## Standardization Requirements

### 1. Launch State Machine

**Proposed States:**
```typescript
type FarmLaunchState =
  | 'initializing'      // Farm record created
  | 'session_creating'  // Tmux session being created
  | 'session_ready'     // Session verified
  | 'orchestrator_launching' // Python process spawning
  | 'orchestrator_ready'     // Orchestrator heartbeat received
  | 'agents_launching'  // Claude processes starting
  | 'agents_initializing' // Waiting for agents to be ready
  | 'active'            // All agents ready and working
  | 'failed'            // Launch failed
  | 'timeout'           // Launch timeout exceeded
```

**Benefits:**
- Clear progress tracking
- Better error messages
- Frontend can show progress bar

---

### 2. Timing Constants

**Create shared timing configuration:**

```typescript
// apps/api/src/config/launchTiming.ts
export const LAUNCH_TIMING = {
  // Session creation
  SESSION_CREATE_DELAY: {
    harvest: 2000,
    quick_task: 1000,
    go_wild: 3000
  },

  // Orchestrator delays
  ORCHESTRATOR_SPAWN_TIMEOUT: 10000,
  ORCHESTRATOR_HEARTBEAT_TIMEOUT: 15000,

  // Agent launch
  AGENT_INIT_DELAY: {
    mock: 2000,
    claude: 8000,  // 6s init + 2s buffer
    openai: 5000
  },

  // Health monitoring
  HEALTH_CHECK_INITIAL_DELAY: 30000,  // Increased from 10s
  HEALTH_CHECK_INTERVAL: 30000,

  // Verification
  AGENT_READY_TIMEOUT: 30000,
  PIPE_PANE_VERIFY_TIMEOUT: 10000
};
```

---

### 3. Coordination Files

**Standardize status file format:**

```typescript
// coordination/farm_{farmId}_launch.json
{
  "farm_id": "uuid",
  "state": "agents_initializing",
  "phases": {
    "session_created": { "timestamp": "ISO", "success": true },
    "orchestrator_spawned": { "timestamp": "ISO", "success": true, "pid": 12345 },
    "orchestrator_ready": { "timestamp": "ISO", "success": true },
    "agents_launched": { "timestamp": "ISO", "success": true, "count": 3 }
  },
  "agents": [
    {
      "index": 0,
      "name": "Bessie the Cow",
      "state": "initializing",
      "pane": "farm-abc:agents.0",
      "pid": 67890,
      "last_output": "ISO timestamp"
    }
  ],
  "errors": []
}
```

---

### 4. Error Recovery Matrix

| Error Condition | Detection | Recovery Strategy | Max Retries |
|----------------|-----------|-------------------|-------------|
| Session creation fails | tmux list-sessions | Retry with exponential backoff | 3 |
| Pipe-pane not working | Log file empty after 5s | Re-establish pipe-pane | 2 |
| Agent not ready after 30s | No output in pane | Check Claude process, restart | 1 |
| Orchestrator heartbeat missing | No heartbeat for 20s | Restart orchestrator | 1 |
| Pane doesn't exist | tmux list-panes fails | Check session, recreate pane | 0 |

---

## Recommended Fixes (Prioritized)

### Priority 1: Critical Reliability Fixes

**1. Fix Health Check Timing**
- File: `apps/api/src/services/unified/OrchestratorHealthMonitor.ts`
- Change: `INITIAL_DELAY: 10000` → `INITIAL_DELAY: 30000`
- Also: Add "launching" status check

**2. Ensure --reuse-session Always Passed**
- File: `apps/api/src/services/UnifiedFarmLaunchOrchestrator.ts`
- Verify: Line 988 includes `'--reuse-session'`
- Add: Validation that flag is present

**3. Add Launch State Tracking**
- File: `apps/api/src/services/UnifiedFarmLaunchOrchestrator.ts`
- Add: Database updates for each launch phase
- Create: New `farm_launch_phases` table

### Priority 2: Standardization

**4. Create Timing Configuration Module**
- File: Create `apps/api/src/config/launchTiming.ts`
- Extract all hard-coded delays
- Document reasoning for each delay

**5. Implement Centralized Status File**
- File: Create `apps/api/src/services/launchCoordinator.ts`
- Purpose: Single source of truth for launch state
- Format: As defined in section 3 above

### Priority 3: Robustness

**6. Add Pipe-Pane Monitoring**
- File: `apps/api/src/services/terminalStreamService.ts`
- Add: Periodic check that log files are growing
- Recovery: Re-establish pipe-pane if stale

**7. Implement Launch Timeout**
- File: `apps/api/src/services/UnifiedFarmLaunchOrchestrator.ts`
- Add: Overall launch timeout (e.g., 5 minutes)
- Action: Mark farm as failed if exceeded

---

## Testing Strategy

### Unit Tests Needed

1. **Timing validation tests**
   - Verify all delays are within acceptable ranges
   - Test timeout overflow protection

2. **State machine tests**
   - Test all state transitions
   - Test error state handling

3. **Coordination file tests**
   - Test atomic writes
   - Test concurrent access

### Integration Tests Needed

1. **End-to-end launch flow**
   - Mock mode (fast)
   - Claude mode (with API key)
   - Multiple agents (2, 3, 5, 12)

2. **Failure recovery**
   - Session creation failure
   - Orchestrator crash
   - Agent initialization timeout
   - Pipe-pane failure

3. **Performance tests**
   - Launch time by mode
   - Memory usage per agent
   - Terminal streaming latency

---

## Success Metrics

**Launch should be considered "standardized and repeatable" when:**

✅ 95%+ success rate for farm launches
✅ All timing dependencies documented
✅ Launch state visible in frontend
✅ Error recovery works automatically
✅ Launch completes within 60 seconds (mock) or 120 seconds (Claude)
✅ No false "agent dead" errors
✅ Terminal streaming works 100% of the time

---

## Next Steps

1. **Implement Priority 1 fixes** (Estimated: 2-3 hours)
   - Health check timing
   - Session reuse validation
   - Launch state tracking

2. **Create timing configuration** (Estimated: 1 hour)
   - Extract constants
   - Document delays
   - Add validation

3. **Build centralized coordinator** (Estimated: 3-4 hours)
   - Launch state machine
   - Status file management
   - Error recovery logic

4. **Write comprehensive tests** (Estimated: 4-6 hours)
   - Unit tests for timing
   - Integration tests for launch flow
   - Failure recovery scenarios

5. **Production validation** (Estimated: 2 hours)
   - Deploy to staging
   - Run 100 test launches
   - Monitor success rate

**Total Estimated Time:** 12-16 hours of focused development

---

**Conclusion:**

The farm launch process has a solid foundation but suffers from **timing coordination issues** and **lack of standardization**. The fixes outlined above will create a **concrete, repeatable, and professional** launch system that meets production requirements.
