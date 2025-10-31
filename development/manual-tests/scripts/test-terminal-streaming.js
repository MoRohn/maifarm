#!/usr/bin/env node

/**
 * Simple test to verify terminal output is streaming live
 * This test creates a tmux session and verifies we can see output in real-time
 */

import { io } from 'socket.io-client';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const SERVER_URL = 'http://localhost:4567';
const TEST_SESSION_NAME = `test-stream-${Date.now()}`;
const FARM_ID = TEST_SESSION_NAME; // Use session name as farm ID for simplicity

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function execCommand(command) {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', command], {
      env: { ...process.env, TMUX_TMPDIR: '/tmp' }
    });
    
    let output = '';
    child.stdout.on('data', (data) => output += data.toString());
    child.stderr.on('data', (data) => output += data.toString());
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Command failed: ${command}\n${output}`));
      }
    });
  });
}

async function createTmuxSession() {
  log(`\n📦 Creating tmux session: ${TEST_SESSION_NAME}`, 'cyan');
  
  try {
    // Kill existing session if it exists
    await execCommand(`TMUX_TMPDIR=/tmp tmux kill-session -t ${TEST_SESSION_NAME} 2>/dev/null`);
  } catch (e) {
    // Ignore error if session doesn't exist
  }
  
  // Create new session
  await execCommand(`TMUX_TMPDIR=/tmp tmux new-session -d -s ${TEST_SESSION_NAME}`);
  log('✅ Tmux session created', 'green');
  
  // Set up output directory
  const outputDir = path.join(process.cwd(), 'maibarn', 'terminals', FARM_ID);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Set up pipe-pane to capture output
  const outputFile = path.join(outputDir, 'agent-1.log');
  await execCommand(`TMUX_TMPDIR=/tmp tmux pipe-pane -t ${TEST_SESSION_NAME}:0.0 'cat >> ${outputFile}'`);
  log(`✅ Output piping to: ${outputFile}`, 'green');
  
  return outputFile;
}

async function connectWebSocket() {
  return new Promise((resolve, reject) => {
    log('\n🔌 Connecting to WebSocket...', 'cyan');
    
    const socket = io(SERVER_URL, {
      transports: ['websocket'],
      reconnection: false
    });
    
    socket.on('connect', () => {
      log('✅ WebSocket connected', 'green');
      resolve(socket);
    });
    
    socket.on('connect_error', (error) => {
      log(`❌ Connection failed: ${error.message}`, 'red');
      reject(error);
    });
    
    setTimeout(() => reject(new Error('Connection timeout')), 5000);
  });
}

async function testStreaming() {
  let socket = null;
  let receivedOutput = [];
  let testPassed = false;
  
  try {
    // Create tmux session
    const outputFile = await createTmuxSession();
    
    // Connect to WebSocket
    socket = await connectWebSocket();
    
    // Join terminal room
    log(`\n📡 Joining terminal room for farm: ${FARM_ID}`, 'cyan');
    socket.emit('terminal:join', { farmId: FARM_ID });
    
    // Listen for terminal output
    socket.on('terminal:output', (data) => {
      // Handle different data formats
      let agentId, output, timestamp;
      
      if (typeof data === 'string') {
        // If data is just a string
        output = data;
        agentId = 1;
        timestamp = new Date().toISOString();
      } else if (data && typeof data === 'object') {
        // If data is an object
        agentId = data.agentId || data.agent || 1;
        output = data.output || data.data || data.content || JSON.stringify(data);
        timestamp = data.timestamp || new Date().toISOString();
      } else {
        output = String(data);
        agentId = 1;
        timestamp = new Date().toISOString();
      }
      
      log(`📨 Received output from Agent ${agentId}: "${String(output).trim().substring(0, 50)}..."`, 'yellow');
      receivedOutput.push({ agentId, output, timestamp });
    });
    
    // Send test commands to tmux
    log('\n📝 Sending test commands to tmux session...', 'cyan');
    
    const testCommands = [
      'echo "Test 1: Hello from tmux!"',
      'echo "Test 2: Terminal streaming is working!"',
      'date',
      'echo "Test 3: Final test message"'
    ];
    
    for (const cmd of testCommands) {
      log(`  → Sending: ${cmd}`, 'blue');
      await execCommand(`TMUX_TMPDIR=/tmp tmux send-keys -t ${TEST_SESSION_NAME}:0.0 '${cmd}' Enter`);
      await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between commands
    }
    
    // Wait for output
    log('\n⏳ Waiting for streamed output...', 'cyan');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check results
    log('\n📊 Results:', 'cyan');
    log(`  Total messages received: ${receivedOutput.length}`);
    
    if (receivedOutput.length > 0) {
      log('\n  Received outputs:', 'green');
      receivedOutput.forEach((msg, i) => {
        log(`    ${i + 1}. Agent ${msg.agentId}: "${msg.output.trim().substring(0, 50)}..."`);
      });
      
      // Check if we got our test messages
      const allOutput = receivedOutput.map(m => m.output).join(' ');
      const foundTest1 = allOutput.includes('Hello from tmux');
      const foundTest2 = allOutput.includes('Terminal streaming is working');
      const foundTest3 = allOutput.includes('Final test message');
      
      log('\n  Test message verification:', 'cyan');
      log(`    Test 1 (Hello from tmux): ${foundTest1 ? '✅' : '❌'}`);
      log(`    Test 2 (Terminal streaming): ${foundTest2 ? '✅' : '❌'}`);
      log(`    Test 3 (Final message): ${foundTest3 ? '✅' : '❌'}`);
      
      testPassed = foundTest1 || foundTest2 || foundTest3;
    } else {
      log('  ❌ No messages received!', 'red');
      
      // Check if file has content
      if (fs.existsSync(outputFile)) {
        const fileContent = fs.readFileSync(outputFile, 'utf-8');
        log(`\n  📄 Output file content (${outputFile}):`, 'yellow');
        log(`    Length: ${fileContent.length} bytes`);
        if (fileContent.length > 0) {
          log(`    Preview: "${fileContent.substring(0, 100).replace(/\n/g, '\\n')}..."`);
        }
      }
    }
    
    // Final result
    log('\n' + '='.repeat(50), 'cyan');
    if (testPassed) {
      log('✅ TEST PASSED: Terminal streaming is working!', 'green');
    } else {
      log('❌ TEST FAILED: Terminal streaming not working properly', 'red');
      log('\n  Troubleshooting tips:', 'yellow');
      log('    1. Check if the server is running (npm run dev)');
      log('    2. Verify WebSocket connection on port 4567');
      log('    3. Check server logs for errors');
      log('    4. Ensure tmux is installed and accessible');
    }
    
  } catch (error) {
    log(`\n❌ Test error: ${error.message}`, 'red');
    console.error(error);
  } finally {
    // Cleanup
    if (socket) {
      log('\n🧹 Cleaning up...', 'cyan');
      socket.disconnect();
    }
    
    try {
      await execCommand(`TMUX_TMPDIR=/tmp tmux kill-session -t ${TEST_SESSION_NAME}`);
      log('  ✅ Tmux session cleaned up', 'green');
    } catch (e) {
      // Ignore cleanup errors
    }
    
    process.exit(testPassed ? 0 : 1);
  }
}

// Run the test
log('🚀 Terminal Streaming Test', 'cyan');
log('='.repeat(50), 'cyan');
testStreaming();