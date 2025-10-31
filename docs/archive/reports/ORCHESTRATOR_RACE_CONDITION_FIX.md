
## CRITICAL FIX APPLIED - Orchestrator Health Check Race Condition

### Problem
TypeScript health monitoring was starting immediately after farm creation and running checks every 10 seconds, but the Python orchestrator waits 30 seconds before its first health check. This caused:
- TypeScript sees 'pane does not exist' after 10 seconds
- Recovery attempts triggered before orchestrator initialized
- Orchestrator/agents killed during startup
- XenoSync never able to fully initialize

### Solution
Added 45-second initialization grace period to FarmHealthMonitor:
- Health checks skipped during first 45 seconds
- Allows orchestrator time to initialize (30s + 15s buffer)
- Prevents premature recovery attempts
- Aligns TypeScript and Python health check timing

### Files Modified
1. **apps/api/src/services/OrchestratorHealthMonitor.ts** (THE CRITICAL FIX)
   - Added `startTime` field to MonitoredFarm interface (line 47)
   - Added `INITIALIZATION_GRACE_PERIOD = 45000` constant (line 55)
   - Modified `startMonitoring()` to store start time and log grace period (lines 89, 94-95)
   - Modified `emitHealthUpdate()` to suppress warnings during grace period (lines 239-264)
   - Modified `handleHealthIssues()` to suppress recovery attempts during grace period (lines 289-295)

2. apps/api/src/services/farmHealthMonitor.ts (also updated but not the primary issue)
   - Same grace period logic applied for consistency

### Changes
1. Added startTime field to FarmHealth interface
2. Added INITIALIZATION_GRACE_PERIOD constant (45000ms)
3. Modified startMonitoring() to store start time
4. Modified runHealthChecks() to skip checks during grace period

Date: Mon Oct  6 11:17:04 EDT 2025

