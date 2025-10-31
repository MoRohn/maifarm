#!/usr/bin/env node

/**
 * Simple shutdown timing test for MaiFarm
 * Tests that the system properly enforces timeouts with graceful shutdown
 */

import { setTimeout } from 'timers/promises';
import fetch from 'node-fetch';

const API_BASE = 'http://localhost:4567/api';

// ANSI colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = '') {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`${colors.dim}[${timestamp}]${colors.reset} ${color}${message}${colors.reset}`);
}

async function createFarmWithTimeout(timeoutSeconds = 30) {
  log(`${colors.bright}Creating farm with ${timeoutSeconds}s timeout...${colors.reset}`, colors.cyan);

  try {
    const response = await fetch(`${API_BASE}/farms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Shutdown Test Farm - ${timeoutSeconds}s`,
        description: `Testing shutdown timing with ${timeoutSeconds}s timeout`,
        seedId: 'test-seed',
        agentCount: 1,
        timeout: timeoutSeconds,
        prompt: 'Wait for timeout test - do nothing'
      })
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error?.message || 'Failed to create farm');
    }

    const farmId = data.data?.id;
    if (!farmId) {
      throw new Error('No farm ID returned');
    }

    log(`✓ Farm created with ID: ${farmId}`, colors.green);
    return farmId;

  } catch (error) {
    log(`✗ Failed to create farm: ${error.message}`, colors.red);
    return null;
  }
}

async function monitorFarmStatus(farmId, expectedTimeoutSeconds) {
  log(`Monitoring farm ${farmId} (expecting ~${expectedTimeoutSeconds}s + 30s graceful)...`, colors.blue);

  const startTime = Date.now();
  let lastStatus = '';
  let shutdownStartTime = null;
  let completed = false;

  while (!completed) {
    try {
      const response = await fetch(`${API_BASE}/farms/${farmId}`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to get farm status');
      }

      const farm = data.data;
      const elapsed = Math.floor((Date.now() - startTime) / 1000);

      // Log status changes
      if (farm.status !== lastStatus) {
        lastStatus = farm.status;
        log(`[${elapsed}s] Status: ${farm.status}`, colors.yellow);

        // Track when shutdown starts
        if (farm.status === 'shutting_down' && !shutdownStartTime) {
          shutdownStartTime = Date.now();
          log(`  → Graceful shutdown started`, colors.cyan);
        }

        // Check if completed
        if (farm.status === 'completed' || farm.status === 'failed' || farm.status === 'timeout') {
          completed = true;

          const totalTime = (Date.now() - startTime) / 1000;
          const expectedTotal = expectedTimeoutSeconds + 30; // timeout + graceful period

          log('', '');
          log(`${colors.bright}=== Test Results ===${colors.reset}`, colors.cyan);
          log(`Total time: ${totalTime.toFixed(1)}s`, colors.blue);
          log(`Expected: ~${expectedTotal}s (${expectedTimeoutSeconds}s timeout + 30s graceful)`, colors.blue);

          if (shutdownStartTime) {
            const gracefulDuration = (Date.now() - shutdownStartTime) / 1000;
            log(`Graceful shutdown duration: ${gracefulDuration.toFixed(1)}s`, colors.blue);
          }

          const difference = Math.abs(totalTime - expectedTotal);
          if (difference <= 5) { // 5 second tolerance
            log(`✓ Timing is correct (within 5s tolerance)`, colors.green);
          } else {
            log(`✗ Timing differs by ${difference.toFixed(1)}s`, colors.red);
          }
        }
      }

      // Log periodic updates
      if (elapsed > 0 && elapsed % 10 === 0) {
        log(`[${elapsed}s] Still ${farm.status}...`, colors.dim);
      }

    } catch (error) {
      log(`Error checking status: ${error.message}`, colors.red);
    }

    if (!completed) {
      await setTimeout(1000); // Check every second
    }
  }
}

async function testQuickTaskShutdown() {
  log(`${colors.bright}Testing Quick Task shutdown (fixed 5 minutes)...${colors.reset}`, colors.cyan);

  try {
    // Quick task endpoint might be different, let's try the standard approach
    const response = await fetch(`${API_BASE}/farms/quick-task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Quick task timeout test - do nothing',
        agentCount: 1
      })
    });

    const data = await response.json();

    if (!data.success) {
      log('Quick task endpoint not available, skipping', colors.yellow);
      return;
    }

    const farmId = data.data?.id;
    if (!farmId) {
      throw new Error('No farm ID returned from quick task');
    }

    log(`✓ Quick task started with farm ID: ${farmId}`, colors.green);
    await monitorFarmStatus(farmId, 300); // 5 minutes = 300 seconds

  } catch (error) {
    log(`Quick task test skipped: ${error.message}`, colors.yellow);
  }
}

async function main() {
  log('', '');
  log(`${colors.bright}MaiFarm Shutdown Timing Test${colors.reset}`, colors.cyan);
  log('=====================================', colors.cyan);
  log('', '');

  // Parse command line arguments
  const args = process.argv.slice(2);
  const mode = args[0] || 'farm';
  const timeout = parseInt(args[1]) || 30;

  // Skip health check, just try to connect
  log('Attempting to connect to server...', colors.blue);
  log('', '');

  switch (mode) {
    case 'farm':
      const farmId = await createFarmWithTimeout(timeout);
      if (farmId) {
        await monitorFarmStatus(farmId, timeout);
      }
      break;

    case 'quick':
      await testQuickTaskShutdown();
      break;

    default:
      log('Usage: node test-shutdown-simple.js [farm|quick] [timeout_seconds]', colors.yellow);
      log('  farm [timeout] - Test farm with custom timeout (default 30s)', colors.dim);
      log('  quick - Test quick task (5 minute fixed timeout)', colors.dim);
      process.exit(1);
  }

  log('', '');
  log('Test complete!', colors.green);
}

// Handle interruption
process.on('SIGINT', () => {
  log('\nTest interrupted', colors.yellow);
  process.exit(0);
});

// Run the test
main().catch(error => {
  log(`Fatal error: ${error.message}`, colors.red);
  process.exit(1);
});