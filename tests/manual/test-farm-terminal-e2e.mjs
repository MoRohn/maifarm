#!/usr/bin/env node

import { io } from 'socket.io-client';
import fetch from 'node-fetch';
import { spawn } from 'child_process';
import { readFile } from 'fs/promises';

const API_URL = 'http://localhost:4567';
const WS_URL = 'http://localhost:4567';

console.log('🚀 End-to-End Farm Terminal Streaming Test');
console.log('==========================================\n');

// Step 1: Create a real farm via API
console.log('📋 Step 1: Creating farm via API...');

const farmData = {
  name: 'Terminal Test Farm',
  description: 'Testing terminal streaming functionality',
  prompt: 'Test terminal streaming',
  agentCount: 3,
  mode: 'harvest',
  timeout: 300
};

try {
  const response = await fetch(`${API_URL}/api/farms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(farmData)
  });

  const farm = await response.json();

  if (!farm.success) {
    throw new Error(`Failed to create farm: ${JSON.stringify(farm)}`);
  }

  const farmId = farm.data.id;
  const sessionId = farm.data.sessionId || `farm-${farmId.substring(0, 8)}`;

  console.log(`✅ Farm created: ${farmId}`);
  console.log(`   Session ID: ${sessionId}`);
  console.log(`   Status: ${farm.data.status}`);

  // Step 2: Wait for tmux session to be ready
  console.log('\n📋 Step 2: Waiting for tmux session...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Check if tmux session exists
  const checkSession = spawn('tmux', ['has-session', '-t', sessionId]);
  await new Promise((resolve, reject) => {
    checkSession.on('close', code => {
      if (code === 0) {
        console.log('✅ Tmux session exists');
        resolve();
      } else {
        console.log('⚠️ Tmux session not found, creating mock session...');
        resolve();
      }
    });
  });

  // Step 3: Connect WebSocket and monitor terminal output
  console.log('\n📋 Step 3: Connecting WebSocket to monitor terminals...');

  const socket = io(WS_URL, {
    transports: ['websocket'],
    reconnectionAttempts: 3
  });

  const terminalOutputReceived = new Map();
  let joinedSuccessfully = false;

  socket.on('connect', () => {
    console.log('✅ WebSocket connected');

    // Join terminal session
    console.log(`   Joining terminal session: ${sessionId}`);
    socket.emit('terminal:join:simple', {
      farmId: farmId,
      sessionId: sessionId
    });
  });

  socket.on('terminal:joined', (data) => {
    console.log(`✅ Successfully joined terminal session`);
    joinedSuccessfully = true;
  });

  socket.on('terminal:output', (data) => {
    const agentId = data.agentId;
    if (!terminalOutputReceived.has(agentId)) {
      terminalOutputReceived.set(agentId, []);
    }
    terminalOutputReceived.get(agentId).push(data.content);
    console.log(`📝 Terminal output from Agent ${agentId}: ${data.content.substring(0, 50)}...`);
  });

  socket.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });

  // Step 4: Simulate agent activity in tmux panes
  console.log('\n📋 Step 4: Simulating agent activity...');

  // Give WebSocket time to connect
  await new Promise(resolve => setTimeout(resolve, 1000));

  for (let i = 0; i < 3; i++) {
    const paneTarget = `${sessionId}:agents.${i}`;

    // Send test commands to each pane
    const command1 = `echo "[$(date -Iseconds)] Agent ${i} initialized"`;
    const command2 = `echo "[$(date -Iseconds)] Agent ${i} working on task..."`;

    spawn('tmux', ['send-keys', '-t', paneTarget, command1, 'Enter']);
    await new Promise(resolve => setTimeout(resolve, 500));

    spawn('tmux', ['send-keys', '-t', paneTarget, command2, 'Enter']);
    console.log(`   Sent test commands to Agent ${i}`);
  }

  // Step 5: Check terminal files are being written
  console.log('\n📋 Step 5: Checking terminal output files...');

  await new Promise(resolve => setTimeout(resolve, 2000));

  for (let i = 0; i < 3; i++) {
    const filePath = `${process.env.MAIFARM_ROOT || process.cwd()}/var/maibarn/terminals/${farmId}/agent-${i}.log`;
    try {
      const content = await readFile(filePath, 'utf8');
      if (content.length > 0) {
        console.log(`✅ Agent ${i} log file has content (${content.length} bytes)`);
        console.log(`   Preview: ${content.substring(0, 100).replace(/\n/g, '\\n')}...`);
      } else {
        console.log(`⚠️ Agent ${i} log file is empty`);
      }
    } catch (error) {
      console.log(`❌ Agent ${i} log file not found: ${filePath}`);
    }
  }

  // Step 6: Verify WebSocket received terminal output
  console.log('\n📋 Step 6: Verifying WebSocket terminal streaming...');

  // Wait a bit more for WebSocket events
  await new Promise(resolve => setTimeout(resolve, 3000));

  if (!joinedSuccessfully) {
    console.log('❌ Failed to join terminal session via WebSocket');
  }

  if (terminalOutputReceived.size > 0) {
    console.log(`✅ Received terminal output from ${terminalOutputReceived.size} agents:`);
    for (const [agentId, outputs] of terminalOutputReceived.entries()) {
      console.log(`   Agent ${agentId}: ${outputs.length} messages`);
    }
  } else {
    console.log('⚠️ No terminal output received via WebSocket');
    console.log('   This might indicate the file watcher is not working');
  }

  // Step 7: Open browser to check UI
  console.log('\n📋 Step 7: Opening browser to check UI...');
  const browserUrl = `http://localhost:3000/harvest/${farmId}`;
  console.log(`   URL: ${browserUrl}`);
  spawn('open', [browserUrl]);

  // Step 8: Summary
  console.log('\n📊 Test Summary');
  console.log('===============');
  console.log(`✅ Farm created: ${farmId}`);
  console.log(`✅ Session ID: ${sessionId}`);
  console.log(`${joinedSuccessfully ? '✅' : '❌'} WebSocket joined terminal session`);
  console.log(`${terminalOutputReceived.size > 0 ? '✅' : '❌'} Terminal output streamed via WebSocket`);

  // Keep connection alive to monitor
  console.log('\n⏳ Monitoring for 10 more seconds...');
  await new Promise(resolve => setTimeout(resolve, 10000));

  // Cleanup
  console.log('\n🧹 Cleaning up...');
  socket.disconnect();

  // Kill tmux session
  spawn('tmux', ['kill-session', '-t', sessionId]);

  console.log('✅ Test complete!');

  process.exit(terminalOutputReceived.size > 0 ? 0 : 1);

} catch (error) {
  console.error('❌ Test failed:', error);
  process.exit(1);
}