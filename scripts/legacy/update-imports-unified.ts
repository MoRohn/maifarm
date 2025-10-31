#!/usr/bin/env npx tsx

/**
 * Update all imports to use unified services - Phase 3
 * This script updates all TypeScript files to import from the new unified services
 */

import fs from 'fs/promises';
import path from 'path';

// Map old service names to new unified service paths
const serviceMap = new Map<string, string>([
  // Terminal & Session Services → unified/terminalService
  ['terminalService', 'unified/terminalService'],
  ['terminalManager', 'unified/terminalService'],
  ['terminalStreamService', 'unified/terminalService'],
  ['terminalOutputWatcher', 'unified/terminalService'],
  ['tmuxService', 'unified/terminalService'],
  ['tmuxHelper', 'unified/terminalService'],
  ['sessionManager', 'unified/terminalService'],
  ['sessionCache', 'unified/terminalService'],
  ['terminalHealthService', 'unified/terminalService'],
  ['terminalRecoveryService', 'unified/terminalService'],
  ['terminalCleanupService', 'unified/terminalService'],
  ['unifiedTmuxManager', 'unified/terminalService'],
  ['tmuxSessionResolver', 'unified/terminalService'],

  // Farm Management → unified/farmService
  ['farmManager', 'unified/farmService'],
  ['farmLauncher', 'unified/farmService'],
  ['farmOrchestrator', 'unified/farmService'],
  ['OrchestratorService', 'unified/farmService'],
  ['farmLifecycleService', 'unified/farmService'],
  ['farmStateManager', 'unified/farmService'],
  ['farmTimeoutService', 'unified/farmService'],
  ['enhancedFarmLifecycle', 'unified/farmService'],

  // State Management → unified/stateCoordinator
  ['stateManager', 'unified/stateCoordinator'],
  ['stateService', 'unified/stateCoordinator'],
  ['stateSyncService', 'unified/stateCoordinator'],
  ['stateReconciler', 'unified/stateCoordinator'],
  ['cacheService', 'unified/stateCoordinator'],
  ['cache', 'unified/stateCoordinator'],
  ['redisService', 'unified/stateCoordinator'],
  ['unifiedCacheService', 'unified/stateCoordinator'],
  ['unifiedRedisStateManager', 'unified/stateCoordinator'],
  ['StateCoordinator', 'unified/stateCoordinator'],
  ['redisCoordinationStore', 'unified/stateCoordinator'],

  // WebSocket → unified/websocketHub
  ['websocketService', 'unified/websocketHub'],
  ['socketManager', 'unified/websocketHub'],
  ['realtimeService', 'unified/websocketHub'],
  ['UnifiedConnectionHub', 'unified/websocketHub'],
  ['RealtimeConnectionManager', 'unified/websocketHub'],

  // Quick Task → unified/quickTaskService
  ['quickTaskService', 'unified/quickTaskService'],
  ['quickTaskExecutor', 'unified/quickTaskService'],
  ['quickTaskServiceV2', 'unified/quickTaskService'],
  ['simpleQuickTaskService', 'unified/quickTaskService'],
  ['taskQueueService', 'unified/quickTaskService'],
  ['taskTimeoutService', 'unified/quickTaskService'],

  // AI Providers → unified/aiProviderService
  ['claudeService', 'unified/aiProviderService'],
  ['claudeCodeManager', 'unified/aiProviderService'],
  ['claudeCodeCoordinator', 'unified/aiProviderService'],
  ['openaiService', 'unified/aiProviderService'],
  ['openaiCodeManager', 'unified/aiProviderService'],
  ['qwenService', 'unified/aiProviderService'],
  ['qwenCodeManager', 'unified/aiProviderService'],
  ['qwenApiClient', 'unified/aiProviderService'],
  ['qwenOllamaClient', 'unified/aiProviderService'],
  ['ollamaService', 'unified/aiProviderService'],
  ['ollamaIntegration', 'unified/aiProviderService'],
  ['ollamaModelDetector', 'unified/aiProviderService'],
  ['llmProxyService', 'unified/aiProviderService'],
  ['dynamicProviderRouter', 'unified/aiProviderService'],
  ['mixedProviderOrchestrator', 'unified/aiProviderService'],

  // Agent Management → unified/farmService (agents are part of farms)
  ['agentManager', 'unified/farmService'],
  ['agentCoordinator', 'unified/farmService'],
  ['agentCoordinatorV2', 'unified/farmService'],
  ['agentHealthMonitor', 'unified/farmService'],
  ['agentRecoveryService', 'unified/farmService'],

  // Harvest → unified/farmService (harvest is part of farm lifecycle)
  ['harvestService', 'unified/farmService'],
  ['harvestFileCollector', 'unified/farmService'],
  ['barnService', 'unified/farmService'],
  ['barnCatalogService', 'unified/farmService'],
  ['HarvestOrchestrator', 'unified/farmService'],
  ['farmHarvestIntegration', 'unified/farmService'],

  // GoWild → unified/farmService (GoWild is a farm mode)
  ['goWildManager', 'unified/farmService'],
  ['goWildManagerV2', 'unified/farmService'],
  ['goWildHarvestIntegration', 'unified/farmService'],
  ['safetyManager', 'unified/farmService'],

  // Monitoring → will be unified later
  ['metricsCollector', 'unified/stateCoordinator'], // Metrics stored in state
  ['performanceMonitor', 'unified/stateCoordinator'],
  ['alertingService', 'unified/stateCoordinator'],
  ['analyticsService', 'unified/stateCoordinator'],
  ['telemetryService', 'unified/stateCoordinator'],

  // Workflow → unified/farmService (workflows are farm operations)
  ['workflowService', 'unified/farmService'],
  ['pipelineOrchestrator', 'unified/farmService'],
]);

async function updateFile(filePath: string): Promise<boolean> {
  try {
    let content = await fs.readFile(filePath, 'utf-8');
    let modified = false;
    const originalContent = content;

    // Process each service mapping
    for (const [oldService, newService] of serviceMap) {
      // Match various import patterns
      const patterns = [
        // Named imports: import { Something } from '../services/oldService'
        new RegExp(`from ['"\`]([^'"\`]*)/services/${oldService}['"\`]`, 'g'),
        // Default imports: import Something from '../services/oldService'
        new RegExp(`from ['"\`]([^'"\`]*)/services/${oldService}\.js['"\`]`, 'g'),
        // Require statements: require('../services/oldService')
        new RegExp(`require\\(['"\`]([^'"\`]*)/services/${oldService}['"\`]\\)`, 'g'),
        // Dynamic imports: import('../services/oldService')
        new RegExp(`import\\(['"\`]([^'"\`]*)/services/${oldService}['"\`]\\)`, 'g'),
      ];

      for (const pattern of patterns) {
        if (pattern.test(content)) {
          content = content.replace(pattern, (match, prefix) => {
            return match.replace(`/services/${oldService}`, `/services/${newService}`);
          });
          modified = true;
        }
      }
    }

    // Write back if modified
    if (modified) {
      await fs.writeFile(filePath, content);
      console.log(`✅ Updated: ${filePath}`);

      // Verify the changes
      const updatedContent = await fs.readFile(filePath, 'utf-8');
      if (updatedContent === originalContent) {
        console.log(`⚠️  Warning: No changes detected in ${filePath}`);
      }

      return true;
    }

    return false;
  } catch (error) {
    console.error(`❌ Error updating ${filePath}:`, error);
    return false;
  }
}

async function main() {
  console.log('🔄 Updating imports to unified services...\n');
  console.log('📂 Scanning for TypeScript files...\n');

  // Find all TypeScript files
  const glob = (await import('glob')).default;
  const allFiles = await new Promise<string[]>((resolve, reject) => {
    glob('**/*.{ts,tsx,js,jsx}', {
      ignore: [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/backup_*/**',
        '**/coverage/**',
        '**/.next/**',
        'scripts/cleanup-*.sh',
        'scripts/update-imports-*.ts',
        'server/services/unified/**',
        'server/orchestrators/**',
        'maibarn/**',
        '**/*.min.js',
        '**/*.bundle.js',
        '**/vendor/**',
      ]
    }, (err, matches) => {
      if (err) reject(err);
      else resolve(matches);
    });
  });

  // Filter out any accidental directories
  const files = [];
  for (const file of allFiles) {
    try {
      const stat = await fs.stat(file);
      if (stat.isFile()) {
        files.push(file);
      }
    } catch (err) {
      // Skip files we can't stat
    }
  }

  console.log(`📝 Found ${files.length} files to check\n`);

  let updatedCount = 0;
  let errorCount = 0;

  // Process files
  for (const file of files) {
    const updated = await updateFile(file);
    if (updated) {
      updatedCount++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('✨ Import Update Complete!');
  console.log('='.repeat(50));
  console.log(`📊 Statistics:`);
  console.log(`  • Files checked: ${files.length}`);
  console.log(`  • Files updated: ${updatedCount}`);
  console.log(`  • Files unchanged: ${files.length - updatedCount - errorCount}`);
  if (errorCount > 0) {
    console.log(`  • Errors: ${errorCount}`);
  }

  console.log('\n📝 Next steps:');
  console.log('1. Run: npm run typecheck');
  console.log('2. Run: npm test');
  console.log('3. Review changes: git diff');
  console.log('4. Commit: git commit -m "refactor: Update imports to unified services"');
}

// Run the script
main().catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});