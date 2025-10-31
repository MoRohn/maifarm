#!/usr/bin/env node

import { io } from 'socket.io-client';

// The farm ID that has terminal files
const farmId = 'b5e40088-6875-44bc-b2ec-089ce0233e1f';
const sessionId = `farm-${farmId.substring(0, 8)}`;

console.log('🔍 Testing Terminal File Watcher Debug');
console.log('=====================================');
console.log(`Farm ID: ${farmId}`);
console.log(`Session ID: ${sessionId}`);
console.log('');

// Connect to WebSocket server
const socket = io('http://localhost:4567', {
  transports: ['websocket'],
  reconnection: false
});

socket.on('connect', () => {
  console.log('✅ Connected to WebSocket server');

  // Join terminal room
  console.log(`📡 Emitting terminal:join for ${sessionId}`);
  socket.emit('terminal:join', {
    farmId: farmId,
    sessionId: sessionId
  });
});

socket.on('terminal:joined', (data) => {
  console.log('✅ Successfully joined terminal room:', data);
});

socket.on('terminal:output', (data) => {
  console.log('📝 Terminal output received:');
  console.log('  - Agent ID:', data.agentId);
  console.log('  - Lines:', data.lines?.length || 0);
  console.log('  - Output length:', data.output?.length || 0);
  if (data.lines && data.lines.length > 0) {
    console.log('  - Sample:', data.lines[0]);
  }
});

socket.on('error', (error) => {
  console.error('❌ WebSocket error:', error);
});

socket.on('disconnect', () => {
  console.log('🔌 Disconnected from WebSocket server');
});

// Keep the script running
setTimeout(() => {
  console.log('\n⏱️ Test complete. Check server logs for file watcher activity.');
  process.exit(0);
}, 10000);