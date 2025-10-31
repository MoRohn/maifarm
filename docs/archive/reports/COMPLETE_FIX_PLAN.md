# Complete Fix Plan - All Critical Issues

## 🎯 ACTUAL ROOT CAUSE (Confirmed)

**The XenoSync orchestrator launches tmux BUT NEVER STARTS CLAUDE CODE**

Evidence:
- Tmux session exists: ✅ `farm-044d90e3`
- Pipe-pane setup: ✅ Log files created
- Orchestrator process: ✅ Python process running
- **Claude Code launched**: ❌ **NO PROCESSES**
- Terminal output: ❌ Only echo test messages
- Result: Farm idle → Orphaned after 2min

## 🔥 CASCADE OF FAILURES

```
Orchestrator doesn't launch Claude
        ↓
No agent activity
        ↓
No terminal output
        ↓
No heartbeats
        ↓
Farm marked orphaned
        ↓
Frontend sees "orphaned" + empty terminals
        ↓
User has to refresh to see nothing
```

## ✅ COMPREHENSIVE SOLUTION

### Fix 1: Orchestrator Must Launch Claude (CRITICAL)

**Problem**: `launchXenoSyncAgents` spawns orchestrator.py but orchestrator fails to launch Claude

**Root Cause Analysis Needed**:
1. Check orchestrator.py logs
2. Verify API key passed to orchestrator
3. Check prompt file exists
4. Verify Claude CLI path

**Debug Command**:
```bash
# Check orchestrator stderr/stdout
ps aux | grep orchestrator.py | grep 044d90e3
# Check if prompt file exists
ls -la /Users/rohnspringfield/maifarm/var/maibarn/xenosync-sessions/prompt-044d90e3*.yaml
# Test Claude CLI manually
claude --version
```

**Expected Orchestrator Behavior**:
```python
# Should execute:
tmux send-keys -t farm-{id}:agents.0 "claude --dangerously-skip-permissions -p '{prompt}'" Enter
```

### Fix 2: Implement Continuous Heartbeat

**Location**: `apps/api/src/services/tmuxHealthMonitor.ts`

```typescript
private async checkSessionHealth(farmSession: FarmSession): Promise<void> {
  const health = await this.getSessionHealth(farmSession.sessionName);

  if (health.exists && health.paneCount > 0) {
    // Update heartbeat for ANY detected session
    await db.query(
      `UPDATE farms
       SET last_heartbeat = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       AND status IN ('active', 'launching', 'running')`,
      [farmSession.farmId]
    );
    logger.debug(`[TmuxHealthMonitor] Heartbeat updated for farm ${farmSession.farmId}`);
  }
}
```

### Fix 3: Real-time WebSocket Streaming

**Location**: `apps/api/src/services/terminalFileWatcherService.ts`

Ensure watcher emits on EVERY file change:

```typescript
this.watcher.on('change', async (filepath: string) => {
  const { farmId, agentIndex } = this.parseFilePath(filepath);

  try {
    const content = await fs.promises.readFile(filepath, 'utf-8');
    const lines = content.split('\\n').filter(l => l.trim());
    const recentLines = lines.slice(-50); // Last 50 lines

    // Emit to WebSocket IMMEDIATELY
    this.websocketManager.emitToRoom(`farm-${farmId}`, 'terminal:output', {
      farmId,
      agentIndex,
      content: recentLines.join('\\n'),
      timestamp: new Date().toISOString()
    });

    // Also emit individual lines for real-time feel
    const latestLine = lines[lines.length - 1];
    if (latestLine) {
      this.websocketManager.emitToRoom(`farm-${farmId}`, 'terminal:line', {
        farmId,
        agentIndex,
        line: latestLine,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error(`Failed to emit terminal output for ${filepath}:`, error);
  }
});
```

### Fix 4: Verify Orchestrator Launch Chain

**Check Point 1**: `UnifiedFarmLaunchOrchestrator.ts:launchXenoSyncAgents`

```typescript
// Line ~1050: Verify spawn call
const orchestratorProcess = spawn('python3', [
  orchestratorScript,
  '--prompt-file', promptFile,
  '--num-agents', config.agentCount.toString(),
  '--farm-id', config.farmId,
  '--session', state.sessionName,
  '--workspace-dir', workspaceDir,
  '--provider', config.provider || 'claude'
], {
  env: {
    ...process.env,
    ANTHROPIC_API_KEY: apiKey,  // CRITICAL: Must be set
    TMUX_TMPDIR: '/tmp'
  },
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe']  // Capture stdout/stderr
});

// CRITICAL: Log orchestrator output
orchestratorProcess.stdout?.on('data', (data) => {
  logger.info(`[Orchestrator ${config.farmId}] ${data.toString()}`);
});

orchestratorProcess.stderr?.on('data', (data) => {
  logger.error(`[Orchestrator ${config.farmId}] ERROR: ${data.toString()}`);
});
```

**Check Point 2**: `orchestrator.py` - Verify Claude launch

```python
# Must call send_tmux_command for EACH agent:
def launch_agent(agent_idx, agent_name, workspace, pane_index):
    pane = f"{session_name}:agents.{pane_index}"

    # Set environment
    send_tmux_command(pane, f"export ANTHROPIC_API_KEY='{api_key}'")
    send_tmux_command(pane, f"cd {workspace}")

    # Launch Claude
    claude_cmd = f"claude --dangerously-skip-permissions -p '{prompt}'"
    send_tmux_command(pane, claude_cmd)

    # Verify launched
    time.sleep(2)
    verify_agent_running(pane)
```

## 🔍 IMMEDIATE DIAGNOSTIC STEPS

### Step 1: Check Why Orchestrator Isn't Launching Claude

```bash
# Find orchestrator for any active farm
FARM_ID=$(env TMUX_TMPDIR=/tmp tmux list-sessions | grep farm- | head -1 | cut -d: -f1 | cut -d- -f2)

# Check orchestrator process
ps aux | grep "orchestrator.py.*$FARM_ID"

# Check orchestrator logs (if captured)
tail -100 /Users/rohnspringfield/maifarm/logs/orchestrator-$FARM_ID.log

# Check prompt file
cat /Users/rohnspringfield/maifarm/var/maibarn/xenosync-sessions/prompt-$FARM_ID*.yaml

# Manually test Claude launch in tmux pane
env TMUX_TMPDIR=/tmp tmux send-keys -t farm-$FARM_ID:agents.0 "claude --version" Enter
sleep 1
env TMUX_TMPDIR=/tmp tmux capture-pane -t farm-$FARM_ID:agents.0 -p
```

### Step 2: Verify API Key Environment

```bash
# Check if API key is set in orchestrator environment
ps eww $(pgrep -f "orchestrator.py.*$FARM_ID") | tr ' ' '\\n' | grep ANTHROPIC
```

### Step 3: Check Orchestrator Stdout/Stderr

The orchestrator output should show:
```
[2025-10-02 16:38:47] [INFO] Session farm-044d90e3 verified with 5 panes
[2025-10-02 16:38:48] [INFO] Launching Claude agent 0 (Bessie the Cow)
[2025-10-02 16:38:50] [INFO] Agent 0 is ready (detected output)
[2025-10-02 16:38:50] [INFO] Claude agent 0 launched successfully
```

If missing → Orchestrator is silently failing to launch Claude

## 📊 SUCCESS CRITERIA

After fixes:
1. ✅ Orchestrator launches Claude processes in ALL tmux panes
2. ✅ Terminal logs show Claude conversation (not just echo)
3. ✅ Farm stays "active" for full duration (no orphaning)
4. ✅ Frontend shows real-time output WITHOUT refresh
5. ✅ Heartbeat updated every 30-60 seconds
6. ✅ WebSocket events stream continuously

## 🚀 IMPLEMENTATION PRIORITY

1. **P0 - Debug Orchestrator** (Blocks everything)
2. **P0 - Fix Claude Launch** (No point fixing anything else first)
3. **P1 - Implement Heartbeat** (Prevents orphaning)
4. **P1 - Enable WebSocket Streaming** (User experience)
5. **P2 - Add Monitoring** (Observability)

## 💡 LIKELY ORCHESTRATOR BUGS

Based on symptoms, most likely issues:
1. API key not being passed to orchestrator environment
2. Orchestrator catching exception and silently failing
3. Claude command malformed or path incorrect
4. Prompt file not found or empty
5. Orchestrator completing before agents launch (race condition)
