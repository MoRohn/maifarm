# MaiFarm Service Consolidation Plan

## Overview
This document maps out the service consolidation strategy to reduce ~200+ service files to approximately 30 core services.

## Service Categories & Consolidation Strategy

### 1. Terminal & Tmux Services (15 files → 2 files)

#### Current Duplicates:
- `terminalStreamService.ts`
- `terminalStreamUnified.ts`
- `terminalStreamEnhanced.ts`
- `terminalStreamStandardized.ts`
- `terminalStreamCoordinator.ts`
- `terminalStreamMigration.ts`
- `terminalStreamingFix.ts`
- `terminalOutputCache.ts`
- `terminalOutputWatcher.ts`
- `terminalViewCoordinator.ts`
- `tmuxHelper.ts`
- `tmuxSessionResolver.ts`
- `tmuxHealthManager.ts`
- `tmuxHealthMonitor.ts`
- `tmuxConnectionPool.ts`

#### Target Services:
1. **`terminalService.ts`** - Unified terminal streaming, output capture, and caching
2. **`tmuxService.ts`** - Session management, health monitoring, and connection pooling

---

### 2. Farm Management Services (12 files → 2 files)

#### Current Duplicates:
- `farmManager.ts`
- `farmLauncher.ts`
- `FarmLauncherV2.ts`
- `robustFarmLauncher.ts`
- `farmLaunchCoordinator.ts`
- `farmLaunchOptimized.ts`
- `farmLifecycleManager.ts`
- `enhancedFarmLifecycle.ts`
- `farmCompletionFix.ts`
- `farmHarvestIntegration.ts`
- `zombieFarmCleanup.ts`
- `farmersService.ts`

#### Target Services:
1. **`farmService.ts`** - Farm lifecycle, creation, management, and cleanup
2. **`farmLauncherService.ts`** - Launch coordination and optimization

---

### 3. Quick Task Services (4 files → 1 file)

#### Current Duplicates:
- `quickTaskService.ts`
- `quickTaskServiceV2.ts`
- `quickTaskExecutor.ts`
- `quickTaskOptimizationCoordinator.ts`

#### Target Service:
1. **`quickTaskService.ts`** - All quick task functionality consolidated

---

### 4. Coordination Services (10+ files → 2 files)

#### Current Duplicates:
- `coordinationFileWatcher.ts`
- `unifiedCoordinationService.ts`
- `fileBasedCoordination.ts`
- `workCoordination.ts`
- `projectWorkspaceCoordinator.ts`
- `redisCoordinationStore.ts`
- `StateCoordinator.ts`
- `agentCoordinator.ts`
- `agentCoordinatorV2.ts`
- `claudeCodeCoordinator.ts`

#### Target Services:
1. **`coordinationService.ts`** - Central coordination hub
2. **`redisStateService.ts`** - Redis-backed state management

---

### 5. Agent Management Services (8+ files → 2 files)

#### Current Duplicates:
- `agentManager.ts`
- `agentCoordinator.ts`
- `agentCoordinatorV2.ts`
- `agentHealthMonitor.ts`
- `agentRecoveryService.ts`
- `agentCleanupService.ts`
- `agentErrorDetectionService.ts`
- `reapAgentsService.ts`

#### Target Services:
1. **`agentService.ts`** - Agent lifecycle and management
2. **`agentHealthService.ts`** - Health monitoring and recovery

---

### 6. Harvest Services (6+ files → 1 file)

#### Current Duplicates:
- `harvestService.ts`
- `harvestFileCollector.ts`
- `HarvestOrchestrator.ts`
- `harvestIntegrityService.ts`
- `harvestSessionBroadcaster.ts`
- `harvestSessionCache.ts`

#### Target Service:
1. **`harvestService.ts`** - Complete harvest functionality

---

### 7. AI Provider Services (10+ files → 2 files)

#### Current Duplicates:
- `aiOrchestrator.ts`
- `claudeCodeManager.ts`
- `openaiCodeManager.ts`
- `qwenCodeManager.ts`
- `ollamaService.ts`
- `ollamaIntegration.ts`
- `multiClaudeService.ts`
- `multiClaudeServiceV2.ts`
- `multiClaudeIntegration.ts`
- `mixedProviderOrchestrator.ts`
- `dynamicProviderRouter.ts`

#### Target Services:
1. **`aiProviderService.ts`** - Provider abstraction and routing
2. **`multiAgentService.ts`** - Multi-agent coordination

---

### 8. Metrics & Monitoring Services (8+ files → 2 files)

#### Current Duplicates:
- `metricsCollector.ts`
- `metricsAggregator.ts`
- `realtimeMetricsService.ts`
- `realtimeMetricsAggregator.ts`
- `MetricsPipeline.ts`
- `monitoringService.ts`
- `performanceMonitor.ts`
- `providerMetricsService.ts`

#### Target Services:
1. **`metricsService.ts`** - Metrics collection and aggregation
2. **`monitoringService.ts`** - System monitoring and alerting

---

### 9. Connection Management Services (6+ files → 1 file)

#### Current Duplicates:
- `RealtimeConnectionManager.ts`
- `UnifiedConnectionHub.ts`
- `connectionPoolManager.ts`
- `apiConnectionManager.ts`
- `tmuxConnectionPool.ts`
- `sessionController.ts`

#### Target Service:
1. **`connectionService.ts`** - All connection management

---

### 10. Cache Services (4+ files → 1 file)

#### Current Duplicates:
- `unifiedCacheService.ts`
- `cacheService.ts`
- `terminalOutputCache.ts`
- `harvestSessionCache.ts`

#### Target Service:
1. **`cacheService.ts`** - Unified caching layer

---

## Implementation Strategy

### Phase 1: Create Core Services (Week 1)
1. Create new unified service files with proper interfaces
2. Implement dependency injection pattern
3. Add comprehensive logging and error handling

### Phase 2: Migration (Week 2)
1. Update all imports to use new services
2. Add compatibility layers for gradual migration
3. Test each service migration thoroughly

### Phase 3: Cleanup (Week 3)
1. Remove deprecated service files
2. Update tests to use new services
3. Document new service architecture

## Service Architecture Pattern

Each consolidated service will follow this pattern:

```typescript
// Example: terminalService.ts
import { injectable, inject } from 'inversify';
import { EventEmitter } from 'events';

@injectable()
export class TerminalService extends EventEmitter {
  constructor(
    @inject('RedisService') private redis: RedisService,
    @inject('ConfigService') private config: ConfigService
  ) {
    super();
  }

  // Unified methods from all terminal services
  async startStreaming(farmId: string): Promise<void> { }
  async stopStreaming(farmId: string): Promise<void> { }
  async captureOutput(sessionName: string): Promise<string> { }
  // ... etc
}
```

## Benefits

1. **Code Reduction**: ~85% reduction in service files
2. **Maintainability**: Clear service boundaries and responsibilities
3. **Performance**: Reduced memory overhead and faster startup
4. **Testing**: Easier to test with clear service interfaces
5. **Documentation**: Simpler to document fewer services

## Success Metrics

- Service file count: From 200+ to ~30
- Import statements: 70% reduction
- Memory usage: 50% reduction
- Startup time: 40% improvement
- Test execution time: 30% faster

## Risk Mitigation

1. Keep old services temporarily with deprecation warnings
2. Implement feature flags for gradual rollout
3. Comprehensive testing before each migration
4. Maintain backwards compatibility during transition
5. Document all breaking changes

## Next Steps

1. Review and approve this consolidation plan
2. Set up dependency injection framework
3. Begin implementing core services
4. Create migration scripts
5. Update documentation