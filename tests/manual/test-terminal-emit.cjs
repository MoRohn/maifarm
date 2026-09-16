#!/usr/bin/env node

/**
 * Test script to manually emit terminal output via WebSocket
 * This tests if the WebSocket connection and terminal display works
 */

const io = require('socket.io-client');
const fs = require('fs');
const path = require('path');

// Connect to the WebSocket server
const socket = io('http://localhost:4567', {
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});

socket.on('connect', () => {
  console.log('Connected to WebSocket server');

  // Read some actual terminal output
  const terminalDir = path.join(process.env.MAIFARM_ROOT || process.cwd(), 'var/maibarn/terminals/35125033-10d8-42c6-a715-b7a3fad01375');
  const logFile = path.join(terminalDir, 'agent-0.log');

  if (fs.existsSync(logFile)) {
    const content = fs.readFileSync(logFile, 'utf8');
    const lines = content.split('\n').slice(-50); // Get last 50 lines

    // Emit terminal output event
    console.log('Emitting terminal:output event...');
    socket.emit('terminal:output', {
      farmId: '35125033-10d8-42c6-a715-b7a3fad01375',
      sessionName: 'farm-35125033',
      agentId: 'agent-0',
      output: lines.join('\n'),
      lines: lines,
      timestamp: new Date()
    });

    // Also try broadcasting approach
    setTimeout(() => {
      console.log('Broadcasting farm:terminal:output event...');
      socket.emit('broadcast', {
        event: 'farm:terminal:output',
        data: {
          farmId: '35125033-10d8-42c6-a715-b7a3fad01375',
          agentId: 'agent-0',
          content: lines.join('\n'),
          timestamp: new Date()
        }
      });
    }, 1000);

    // Try the room approach
    setTimeout(() => {
      console.log('Joining terminal room and emitting...');
      socket.emit('terminal:join', {
        sessionId: 'farm-35125033',
        farmId: '35125033-10d8-42c6-a715-b7a3fad01375'
      });

      setTimeout(() => {
        socket.emit('terminal:output', {
          sessionName: 'farm-35125033',
          sessionId: 'farm-35125033',
          farmId: '35125033-10d8-42c6-a715-b7a3fad01375',
          agentId: 0,
          output: 'Test output from manual emission:\n' + lines.slice(-10).join('\n'),
          lines: lines.slice(-10),
          timestamp: new Date()
        });
      }, 500);
    }, 2000);

  } else {
    console.log('Terminal log file not found:', logFile);
  }
});

socket.on('error', (error) => {
  console.error('WebSocket error:', error);
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});

// Listen for any events
socket.onAny((eventName, ...args) => {
  console.log('Received event:', eventName, args);
});

// Keep the script running
setTimeout(() => {
  console.log('Test complete, disconnecting...');
  socket.disconnect();
  process.exit(0);
}, 10000);