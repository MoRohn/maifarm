# Farm Launch Process Improvements

## Issues Identified from Log Analysis

1. **Cross-farm contamination**: System trying to capture from wrong farm sessions
2. **Agent count mismatch**: Defaulting to 2 agents instead of actual XenoSync count
3. **Race conditions**: Tmux panes not ready when streaming starts
4. **Session naming inconsistency**: Mix of short and full UUIDs causing confusion
5. **No cleanup mechanism**: Orphaned sessions interfering with new farms

## Implemented Solutions

### 1. Session Isolation & Cleanup (`SessionCleanupManager.ts`)

- **Automatic orphan detection**: Scans for inactive tmux sessions every 30 seconds
- **Pre-launch cleanup**: Removes any existing sessions before creating new farms
- **Active farm tracking**: Prevents cleanup of running farms
- **Graceful cleanup**: Properly stops streams and kills tmux sessions

### 2. Agent Count Propagation

- **Pending session registry**: XenoSync pre-registers expected agent count
- **Multi-service registration**: Updates both terminal service and stream service
- **Fallback hierarchy**:
  1. Check pending session info
  2. Query farm database
  3. Use mode-based defaults (5 for XenoSync/GoWild, 2 for QuickTask)

### 3. Enhanced Session Readiness Checks

- **Clean session naming**: Ensures consistent `farm-{shortId}` format
- **Robust pane detection**: Validates both session and pane existence
- **Timeout protection**: 30-second maximum wait with 100ms polling
- **Improved error messages**: Clear indication of what's missing

### 4. Comprehensive Error Recovery (`TerminalStreamRecovery.ts`)

- **Health monitoring**: Checks stream health every 10 seconds
- **Automatic recovery**: Attempts to restart failed streams
- **Exponential backoff**: Retry delays from 1s to 30s
- **Session repair**: Attempts to fix broken tmux sessions
- **Recovery events**: Broadcasts success/failure to clients

### 5. Farm ID Normalization

- **Consistent ID handling**: Always uses 36-char UUIDs internally
- **Short ID generation**: Uses first 8 chars for session names
- **Cross-contamination prevention**: Strict ID validation and cleanup

## Key Code Changes

### Terminal Stream Service
- Added pending session registry for accurate agent counting
- Enhanced session readiness checks with proper isolation
- Improved error handling with non-blocking stream starts
- Added `getAllStreamingStatus()` for health monitoring

### Terminal Stream Fix
- Enhanced agent count detection from multiple sources
- Proper farm ID cleaning and normalization
- Better streaming status validation

### XenoSync Integration
- Pre-registers sessions with accurate agent counts
- Updates both terminal services for consistency
- Provides window target information

### Farm Service
- Integrated session cleanup manager
- Pre-launch cleanup of orphaned sessions
- Proper lifecycle management with registration/unregistration

## Result

The improvements create a more robust farm launch process that:

1. **Prevents cross-contamination** between different farm sessions
2. **Accurately tracks agent counts** from XenoSync notifications
3. **Handles race conditions** with proper readiness checks
4. **Automatically recovers** from transient failures
5. **Cleans up orphaned resources** to prevent interference

## Monitoring & Debugging

### Key Log Messages to Watch
- `[SessionCleanupManager] Found X orphaned sessions to clean`
- `[TerminalStreamFix] Using pending session agent count: X`
- `[TerminalStreamService] Session farm-XXX pane Y is ready`
- `[TerminalStreamRecovery] Successfully recovered stream farm:agent`

### Health Check Endpoints
```bash
# Check recovery status
curl http://localhost:4567/api/terminal/recovery-status

# Force cleanup specific farm
curl -X POST http://localhost:4567/api/farms/{farmId}/cleanup

# Get all streaming status
curl http://localhost:4567/api/terminal/streaming-status
```

## Future Enhancements

1. **Predictive failure detection** based on stream patterns
2. **Automatic pane recreation** for damaged sessions
3. **Stream quality metrics** for performance monitoring
4. **Client-side retry logic** for WebSocket reconnection
5. **Session template system** for faster farm creation