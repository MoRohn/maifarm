#!/usr/bin/env node

/**
 * Test shutdown timing behavior
 * Tests graceful shutdown with proper timing according to CLAUDE.md:
 * - Quick Task: Fixed 5 minutes (300000ms)
 * - Farm Mode: User-configurable (default 1 hour)
 * - GoWild Mode: User-configurable (default 30 minutes)
 * - All modes: 30-second graceful shutdown before timeout
 */

import http from 'http';
import { spawn } from 'child_process';

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
  const timestamp = new Date().toISOString();
  console.log(`${colors.dim}[${timestamp}]${colors.reset} ${color}${message}${colors.reset}`);
}

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4567,
      path: `/api${path}`,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

async function testQuickTaskTiming() {
  log(`${colors.bright}Testing Quick Task shutdown timing...${colors.reset}`, colors.cyan);

  const startTime = Date.now();

  try {
    // Launch a quick task with a simple prompt
    log('Launching quick task...', colors.blue);
    const response = await makeRequest('POST', '/quicktask', {
      prompt: 'Test shutdown timing - just wait for timeout',
      timeout: 10 // Should be ignored - Quick Task always uses 5 minutes
    });

    if (!response.farmId) {
      throw new Error('No farmId returned from quick task');
    }

    const farmId = response.farmId;
    log(`Quick task launched with farmId: ${farmId}`, colors.green);

    // Monitor the farm status
    log('Monitoring farm status (expecting ~5 minute timeout + 30s graceful shutdown)...', colors.yellow);

    let lastStatus = '';
    let shutdownStarted = null;

    const checkInterval = setInterval(async () => {
      try {
        const status = await makeRequest('GET', `/farms/${farmId}`);
        const elapsed = Math.floor((Date.now() - startTime) / 1000);

        if (status.status !== lastStatus) {
          lastStatus = status.status;
          log(`[${elapsed}s] Status changed to: ${status.status}`, colors.blue);

          if (status.status === 'shutting_down' && !shutdownStarted) {
            shutdownStarted = Date.now();
            log(`Graceful shutdown started at ${elapsed}s`, colors.yellow);
          }

          if (status.status === 'completed' || status.status === 'failed') {
            clearInterval(checkInterval);

            const totalTime = (Date.now() - startTime) / 1000;
            const expectedTime = 300 + 30; // 5 minutes + 30s graceful shutdown

            log(`\n${colors.bright}Quick Task Test Results:${colors.reset}`, colors.cyan);
            log(`Total time: ${totalTime.toFixed(1)}s`, colors.blue);
            log(`Expected: ~${expectedTime}s (300s timeout + 30s graceful)`, colors.blue);

            if (shutdownStarted) {
              const gracefulTime = (Date.now() - shutdownStarted) / 1000;
              log(`Graceful shutdown duration: ${gracefulTime.toFixed(1)}s`, colors.blue);
            }

            if (Math.abs(totalTime - expectedTime) <= 5) { // 5 second tolerance
              log(`✓ Timing matches expected behavior`, colors.green);
            } else {
              log(`✗ Timing differs from expected (${Math.abs(totalTime - expectedTime).toFixed(1)}s difference)`, colors.red);
            }
          }
        }

        // Log periodic updates every 30 seconds
        if (elapsed % 30 === 0) {
          log(`[${elapsed}s] Still ${status.status}...`, colors.dim);
        }

      } catch (error) {
        log(`Error checking status: ${error.message}`, colors.red);
      }
    }, 1000); // Check every second

    // Set a hard timeout at 10 minutes to prevent hanging
    setTimeout(() => {
      clearInterval(checkInterval);
      log('Test timeout reached (10 minutes)', colors.red);
    }, 600000);

  } catch (error) {
    log(`Test failed: ${error.message}`, colors.red);
  }
}

async function testFarmTiming(timeout = 60) {
  log(`\n${colors.bright}Testing Farm mode with ${timeout}s timeout...${colors.reset}`, colors.cyan);

  const startTime = Date.now();

  try {
    // Launch a farm with custom timeout
    log(`Launching farm with ${timeout}s timeout...`, colors.blue);
    const response = await makeRequest('POST', '/farms', {
      name: `Test Farm - ${timeout}s timeout`,
      prompt: 'Test shutdown timing - just wait for timeout',
      agentCount: 1,
      timeout: timeout // In seconds
    });

    if (!response.id) {
      throw new Error('No farm ID returned');
    }

    const farmId = response.id;
    log(`Farm launched with ID: ${farmId}`, colors.green);

    // Monitor the farm status
    log(`Monitoring farm status (expecting ~${timeout}s timeout + 30s graceful shutdown)...`, colors.yellow);

    let lastStatus = '';
    let shutdownStarted = null;

    const checkInterval = setInterval(async () => {
      try {
        const status = await makeRequest('GET', `/farms/${farmId}`);
        const elapsed = Math.floor((Date.now() - startTime) / 1000);

        if (status.status !== lastStatus) {
          lastStatus = status.status;
          log(`[${elapsed}s] Status changed to: ${status.status}`, colors.blue);

          if (status.status === 'shutting_down' && !shutdownStarted) {
            shutdownStarted = Date.now();
            log(`Graceful shutdown started at ${elapsed}s`, colors.yellow);
          }

          if (status.status === 'completed' || status.status === 'failed') {
            clearInterval(checkInterval);

            const totalTime = (Date.now() - startTime) / 1000;
            const expectedTime = timeout + 30; // User timeout + 30s graceful shutdown

            log(`\n${colors.bright}Farm Test Results:${colors.reset}`, colors.cyan);
            log(`Total time: ${totalTime.toFixed(1)}s`, colors.blue);
            log(`Expected: ~${expectedTime}s (${timeout}s timeout + 30s graceful)`, colors.blue);

            if (shutdownStarted) {
              const gracefulTime = (Date.now() - shutdownStarted) / 1000;
              log(`Graceful shutdown duration: ${gracefulTime.toFixed(1)}s`, colors.blue);
            }

            if (Math.abs(totalTime - expectedTime) <= 5) { // 5 second tolerance
              log(`✓ Timing matches expected behavior`, colors.green);
            } else {
              log(`✗ Timing differs from expected (${Math.abs(totalTime - expectedTime).toFixed(1)}s difference)`, colors.red);
            }
          }
        }

        // Log periodic updates every 10 seconds
        if (elapsed % 10 === 0) {
          log(`[${elapsed}s] Still ${status.status}...`, colors.dim);
        }

      } catch (error) {
        log(`Error checking status: ${error.message}`, colors.red);
      }
    }, 1000); // Check every second

    // Set a hard timeout
    setTimeout(() => {
      clearInterval(checkInterval);
      log(`Test timeout reached (${timeout + 60}s)`, colors.red);
    }, (timeout + 60) * 1000);

  } catch (error) {
    log(`Test failed: ${error.message}`, colors.red);
  }
}

async function checkServerRunning() {
  try {
    await makeRequest('GET', '/health');
    return true;
  } catch (error) {
    return false;
  }
}

async function main() {
  log(`${colors.bright}MaiFarm Shutdown Timing Test${colors.reset}`, colors.cyan);
  log('========================================\n', colors.cyan);

  // Check if server is running
  const serverRunning = await checkServerRunning();
  if (!serverRunning) {
    log('Server is not running. Please start it with: npm run start', colors.red);
    process.exit(1);
  }

  log('Server is running. Starting tests...\n', colors.green);

  // Parse command line arguments
  const args = process.argv.slice(2);
  const testType = args[0] || 'quick';

  switch (testType) {
    case 'quick':
      await testQuickTaskTiming();
      break;

    case 'farm':
      const timeout = parseInt(args[1]) || 60; // Default 60 seconds
      await testFarmTiming(timeout);
      break;

    case 'both':
      // Test quick task first (5 minutes)
      await testQuickTaskTiming();

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 360000)); // 6 minutes

      // Then test farm with short timeout
      await testFarmTiming(60);
      break;

    default:
      log(`Usage: node test-shutdown-timing.js [quick|farm|both] [timeout_seconds]`, colors.yellow);
      log(`  quick - Test Quick Task (5 minute fixed timeout)`, colors.dim);
      log(`  farm [timeout] - Test Farm mode with custom timeout (default 60s)`, colors.dim);
      log(`  both - Test both modes sequentially`, colors.dim);
      process.exit(1);
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  log('\n\nTest interrupted by user', colors.yellow);
  process.exit(0);
});

main().catch(error => {
  log(`Unexpected error: ${error.message}`, colors.red);
  process.exit(1);
});