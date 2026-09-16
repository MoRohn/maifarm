#!/usr/bin/env tsx
/**
 * Manual Terminal Streaming Initializer
 *
 * This script manually initializes terminal streaming for already-running farms
 * that were launched without the file watcher setup.
 *
 * Usage: npx tsx scripts/dev/init-terminal-streaming.ts <farmId> <sessionName>
 */

import { terminalFileWatcherService } from '../../apps/api/src/services/terminalFileWatcherService';
import { logger, LogCategory } from '../../apps/api/src/utils/logger';

async function initializeTerminalStreaming(farmId: string, sessionName: string): Promise<void> {
  try {
    logger.info(LogCategory.TERMINAL, `Manually initializing file watcher for farm ${farmId}`);

    await terminalFileWatcherService.watchFarm(farmId, sessionName);

    logger.info(LogCategory.TERMINAL, `File watcher initialized successfully for farm ${farmId}`);
    console.log(`✅ Terminal streaming initialized for farm ${farmId}`);
    console.log(`   Session: ${sessionName}`);
    console.log(`   File watcher is now monitoring terminal logs`);
    console.log(`   WebSocket events will be emitted for terminal output changes`);

  } catch (error) {
    logger.error(LogCategory.TERMINAL, `Failed to initialize file watcher for farm ${farmId}:`, error);
    console.error(`❌ Failed to initialize terminal streaming:`, error);
    process.exit(1);
  }
}

// Main execution
const farmId = process.argv[2];
const sessionName = process.argv[3];

if (!farmId || !sessionName) {
  console.error('Usage: npx tsx scripts/dev/init-terminal-streaming.ts <farmId> <sessionName>');
  console.error('');
  console.error('Example: npx tsx scripts/dev/init-terminal-streaming.ts b5b0d117-24a3-42b6-89d2-f8728d3e24ae farm-b5b0d117');
  process.exit(1);
}

initializeTerminalStreaming(farmId, sessionName).then(() => {
  console.log('\n✅ Initialization complete. Press Ctrl+C to exit or leave running to maintain file watching.');
}).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
