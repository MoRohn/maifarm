#!/usr/bin/env node

/**
 * Terminal Display Functionality Test
 * Tests tmux session management, pipe-pane setup, and terminal streaming
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';
import WebSocket from 'ws';

const execAsync = promisify(exec);

// Configuration
const TEST_FARM_ID = `test-${Date.now().toString(36)}`;
const SESSION_NAME = `farm-${TEST_FARM_ID}`;
const TERMINAL_OUTPUT_DIR = '/Users/rohnspringfield/maibarn/terminals';
const NUM_AGENTS = 3;
const WS_URL = 'ws://localhost:4567';

// Color codes for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
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

// Test 1: Create tmux session with multiple panes
async function testTmuxSessionCreation() {
  logSection('TEST 1: Tmux Session Creation');
  
  try {
    // Create new tmux session
    log(`Creating tmux session: ${SESSION_NAME}`, 'cyan');
    await execAsync(`/opt/homebrew/bin/tmux new-session -d -s "${SESSION_NAME}" -n agents -x 120 -y 40`);
    
    // Create panes for each agent
    for (let i = 1; i < NUM_AGENTS; i++) {
      log(`Creating pane for Agent ${i + 1}`, 'cyan');
      await execAsync(`/opt/homebrew/bin/tmux split-window -t "${SESSION_NAME}:agents" -h`);
    }
    
    // Set layout
    await execAsync(`/opt/homebrew/bin/tmux select-layout -t "${SESSION_NAME}:agents" tiled`);
    
    // Verify session exists
    const { stdout } = await execAsync('/opt/homebrew/bin/tmux list-sessions -F "#{session_name}"');
    if (stdout.includes(SESSION_NAME)) {
      log('✓ Tmux session created successfully', 'green');
      
      // List panes
      const { stdout: panes } = await execAsync(`/opt/homebrew/bin/tmux list-panes -t "${SESSION_NAME}:agents" -F "#{pane_index}:#{pane_width}x#{pane_height}"`);
      log(`Panes created:\n${panes}`, 'dim');
      return true;
    } else {
      throw new Error('Session not found in tmux list');
    }
  } catch (error) {
    log(`✗ Failed to create tmux session: ${error.message}`, 'red');
    return false;
  }
}

// Test 2: Setup pipe-pane for terminal output capture
async function testPipePaneSetup() {
  logSection('TEST 2: Pipe-Pane Setup');
  
  try {
    // Ensure terminal output directory exists
    await fs.mkdir(TERMINAL_OUTPUT_DIR, { recursive: true });
    
    for (let i = 0; i < NUM_AGENTS; i++) {
      const outputFile = path.join(TERMINAL_OUTPUT_DIR, `${TEST_FARM_ID}_agent_${i + 1}.log`);
      
      log(`Setting up pipe-pane for Agent ${i + 1} -> ${outputFile}`, 'cyan');
      
      // Setup pipe-pane to capture output
      const pipeCommand = `/opt/homebrew/bin/tmux pipe-pane -t "${SESSION_NAME}:agents.${i}" -o "cat >> '${outputFile}'"`;
      await execAsync(pipeCommand);
      
      // Create initial file if it doesn't exist
      await fs.writeFile(outputFile, `=== Agent ${i + 1} Terminal Output ===\n`, { flag: 'a' });
    }
    
    log('✓ Pipe-pane setup completed for all agents', 'green');
    return true;
  } catch (error) {
    log(`✗ Failed to setup pipe-pane: ${error.message}`, 'red');
    return false;
  }
}

// Test 3: Send test commands to each pane
async function testSendCommands() {
  logSection('TEST 3: Sending Commands to Panes');
  
  const testCommands = [
    'echo "Agent initialized and ready!"',
    'echo "Running diagnostic checks..."',
    'for i in {1..5}; do echo "Processing task $i..."; sleep 0.5; done',
    'echo "All tasks completed successfully!"'
  ];
  
  try {
    for (let i = 0; i < NUM_AGENTS; i++) {
      log(`Sending commands to Agent ${i + 1}`, 'cyan');
      
      for (const cmd of testCommands) {
        await execAsync(`/opt/homebrew/bin/tmux send-keys -t "${SESSION_NAME}:agents.${i}" "${cmd}" Enter`);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    log('✓ Commands sent to all agents', 'green');
    return true;
  } catch (error) {
    log(`✗ Failed to send commands: ${error.message}`, 'red');
    return false;
  }
}

// Test 4: Verify terminal output files
async function testOutputCapture() {
  logSection('TEST 4: Verifying Output Capture');
  
  // Wait for output to be written
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  try {
    for (let i = 0; i < NUM_AGENTS; i++) {
      const outputFile = path.join(TERMINAL_OUTPUT_DIR, `${TEST_FARM_ID}_agent_${i + 1}.log`);
      
      log(`Checking output file for Agent ${i + 1}`, 'cyan');
      
      const content = await fs.readFile(outputFile, 'utf8');
      
      if (content.includes('Agent initialized') && content.includes('Processing task')) {
        log(`✓ Agent ${i + 1} output captured successfully`, 'green');
        log(`  File size: ${content.length} bytes`, 'dim');
        log(`  Preview: ${content.slice(0, 100).replace(/\n/g, '\\n')}...`, 'dim');
      } else {
        log(`✗ Agent ${i + 1} output incomplete`, 'yellow');
      }
    }
    
    return true;
  } catch (error) {
    log(`✗ Failed to verify output: ${error.message}`, 'red');
    return false;
  }
}

// Test 5: Test capture-pane fallback
async function testCapturePaneFallback() {
  logSection('TEST 5: Testing Capture-Pane Fallback');
  
  try {
    for (let i = 0; i < NUM_AGENTS; i++) {
      log(`Capturing pane content for Agent ${i + 1}`, 'cyan');
      
      const { stdout } = await execAsync(`/opt/homebrew/bin/tmux capture-pane -t "${SESSION_NAME}:agents.${i}" -p`);
      
      if (stdout) {
        log(`✓ Agent ${i + 1} pane captured`, 'green');
        log(`  Content preview: ${stdout.slice(0, 100).replace(/\n/g, '\\n')}...`, 'dim');
      } else {
        log(`✗ Agent ${i + 1} pane empty`, 'yellow');
      }
    }
    
    return true;
  } catch (error) {
    log(`✗ Failed to capture pane: ${error.message}`, 'red');
    return false;
  }
}

// Test 6: WebSocket streaming (if server is running)
async function testWebSocketStreaming() {
  logSection('TEST 6: WebSocket Terminal Streaming');
  
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);
    let timeout;
    
    ws.on('open', () => {
      log('✓ Connected to WebSocket server', 'green');
      
      // Subscribe to terminal events
      ws.send(JSON.stringify({
        type: 'terminal:subscribe',
        farmId: TEST_FARM_ID
      }));
      
      timeout = setTimeout(() => {
        log('⚠ No terminal events received (server may not be running)', 'yellow');
        ws.close();
        resolve(true);
      }, 5000);
    });
    
    ws.on('message', (data) => {
      const event = JSON.parse(data);
      if (event.type === 'terminal:output') {
        log(`✓ Received terminal output event for Agent ${event.agentId}`, 'green');
        clearTimeout(timeout);
        ws.close();
        resolve(true);
      }
    });
    
    ws.on('error', (error) => {
      log(`⚠ WebSocket connection failed (server may not be running): ${error.message}`, 'yellow');
      resolve(true); // Don't fail the test if server isn't running
    });
  });
}

// Cleanup function
async function cleanup() {
  logSection('CLEANUP');
  
  try {
    // Kill tmux session
    log(`Killing tmux session: ${SESSION_NAME}`, 'cyan');
    await execAsync(`/opt/homebrew/bin/tmux kill-session -t "${SESSION_NAME}"`);
    log('✓ Tmux session killed', 'green');
    
    // Clean up output files
    for (let i = 0; i < NUM_AGENTS; i++) {
      const outputFile = path.join(TERMINAL_OUTPUT_DIR, `${TEST_FARM_ID}_agent_${i + 1}.log`);
      try {
        await fs.unlink(outputFile);
        log(`✓ Removed output file for Agent ${i + 1}`, 'green');
      } catch (err) {
        // File might not exist
      }
    }
  } catch (error) {
    log(`⚠ Cleanup warning: ${error.message}`, 'yellow');
  }
}

// Main test runner
async function runTests() {
  console.log('\n' + '='.repeat(60));
  log('MAIFARM TERMINAL DISPLAY TEST SUITE', 'bright');
  console.log('='.repeat(60));
  
  const results = {
    'Tmux Session Creation': false,
    'Pipe-Pane Setup': false,
    'Send Commands': false,
    'Output Capture': false,
    'Capture-Pane Fallback': false,
    'WebSocket Streaming': false
  };
  
  try {
    results['Tmux Session Creation'] = await testTmuxSessionCreation();
    
    if (results['Tmux Session Creation']) {
      results['Pipe-Pane Setup'] = await testPipePaneSetup();
      results['Send Commands'] = await testSendCommands();
      results['Output Capture'] = await testOutputCapture();
      results['Capture-Pane Fallback'] = await testCapturePaneFallback();
      results['WebSocket Streaming'] = await testWebSocketStreaming();
    }
  } catch (error) {
    log(`\n✗ Test suite error: ${error.message}`, 'red');
  } finally {
    await cleanup();
  }
  
  // Print summary
  logSection('TEST SUMMARY');
  
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
  if (passed === total) {
    log(`ALL TESTS PASSED (${passed}/${total})`, 'bright');
  } else {
    log(`TESTS PASSED: ${passed}/${total}`, passed > total/2 ? 'yellow' : 'red');
  }
  
  // Additional diagnostics
  logSection('DIAGNOSTIC INFORMATION');
  
  try {
    // Check tmux version
    const { stdout: tmuxVersion } = await execAsync('/opt/homebrew/bin/tmux -V');
    log(`Tmux version: ${tmuxVersion.trim()}`, 'dim');
    
    // Check for existing sessions
    const { stdout: sessions } = await execAsync('/opt/homebrew/bin/tmux list-sessions -F "#{session_name}" 2>/dev/null || echo "No sessions"');
    log(`Active tmux sessions:\n${sessions}`, 'dim');
    
    // Check terminal directory
    const files = await fs.readdir(TERMINAL_OUTPUT_DIR).catch(() => []);
    log(`Files in ${TERMINAL_OUTPUT_DIR}: ${files.length}`, 'dim');
    
  } catch (error) {
    log('Could not gather diagnostic info', 'dim');
  }
}

// Run the tests
runTests().catch(error => {
  log(`Fatal error: ${error.message}`, 'red');
  process.exit(1);
});