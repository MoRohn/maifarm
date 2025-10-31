#!/usr/bin/env node

/**
 * Terminal Streaming Test Script
 * Tests the terminal streaming functionality including:
 * - WebSocket connection
 * - Terminal output events
 * - Tmux session creation
 * - Pipe-pane streaming
 */

import { io } from 'socket.io-client';
import { spawn } from 'child_process';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:4567';
const TEST_SESSION_ID = `test-terminal-${Date.now()}`;
const TEST_FARM_ID = `test-farm-${Math.random().toString(36).substring(7)}`;

console.log('🚀 Terminal Streaming Test');
console.log('==========================');
console.log(`Server: ${SERVER_URL}`);
console.log(`Session: ${TEST_SESSION_ID}`);
console.log(`Farm: ${TEST_FARM_ID}`);
console.log('');

// Connect to WebSocket
console.log('📡 Connecting to WebSocket...');
const socket = io(SERVER_URL, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5
});

let connectionTimeout = setTimeout(() => {
  console.error('❌ Connection timeout after 10 seconds');
  process.exit(1);
}, 10000);

socket.on('connect', () => {
  clearTimeout(connectionTimeout);
  console.log('✅ Connected to WebSocket');
  console.log(`   Socket ID: ${socket.id}`);
  console.log('');

  // Join terminal room
  console.log('🔌 Joining terminal room...');
  socket.emit('terminal:join', {
    farmId: TEST_FARM_ID,
    agentId: 'test-agent-1'
  });
});

socket.on('terminal:joined', (data) => {
  console.log('✅ Joined terminal room');
  console.log(`   Room: ${data.room}`);
  console.log('');

  // Create a test tmux session
  createTestTmuxSession();
});

socket.on('terminal:output', (data) => {
  console.log('📝 Terminal Output Received:');
  console.log(`   Agent: ${data.agentId}`);
  console.log(`   Farm: ${data.farmId}`);
  console.log(`   Content (${data.content.length} chars): ${data.content.substring(0, 100)}...`);
  console.log('');
});

socket.on('error', (error) => {
  console.error('❌ WebSocket Error:', error);
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection Error:', error.message);
});

socket.on('disconnect', (reason) => {
  console.log('🔌 Disconnected:', reason);
});

function createTestTmuxSession() {
  console.log('🖥️  Creating test tmux session...');

  // Create tmux session
  const tmuxCreate = spawn('tmux', [
    'new-session',
    '-d',
    '-s', TEST_SESSION_ID,
    '-n', 'test-window'
  ], {
    env: { ...process.env, TMUX_TMPDIR: '/tmp' }
  });

  tmuxCreate.on('close', (code) => {
    if (code === 0) {
      console.log('✅ Tmux session created');

      // Send some test output to the session
      setTimeout(() => {
        sendTestOutput();
      }, 1000);

      // Set up pipe-pane
      setTimeout(() => {
        setupPipePane();
      }, 2000);

    } else {
      console.error('❌ Failed to create tmux session, code:', code);
    }
  });
}

function sendTestOutput() {
  console.log('📤 Sending test output to tmux session...');

  const tmuxSend = spawn('tmux', [
    'send-keys',
    '-t', `${TEST_SESSION_ID}:test-window.0`,
    'echo "Hello from terminal streaming test!"',
    'Enter'
  ], {
    env: { ...process.env, TMUX_TMPDIR: '/tmp' }
  });

  tmuxSend.on('close', (code) => {
    if (code === 0) {
      console.log('✅ Test output sent');
    } else {
      console.error('❌ Failed to send test output, code:', code);
    }
  });

  // Send more output
  setTimeout(() => {
    const tmuxSend2 = spawn('tmux', [
      'send-keys',
      '-t', `${TEST_SESSION_ID}:test-window.0`,
      'date',
      'Enter'
    ], {
      env: { ...process.env, TMUX_TMPDIR: '/tmp' }
    });

    tmuxSend2.on('close', () => {
      console.log('📤 Additional test output sent');
    });
  }, 1500);
}

function setupPipePane() {
  console.log('🔧 Setting up pipe-pane...');

  const outputFile = `/tmp/terminal-test-output-${Date.now()}.log`;

  const tmuxPipe = spawn('tmux', [
    'pipe-pane',
    '-t', `${TEST_SESSION_ID}:test-window.0`,
    '-o',
    `cat >> ${outputFile}`
  ], {
    env: { ...process.env, TMUX_TMPDIR: '/tmp' }
  });

  tmuxPipe.on('close', (code) => {
    if (code === 0) {
      console.log('✅ Pipe-pane configured');
      console.log(`   Output file: ${outputFile}`);

      // Monitor the output file
      setTimeout(() => {
        checkOutputFile(outputFile);
      }, 2000);

    } else {
      console.error('❌ Failed to set up pipe-pane, code:', code);
    }
  });
}

function checkOutputFile(outputFile) {
  console.log('📁 Checking output file...');

  const fs = require('fs');

  try {
    if (fs.existsSync(outputFile)) {
      const content = fs.readFileSync(outputFile, 'utf-8');
      console.log('✅ Output file exists');
      console.log(`   Size: ${content.length} bytes`);
      console.log(`   Content preview: ${content.substring(0, 200)}`);
    } else {
      console.log('⚠️  Output file not found yet');
    }
  } catch (error) {
    console.error('❌ Error reading output file:', error.message);
  }

  // Clean up after 5 seconds
  setTimeout(() => {
    cleanup();
  }, 5000);
}

function cleanup() {
  console.log('');
  console.log('🧹 Cleaning up...');

  // Kill the tmux session
  const tmuxKill = spawn('tmux', [
    'kill-session',
    '-t', TEST_SESSION_ID
  ], {
    env: { ...process.env, TMUX_TMPDIR: '/tmp' }
  });

  tmuxKill.on('close', (code) => {
    if (code === 0) {
      console.log('✅ Tmux session killed');
    } else {
      console.log('⚠️  Tmux session may already be gone');
    }

    // Disconnect socket
    socket.disconnect();
    console.log('✅ WebSocket disconnected');

    console.log('');
    console.log('🎉 Test complete!');
    process.exit(0);
  });
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n⚠️  Interrupted, cleaning up...');
  cleanup();
});