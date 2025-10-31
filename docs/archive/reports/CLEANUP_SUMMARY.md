# MaiFarm Codebase Cleanup Summary

## Date: October 3, 2025

### Files Removed

#### 1. Duplicate Orchestrator Files
- `server/orchestrators/xenosync-launcher.py` (symlink)
- `server/orchestrators/xenosync-maifarm-launcher.py` (symlink)
- `apps/api/src/orchestrators/xenosync-launcher.py`
- `apps/api/src/orchestrators/xenosync-maifarm-launcher.py`
- `apps/api/src/orchestrators/quick-task-launcher.py`
- `scripts/python/orchestrator_fixed.py`
- `./orchestrator.py` (misplaced in root)
- `scripts/python/mock_claude_agent.py` (unused)

#### 2. Unused Service Files
- `apps/api/src/services/farmLaunchCoordinator.ts`
- `apps/api/src/services/farmLaunchIntegration.ts`
- `apps/api/src/services/RobustFarmLaunchOrchestrator.ts`

#### 3. Duplicate Health Endpoints
- `apps/api/src/api/health.ts` (duplicate)
- `apps/api/src/api/healthCheck.ts` (duplicate)
- Kept: `apps/api/src/api/healthz.ts` (active)

#### 4. Old Coordination Files
- `apps/api/src/orchestrators/xenosync/.xenosync_coordination/` (entire directory)
- `apps/api/src/orchestrators/` (entire directory - unused)

### Configuration Changes

#### Quick Task Mode Updated
- Changed from 1 agent to 2 agents (XenoSync requires minimum 2)
- Enabled XenoSync for Quick Task mode
- Updated window name from '0' to 'agents' for consistency

### Remaining Structure

#### Core Orchestrators
- **Main**: `scripts/python/orchestrator.py`
- **Reap**: `scripts/python/orchestrator_reap.py`

#### Mock Agents (for testing)
- `scripts/python/simple_mock_agent.py` (used by main orchestrator)
- `scripts/python/enhanced_mock_agent.py` (used by XenoSyncService)

#### Services
- **Active Services**: 126 files
- **API Endpoints**: 46 files

### Key Service Used
- `apps/api/src/services/UnifiedFarmLaunchOrchestrator.ts` (main orchestration)
- `apps/api/src/services/unified/farmService.ts` (farm management)
- `apps/api/src/services/XenoSyncService.ts` (XenoSync integration)

### Farm Modes Configuration

| Mode | Agents | Timeout | XenoSync | Session Prefix |
|------|--------|---------|----------|----------------|
| Quick Task | 2 | 5 min | Yes | quick- |
| Harvest | 3 | User-defined | Yes | farm- |
| Go Wild | 5 | 30 min | Yes | farm- |

### Benefits of Cleanup
1. Removed ~15 duplicate/unused files
2. Eliminated confusion from multiple orchestrator versions
3. Standardized Quick Task mode to work with XenoSync
4. Clearer project structure with single source of truth for each component
5. Reduced maintenance burden

### Testing Script
- Created: `scripts/test-all-farm-modes.sh`
- Tests all three modes with proper validation
- Updated to reflect new Quick Task configuration