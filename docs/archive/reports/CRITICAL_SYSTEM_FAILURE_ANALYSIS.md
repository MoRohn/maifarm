# Critical System Failure: Terminal Streaming Complete Breakdown

## Executive Summary
The MaiFarm terminal streaming system is completely non-functional. Despite claims of "100% working", the reality is a **0% functional system** with failures at every level from database to UI.

## Failure Cascade

### Level 1: Database Layer ❌
- **Issue**: `farms_status_check` constraint violation
- **Impact**: Cannot create new farms
- **Error**: `error: new row for relation "farms" violates check constraint "farms_status_check"`

### Level 2: Orchestration Layer ❌
- **XenoSync Issue**: Creates tmux sessions on wrong path
  - Expected: `TMUX_TMPDIR=/tmp`
  - Actual: `/private/tmp/tmux-501/default`
- **Session Persistence**: Sessions disappear immediately after creation
- **Data Storage**: `tmuxSessionName` field never populated

### Level 3: Agent Management ❌
- **Agent Array**: Always empty `[]`
- **Agent Count**: Not tracked
- **Agent Status**: No data available

### Level 4: Terminal Capture ❌
- **Tmux Sessions**: Don't exist
- **Capture Attempts**: Failing continuously
- **Output Files**: Never created
- **File Watching**: Nothing to watch

### Level 5: WebSocket Layer ❌
- **Events Sent**: Yes (test shows 16 events)
- **Actual Content**: Empty/placeholder data
- **Real Terminal Output**: Never captured

### Level 6: UI Display ❌
- **Harvest Page**: Shows no terminals
- **Terminal Components**: Receive no real data
- **User Experience**: Complete failure

## Root Causes

1. **Environment Mismatch**
   - macOS uses `/private/tmp/tmux-501/default` by default
   - Code expects `TMUX_TMPDIR=/tmp`
   - XenoSync doesn't respect TMUX_TMPDIR setting

2. **Database Schema Issues**
   - Status constraint too restrictive
   - Missing proper default values
   - Migration failures cascading

3. **Launch Process Broken**
   - Orchestrator not creating persistent sessions
   - Session info not stored in database
   - Agent information not tracked

4. **No Error Recovery**
   - System keeps trying failed operations
   - No circuit breakers
   - Endless capture attempts on non-existent sessions

## Immediate Actions Required

### 1. Fix Database Constraint
```sql
ALTER TABLE farms
DROP CONSTRAINT IF EXISTS farms_status_check;

ALTER TABLE farms
ADD CONSTRAINT farms_status_check
CHECK (status IN ('idle', 'launching', 'active', 'running', 'completed', 'failed', 'cancelled'));
```

### 2. Fix Tmux Path Issue
- Ensure ALL tmux commands use `TMUX_TMPDIR=/tmp`
- Update XenoSync launcher to export TMUX_TMPDIR
- Add environment variable to orchestrator.py

### 3. Fix Session Persistence
- Store tmuxSessionName when creating farm
- Update agent array when launching
- Track session lifecycle properly

### 4. Fix Terminal Capture
- Verify session exists before capture
- Stop capture attempts when session dies
- Implement proper cleanup

### 5. Fix File Watching
- Only start watching when files exist
- Handle missing directories gracefully
- Stop watching on session end

## Testing Requirements

Before claiming "100% working", verify:

1. ✅ Can create a new farm via API
2. ✅ Tmux session is created and persists
3. ✅ Agent information is stored
4. ✅ Terminal output files are created
5. ✅ File watcher detects changes
6. ✅ WebSocket events contain real output
7. ✅ UI displays actual terminal content
8. ✅ Multiple agents stream simultaneously
9. ✅ Sessions clean up properly
10. ✅ System recovers from failures

## Current Score: 0/10 ❌

## Conclusion

The system is experiencing complete failure at every layer. No terminal output is reaching users. The claimed "100% working" status is entirely false. Immediate comprehensive fixes are required across all components to achieve even basic functionality.

**User Impact**: Users cannot monitor any agent activity. The core value proposition of MaiFarm is non-functional.

**Priority**: CRITICAL - System is unusable in current state.