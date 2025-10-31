#!/usr/bin/env node

/**
 * Comprehensive test script for farm lifecycle fixes
 * Tests that farms run for their full duration and produce actual work
 */

const fetch = require('node-fetch');
const { spawn } = require('child_process');

const API_URL = process.env.API_URL || 'http://localhost:4567';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function success(message) {
  console.log(`${colors.green}✓ ${message}${colors.reset}`);
}

function error(message) {
  console.log(`${colors.red}✗ ${message}${colors.reset}`);
}

function info(message) {
  console.log(`${colors.cyan}ℹ ${message}${colors.reset}`);
}

function warning(message) {
  console.log(`${colors.yellow}⚠ ${message}${colors.reset}`);
}

// Check if tmux session exists
async function checkTmuxSession(sessionName) {
  return new Promise((resolve) => {
    const check = spawn('tmux', ['has-session', '-t', sessionName]);
    check.on('exit', (code) => {
      resolve(code === 0);
    });
  });
}

// Get tmux pane count
async function getTmuxPaneCount(sessionName) {
  return new Promise((resolve) => {
    const listPanes = spawn('tmux', ['list-panes', '-t', sessionName, '-F', '#{pane_index}']);
    let output = '';
    
    listPanes.stdout?.on('data', (data) => {
      output += data.toString();
    });
    
    listPanes.on('exit', () => {
      const panes = output.trim().split('\n').filter(Boolean);
      resolve(panes.length);
    });
  });
}

// Check if agents have output
async function checkAgentOutput(sessionName, agentIndex) {
  return new Promise((resolve) => {
    const capture = spawn('tmux', [
      'capture-pane',
      '-t', `${sessionName}:0.${agentIndex}`,
      '-p'
    ]);
    
    let output = '';
    capture.stdout?.on('data', (data) => {
      output += data.toString();
    });
    
    capture.on('exit', () => {
      // Check if there's meaningful output (not just empty or error messages)
      const hasOutput = output.length > 100 && 
                       !output.includes('No ANTHROPIC_API_KEY') &&
                       !output.includes('[ERROR]');
      resolve(hasOutput);
    });
  });
}

// Monitor farm lifecycle
async function monitorFarmLifecycle(farmId, expectedDurationMs) {
  const startTime = Date.now();
  const checkInterval = 5000; // Check every 5 seconds
  const maxChecks = Math.ceil((expectedDurationMs + 30000) / checkInterval); // Add 30s buffer
  
  let checkCount = 0;
  let farmStatus = 'unknown';
  let sessionName = null;
  let hasAgentWork = false;
  
  info(`Monitoring farm ${farmId} for ${expectedDurationMs / 1000}s`);
  
  while (checkCount < maxChecks) {
    try {
      // Get farm status
      const farmResponse = await fetch(`${API_URL}/api/farms/${farmId}`);
      if (farmResponse.ok) {
        const farmData = await farmResponse.json();
        farmStatus = farmData.data?.status || 'unknown';
        
        if (!sessionName && farmData.data?.tmuxSession) {
          sessionName = farmData.data.tmuxSession;
        }
      }
      
      const elapsedMs = Date.now() - startTime;
      const elapsedSec = Math.round(elapsedMs / 1000);
      
      // Check tmux session
      if (sessionName) {
        const sessionExists = await checkTmuxSession(sessionName);
        const paneCount = sessionExists ? await getTmuxPaneCount(sessionName) : 0;
        
        // Check for agent output
        if (sessionExists && paneCount > 0 && !hasAgentWork) {
          for (let i = 0; i < paneCount; i++) {
            const hasOutput = await checkAgentOutput(sessionName, i);
            if (hasOutput) {
              hasAgentWork = true;
              success(`Agent ${i} is producing output!`);
              break;
            }
          }
        }
        
        info(`[${elapsedSec}s] Status: ${farmStatus}, Session: ${sessionExists ? 'active' : 'missing'}, Panes: ${paneCount}, Work: ${hasAgentWork ? 'yes' : 'no'}`);
        
        // Check for premature completion
        if (farmStatus === 'completed' && elapsedMs < expectedDurationMs - 30000) {
          error(`Farm completed prematurely after ${elapsedSec}s (expected ~${expectedDurationMs / 1000}s)`);
          return {
            success: false,
            reason: 'premature_completion',
            duration: elapsedMs,
            hasWork: hasAgentWork
          };
        }
        
        // Check if session disappeared while farm is active
        if (!sessionExists && (farmStatus === 'active' || farmStatus === 'running')) {
          warning(`Session disappeared while farm is ${farmStatus}`);
        }
      } else {
        info(`[${elapsedSec}s] Status: ${farmStatus}, Session: not created yet`);
      }
      
      // Success conditions
      if (farmStatus === 'completed' && elapsedMs >= expectedDurationMs - 30000 && hasAgentWork) {
        success(`Farm completed successfully after ${elapsedSec}s with agent work!`);
        return {
          success: true,
          duration: elapsedMs,
          hasWork: true
        };
      }
      
      // Wait for next check
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      checkCount++;
      
    } catch (err) {
      error(`Error monitoring farm: ${err.message}`);
    }
  }
  
  // Timeout reached
  return {
    success: false,
    reason: 'timeout',
    duration: Date.now() - startTime,
    hasWork: hasAgentWork,
    finalStatus: farmStatus
  };
}

// Test Quick Task (5 minute timeout)
async function testQuickTask() {
  log('\n=== Testing Quick Task (5 minute timeout) ===\n', colors.bright);
  
  try {
    // Create a Quick Task
    const createResponse = await fetch(`${API_URL}/api/tasks/quick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Write a simple hello world Python script and explain what it does',
        numberOfAgents: 1
      })
    });
    
    if (!createResponse.ok) {
      error('Failed to create Quick Task');
      return false;
    }
    
    const { data } = await createResponse.json();
    const farmId = data.farmId;
    info(`Created Quick Task with farm ID: ${farmId}`);
    
    // Monitor for 5 minutes (Quick Task timeout)
    const result = await monitorFarmLifecycle(farmId, 300000); // 5 minutes
    
    if (result.success) {
      success('Quick Task lifecycle test PASSED');
      return true;
    } else {
      error(`Quick Task lifecycle test FAILED: ${result.reason}`);
      if (!result.hasWork) {
        error('Agents did not produce any work');
      }
      return false;
    }
    
  } catch (err) {
    error(`Quick Task test failed: ${err.message}`);
    return false;
  }
}

// Test regular farm (configurable timeout)
async function testRegularFarm() {
  log('\n=== Testing Regular Farm (2 minute timeout) ===\n', colors.bright);
  
  try {
    // Create a regular farm with 2 minute timeout for testing
    const createResponse = await fetch(`${API_URL}/api/farms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Farm Lifecycle',
        description: 'Testing farm runs for full duration',
        config: {
          prompt: 'Create a comprehensive README file for a new TypeScript project',
          maxAgents: 2,
          timeout: 120, // 2 minutes in seconds
          collaborative: true
        }
      })
    });
    
    if (!createResponse.ok) {
      error('Failed to create farm');
      return false;
    }
    
    const { data } = await createResponse.json();
    const farmId = data.id;
    info(`Created farm with ID: ${farmId}`);
    
    // Launch the farm
    const launchResponse = await fetch(`${API_URL}/api/farms/${farmId}/launch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!launchResponse.ok) {
      error('Failed to launch farm');
      return false;
    }
    
    info('Farm launched successfully');
    
    // Monitor for 2 minutes (configured timeout)
    const result = await monitorFarmLifecycle(farmId, 120000); // 2 minutes
    
    if (result.success) {
      success('Regular farm lifecycle test PASSED');
      return true;
    } else {
      error(`Regular farm lifecycle test FAILED: ${result.reason}`);
      if (!result.hasWork) {
        error('Agents did not produce any work');
      }
      return false;
    }
    
  } catch (err) {
    error(`Regular farm test failed: ${err.message}`);
    return false;
  }
}

// Main test runner
async function runTests() {
  log('\n========================================', colors.bright);
  log('   Farm Lifecycle Fix Validation', colors.bright);
  log('========================================\n', colors.bright);
  
  // Check if server is running
  try {
    const healthResponse = await fetch(`${API_URL}/api/health`);
    if (!healthResponse.ok) {
      error('Server is not healthy');
      process.exit(1);
    }
    success('Server is running');
  } catch (err) {
    error('Server is not running. Please start with: npm run dev');
    process.exit(1);
  }
  
  // Check for API key
  const apiKeyCheck = spawn('sh', ['-c', 'grep ANTHROPIC_API_KEY .env.development']);
  const hasApiKey = await new Promise(resolve => {
    apiKeyCheck.on('exit', code => resolve(code === 0));
  });
  
  if (!hasApiKey) {
    warning('ANTHROPIC_API_KEY not found in .env.development');
    warning('Farms may fail to launch without a valid API key');
  } else {
    success('API key configured');
  }
  
  // Run tests
  const quickTaskResult = await testQuickTask();
  const farmResult = await testRegularFarm();
  
  // Summary
  log('\n========================================', colors.bright);
  log('   Test Results Summary', colors.bright);
  log('========================================\n', colors.bright);
  
  if (quickTaskResult) {
    success('Quick Task: Runs for full 5 minutes with agent work');
  } else {
    error('Quick Task: Failed lifecycle test');
  }
  
  if (farmResult) {
    success('Regular Farm: Runs for configured duration with agent work');
  } else {
    error('Regular Farm: Failed lifecycle test');
  }
  
  log('\n========================================', colors.bright);
  
  if (quickTaskResult && farmResult) {
    success('\nAll tests PASSED! Farms are working correctly.\n');
    process.exit(0);
  } else {
    error('\nSome tests FAILED. Check the fixes.\n');
    process.exit(1);
  }
}

// Run the tests
runTests().catch(err => {
  error(`Unexpected error: ${err.message}`);
  process.exit(1);
});