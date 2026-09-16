# Real-Time WebSocket Streaming - Testing Instructions

## 🎉 System Status

Your MaiFarm development environment is now fully running with enhanced WebSocket logging!

### ✅ Services Running

- **Backend API Server**: `http://localhost:4567` ✅
- **Frontend Dashboard**: `http://localhost:3000` ✅
- **WebSocket Server**: Port 4567 with enhanced logging ✅
- **Agent Activity Heartbeat**: Broadcasting every 500ms ✅
- **Terminal Streaming**: Ready for real-time output ✅

### 📊 What's Been Enhanced

1. **Farm Naming Fixed**
   - `FarmTaskModal.tsx` now has a dedicated farm name input field
   - Users can provide custom farm names or use timestamp fallback

2. **Enhanced Backend Logging**
   - Terminal output broadcasts log room name and client count
   - Agent activity broadcasts log every heartbeat (500ms)
   - Room join events log successful connections
   - All logs show exactly which rooms and how many clients

3. **Debug Tools Created**
   - `DEBUG_WEBSOCKET.md` - Comprehensive debugging guide
   - Browser console test scripts
   - Real-time event monitoring utilities

---

## 🧪 Step-by-Step Testing Guide

### Step 1: Open the Dashboard

Open your browser and navigate to:
```
http://localhost:3000
```

### Step 2: Create a Test Farm

1. **Click** the "New Farm" button (or farm creation action)

2. **Fill in the form:**
   - **Farm Name**: "Real-Time Streaming Test"
   - **Task Description**: "Write a simple Python script that prints numbers from 1 to 10, one per line"
   - **Agent Count**: 2 or 3 agents (start small for easier debugging)
   - **Time Limit**: 30 minutes

3. **Click "Launch Farm"**

### Step 3: Open Browser Developer Tools

**Immediately after launching the farm:**

1. Press **F12** (or **Cmd+Option+I** on Mac)
2. Go to the **Console** tab
3. **Paste this test script:**

```javascript
// ========================================
// Real-Time WebSocket Monitoring Script
// ========================================
(function() {
  console.log('🔍 Starting Real-Time WebSocket Monitor\n');
  console.log('==========================================\n');

  // Find the socket instance
  const socket = window.__socket || (window.io?.sockets?.[0]);

  if (!socket) {
    console.error('❌ CRITICAL: Socket not found!');
    console.error('   WebSocket might not be initialized.');
    console.error('   Check if useWebSocket() hook is working.');
    return;
  }

  // Display socket info
  console.log('✅ Socket Found:');
  console.log('   ID:', socket.id);
  console.log('   Connected:', socket.connected);
  console.log('   Rooms:', Array.from(socket.rooms || []));
  console.log('\n==========================================\n');

  // Counters
  let terminalOutputCount = 0;
  let activityUpdateCount = 0;
  let joinedEventReceived = false;

  // Monitor terminal:joined event
  socket.on('terminal:joined', (data) => {
    joinedEventReceived = true;
    console.log('✅ TERMINAL:JOINED Event Received:', data);
    console.log('   Farm ID:', data.farmId);
    console.log('   Rooms:', data.rooms);
    console.log('\n==========================================\n');
  });

  // Monitor terminal output
  socket.on('terminal:output', (data) => {
    terminalOutputCount++;
    const preview = data.content?.substring(0, 80) || 'No content';
    console.log(`[${terminalOutputCount}] 📟 TERMINAL OUTPUT:`);
    console.log(`   Agent ${data.agentIndex} | ${data.content?.length || 0} bytes`);
    console.log(`   Preview: "${preview}"`);
    console.log('');
  });

  // Monitor agent activity updates
  socket.on('agent:activity:update', (data) => {
    activityUpdateCount++;
    console.log(`[${activityUpdateCount}] 💓 AGENT ACTIVITY:`);
    console.log(`   Agent ${data.agentIndex}: ${data.agentName}`);
    console.log(`   Status: ${data.status} | Change: ${data.changeType}`);
    console.log(`   Streaming: ${data.isStreaming} | Output Lines: ${data.outputLineCount}`);
    console.log('');
  });

  // Status summary every 10 seconds
  setInterval(() => {
    console.log('📊 SUMMARY (Last 10 seconds):');
    console.log(`   Terminal Outputs: ${terminalOutputCount}`);
    console.log(`   Activity Updates: ${activityUpdateCount}`);
    console.log(`   Room Joined: ${joinedEventReceived ? 'YES ✅' : 'NO ❌'}`);
    console.log(`   Socket Connected: ${socket.connected ? 'YES ✅' : 'NO ❌'}`);
    console.log('\n==========================================\n');
  }, 10000);

  console.log('✅ Event Listeners Registered!');
  console.log('   Watching for: terminal:output, agent:activity:update, terminal:joined');
  console.log('\n🔎 Expected Behavior:');
  console.log('   - You should see [N] 📟 messages as agents produce output');
  console.log('   - You should see [N] 💓 messages every ~500ms (heartbeats)');
  console.log('   - Summary reports every 10 seconds\n');
  console.log('==========================================\n');
})();
```

### Step 4: Watch Backend Logs

**In your terminal** where you started the servers, you should see:

```
✅ Expected Log Pattern:

[TERMINAL] Socket {socket-id} successfully joined session farm-{id}.
            Rooms: farm:{full-farm-id} (1 clients), terminal:farm-{short-id} (1 clients)

[AGENT] Registered agent activity: Agent Name (farm-{id}:0)

[TERMINAL] Broadcasting terminal output to room farm:{full-farm-id} (1 clients):
           agent=0, bytes=123

[AGENT] Broadcasting agent activity: Agent Name (heartbeat) to farm:{full-farm-id}
```

**🔍 Key Indicator:** Check the **"(X clients)"** part:
- **(1 clients)** or more = ✅ Frontend successfully joined room
- **(0 clients)** = ❌ Frontend NOT in room (events won't be received)

### Step 5: Observe Real-Time Updates

**What You Should See:**

#### In Browser Console:
✅ `✅ TERMINAL:JOINED Event Received` - Confirms room join
✅ `[1] 📟 TERMINAL OUTPUT` - Output messages incrementing
✅ `[1] 💓 AGENT ACTIVITY` - Heartbeat messages every 500ms
✅ Summary reports showing non-zero counts

#### In Terminal View UI:
✅ Lines appearing in real-time WITHOUT page refresh
✅ Agent status badges updating (initializing → active → processing)
✅ "Last activity" timestamp updating frequently
✅ Agent names displaying correctly

#### In Network Tab (DevTools):
1. Go to **Network → WS** (WebSocket filter)
2. Click on the WebSocket connection
3. Go to **Messages** tab
✅ Should see messages streaming: `terminal:output`, `agent:activity:update`

---

## 🎯 Success Criteria

Your real-time streaming is **WORKING** if you see:

✅ Backend logs: `Broadcasting to room farm:{id} (1 clients)` or more
✅ Browser console: `[N] 📟` and `[N] 💓` messages appearing
✅ Terminal view: Lines appearing without refresh
✅ Agent badges: Status changing in real-time
✅ Network tab: WebSocket messages flowing

---

## ❌ Troubleshooting

### Problem 1: Backend Shows (0 clients)

**Symptoms:**
- Backend logs: `Broadcasting to room farm:{id} (0 clients)`
- No `terminal:joined` event in browser console

**Root Cause:** Frontend not joining WebSocket room

**Debug Steps:**
1. Check if `socket.connected` is `true` in console test
2. Verify `terminal:join_session` event is being emitted
3. Check for WebSocket connection errors in Network tab

**Fix:**
- Refresh the page
- Check if WebSocket server is accessible
- Verify `useWebSocket()` hook is returning connected socket

### Problem 2: Events Not Reaching Browser

**Symptoms:**
- Backend shows `(1 clients)` but no console messages
- Network tab shows no WebSocket messages

**Root Cause:** Event listeners not registered or socket disconnected

**Debug Steps:**
1. Check if test script ran without errors
2. Verify `socket.connected` is `true`
3. Check for JavaScript errors in console

**Fix:**
- Re-run the test script after farm launches
- Check if component mounted correctly
- Verify WebSocket reconnection logic

### Problem 3: Events Received But UI Not Updating

**Symptoms:**
- Console shows `[N] 📟` and `[N] 💓` messages
- But terminal view is frozen/empty

**Root Cause:** React state updates not triggering re-renders

**Debug Steps:**
1. Check if `setAgentOutputs()` is being called in event handlers
2. Verify terminal refs are not null
3. Check for stale closure issues in useEffect

**Fix:**
- Check `CentralTerminalView.tsx` useEffect dependencies (line 173)
- Verify event handlers have access to latest state
- Check if component is unmounting/remounting

### Problem 4: Only Some Agents Show Output

**Symptoms:**
- Agent 0 works, but Agent 1 and 2 don't show output
- Backend logs show broadcasts for all agents

**Root Cause:** Agent index normalization or output routing issue

**Debug Steps:**
1. Check console messages - are all agents producing output?
2. Verify `agentIndex` is being parsed correctly
3. Check if `agentOutputs` state has entries for all agents

**Fix:**
- Check `handleTerminalOutput` function in `CentralTerminalView.tsx`
- Verify agent ID extraction logic (lines 403-408)

---

## 🔧 Manual Testing Commands

### Check Backend Health
```bash
# Terminal health
curl -s http://localhost:4567/api/terminal-health/health | jq '.'

# Active farms
curl -s http://localhost:4567/api/farms | jq '.[] | {id, name, status, agentCount}'
```

### Check Tmux Sessions
```bash
# List sessions
TMUX_TMPDIR=/tmp tmux list-sessions

# List panes in farm
TMUX_TMPDIR=/tmp tmux list-panes -t farm-{id}:agents -F "#{pane_index} #{pane_current_command}"
```

### View Backend Logs in Real-Time
The backend is running in the background. Key logs to watch for:
- `[TERMINAL]` - Terminal streaming events
- `[AGENT]` - Agent activity heartbeats
- `[WEBSOCKET]` - WebSocket connection events

---

## 📞 Reporting Results

After testing, please report:

1. **Backend Logs:**
   - Are you seeing `(0 clients)` or `(1+ clients)`?
   - Are broadcasts happening frequently?

2. **Browser Console:**
   - Did the test script run successfully?
   - Are you seeing `[N] 📟` and `[N] 💓` messages?
   - What's the count after 30 seconds?

3. **UI Behavior:**
   - Does terminal update without refresh? YES/NO
   - Do agent badges update in real-time? YES/NO
   - Any errors in console?

4. **Network Tab:**
   - Are WebSocket messages visible? YES/NO
   - What events are being received?

---

## 🎉 Expected Success Scenario

**Timeline after farm launch:**

- **0-2 seconds:** Farm creation, database save
- **2-5 seconds:** Tmux session creation, agent spawning
- **5-10 seconds:** Backend logs show agents registered, terminal streaming started
- **10+ seconds:**
  - Console shows `[1] 📟` messages
  - Console shows `[1] 💓 [2] 💓` heartbeats every 500ms
  - Terminal view shows output appearing line by line
  - Agent badges show "active" or "processing"
  - NO PAGE REFRESH NEEDED!

If you see this pattern, **real-time streaming is working perfectly!** ✅

---

## 📚 Related Documentation

- **DEBUG_WEBSOCKET.md** - Detailed debugging guide with common issues
- **REAL_TIME_STREAMING_IMPLEMENTATION_COMPLETE.md** - Architecture documentation
- **CLAUDE.md** - Terminal streaming section

---

**Last Updated:** 2025-10-15
**Version:** Enhanced with comprehensive logging
**Status:** Ready for testing ✅
