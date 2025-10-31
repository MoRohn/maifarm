# Comprehensive Farm Launch & Terminal Streaming Fix Plan

## 🔴 ROOT CAUSES IDENTIFIED

### 1. **Dual Agent Creation Paths** (CRITICAL)
**Problem**: Two services create agents differently:
- `UnifiedFarmLaunchOrchestrator.ts` - Uses simple strings, sets 'primary'/'secondary'
- `UnifiedAgentService.ts` - Uses JSON objects, sets 'specialized'

**Impact**: Causes "Billy the Goat" JSON objects in database instead of simple names.

### 2. **TMUX_TMPDIR Inconsistency** (PARTIALLY FIXED)
**Problem**: Sessions created in `/tmp` but Bash looks in `/private/tmp` (macOS symlink).
**Status**: Fixed in pathConfig.ts but still showing `/private/tmp` errors.

### 3. **Agent Type Mismatch** (IDENTIFIED)
**Problem**: Database constraint allows ['primary', 'secondary', 'specialized'] but code inconsistently uses 'claude', 'specialized', etc.

### 4. **No Orchestrator Launch** (CRITICAL)
**Problem**: Tmux sessions created but orchestrator.py never launches Claude Code processes.
**Evidence**: Terminal logs show only shell prompts, no Claude Code output.

### 5. **Agent Count Discrepancy** (UI BUG)
**Problem**: UI shows "1 Agent" when 3 were requested and created in database.

## 🎯 COMPREHENSIVE FIX STRATEGY

### Phase 1: Standardize Agent Creation (CRITICAL - DO FIRST)

**File**: `/apps/api/src/services/unified/agentService.ts:69-70`

**Current Code (BROKEN)**:
```typescript
name: getFarmAgentName(i + 1),  // Returns JSON object!
type: 'specialized',
```

**Fixed Code**:
```typescript
import { getSimpleAgentName } from '../../utils/farmAgentNames';

// In createAgents() method:
name: getSimpleAgentName(i),  // Returns simple string like "Bessie the Cow"
type: i === 0 ? 'primary' : 'secondary',  // Matches UnifiedFarmLaunchOrchestrator
```

### Phase 2: Fix TMUX_TMPDIR Symlink Issue

**Problem**: macOS `/tmp` is symlink to `/private/tmp`. Commands fail when checking different paths.

**Solution**: Normalize ALL tmux commands to use `/private/tmp` consistently OR resolve symlinks.

**Files to Update**:
- All `TMUX_TMPDIR` environment variable settings
- All tmux command executions
- Python orchestrator.py

**Approach**:
```typescript
// In pathConfig.ts:
const defaultTmuxTmpDir = fs.realpathSync('/tmp');  // Resolves to /private/tmp on macOS
```

### Phase 3: Ensure Orchestrator Launches Claude Code

**Problem**: Orchestrator starts but never launches Claude Code in tmux panes.

**Root Cause**: Need to verify:
1. Orchestrator process receives correct arguments
2. Tmux session/panes exist when orchestrator tries to send commands
3. API keys are properly passed to orchestrator
4. Claude CLI is in PATH

**Debug Steps**:
1. Check orchestrator.py arguments in server logs
2. Verify tmux send-keys commands are executed
3. Check Claude CLI availability: `which claude`
4. Monitor orchestrator process: `ps aux | grep orchestrator`

### Phase 4: Fix WebSocket Terminal Streaming

**Problem**: Frontend shows "Waiting for output..." even when log files have content.

**Root Causes**:
1. Terminal file watcher not detecting file changes
2. WebSocket not emitting to correct room
3. Frontend not joining correct room
4. Pipe-pane not writing to log files

**Fix Checklist**:
- [ ] Verify pipe-pane is set up BEFORE sending commands
- [ ] Confirm log files are being written (check file size > 0)
- [ ] Verify terminalFileWatcherService is watching correct directory
- [ ] Check WebSocket room names match: `farm-${farmId}` vs `farm-${farmId.substring(0,8)}`
- [ ] Verify frontend joins room on mount

### Phase 5: Fix Agent Count Display

**Problem**: UI shows wrong agent count.

**Potential Causes**:
1. Frontend counting wrong data structure
2. WebSocket not broadcasting agent creation events
3. Farm config not synced with actual agents

**Fix**: Verify frontend agent counting logic uses actual agents array length.

## 📋 IMPLEMENTATION ORDER

### Step 1: Fix UnifiedAgentService (IMMEDIATE)
```bash
# Edit apps/api/src/services/unified/agentService.ts
# Change lines 69-70 to use getSimpleAgentName() and correct type
```

### Step 2: Fix TMUX_TMPDIR Symlink Resolution
```bash
# Edit apps/api/src/config/paths.ts
# Use fs.realpathSync('/tmp') to get actual path
```

### Step 3: Debug Orchestrator Launch
```bash
# Add extensive logging to orchestrator.py
# Verify Claude CLI is available
# Check tmux send-keys commands are executed
```

### Step 4: Verify Terminal Streaming Pipeline
```bash
# Check pipe-pane setup timing
# Verify file watcher is running
# Test WebSocket room joining
```

### Step 5: Clean Database & Test
```bash
# Delete all farms and agents
# Restart server with all fixes
# Create fresh test farm
# Verify all components working
```

## 🧪 VALIDATION CHECKLIST

After fixes, a successful farm launch should show:

- [ ] Agents created with simple names: "Bessie the Cow", "Cluck the Chicken", etc.
- [ ] Agent types are 'primary' (agent 0) and 'secondary' (others)
- [ ] Agent count in UI matches requested count
- [ ] Tmux session created in correct location (no /private/tmp errors)
- [ ] Orchestrator process launches and stays running
- [ ] Claude Code processes start in tmux panes
- [ ] Terminal logs capture Claude Code output
- [ ] WebSocket streams output to frontend in real-time
- [ ] Terminal windows show actual Claude Code conversation
- [ ] Farm stays "active" for full timeout (no premature orphaning)
- [ ] Agents complete work and farm transitions to "completed"

## 🚨 CRITICAL SUCCESS FACTORS

1. **Single Agent Creation Path**: Use ONLY UnifiedFarmLaunchOrchestrator for agent creation
2. **Consistent Naming**: Always use `getSimpleAgentName(index)` - never getFarmAgentName()
3. **Proper Types**: Agent type MUST be 'primary', 'secondary', or 'specialized' - never 'claude'
4. **TMUX_TMPDIR Consistency**: ALL tmux operations use same resolved path
5. **Orchestrator Monitoring**: Verify processes are running AND sending commands to tmux
6. **Terminal Streaming**: Pipe-pane MUST be set up before any command execution
7. **WebSocket Rooms**: Frontend and backend MUST use identical room naming

## 📊 EXPECTED OUTCOMES

✅ **Stable Farm Launches**: 95%+ success rate
✅ **Correct Agent Names**: No more "Billy the Goat" duplicates
✅ **Real-time Streaming**: See Claude Code output immediately
✅ **Accurate Monitoring**: UI reflects actual farm state
✅ **No Orphaning**: Farms run to completion or configured timeout
✅ **Database Integrity**: All constraints respected, no errors

## 🔧 MAINTENANCE NOTES

**To prevent regression**:
1. Add integration tests for farm launch workflow
2. Add validation for agent name format (must be string, not object)
3. Add validation for agent type (must be in allowed enum)
4. Add monitoring for orchestrator process health
5. Add alerts for terminal streaming failures
6. Document the SINGLE agent creation path requirement
