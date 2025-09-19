# CRITICAL ISSUES IDENTIFIED

## Major Problems Found:

### 1. Quick Task Mode Hanging
- **Root Cause**: Python launcher script (`quick-task-launcher.py`) is not executing properly
- **Issue**: The farmLaunchCoordinator spawns the Python process but it either:
  - Never executes the Claude CLI commands
  - Fails silently due to environment issues
  - Has path/permission problems with the Claude CLI
- **Evidence**: Tmux sessions are created with empty panes - no Claude processes running

### 2. API Response Hanging
- **Quick Task endpoint** (`/api/tasks/quick`) accepts requests but never returns
- **Farm endpoint** likely has similar issues
- **GoWild endpoint** probably affected too

### 3. Terminal Streaming Not Working
- Agents aren't launching, so there's nothing to stream
- WebSocket connections work but no data flows

## Recommended Fixes:

### Option 1: Direct Tmux Commands (Simplest)
Instead of using Python launcher, directly execute tmux commands from Node.js:
```javascript
// In farmLaunchCoordinator.ts, replace Python launcher with:
const claudeCmd = `claude --dangerously-skip-permissions -p "${options.prompt}"`;
for (let i = 0; i < options.numberOfAgents; i++) {
  await exec(`tmux send-keys -t ${sessionName}:agents.${i} '${claudeCmd}' Enter`);
}
```

### Option 2: Fix Python Launcher
- Add proper error handling and logging
- Ensure Claude CLI path is in PATH
- Add retry logic
- Write logs to file for debugging

### Option 3: Use XenoSync for Everything
- XenoSync seems more mature
- Already handles Claude launching
- Just needs configuration adjustment

## Testing Verification Needed:
1. Check if Claude CLI actually works: `claude --version`
2. Verify API key is valid
3. Test tmux command execution manually
4. Check Python environment and dependencies

## Files That Need Fixing:
- `/server/services/farmLaunchCoordinator.ts` - Main issue location
- `/server/orchestrators/quick-task-launcher.py` - Not working properly
- `/server/services/quickTaskService.ts` - Might need timeout handling
- `/server/api/tasks.ts` - Needs error handling for hanging launches

## Current Status:
- Server starts ✅
- API endpoints respond ❌ (hang indefinitely)
- Tmux sessions created ✅
- Agents launched ❌
- Terminal output ❌
- TypeScript compilation ⚠️ (592 errors remaining)