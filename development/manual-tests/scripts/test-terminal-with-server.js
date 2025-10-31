#!/usr/bin/env node

/**
 * Terminal Display Test with Server
 * Tests terminal functionality with running server
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';
import WebSocket from 'ws';
import axios from 'axios';

const execAsync = promisify(exec);

// Configuration
const TEST_FARM_ID = `test-${Date.now().toString(36)}`;
const SESSION_NAME = `farm-${TEST_FARM_ID}`;
const SERVER_URL = 'http://localhost:4567';
const WS_URL = 'ws://localhost:4567';
const NUM_AGENTS = 2;

// Color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'bright');
  console.log('='.repeat(60));
}

// Start the dev server
async function startServer() {
  logSection('Starting Development Server');
  
  return new Promise((resolve) => {
    const serverProcess = spawn('npm', ['run', 'dev:server'], {
      env: {
        ...process.env,
        NODE_ENV: 'development',
        BYPASS_AUTH: 'true',
        PORT: '4567'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let serverReady = false;
    
    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (!serverReady && (output.includes('Server running') || output.includes('listening on'))) {
        serverReady = true;
        log('✓ Server started successfully', 'green');
        resolve(serverProcess);
      }
    });
    
    serverProcess.stderr.on('data', (data) => {
      // Ignore TypeScript warnings
      const error = data.toString();
      if (!error.includes('TS') && !error.includes('warning')) {
        console.error('Server error:', error);
      }
    });
    
    // Timeout after 10 seconds
    setTimeout(() => {
      if (!serverReady) {
        log('⚠ Server startup timeout', 'yellow');
        serverProcess.kill();
        resolve(null);
      }
    }, 10000);
  });
}

// Check server health
async function checkServerHealth() {
  try {
    const response = await axios.get(`${SERVER_URL}/api/health`);
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

// Create a farm via API
async function createFarmViaAPI() {
  logSection('Creating Farm via API');
  
  try {
    const farmConfig = {
      name: `Test Farm ${TEST_FARM_ID}`,
      mode: 'farm',
      agents: [
        { name: 'Agent 1', role: 'Primary' },
        { name: 'Agent 2', role: 'Support' }
      ],
      timeout: 300
    };
    
    const response = await axios.post(`${SERVER_URL}/api/farms`, farmConfig);
    
    if (response.data && response.data.id) {
      log(`✓ Farm created: ${response.data.id}`, 'green');
      return response.data.id;
    }
  } catch (error) {
    log(`✗ Failed to create farm: ${error.message}`, 'red');
    return null;
  }
}

// Test WebSocket terminal streaming
async function testTerminalStreaming(farmId) {
  logSection('Testing Terminal WebSocket Streaming');
  
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);
    const events = [];
    let timeout;
    
    ws.on('open', () => {
      log('✓ Connected to WebSocket', 'green');
      
      // Subscribe to terminal events
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: 'terminal',
        farmId: farmId
      }));
      
      // Send test terminal output
      setTimeout(() => {
        ws.send(JSON.stringify({
          type: 'terminal:input',
          farmId: farmId,
          agentId: 0,
          command: 'echo "Test terminal output"'
        }));
      }, 1000);
      
      timeout = setTimeout(() => {
        if (events.length > 0) {
          log(`✓ Received ${events.length} terminal events`, 'green');
          events.forEach(e => log(`  - ${e.type}: ${e.data?.slice(0, 50)}...`, 'cyan'));
        } else {
          log('⚠ No terminal events received', 'yellow');
        }
        ws.close();
        resolve(events);
      }, 5000);
    });
    
    ws.on('message', (data) => {
      try {
        const event = JSON.parse(data);
        if (event.type && event.type.startsWith('terminal')) {
          events.push(event);
          log(`📡 Event: ${event.type}`, 'cyan');
        }
      } catch (err) {
        // Not JSON, might be raw terminal output
        events.push({ type: 'terminal:raw', data: data.toString() });
      }
    });
    
    ws.on('error', (error) => {
      log(`✗ WebSocket error: ${error.message}`, 'red');
      clearTimeout(timeout);
      resolve([]);
    });
  });
}

// Test tmux integration
async function testTmuxIntegration() {
  logSection('Testing Tmux Integration');
  
  try {
    // Create session
    await execAsync(`/opt/homebrew/bin/tmux new-session -d -s "${SESSION_NAME}" -n agents`);
    
    // Add panes
    for (let i = 1; i < NUM_AGENTS; i++) {
      await execAsync(`/opt/homebrew/bin/tmux split-window -t "${SESSION_NAME}:agents" -h`);
    }
    
    // Send commands
    for (let i = 0; i < NUM_AGENTS; i++) {
      await execAsync(`/opt/homebrew/bin/tmux send-keys -t "${SESSION_NAME}:agents.${i}" "echo 'Agent ${i + 1} active'" Enter`);
    }
    
    // Capture output
    const { stdout } = await execAsync(`/opt/homebrew/bin/tmux capture-pane -t "${SESSION_NAME}:agents.0" -p`);
    
    if (stdout.includes('Agent 1 active')) {
      log('✓ Tmux integration working', 'green');
      return true;
    } else {
      log('✗ Tmux output not captured', 'red');
      return false;
    }
  } catch (error) {
    log(`✗ Tmux integration failed: ${error.message}`, 'red');
    return false;
  }
}

// Test API terminal endpoints
async function testTerminalAPI(farmId) {
  logSection('Testing Terminal API Endpoints');
  
  try {
    // Get terminal status
    const statusResponse = await axios.get(`${SERVER_URL}/api/terminals/${farmId}/status`);
    log(`✓ Terminal status: ${statusResponse.data.status || 'unknown'}`, 'green');
    
    // Send command via API
    const commandResponse = await axios.post(`${SERVER_URL}/api/terminals/${farmId}/command`, {
      agentId: 0,
      command: 'echo "API test"'
    });
    log(`✓ Command sent: ${commandResponse.status === 200 ? 'success' : 'failed'}`, 'green');
    
    // Get terminal output
    const outputResponse = await axios.get(`${SERVER_URL}/api/terminals/${farmId}/output`);
    if (outputResponse.data && outputResponse.data.length > 0) {
      log(`✓ Terminal output retrieved: ${outputResponse.data.length} lines`, 'green');
    } else {
      log('⚠ No terminal output available', 'yellow');
    }
    
    return true;
  } catch (error) {
    if (error.response?.status === 404) {
      log('⚠ Terminal API endpoints not implemented', 'yellow');
    } else {
      log(`✗ Terminal API error: ${error.message}`, 'red');
    }
    return false;
  }
}

// Cleanup
async function cleanup(serverProcess) {
  logSection('Cleanup');
  
  // Kill server
  if (serverProcess) {
    serverProcess.kill();
    log('✓ Server stopped', 'green');
  }
  
  // Kill tmux session
  try {
    await execAsync(`/opt/homebrew/bin/tmux kill-session -t "${SESSION_NAME}"`);
    log('✓ Tmux session killed', 'green');
  } catch (err) {
    // Session might not exist
  }
}

// Main test runner
async function runTests() {
  console.log('\n' + '='.repeat(60));
  log('TERMINAL DISPLAY TEST WITH SERVER', 'bright');
  console.log('='.repeat(60));
  
  let serverProcess = null;
  let farmId = null;
  const results = {};
  
  try {
    // Start server
    serverProcess = await startServer();
    
    if (!serverProcess) {
      log('⚠ Could not start server, running limited tests', 'yellow');
    } else {
      // Wait for server to be fully ready
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check health
      const healthy = await checkServerHealth();
      results['Server Health'] = healthy;
      
      if (healthy) {
        // Create farm
        farmId = await createFarmViaAPI();
        results['Farm Creation'] = !!farmId;
        
        if (farmId) {
          // Test WebSocket streaming
          const events = await testTerminalStreaming(farmId);
          results['WebSocket Streaming'] = events.length > 0;
          
          // Test API endpoints
          results['Terminal API'] = await testTerminalAPI(farmId);
        }
      }
    }
    
    // Test tmux (doesn't need server)
    results['Tmux Integration'] = await testTmuxIntegration();
    
  } catch (error) {
    log(`✗ Test error: ${error.message}`, 'red');
  } finally {
    await cleanup(serverProcess);
  }
  
  // Summary
  logSection('TEST RESULTS');
  
  let passed = 0;
  let total = 0;
  
  for (const [test, result] of Object.entries(results)) {
    total++;
    if (result) {
      passed++;
      log(`✓ ${test}`, 'green');
    } else {
      log(`✗ ${test}`, 'red');
    }
  }
  
  console.log('\n' + '-'.repeat(60));
  log(`Results: ${passed}/${total} tests passed`, passed === total ? 'green' : 'yellow');
}

// Run tests
runTests().catch(error => {
  log(`Fatal error: ${error.message}`, 'red');
  process.exit(1);
});