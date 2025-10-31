#!/usr/bin/env node

import { io } from 'socket.io-client';

const WS_URL = 'http://localhost:4567';

async function testWebSocket() {
  console.log('Testing Socket.IO connection only...\n');
  
  try {
    const socket = io(WS_URL, {
      transports: ['websocket', 'polling']
    });
    
    await new Promise((resolve, reject) => {
      socket.on('connect', () => {
        console.log('✅ Socket.IO connected');
        console.log('Socket ID:', socket.id);
        resolve();
      });
      
      socket.on('connect_error', (error) => {
        console.error('❌ Socket.IO connection error:', error.message);
        reject(error);
      });
      
      // Set timeout
      setTimeout(() => reject(new Error('Socket.IO connection timeout')), 5000);
    });
    
    // Test sending a simple message
    console.log('Sending test message...');
    socket.emit('ping', { timestamp: Date.now() });
    
    // Listen for messages
    socket.on('message', (data) => {
      console.log('Received message:', data);
    });
    
    // Wait a bit then disconnect
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    socket.disconnect();
    console.log('✅ Socket.IO test completed successfully');
    
  } catch (error) {
    console.error('❌ WebSocket test failed:', error.message);
    process.exit(1);
  }
}

testWebSocket();