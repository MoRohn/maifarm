# Critical Terminal Display Fix

## Problem Identified
The CLI terminal windows are not appearing on the Harvest page because:

1. **No Active Tmux Sessions**: `TMUX_TMPDIR=/tmp tmux list-sessions` returns "No tmux sessions found"
2. **Backend Not Running**: The backend server is not active (port 4567 not responding)
3. **Terminal Streaming Disconnect**: The terminal streaming service is not initialized or connected
4. **Missing Session Initialization**: XenoSync sessions are not properly creating tmux sessions

## Root Causes

### 1. Session Creation Issue
- When farms are launched (especially with XenoSync), the tmux sessions may not be created properly
- The session naming convention mismatch between `quick_<farmId>` and `farm-<farmId>`

### 2. Terminal Streaming Service Not Active
- The `terminalStreamService` needs to be properly initialized when farms start
- The WebSocket connection for terminal events isn't established

### 3. Terminal Output Watcher Race Condition
- The watcher reports "Session no longer exists" immediately after creation
- Missing TMUX_TMPDIR=/tmp environment variable consistency

## Immediate Fix Required

### Step 1: Ensure Backend is Running
```bash
npm run start
# or
npm run dev
```

### Step 2: Check for Active Farms
```bash
curl http://localhost:4567/api/farms | jq '.'
```

### Step 3: Manual Session Creation (If Needed)
```bash
# Create a test session
TMUX_TMPDIR=/tmp tmux new-session -d -s farm-test -x 120 -y 40
```

### Step 4: Terminal Streaming Initialization Fix

The terminal streaming needs to be initialized when:
1. A farm is launched
2. XenoSync starts agents
3. Quick tasks are created

## Code Fixes Applied

### 1. Terminal Stream Service Initialization
- Added proper session initialization in `terminalStreamService.ts`
- Fixed adaptive polling intervals
- Added proper error handling and retry logic

### 2. Session Detection Fix
- Added 2-second stabilization delay before monitoring new sessions
- Improved session existence checking with retry logic
- Consistent TMUX_TMPDIR=/tmp usage

### 3. XenoSync Integration
- Ensured XenoSync creates sessions with correct naming convention
- Added proper terminal stream initialization after session creation
- Fixed window target detection for 'agents' window

### 4. WebSocket Event Flow
- Fixed terminal:join_session event handling
- Ensured terminal:output events are properly broadcast
- Added proper room management for terminal sessions

## Testing the Fix

### 1. Launch a Test Farm
```bash
# Via API
curl -X POST http://localhost:4567/api/farms \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Test task", "mode": "quick"}'
```

### 2. Check Terminal Sessions
```bash
# Check tmux sessions
TMUX_TMPDIR=/tmp tmux list-sessions

# Check via API
curl http://localhost:4567/api/harvest/terminal/sessions?farmId=<FARM_ID>
```

### 3. Monitor WebSocket Events
Open browser console and check for:
- `terminal:output` events
- `terminal:joined` confirmations
- Session streaming status

## Critical Files to Monitor

1. `/server/services/terminalStreamService.ts` - Main streaming service
2. `/server/websocket/terminalHandlers.ts` - WebSocket event handlers
3. `/server/services/XenoSyncService.ts` - XenoSync session creation
4. `/src/components/Harvest/CentralTerminalView.tsx` - Frontend display

## Expected Behavior

When working correctly:
1. Farm launch creates tmux session immediately
2. Terminal streaming starts automatically
3. WebSocket events flow to frontend
4. CLI windows appear with real-time output
5. Multiple agent panes visible in grid layout

## Emergency Recovery

If terminals still don't appear:

1. **Restart Backend**:
```bash
npm run start
```

2. **Clear Session Cache**:
```bash
curl -X POST http://localhost:4567/api/terminal/cleanup
```

3. **Force Session Recovery**:
```bash
curl -X POST http://localhost:4567/api/terminal/recover/<FARM_ID>
```

4. **Manual Terminal Attach**:
```bash
TMUX_TMPDIR=/tmp tmux attach -t farm-<SESSION_ID>
```

## Monitoring Commands

```bash
# Watch for new sessions
watch -n 1 'TMUX_TMPDIR=/tmp tmux list-sessions'

# Monitor WebSocket health
curl http://localhost:4567/api/websocket-health

# Check terminal streaming status
curl http://localhost:4567/api/terminal/debug
```

## Status
⚠️ **CRITICAL**: Terminal display functionality is broken
🔧 **ACTION REQUIRED**: Backend must be running for terminals to work
📝 **NEXT STEPS**: 
1. Start the backend server
2. Launch a test farm
3. Verify terminal sessions are created
4. Confirm WebSocket events are flowing