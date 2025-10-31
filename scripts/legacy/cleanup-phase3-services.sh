#!/bin/bash

# MaiFarm Service Cleanup Script - Phase 3
# Comprehensive removal of 89 deprecated service files
# Creates backups before removal

set -e

echo "🧹 MaiFarm Service Cleanup - Phase 3 (89 files)"
echo "================================================"
echo ""

# Create backup directory
BACKUP_DIR="./backup_phase3_$(date +%Y%m%d_%H%M%S)"
echo "📦 Creating backup directory: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

# Counter for removed files
REMOVED_COUNT=0
NOT_FOUND_COUNT=0

# Function to safely remove a file with backup
remove_with_backup() {
    local file="$1"
    if [ -f "$file" ]; then
        # Create backup path maintaining directory structure
        local backup_file="$BACKUP_DIR/$file"
        mkdir -p "$(dirname "$backup_file")"
        cp "$file" "$backup_file"
        rm "$file"
        echo "  ✓ Removed: $file"
        ((REMOVED_COUNT++))
    else
        echo "  ⚠️  Not found: $file"
        ((NOT_FOUND_COUNT++))
    fi
}

echo ""
echo "🗑️  Starting cleanup of deprecated services..."
echo ""

# ===============================================
# Terminal & Session Services (15 files)
# ===============================================
echo "📺 Terminal & Session Services (15 files):"
remove_with_backup "server/services/terminalService.ts"
remove_with_backup "server/services/terminalManager.ts"
remove_with_backup "server/services/terminalStreamService.ts"
remove_with_backup "server/services/terminalOutputWatcher.ts"
remove_with_backup "server/services/tmuxService.ts"
remove_with_backup "server/services/tmuxHelper.ts"
remove_with_backup "server/services/sessionManager.ts"
remove_with_backup "server/services/sessionCache.ts"
remove_with_backup "server/services/terminalHealthService.ts"
remove_with_backup "server/services/terminalRecoveryService.ts"
remove_with_backup "server/services/terminalCleanupService.ts"
remove_with_backup "server/services/terminalBufferService.ts"
remove_with_backup "server/services/terminalHistoryService.ts"
remove_with_backup "server/services/terminalLogService.ts"
remove_with_backup "server/services/terminalMonitor.ts"

# ===============================================
# Farm Management Services (12 files)
# ===============================================
echo ""
echo "🚜 Farm Management Services (12 files):"
remove_with_backup "server/services/farmManager.ts"
remove_with_backup "server/services/farmLauncher.ts"
remove_with_backup "server/services/farmOrchestrator.ts"
remove_with_backup "server/services/OrchestratorService.ts"
remove_with_backup "server/services/farmLifecycleService.ts"
remove_with_backup "server/services/farmStateManager.ts"
remove_with_backup "server/services/farmTimeoutService.ts"
remove_with_backup "server/services/farmRecoveryService.ts"
remove_with_backup "server/services/farmValidationService.ts"
remove_with_backup "server/services/farmTemplateService.ts"
remove_with_backup "server/services/farmConfigService.ts"
remove_with_backup "server/services/farmMetricsService.ts"

# ===============================================
# State Management Services (10 files)
# ===============================================
echo ""
echo "📊 State Management Services (10 files):"
remove_with_backup "server/services/stateManager.ts"
remove_with_backup "server/services/stateService.ts"
remove_with_backup "server/services/stateSyncService.ts"
remove_with_backup "server/services/stateReconciler.ts"
remove_with_backup "server/services/cacheService.ts"
remove_with_backup "server/services/cache.ts"
remove_with_backup "server/services/redisService.ts"
remove_with_backup "server/services/persistenceService.ts"
remove_with_backup "server/services/stateValidator.ts"
remove_with_backup "server/services/stateHistory.ts"

# ===============================================
# WebSocket Services (6 files)
# ===============================================
echo ""
echo "🔌 WebSocket Services (6 files):"
# Note: socketServer.ts might be in use, check before removing
if [ -f "server/websocket/socketServer.ts" ]; then
    echo "  ⚠️  Skipping socketServer.ts (may be in use)"
else
    remove_with_backup "server/websocket/socketServer.ts"
fi
remove_with_backup "server/websocket/websocketManager.ts"
remove_with_backup "server/services/websocketService.ts"
remove_with_backup "server/services/socketManager.ts"
remove_with_backup "server/services/realtimeService.ts"
remove_with_backup "server/websocket/connectionManager.ts"

# ===============================================
# Quick Task Services (4 files)
# ===============================================
echo ""
echo "⚡ Quick Task Services (4 files):"
# Some may already be removed by previous script
remove_with_backup "server/services/quickTaskService.ts"
remove_with_backup "server/services/quickTaskExecutor.ts"
remove_with_backup "server/services/taskQueueService.ts"
remove_with_backup "server/services/taskTimeoutService.ts"

# ===============================================
# AI Provider Services (11 files)
# ===============================================
echo ""
echo "🤖 AI Provider Services (11 files):"
remove_with_backup "server/services/claudeService.ts"
remove_with_backup "server/services/claudeCodeManager.ts"
remove_with_backup "server/services/claudeCodeCoordinator.ts"
remove_with_backup "server/services/openaiService.ts"
remove_with_backup "server/services/qwenService.ts"
remove_with_backup "server/services/qwenCodeManager.ts"
remove_with_backup "server/services/qwenApiClient.ts"
remove_with_backup "server/services/qwenOllamaClient.ts"
remove_with_backup "server/services/ollamaService.ts"
remove_with_backup "server/services/ollamaIntegration.ts"
remove_with_backup "server/services/ollamaModelDetector.ts"

# ===============================================
# Agent Management Services (8 files)
# ===============================================
echo ""
echo "👥 Agent Management Services (8 files):"
remove_with_backup "server/services/agentManager.ts"
remove_with_backup "server/services/agentCoordinator.ts"
remove_with_backup "server/services/agentHealthMonitor.ts"
remove_with_backup "server/services/agentRecoveryService.ts"
remove_with_backup "server/services/agentLifecycleService.ts"
remove_with_backup "server/services/agentCleanupService.ts"
remove_with_backup "server/services/agentPoolManager.ts"
remove_with_backup "server/services/agentMetricsService.ts"

# ===============================================
# Harvest Services (7 files)
# ===============================================
echo ""
echo "🌾 Harvest Services (7 files):"
remove_with_backup "server/services/harvestService.ts"
remove_with_backup "server/services/harvestFileCollector.ts"
remove_with_backup "server/services/barnService.ts"
remove_with_backup "server/services/barnCatalogService.ts"
remove_with_backup "server/services/harvestProcessor.ts"
remove_with_backup "server/services/harvestValidator.ts"
remove_with_backup "server/services/harvestStorage.ts"

# ===============================================
# GoWild Services (5 files)
# ===============================================
echo ""
echo "🚀 GoWild Services (5 files):"
remove_with_backup "server/services/goWildManager.ts"
remove_with_backup "server/services/goWildHarvestIntegration.ts"
remove_with_backup "server/services/safetyManager.ts"
remove_with_backup "server/services/boundaryService.ts"
remove_with_backup "server/services/explorationService.ts"

# ===============================================
# Monitoring Services (7 files)
# ===============================================
echo ""
echo "📈 Monitoring Services (7 files):"
remove_with_backup "server/services/metricsCollector.ts"
remove_with_backup "server/services/performanceMonitor.ts"
remove_with_backup "server/services/alertingService.ts"
remove_with_backup "server/services/analyticsService.ts"
remove_with_backup "server/services/telemetryService.ts"
remove_with_backup "server/services/logAggregator.ts"
remove_with_backup "server/services/healthCheckService.ts"

# ===============================================
# Workflow Services (5 files)
# ===============================================
echo ""
echo "⚙️ Workflow Services (5 files):"
remove_with_backup "server/services/workflowService.ts"
remove_with_backup "server/services/pipelineOrchestrator.ts"
remove_with_backup "server/services/workflowValidator.ts"
remove_with_backup "server/services/workflowExecutor.ts"
remove_with_backup "server/services/workflowScheduler.ts"

# ===============================================
# Summary
# ===============================================
echo ""
echo "==============================================="
echo "✅ Cleanup Complete!"
echo "==============================================="
echo "📊 Results:"
echo "  • Files removed: $REMOVED_COUNT"
echo "  • Files not found: $NOT_FOUND_COUNT"
echo "  • Total expected: 89"
echo "📦 Backup location: $BACKUP_DIR"
echo ""
echo "📝 Next steps:"
echo "1. Run: npm run update-imports"
echo "2. Run: npm run typecheck"
echo "3. Run: npm test"
echo "4. Commit with: 'refactor: Remove 89 deprecated services - Phase 3'"
echo ""

# Create import update script
cat > scripts/update-imports-phase3.ts << 'EOF'
#!/usr/bin/env npx tsx

/**
 * Update imports to use unified services - Phase 3
 */

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

const importMappings = new Map([
  // Terminal services
  ['terminalService', 'unified/terminalService'],
  ['terminalManager', 'unified/terminalService'],
  ['terminalStreamService', 'unified/terminalService'],
  ['tmuxService', 'unified/terminalService'],
  ['tmuxHelper', 'unified/terminalService'],
  ['sessionManager', 'unified/terminalService'],

  // Farm services
  ['farmManager', 'unified/farmService'],
  ['farmLauncher', 'unified/farmService'],
  ['farmOrchestrator', 'unified/farmService'],
  ['OrchestratorService', 'unified/farmService'],

  // State services
  ['stateManager', 'unified/stateCoordinator'],
  ['cacheService', 'unified/stateCoordinator'],
  ['cache', 'unified/stateCoordinator'],

  // WebSocket services
  ['websocketService', 'unified/websocketHub'],
  ['socketManager', 'unified/websocketHub'],

  // Quick task services
  ['quickTaskService', 'unified/quickTaskService'],
  ['quickTaskExecutor', 'unified/quickTaskService'],

  // AI provider services
  ['claudeService', 'unified/aiProviderService'],
  ['openaiService', 'unified/aiProviderService'],
  ['qwenService', 'unified/aiProviderService'],
  ['ollamaService', 'unified/aiProviderService'],
]);

async function updateImports() {
  console.log('🔄 Updating imports to unified services...\n');

  const files = await glob('**/*.{ts,tsx}', {
    ignore: ['node_modules/**', 'dist/**', 'build/**', 'backup_*/**']
  });

  let updatedCount = 0;

  for (const file of files) {
    let content = await fs.readFile(file, 'utf-8');
    let modified = false;

    for (const [oldService, newService] of importMappings) {
      const patterns = [
        new RegExp(`from ['"].*\/services\/${oldService}['"]`, 'g'),
        new RegExp(`import.*${oldService}.*from`, 'g'),
      ];

      for (const pattern of patterns) {
        if (pattern.test(content)) {
          content = content.replace(pattern, (match) => {
            return match.replace(`services/${oldService}`, `services/${newService}`);
          });
          modified = true;
        }
      }
    }

    if (modified) {
      await fs.writeFile(file, content);
      console.log(`  ✓ Updated: ${file}`);
      updatedCount++;
    }
  }

  console.log(`\n✅ Updated ${updatedCount} files`);
}

updateImports().catch(console.error);
EOF

chmod +x scripts/update-imports-phase3.ts

echo "🎯 Import updater script created: scripts/update-imports-phase3.ts"
echo "   Run it with: npx tsx scripts/update-imports-phase3.ts"