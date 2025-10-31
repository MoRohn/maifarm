# Terminal Streaming Fix - Final Solution

## Issue Analysis

The terminal streaming is failing because:

1. **Directory Mismatch**: Terminal files are being written to different directories:
   - Full farm ID: `/var/maibarn/terminals/b5e40088-6875-44bc-b2ec-089ce0233e1f/`
   - Truncated ID: `/var/maibarn/terminals/b5e40088/`

2. **File Watcher Not Finding Files**: The `terminalFileWatcherService.watchFarm()` is being called but not finding files because it's looking in the wrong directory.

3. **WebSocket Events Not Emitted**: Even when files exist, the watcher isn't detecting changes and emitting events.

## Root Cause

The terminal streaming service writes to one directory pattern but the file watcher looks in another. This is because different services use different ID formats:
- `terminalStreamService` might use truncated IDs
- `terminalFileWatcherService` uses the ID passed to it (full)

## Solution

We need to:
1. Check both possible directory locations
2. Handle both full and truncated farm IDs
3. Ensure the file watcher actually watches the files that exist

## Files That Need Fixing

1. **terminalFileWatcherService.ts** - Check multiple directory patterns
2. **terminalStreamService.ts** - Ensure consistent directory usage
3. **terminalStreamFix.ts** - Pass correct IDs to file watcher

## Implementation Status

✅ Added debug logging to trace the issue
✅ Identified directory mismatch
⏳ Need to implement directory fallback logic
⏳ Need to test with both ID formats