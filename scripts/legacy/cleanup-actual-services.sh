#!/bin/bash

# MaiFarm Actual Service Cleanup Script
# Removes real deprecated services that exist in the codebase

# Don't exit on error - continue removing files

echo "🧹 MaiFarm Service Cleanup - Removing Actual Deprecated Services"
echo "================================================================="
echo ""

# Create backup directory
BACKUP_DIR="./backup_actual_$(date +%Y%m%d_%H%M%S)"
echo "📦 Creating backup directory: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

# Counter
REMOVED_COUNT=0

# Function to safely remove a file with backup
remove_with_backup() {
    local file="$1"
    if [ -f "$file" ]; then
        local backup_file="$BACKUP_DIR/$file"
        mkdir -p "$(dirname "$backup_file")"
        cp "$file" "$backup_file"
        rm "$file"
        echo "  ✓ Removed: $file"
        ((REMOVED_COUNT++))
    fi
}

echo ""
echo "🗑️  Removing deprecated services..."
echo ""

# AI Provider Services (keeping unified/aiProviderService.ts)
echo "🤖 AI Provider Services:"
remove_with_backup "server/services/claudeCodeCoordinator.ts"
remove_with_backup "server/services/claudeCodeManager.ts"
remove_with_backup "server/services/ollamaService.ts"
remove_with_backup "server/services/ollamaIntegration.ts"
remove_with_backup "server/services/ollamaModelDetector.ts"
remove_with_backup "server/services/qwenCodeManager.ts"
remove_with_backup "server/services/qwenApiClient.ts"
remove_with_backup "server/services/openaiCodeManager.ts"

# Farm Management (keeping unified/farmService.ts)
echo ""
echo "🚜 Farm Management Services:"
remove_with_backup "server/services/farmManager.ts"
remove_with_backup "server/services/farmLauncher.ts"
remove_with_backup "server/services/OrchestratorService.ts"
remove_with_backup "server/services/enhancedFarmLifecycle.ts"

# Agent Coordination (keeping unified/farmService.ts)
echo ""
echo "👥 Agent Services:"
remove_with_backup "server/services/agentCoordinator.ts"
remove_with_backup "server/services/agentCoordinatorV2.ts"
remove_with_backup "server/services/agentManager.ts"
remove_with_backup "server/services/agentRecoveryService.ts"
remove_with_backup "server/services/agentHealthMonitor.ts"
remove_with_backup "server/services/agentCleanupService.ts"

# Quick Task (keeping unified/quickTaskService.ts)
echo ""
echo "⚡ Quick Task Services:"
remove_with_backup "server/services/quickTaskService.ts"
remove_with_backup "server/services/quickTaskServiceV2.ts"
remove_with_backup "server/services/quickTaskExecutor.ts"
remove_with_backup "server/services/simpleQuickTaskService.ts"
remove_with_backup "server/services/quickTaskOptimizationCoordinator.ts"

# Harvest/Barn (keeping unified/farmService.ts)
echo ""
echo "🌾 Harvest & Barn Services:"
remove_with_backup "server/services/harvestService.ts"
remove_with_backup "server/services/harvestFileCollector.ts"
remove_with_backup "server/services/barnService.ts"
remove_with_backup "server/services/barnCatalogService.ts"
remove_with_backup "server/services/barnSyncService.ts"
remove_with_backup "server/services/HarvestOrchestrator.ts"
remove_with_backup "server/services/farmHarvestIntegration.ts"

# GoWild (keeping unified/farmService.ts)
echo ""
echo "🚀 GoWild Services:"
remove_with_backup "server/services/goWildManager.ts"
remove_with_backup "server/services/goWildManagerV2.ts"
remove_with_backup "server/services/goWildHarvestIntegration.ts"
remove_with_backup "server/services/safetyManager.ts"

# Terminal/Session (keeping unified/terminalService.ts)
echo ""
echo "📺 Terminal Services:"
remove_with_backup "server/services/terminalStreamService.ts"
remove_with_backup "server/services/terminalOutputWatcher.ts"
remove_with_backup "server/services/tmuxHelper.ts"
remove_with_backup "server/services/tmuxService.ts"
remove_with_backup "server/services/sessionManager.ts"
remove_with_backup "server/services/sessionCache.ts"
remove_with_backup "server/services/unifiedTmuxManager.ts"
remove_with_backup "server/services/tmuxSessionResolver.ts"
remove_with_backup "server/services/tmuxHealthManager.ts"

# State/Cache (keeping unified/stateCoordinator.ts)
echo ""
echo "📊 State Management Services:"
remove_with_backup "server/services/StateCoordinator.ts"
remove_with_backup "server/services/cacheService.ts"
remove_with_backup "server/services/cache.ts"
remove_with_backup "server/services/unifiedCacheService.ts"
remove_with_backup "server/services/unifiedRedisStateManager.ts"
remove_with_backup "server/services/redisCoordinationStore.ts"
remove_with_backup "server/services/redisService.ts"
remove_with_backup "server/services/stateManager.ts"

# WebSocket (keeping unified/websocketHub.ts)
echo ""
echo "🔌 WebSocket Services:"
remove_with_backup "server/services/UnifiedConnectionHub.ts"
remove_with_backup "server/services/RealtimeConnectionManager.ts"
remove_with_backup "server/services/websocketService.ts"
remove_with_backup "server/services/socketManager.ts"

# Workflow (consolidated into unified/farmService.ts)
echo ""
echo "⚙️ Workflow Services:"
remove_with_backup "server/services/workflowService.ts"
remove_with_backup "server/services/pipelineOrchestrator.ts"

# Monitoring (will be unified later)
echo ""
echo "📈 Monitoring Services:"
remove_with_backup "server/services/metricsCollector.ts"
remove_with_backup "server/services/performanceMonitor.ts"
remove_with_backup "server/services/alertingService.ts"
remove_with_backup "server/services/analyticsService.ts"
remove_with_backup "server/services/telemetryService.ts"
remove_with_backup "server/services/monitoringService.ts"

# Other duplicates
echo ""
echo "🔄 Other Duplicate Services:"
remove_with_backup "server/services/unifiedCoordinationService.ts"
remove_with_backup "server/services/multiClaudeService.ts"
remove_with_backup "server/services/multiClaudeServiceV2.ts"
remove_with_backup "server/services/multiClaudeIntegration.ts"
remove_with_backup "server/services/mixedProviderOrchestrator.ts"
remove_with_backup "server/services/dynamicProviderRouter.ts"
remove_with_backup "server/services/workCoordination.ts"
remove_with_backup "server/services/coordinationService.ts"

echo ""
echo "==============================================="
echo "✅ Cleanup Complete!"
echo "==============================================="
echo "📊 Files removed: $REMOVED_COUNT"
echo "📦 Backup location: $BACKUP_DIR"
echo ""
echo "📝 Next steps:"
echo "1. Run: npm run typecheck"
echo "2. Run: npm test"
echo "3. Commit: git commit -m 'refactor: Remove deprecated services - Phase 3'"