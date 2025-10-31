# MaiFarm Farm Launch Issues - Comprehensive Analysis

## Executive Summary
After analyzing the MaiFarm codebase, I've identified multiple critical issues preventing robust farm launches and proper agent monitoring. The main problems center around:

1. **XenoSync Integration Gap** - XenoSync orchestrator exists but isn't properly integrated
2. **Pipe-pane Timing Issues** - Terminal output capture fails due to race conditions
3. **Claude CLI Launch Problems** - Command formatting and prompt delivery issues
4. **Terminal Streaming Reliability** - File watchers and WebSocket events not properly synchronized
5. **Health Monitoring Failures** - Agents not being properly tracked

## Critical Issues Identified

### 1. XenoSync Integration Problems

**Location**: `/apps/api/src/services/UnifiedFarmLaunchOrchestrator.ts`

**Issue**: The XenoSync integration in `launchXenoSyncAgents()` uses the wrong orchestrator script:
```typescript
// Line 938-943: Currently using main orchestrator.py
const orchestratorPath = path.join(
  process.cwd(),
  'scripts/python/orchestrator.py'  // Should potentially use xenosync orchestrator
);
```

**Impact**: XenoSync features not being utilized for multi-agent coordination

### 2. Pipe-pane Setup Race Conditions

**Location**: `/scripts/python/orchestrator.py`

**Issues Found**:
- Lines 283-296: Increased delays but still have race conditions
- Lines 302-308: Pipe-pane setup happens AFTER pane creation with insufficient verification
- Lines 344-386: Recovery mechanism exists but not always triggered

**Critical Code**:
```python
# Line 283-284: Still has timing issues
time.sleep(3.0)  # Increased but not reliable

# Line 295-296: Another arbitrary delay
time.sleep(1.5)  # May not be sufficient
```

**Impact**: Terminal output not captured, empty log files, no visible agent activity

### 3. Claude CLI Launch Command Issues

**Location**: `/scripts/python/orchestrator.py`

**Problems**:
- Line 1005: Command uses cat for prompt which may fail with special characters
- Line 842: Returns marker instead of actual command, requiring special handling
- Line 982-1031: Complex multi-step launch process prone to failures

**Problematic Code**:
```python
# Line 1005: Shell expansion issues
claude_cmd = f"claude --dangerously-skip-permissions -p \"$(cat '{prompt_file_path}')\""
```

**Impact**: Agents fail to receive prompts or launch with malformed commands

### 4. Terminal Streaming Pipeline Issues

**Location**: `/apps/api/src/services/UnifiedFarmLaunchOrchestrator.ts`

**Problems**:
- Lines 670-719: `setupPipePaneForAllAgents()` doesn't verify pipe-pane is actually working
- Lines 1245-1310: `setupTerminalStreaming()` has multiple failure points
- Line 1308: Force capture delayed by 3 seconds may be too late

**Impact**: Frontend shows empty terminals even when agents are running

### 5. Missing Orchestrator Bridge Communication

**Location**: `/apps/api/src/services/UnifiedFarmLaunchOrchestrator.ts`

**Issue**: Lines 1003-1061 attempt to use OrchestratorBridge but:
```typescript
// Line 1004: Waiting for ready signal that may never come
const orchestratorStatus = await orchestratorBridge.waitForOrchestratorReady(
  config.farmId,
  {
    timeout: 90000, // 90s timeout too long
    requiredStatus: [OrchestratorStatus.READY]
  }
);
```

**Impact**: System waits for orchestrator readiness that never signals properly

## Recommended Fixes

### Fix 1: Improve Pipe-pane Setup Reliability

**File**: `/scripts/python/orchestrator.py`

```python
def _create_session(self, session: str, num_agents: int) -> None:
    # ... existing code ...

    # After line 277, before creating session
    # Pre-verify tmux server is responsive
    for attempt in range(3):
        test_result = run_cmd(["tmux", "list-sessions"], capture=True)
        if test_result.returncode == 0:
            break
        time.sleep(1)

    # After line 301, improve pipe-pane setup
    for retry in range(3):
        # Set up pipe-pane with explicit 'exec' and immediate test
        pipe_cmd = ["tmux", "pipe-pane", "-t", f"{session}:agents.0", "-o", f"exec cat >> {first_log_file}"]
        result = run_cmd(pipe_cmd)

        if result.returncode == 0:
            # Immediate verification with test output
            test_cmd = ["tmux", "send-keys", "-t", f"{session}:agents.0",
                       f"echo '[PIPE-TEST-{datetime.now().isoformat()}]'", "Enter"]
            run_cmd(test_cmd)
            time.sleep(0.5)

            # Check if test message was captured
            if first_log_file.exists() and "[PIPE-TEST" in first_log_file.read_text():
                logger.info("Pipe-pane verified working for pane 0")
                break

        if retry < 2:
            time.sleep(1)
            logger.warning(f"Pipe-pane setup attempt {retry + 1} failed, retrying...")
```

### Fix 2: Simplify Claude Launch Process

**File**: `/scripts/python/orchestrator.py`

```python
def build_provider_command(self, provider: str, prompt: str, agent_idx: int = 0) -> str:
    if provider == "claude":
        api_key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("CLAUDE_API_KEY") or ""
        claude_bin = check_binary("claude", env_var="CLAUDE_BIN")

        if not claude_bin or not api_key or len(api_key) < 30:
            return "MOCK_AGENT:simple_mock_agent.py"

        # Write prompt to file with proper escaping
        prompt_file_path = self.cfg.coordination_dir / f"agent_{agent_idx}_prompt.txt"
        prompt_file_path.write_text(prompt, encoding='utf-8')

        # Return simplified launch marker
        return f"CLAUDE_SIMPLE:{agent_idx}:{prompt_file_path}"

def _launch_agent(self, agent_idx: int, pane: str) -> None:
    command = self.build_provider_command(self.cfg.provider, agent_prompt, agent_idx)

    if command.startswith("CLAUDE_SIMPLE:"):
        parts = command.split(":", 2)
        agent_id, prompt_file = parts[1], parts[2]

        # Clear and setup environment
        run_cmd(["tmux", "send-keys", "-t", pane, "clear", "Enter"])
        time.sleep(0.1)

        if self.cfg.workspace_dir:
            cd_cmd = f"cd {shlex.quote(str(self.cfg.workspace_dir))}"
            run_cmd(["tmux", "send-keys", "-t", pane, cd_cmd, "Enter"])
            time.sleep(0.2)

        # Set memory and launch Claude directly without cat
        mem_cmd = f"export NODE_OPTIONS='--max-old-space-size=2048'"
        run_cmd(["tmux", "send-keys", "-t", pane, mem_cmd, "Enter"])
        time.sleep(0.1)

        # Launch Claude first
        claude_cmd = "claude --dangerously-skip-permissions"
        run_cmd(["tmux", "send-keys", "-t", pane, claude_cmd, "Enter"])

        # Wait for Claude to initialize
        time.sleep(5)

        # Send prompt line by line
        with open(prompt_file, 'r') as f:
            for line in f:
                if line.strip():
                    # Use literal mode for safety
                    run_cmd(["tmux", "send-keys", "-t", pane, "-l", line.rstrip()])
                    run_cmd(["tmux", "send-keys", "-t", pane, "Enter"])
                    time.sleep(0.05)
```

### Fix 3: Add Orchestrator Status Signaling

**File**: `/scripts/python/orchestrator.py`

Add proper status signaling after line 433:

```python
def _verify_session_ready(self, timeout: int = 30) -> bool:
    # ... existing verification code ...

    if pane_count >= self.cfg.num_agents:
        # Write ready status immediately
        self._write_orchestrator_status("ready", list(range(pane_count)))

        # Also write to Node.js expected location
        node_status_file = Path.cwd() / "var" / "maibarn" / "coordination" / f"orchestrator_ready_{self.cfg.farm_id}.json"
        atomic_write_json(node_status_file, {
            "status": "ready",
            "sessionName": self.cfg.session_name,
            "farmId": self.cfg.farm_id,
            "panesCreated": pane_count,
            "timestamp": datetime.now().isoformat()
        })

        return True
```

### Fix 4: Enhance Terminal Streaming Reliability

**File**: `/apps/api/src/services/UnifiedFarmLaunchOrchestrator.ts`

Improve pipe-pane verification after line 700:

```typescript
private async setupPipePaneForAllAgents(...) {
  // ... existing setup code ...

  // After line 706, add verification
  for (let i = 0; i < agentCount; i++) {
    const outputFile = path.join(terminalDir, `agent-${i}.log`);
    const paneTarget = `${sessionName}:${windowName}.${i}`;

    // Set up pipe-pane with retries
    let pipeSuccess = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      await fs.writeFile(outputFile, `[Starting capture for Agent ${i}]\n`);

      const pipeCmd = ['pipe-pane', '-t', paneTarget, '-o', `cat >> ${outputFile}`];
      await this.executeTmuxCommand(pipeCmd);

      // Send test message
      await this.executeTmuxCommand(['send-keys', '-t', paneTarget,
        `echo '[PIPE-VERIFY-${Date.now()}]'`, 'Enter']);

      await new Promise(resolve => setTimeout(resolve, 500));

      // Check if file is growing
      const stats = await fs.stat(outputFile);
      if (stats.size > 30) {
        pipeSuccess = true;
        logger.info(LogCategory.TERMINAL, `Pipe-pane verified for ${paneTarget}`);
        break;
      }

      if (attempt < 2) {
        logger.warn(LogCategory.TERMINAL, `Pipe-pane attempt ${attempt + 1} failed for ${paneTarget}, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (!pipeSuccess) {
      logger.error(LogCategory.TERMINAL, `Failed to establish pipe-pane for ${paneTarget}`);
    }
  }
}
```

### Fix 5: Implement Proper Health Monitoring

**File**: Create `/apps/api/src/services/AgentHealthMonitor.ts`

```typescript
export class AgentHealthMonitor {
  private checkInterval = 15000; // 15 seconds
  private unhealthyThreshold = 60000; // 1 minute

  async checkAgentHealth(farmId: string, sessionName: string, agentIndex: number): Promise<boolean> {
    // Check if pane exists
    const paneExists = await this.checkPaneExists(sessionName, agentIndex);
    if (!paneExists) return false;

    // Check if log file is being written
    const logPath = path.join(pathConfig.getPath('TERMINALS_DIR'), farmId, `agent-${agentIndex}.log`);
    try {
      const stats = await fs.stat(logPath);
      const lastModified = stats.mtimeMs;
      const now = Date.now();

      if (now - lastModified > this.unhealthyThreshold) {
        // Try to recover pipe-pane
        await this.recoverPipePane(sessionName, agentIndex, logPath);
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  private async recoverPipePane(sessionName: string, agentIndex: number, logPath: string): Promise<void> {
    const paneTarget = `${sessionName}:agents.${agentIndex}`;

    // Re-establish pipe-pane
    await this.executeTmuxCommand(['pipe-pane', '-t', paneTarget, '-o', `cat >> ${logPath}`]);

    // Send test message
    await this.executeTmuxCommand(['send-keys', '-t', paneTarget,
      `echo '[HEALTH-CHECK-RECOVERY-${Date.now()}]'`, 'Enter']);

    logger.info(LogCategory.HEALTH, `Attempted pipe-pane recovery for ${paneTarget}`);
  }
}
```

## Testing Recommendations

1. **Test Pipe-pane Setup**:
   ```bash
   # Create test session and verify pipe-pane
   TMUX_TMPDIR=/tmp tmux new-session -d -s test-farm
   TMUX_TMPDIR=/tmp tmux pipe-pane -t test-farm:0 -o "cat >> /tmp/test.log"
   TMUX_TMPDIR=/tmp tmux send-keys -t test-farm:0 "echo 'Test message'" Enter
   sleep 1
   cat /tmp/test.log  # Should show the test message
   ```

2. **Test Claude Launch**:
   ```bash
   # Test Claude CLI with file-based prompt
   echo "Test prompt" > /tmp/test-prompt.txt
   claude --dangerously-skip-permissions < /tmp/test-prompt.txt
   ```

3. **Monitor Orchestrator Status**:
   ```bash
   # Watch for orchestrator status files
   watch -n 1 'ls -la /Users/rohnspringfield/maifarm/var/maibarn/coordination/orchestrator*.json'
   ```

## Immediate Actions Required

1. **Fix pipe-pane timing** - Implement proper verification loops
2. **Simplify Claude launch** - Use two-stage approach (launch then prompt)
3. **Add status signaling** - Ensure orchestrator communicates readiness
4. **Enhance monitoring** - Implement health checks with recovery
5. **Improve error handling** - Add proper error recovery mechanisms

## Long-term Recommendations

1. **Migrate to XenoSync** - Fully integrate the XenoSync orchestrator for better agent coordination
2. **Implement event-driven architecture** - Replace polling with proper event notifications
3. **Add comprehensive logging** - Include debug mode for troubleshooting
4. **Create integration tests** - Automated tests for the full launch pipeline
5. **Document failure modes** - Create runbooks for common issues

## Conclusion

The MaiFarm system has multiple points of failure in the farm launch pipeline, primarily centered around:
- Race conditions in tmux session and pipe-pane setup
- Unreliable Claude CLI launch commands
- Missing health monitoring and recovery mechanisms
- Poor error handling and status communication

Implementing the fixes above should significantly improve farm launch reliability and agent monitoring visibility.