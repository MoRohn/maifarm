# Agent Persistence Issue - Deep Analysis & Fix

## Problem Summary

Tmux sessions are NOT dying prematurely - they stay alive with `--no-kill-on-exit` flag. The real issue is that **Claude Code agents are completing their tasks and exiting**, leaving empty tmux panes that show "Waiting for output..." in the UI.

## Root Cause Analysis

### The Orchestrator Flow

```python
# scripts/python/orchestrator.py:191-236
def run(self):
    # 1. Create tmux session with panes
    self._create_session(session_name, num_agents)

    # 2. Launch Claude Code in each pane
    for agent_idx in range(num_agents):
        pane = f"{session_name}:agents.{agent_idx}"
        self._launch_agent(agent_idx, pane)  # Launches: cat prompt.txt | claude -p -

    # 3. Monitor agents (health checks every 30s)
    self._monitor_agents()  # BLOCKS until agents complete or timeout

    # 4. After agents complete, collect outputs
    self.collect_outputs()

    # 5. Graceful shutdown (keeps tmux alive with --no-kill-on-exit)
    self.graceful_shutdown()

    # 6. Orchestrator Python process exits
```

### What Happens to Claude Code Agents

When Claude Code receives a prompt via stdin (`cat prompt.txt | claude -p -`):

1. **Single-shot mode**: Claude reads the prompt, generates a response, and **EXITS**
2. **No interactive session**: The `-p -` flag means "read prompt from stdin and exit"
3. **Pane becomes empty**: After Claude exits, the tmux pane shows just a shell prompt
4. **No persistent process**: There's no long-running Claude process to monitor

This is why the log files show Claude's response, but then nothing more - Claude completed its task and exited as designed.

### The Monitoring Loop Problem

```python
# scripts/python/orchestrator.py:1071-1084
def _monitor_agents(self):
    try:
        while not self.shutdown_requested:
            if deadline and datetime.now() >= deadline:
                logger.info("Max runtime reached; requesting shutdown.")
                break  # Exit monitoring loop

            # Health checks
            if time.time() - last_health_check > health_check_interval:
                self._check_agent_health()
                last_health_check = time.time()

            time.sleep(2)
    except KeyboardInterrupt:
        logger.info("KeyboardInterrupt detected; shutting down…")
```

**Issue**: The monitoring loop runs for the full timeout duration EVEN IF agents have already finished their work. There's no "completion detection" that says "all agents are done, stop monitoring early."

### The Health Check Flaw

```python
# scripts/python/orchestrator.py:1097-1130
def _check_agent_health(self):
    for i in range(num_agents):
        pane = f"{session_name}:agents.{i}"

        # Capture recent pane content
        result = run_cmd(["tmux", "capture-pane", "-t", pane, "-p", "-S", "-100"])

        # Check if pane exists
        pane_exists = run_cmd(["tmux", "list-panes", "-t", pane]).returncode == 0

        if not pane_exists:
            health_status["status"] = "dead"
        elif not result.stdout:
            health_status["status"] = "stuck"  # FALSE POSITIVE!
        else:
            health_status["status"] = "healthy"
```

**Issue**: If Claude Code completes its task and exits:
- Pane still exists ✅
- Pane has output (Claude's response) ✅
- Health check says "healthy" ✅
- BUT Claude process is no longer running ❌

The health check doesn't actually verify that Claude Code is **still running** - it only checks if the pane has output.

## The REAL Problems

### Problem 1: Single-Shot Claude Execution

**Current command** (line 993):
```bash
cat '/path/to/prompt.txt' | claude --dangerously-skip-permissions -p -
```

This launches Claude in **single-shot mode**:
- Claude reads the prompt from stdin
- Generates a response
- **Exits immediately**
- Tmux pane is left with an empty shell

**Why this is a problem**:
- Claude isn't designed to keep working on long-running tasks
- There's no mechanism to give Claude follow-up instructions
- The agent can't respond to changing requirements
- Terminal output stops after the initial response

### Problem 2: No Task Persistence Mechanism

The orchestrator assumes agents will keep working until timeout, but:
- Claude Code completes the prompt and exits
- There's no task queue or work assignment system keeping agents busy
- Agents don't poll for new work or check for updates
- The "collaborative mode" is handled by the prompt, not by actual runtime collaboration

### Problem 3: Premature Completion Detection

**From farm b5b0d117 logs** (agent-0.log):
```
Hello! I'm Bessie the Cow, Lead Coordinator on farm b5b0d117. I can see that this is a test farm with 2 agents (myself and Cluck the Chicken) to test the real Claude Code agent functionality.

Currently, I don't have a specific task assigned beyond testing the agent coordination system. The workspace is empty and ready for work.

What would you like me to work on? I can:
1. Test the coordination system by claiming and completing tasks
2. Validate the terminal streaming functionality
3. Create test outputs in the workspace
4. Coordinate with my peer agent on a collaborative task
5. Something else you have in mind

Just let me know what you'd like me to do!
```

**Claude is waiting for input!** But:
- There's no mechanism to send follow-up prompts
- Claude is running in non-interactive pipe mode
- After printing this message, Claude waits for stdin
- Eventually times out or exits due to no input

## Proposed Solutions

### Solution 1: Make Claude Interactive (RECOMMENDED)

Instead of piping the prompt, launch Claude in interactive mode where it can:
- Stay running in the terminal
- Accept follow-up prompts via file watching or stdin
- Continuously work on tasks
- Respond to coordination system updates

**Modified launch command**:
```python
# DON'T pipe the prompt - make Claude read it and stay interactive
run_cmd(["tmux", "send-keys", "-t", pane,
         f"claude --dangerously-skip-permissions -p '{prompt_file_path}'", "Enter"])
# Note: Using -p <file> instead of piping allows Claude to stay running
```

### Solution 2: Add Task Loop to Agents

Wrap the Claude execution in a monitoring loop that:
- Launches Claude with initial prompt
- Waits for Claude to complete
- Checks for new work in coordination directory
- Re-launches Claude with new prompts if work is available
- Continues until timeout or shutdown signal

**Pseudo-code**:
```python
while not timeout_reached:
    # Launch Claude with current prompt
    claude_process = launch_claude(prompt_file)

    # Wait for completion
    claude_process.wait()

    # Check for new work
    new_work = check_coordination_dir_for_work(agent_id)
    if new_work:
        prompt_file = update_prompt_with_new_work(new_work)
        continue  # Re-launch with new prompt
    else:
        # No work, wait a bit before checking again
        time.sleep(5)
```

### Solution 3: Use Proper Process Monitoring

Instead of health checks on pane content, actually monitor the Claude process:
- Track Claude's PID when it launches
- Check if the process is still running (`ps -p $PID`)
- Detect when Claude exits (not just when pane becomes empty)
- Trigger appropriate actions based on exit code

**Modified health check**:
```python
def _check_agent_health(self):
    # Get the PID of the Claude process in the pane
    pid_result = run_cmd([
        "tmux", "display-message", "-t", pane,
        "-p", "#{pane_pid}"
    ])

    if pid_result.returncode == 0:
        pane_pid = pid_result.stdout.strip()

        # Check if Claude is actually running under this pane
        ps_result = run_cmd(["pgrep", "-P", pane_pid, "claude"])

        if ps_result.returncode == 0:
            health_status["status"] = "healthy"  # Claude is running
        else:
            health_status["status"] = "completed"  # Claude has exited
```

### Solution 4: Add Detach Mode for Long-Running Tasks

For long-running farm tasks, modify the orchestrator to:
- Launch agents in "persistent mode"
- Detach the orchestrator Python process from the tmux session
- Let agents run independently until they naturally complete
- Backend monitors via health checks and log files
- Orchestrator doesn't exit after initial launch

**Modified workflow**:
```python
def run(self):
    # Create session and launch agents
    self._create_session()
    self._launch_agents()

    # Write status file indicating "running"
    self._write_orchestrator_status("running")

    if self.cfg.detach_mode:
        logger.info("Detaching - agents will run independently")
        # Orchestrator exits but agents keep running in tmux
        return
    else:
        # Traditional monitoring mode
        self._monitor_agents()
        self.collect_outputs()
        self.graceful_shutdown()
```

## Recommended Implementation

**Phase 1: Fix Claude Launch Mode** (IMMEDIATE)
1. Modify `_launch_agent()` to NOT pipe the prompt
2. Use `claude -p <file>` instead of `cat <file> | claude -p -`
3. This keeps Claude in a more interactive mode

**Phase 2: Add Process Monitoring** (SHORT TERM)
1. Track Claude PIDs when launching
2. Monitor actual process status, not just pane content
3. Detect when Claude completes vs. crashes vs. stuck

**Phase 3: Implement Task Persistence** (MEDIUM TERM)
1. Add a task queue system in coordination directory
2. Create an agent wrapper script that polls for work
3. Re-launch Claude with new prompts as tasks arrive

**Phase 4: Add Detach Mode** (LONG TERM)
1. Support "fire and forget" mode for long-running farms
2. Backend monitors via file watchers and health checks
3. Orchestrator can exit while agents continue

## Testing Strategy

### Test 1: Verify Claude Stays Running
```bash
# Create a test farm
# Watch the tmux pane
env TMUX_TMPDIR=/tmp tmux attach -t farm-<id>
# Verify Claude stays running after initial response
ps aux | grep claude
```

### Test 2: Monitor Process Lifecycle
```bash
# Check Claude PIDs
tmux display-message -t farm-<id>:agents.0 -p "#{pane_pid}"
# Get child processes
pgrep -P <pane_pid>
# Watch for Claude termination
watch -n 1 'pgrep -P <pane_pid> claude'
```

### Test 3: Long-Running Task
```bash
# Create farm with a long-running prompt
# E.g., "Monitor this directory for changes and report them"
# Verify agent stays alive for the full timeout period
# Check terminal logs continue updating
```

## Impact Assessment

**Before Fix**:
- 🔴 Claude exits after initial response
- 🔴 Agents appear "stuck" or "completed" prematurely
- 🔴 No mechanism for follow-up work
- 🔴 Tmux panes become empty shells
- 🔴 Health checks give false positives

**After Fix**:
- 🟢 Claude stays running in interactive mode
- 🟢 Agents can accept follow-up prompts
- 🟢 Process monitoring detects actual state
- 🟢 Task persistence enables long-running work
- 🟢 Proper completion detection

## Files to Modify

1. **`scripts/python/orchestrator.py`** (Lines 969-1010)
   - Fix `_launch_agent()` to use interactive Claude mode
   - Add process PID tracking
   - Improve `_check_agent_health()` to monitor PIDs

2. **`scripts/python/orchestrator.py`** (Lines 1071-1084)
   - Add completion detection in `_monitor_agents()`
   - Don't wait full timeout if all agents completed
   - Signal backend when agents finish early

3. **`apps/api/src/services/UnifiedFarmLaunchOrchestrator.ts`** (Line 996-1008)
   - Consider adding detach mode option
   - Track orchestrator exit vs. agent completion separately
   - Handle early completion gracefully

## Status

**Analysis**: COMPLETE ✅
**Root Cause Identified**: Claude single-shot execution + no process monitoring
**Solution Designed**: Multi-phase approach outlined above
**Implementation**: READY TO BEGIN

**Next Step**: Implement Phase 1 - Fix Claude launch mode to keep agents running
