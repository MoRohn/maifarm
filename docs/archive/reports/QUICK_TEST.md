# Quick Terminal Streaming Test

## 1-Minute Validation

### Start App
```bash
npm run dev
```

### Create Farm
1. Open http://localhost:3000
2. Create any farm (Quick Task or Go Wild)
3. **Open browser console (F12)**
4. Navigate to Harvest page

### Check Console
Look for these 3 logs:

```
✅ [AgentTerminal] Successfully joined rooms
✅ [AgentTerminal] Received terminal:output event
✅ [AgentTerminal] Processing terminal output
```

### Check Health
```bash
# Replace FARM_ID with your actual ID
curl http://localhost:4567/api/websocket/farm/FARM_ID | jq '.totalUniqueConnections'

# Should return: 1 or higher
```

### Check UI
- Terminal content should appear in agent panels
- Output should update in real-time
- No "waiting for output" messages

## If It Works
✅ **Terminal streaming is operational**

## If It Doesn't
See `TERMINAL_STREAMING_FIX.md` for detailed troubleshooting

---

**Expected time**: < 2 minutes
