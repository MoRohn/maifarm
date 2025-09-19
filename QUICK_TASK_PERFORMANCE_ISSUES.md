# Quick Task Performance Issues Analysis

## Identified Bottlenecks

### 1. Redundant Terminal Watcher Cycles
**Problem**: Terminal output watcher starts, stops, and restarts multiple times during Quick Task initialization.

**Evidence from logs**:
```
[TerminalOutputWatcher] Starting to watch session: quick_7b2af671
[TerminalOutputWatcher] Session quick_7b2af671 no longer exists, stopping watch
[Terminal] Auto-detected session quick_7b2af671 with 1 agents
```

**Root Cause**: Session existence check fails intermittently due to tmux session creation timing.

### 2. Session Detection False Negatives
**Problem**: `sessionExists()` incorrectly reports session doesn't exist when it's still being created.

**Impact**: Causes unnecessary cleanup and restart cycles, adding 2-3 seconds delay.

### 3. Fixed Wait Times
**Problem**: Hardcoded 3-second wait after Claude launch regardless of actual readiness.

**Code Location**: `quickTaskExecutor.ts:396`
```typescript
await new Promise(resolve => setTimeout(resolve, 3000));
```

### 4. Grid View Agent Isolation Issue
**Problem**: Quick Task shows only 1 agent in terminal grid view instead of properly separating multiple agents.

**Root Cause**: Quick Task is being treated as single-agent task despite XenoSync requirement for minimum 2 agents.

## Recommended Fixes

### Fix 1: Improve Session Detection
Replace timing-based detection with proper tmux session polling:

```typescript
// Add retry logic with exponential backoff
async sessionExists(sessionName: string, maxRetries = 5): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    const result = await execAsync(`TMUX_TMPDIR=/tmp tmux has-session -t "${sessionName}" 2>/dev/null`);
    if (result.exitCode === 0) return true;
    if (i < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, i)));
    }
  }
  return false;
}
```

### Fix 2: Remove Redundant Watcher Restarts
Consolidate terminal watching initialization to happen once after session is confirmed:

```typescript
// Wait for session to be fully created before starting watcher
await this.waitForSession(sessionName);
await terminalStreamService.startStreaming(sessionName, sessionName, agentCount);
```

### Fix 3: Replace Fixed Wait with Ready Detection
Replace hardcoded wait with actual Claude readiness detection:

```typescript
// Instead of: await new Promise(resolve => setTimeout(resolve, 3000));
await this.waitForClaudeReady(sessionName, {
  maxWait: 5000,
  checkInterval: 100
});
```

### Fix 4: Fix Agent Count for Quick Tasks
Ensure Quick Tasks always create 2 agents for proper grid view:

```typescript
// In quickTaskExecutor.ts
private async createTmuxSession(sessionName: string, config: QuickTaskExecutionConfig): Promise<boolean> {
  // Create session with 2 panes for XenoSync compatibility
  const createCmd = `TMUX_TMPDIR=/tmp tmux new-session -d -s "${sessionName}" -n quicktask`;
  const splitCmd = `TMUX_TMPDIR=/tmp tmux split-window -t "${sessionName}:quicktask" -h`;
  
  // Execute commands
  await execAsync(createCmd);
  await execAsync(splitCmd);
  
  // Now we have 2 panes for 2 agents
}
```

### Fix 5: Optimize YAML Generation
Cache or simplify YAML for quick tasks:

```typescript
// Use pre-generated template for quick tasks
const QUICK_TASK_YAML_TEMPLATE = `
name: "{name}"
agents:
  - name: "Primary Agent"
    role: Task executor
  - name: "Assistant Agent"  
    role: Validator
task:
  type: quick
  timeout: 300
  prompt: "{prompt}"
`;
```

## Performance Impact

Current delays:
- Session detection retry: ~2-3 seconds
- Fixed Claude wait: 3 seconds  
- Watcher restart cycle: ~1-2 seconds
- Total unnecessary delay: **6-8 seconds**

After fixes:
- Improved session detection: <500ms
- Dynamic ready detection: ~1 second
- Single watcher initialization: 0 seconds added
- Total setup time: **<2 seconds**

## Implementation Priority

1. **High Priority**: Fix agent count for grid view (user-facing issue)
2. **High Priority**: Remove redundant watcher cycles
3. **Medium Priority**: Improve session detection
4. **Low Priority**: Optimize YAML generation
5. **Low Priority**: Replace fixed waits with dynamic detection