# XenoSync Orchestrator Integration Analysis

**Date**: 2025-10-06  
**Status**: ✅ **AGENTS LAUNCHING SUCCESSFULLY** - WebSocket streaming fix needed

## Executive Summary

**GOOD NEWS**: The XenoSync/orchestrator integration is **WORKING CORRECTLY**. Claude Code agents ARE launching, ARE registering, and ARE producing terminal output. The issue preventing terminal visibility on the Harvest Page is a **WebSocket event routing problem**, not an agent launch failure.

### Evidence of Success

1. **Agents Launch Successfully**  
   Terminal logs show Claude Code starting:
   ```
   var/maibarn/terminals/1c708f93.../agent-0.log:
   ▐▛███▜▌   Claude Code v2.0.8
   ▝▜█████▛▘  Sonnet 4.5 · Claude Max
   ```

2. **Database Registration Working**  
   Agents properly registered with unique names:
   ```sql
   Explorer Alpha (primary), Innovator Beta (secondary), Creator Gamma (secondary)...
   ```

3. **Orchestrator Status Tracking Working**  
   Python orchestrator reaches "ready" and "completed" states:
   ```json
   {"status": "completed", "sessionName": "wild-1c708f93", "panesCreated": 5}
   ```

4. **Terminal Output Captured**  
   Log files contain real output (585B to 9.4KB per agent)

## Root Cause: WebSocket Room Joining

### The 4-Stage Terminal Streaming Pipeline

✅ **Stage 1**: Orchestrator → tmux panes (WORKING)  
✅ **Stage 2**: Log files → File watcher (WORKING)  
✅ **Stage 3**: File watcher → WebSocket broadcast (WORKING)  
❌ **Stage 4**: WebSocket → Frontend (BROKEN)

### Critical Gap: Missing Room Join Handlers

**Problem**: Frontend emits `terminal:join_session` and `terminal:join_agent` events, but backend has no handlers that call `socket.join('farm-' + farmId)`.

**Result**: Backend broadcasts to `farm-${farmId}` room, but no sockets are in that room.

## Recommended Fixes

### Fix 1: Add WebSocket Room Join Handlers ⭐ CRITICAL

**File**: `apps/api/src/websocket/socketServer.ts`

Add these handlers in `setupSocketHandlers()`:

```typescript
socket.on('terminal:join_session', ({ sessionId, farmId }) => {
  const roomName = `farm-${farmId}`;
  socket.join(roomName);
  logger.info(LogCategory.TERMINAL,
    `Socket ${socket.id} joined room ${roomName} for session ${sessionId}`);
  
  // Confirm join
  socket.emit('terminal:joined', { sessionId, farmId, roomName });
});

socket.on('terminal:join_agent', ({ sessionId, farmId, agentId, agentIndex }) => {
  const agentRoom = `farm-${farmId}-agent-${agentId}`;
  socket.join(agentRoom);
  logger.info(LogCategory.TERMINAL,
    `Socket ${socket.id} joined agent room ${agentRoom}`);
  
  // Send initial state
  socket.emit('terminal:agent_ready', { farmId, agentId, status: 'connected' });
});
```

### Fix 2: Add Frontend Connection Logging

**File**: `apps/dashboard/src/components/Harvest/AgentTerminal.tsx`

Add after line 91:

```typescript
useEffect(() => {
  if (!socket || !connected) return;

  // Listen for join confirmations
  const handleJoined = (data: any) => {
    console.log(`[AgentTerminal] Joined room for farm ${farmId}, agent ${agentId}:`, data);
  };

  const handleAgentReady = (data: any) => {
    console.log(`[AgentTerminal] Agent ready for farm ${farmId}, agent ${agentId}:`, data);
  };

  socket.on('terminal:joined', handleJoined);
  socket.on('terminal:agent_ready', handleAgentReady);

  return () => {
    socket.off('terminal:joined', handleJoined);
    socket.off('terminal:agent_ready', handleAgentReady);
  };
}, [socket, connected, farmId, agentId]);
```

Enhance logging in `handleTerminalUpdate` (after line 126):

```typescript
const handleTerminalUpdate = (raw: any) => {
  const payload = raw?.payload ?? raw;
  
  // ADD: Debug logging
  console.log('[AgentTerminal] Received terminal:output:', {
    farmId,
    myAgentId: agentId,
    payloadFarmId: payload?.farmId,
    payloadAgentId: payload?.agentId,
    contentLength: payload?.lines?.length || payload?.output?.length || 0
  });
  
  // ... rest of existing code
};
```

### Fix 3: Add WebSocket Health Endpoint

**File**: `apps/api/src/api/websocket-health.ts`

```typescript
import { Router } from 'express';
import { websocketManager } from '../websocket/websocketManager';

const router = Router();

router.get('/api/websocket-health/:farmId', (req, res) => {
  const { farmId } = req.params;
  const roomName = `farm-${farmId}`;
  
  const sockets = websocketManager.getSocketsInRoom(roomName);
  const socketCount = sockets?.length || 0;
  
  res.json({
    farmId,
    roomName,
    connectedSockets: socketCount,
    socketIds: sockets?.map(s => s.id) || [],
    timestamp: new Date().toISOString()
  });
});

export default router;
```

## Validation Steps

### Step 1: Launch Test Farm
```bash
# Create a new farm from frontend
# Monitor backend logs for:
# - "Orchestrator ready for farm..."
# - "Socket XYZ joined room farm-..."
# - "Emitted terminal:output to rooms..."
```

### Step 2: Check Frontend Console
```bash
# In browser console (on Harvest page):
# Look for:
# - "[AgentTerminal] Joined room for farm ..."
# - "[AgentTerminal] Received terminal:output: ..."
```

### Step 3: Verify Room Membership
```bash
curl http://localhost:4567/api/websocket-health/YOUR_FARM_ID | jq '.'

# Should show:
# {
#   "connectedSockets": 1,
#   "socketIds": ["abc123..."]
# }
```

### Step 4: Check Live Terminal Logs
```bash
tail -f var/maibarn/terminals/FARM_ID/agent-0.log
# Should show live output as agents work
```

## Implementation Priority

1. **HIGH** (10 min) - Fix 1: Add room join handlers
2. **HIGH** (5 min) - Fix 2: Add frontend logging  
3. **LOW** (10 min) - Fix 3: Add health endpoint

**Total estimated time**: 25 minutes

## Success Criteria

✅ Frontend console shows "Joined room for farm..." messages  
✅ Frontend console shows "Received terminal:output event..." for each update  
✅ Terminal content appears in AgentTerminal components on Harvest page  
✅ `/api/websocket-health/{farmId}` shows at least 1 connected socket  
✅ No "terminal output not available" messages in UI

## Conclusion

The XenoSync integration is **fundamentally sound**. The orchestrator launches agents correctly, agents produce output, and the file watching system detects changes. The only missing piece is the **final WebSocket connection** between backend broadcasts and frontend listeners.

This is a **simple routing fix**, not a complex architectural issue. The agents ARE working - we just need to ensure their output reaches the browser.

**Confidence Level**: 95%

All evidence points to successful agent launch with a straightforward WebSocket room joining gap.
