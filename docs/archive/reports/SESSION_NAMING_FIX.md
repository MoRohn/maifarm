# Session Naming Standardization - Fix Applied ✅

**Date**: 2025-10-06
**Issue**: Terminal streaming failures due to session name mismatch
**Status**: ✅ **RESOLVED**

---

## Problem Identified

### Root Cause
The terminal service was looking for sessions with `farm-{farmId}` prefix, but Quick Tasks were creating sessions with `quick-{farmId}` prefix. This caused the error:

```
TmuxError: Session farm-3a712bba not ready after 30 attempts
```

**Actual session created**: `quick-3a712bba`
**Service was looking for**: `farm-3a712bba`

### Impact
- Terminal streaming failed for Quick Task farms
- WebSocket connections couldn't establish
- Frontend didn't receive Claude Code agent output

---

## Solution Applied

### Code Changes

**File**: `apps/api/src/utils/sessionNaming.ts`

#### Before (Multiple Prefixes)
```typescript
export function getTmuxSessionName(farmId: string): string {
  // Quick task sessions
  if (farmId.startsWith('quick-task-')) {
    const taskId = farmId.replace('quick-task-', '');
    return `quick_${taskId.substring(0, 8)}`;
  }

  // GoWild sessions
  if (farmId.startsWith('gowild-') || farmId.startsWith('goWild-')) {
    const idPart = farmId.substring(farmId.indexOf('-') + 1);
    return `goWild-${idPart.substring(0, 8)}`;
  }

  // Standard farm sessions
  return `farm-${farmId.substring(0, 8)}`;
}
```

#### After (Standardized Prefix)
```typescript
export function getTmuxSessionName(farmId: string): string {
  // STANDARDIZED: All farms now use "farm-" prefix regardless of type
  // This simplifies terminal streaming and session management
  // Use only first 8 chars of UUID for tmux compatibility
  return `farm-${farmId.substring(0, 8)}`;
}
```

### Benefits of Standardization

1. **Simplified Logic**: One naming pattern for all farm types
2. **Consistent Discovery**: Terminal service can find sessions reliably
3. **Reduced Errors**: No more prefix mismatch issues
4. **Easier Debugging**: All sessions follow same pattern

---

## Validation

### Test Farm Created
**Farm ID**: `59334630-1b8b-4788-9f81-80c18c077277`
**Mode**: Quick Task
**Session Name**: `farm-59334630` ✅

### Evidence of Success

#### 1. Session Created with Correct Prefix
```bash
$ env TMUX_TMPDIR=/tmp tmux list-sessions
farm-59334630: 1 windows (created Mon Oct  6 07:47:30 2025)
```

#### 2. Terminal Logs Created
```bash
$ ls -lh var/maibarn/terminals/59334630*/
total 1040
-rw-r--r--  agent-0.log   113K
-rw-r--r--  agent-1.log   342K
```

#### 3. Agents Healthy
```json
{
  "farm_id": "59334630-1b8b-4788-9f81-80c18c077277",
  "session_name": "farm-59334630",
  "overall_status": "healthy",
  "agents": [
    {
      "agent_name": "Bessie the Cow",
      "pane": "farm-59334630:agents.0",
      "status": "healthy",
      "uptime_seconds": 229.28671
    },
    {
      "agent_name": "Cluck the Chicken",
      "pane": "farm-59334630:agents.1",
      "status": "healthy",
      "uptime_seconds": 229.300344
    }
  ]
}
```

#### 4. No Terminal Streaming Errors
```bash
$ tail -50 /tmp/maifarm-server.log | grep "TmuxError"
# No errors found
```

---

## Legacy Support

The `getFarmIdFromSessionName()` function still supports legacy prefixes for backward compatibility:

- `quick-*` (old Quick Tasks)
- `goWild-*` (old GoWild farms)
- `farm-*` (standard)

This ensures existing sessions continue to work during migration.

---

## Testing Checklist

- [x] Created Quick Task farm with standardized naming
- [x] Verified tmux session uses `farm-` prefix
- [x] Confirmed terminal logs are being created
- [x] Validated agents are healthy and running
- [x] Checked backend logs for errors (none found)
- [x] Confirmed terminal streaming service can find session

---

## Summary

**The session naming has been standardized to use `farm-` prefix for all farm types, resolving the terminal streaming errors.**

All future farms (Quick Tasks, standard farms, and GoWild) will now create sessions with consistent naming:
- Format: `farm-{first8charsOfUUID}`
- Example: `farm-59334630` for farm ID `59334630-1b8b-4788-9f81-80c18c077277`

This fix ensures the terminal service can reliably discover and stream output from all farm types.
