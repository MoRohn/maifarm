import { io } from 'socket.io-client';

// Connect to the WebSocket server
const socket = io('http://localhost:4567', {
  path: '/socket.io',
  transports: ['websocket'],
  auth: {
    userId: 'test-user',
    token: 'test-token'
  }
});

console.log('Connecting to WebSocket server...');

// Connection events
socket.on('connect', () => {
  console.log('✅ Connected to WebSocket server');
  console.log('Socket ID:', socket.id);
  
  // Subscribe to various events
  socket.emit('subscribe', { channel: 'farms' });
  socket.emit('subscribe', { channel: 'agents' });
  socket.emit('subscribe', { channel: 'metrics' });
});

socket.on('disconnect', (reason) => {
  console.log('❌ Disconnected:', reason);
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error.message);
});

// Farm events
socket.on('farm:created', (data) => {
  console.log('📦 Farm created:', data);
});

socket.on('farm:updated', (data) => {
  console.log('🔄 Farm updated:', data);
});

socket.on('farm:status', (data) => {
  console.log('📊 Farm status:', data);
});

// Agent events
socket.on('agent:created', (data) => {
  console.log('🤖 Agent created:', data);
});

socket.on('agent:updated', (data) => {
  console.log('🔄 Agent updated:', data);
});

socket.on('agent:status', (data) => {
  console.log('📊 Agent status:', data);
});

// Metrics events
socket.on('metrics:update', (data) => {
  console.log('📈 Metrics update:', data);
});

// Task events
socket.on('task:assigned', (data) => {
  console.log('📋 Task assigned:', data);
});

socket.on('task:progress', (data) => {
  console.log('⏳ Task progress:', data);
});

socket.on('task:completed', (data) => {
  console.log('✅ Task completed:', data);
});

// Keep the script running
process.on('SIGINT', () => {
  console.log('\nClosing WebSocket connection...');
  socket.disconnect();
  process.exit(0);
});

// Keep alive
setInterval(() => {
  if (socket.connected) {
    console.log('💓 Heartbeat - Connected');
  }
}, 10000);