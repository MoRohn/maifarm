#!/usr/bin/env node

const { spawn } = require('child_process');

// Configuration
const FARM_ID = '5a5ef5e4-1c6a-45f6-a693-b81f1832be7d';
const TMUX_SESSION = 'farm_5a5ef5e4';
const API_URL = 'http://localhost:4567';

// Import Socket.IO client
const io = require('socket.io-client');

// Connect to WebSocket server
const socket = io(API_URL, {
  transports: ['websocket', 'polling'],
  auth: {
    userId: 'monitor-script'
  }
});

socket.on('connect', () => {
  console.log('Connected to WebSocket server');
  
  // Start monitoring agents
  monitorAgents();
});

socket.on('error', (error) => {
  console.error('WebSocket error:', error);
});

function monitorAgents() {
  console.log(`Monitoring agents for farm ${FARM_ID}`);
  
  // Monitor 3 agents
  for (let agentId = 0; agentId < 3; agentId++) {
    setInterval(() => {
      captureAgentTerminal(agentId);
    }, 2000); // Every 2 seconds
  }
}

function captureAgentTerminal(agentId) {
  const capture = spawn('tmux', [
    'capture-pane',
    '-t', `${TMUX_SESSION}:0.${agentId}`,
    '-p',
    '-S', '-100' // Last 100 lines
  ]);
  
  let output = '';
  
  capture.stdout.on('data', (data) => {
    output += data.toString();
  });
  
  capture.on('close', (code) => {
    if (code === 0 && output) {
      // Broadcast terminal update
      socket.emit('agent:terminal:update', {
        farmId: FARM_ID,
        agentId: agentId,
        content: output,
        timestamp: new Date()
      });
      
      console.log(`Updated terminal for agent ${agentId} (${output.length} bytes)`);
    }
  });
}

// Also broadcast agent status
setInterval(() => {
  for (let agentId = 0; agentId < 3; agentId++) {
    socket.emit('agent:status', {
      farmId: FARM_ID,
      agentId: agentId,
      status: 'working',
      uid: `agent_${agentId}`,
      timestamp: new Date()
    });
  }
}, 5000);

console.log('Terminal monitor started. Press Ctrl+C to stop.');