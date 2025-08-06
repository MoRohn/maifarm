import { io } from 'socket.io-client';

console.log('Testing WebSocket connection to MaiFarm server...\n');

// Test direct connection
const socket = io('http://localhost:4567', {
  transports: ['websocket', 'polling'],
  reconnection: false,
  timeout: 5000,
  auth: {
    userId: 'test-client'
  }
});

let connected = false;

socket.on('connect', () => {
  connected = true;
  console.log('✅ WebSocket connected successfully!');
  console.log(`   Socket ID: ${socket.id}`);
  console.log(`   Transport: ${socket.io.engine.transport.name}`);
  
  // Test ping-pong
  socket.on('ping', () => {
    console.log('   ← Received ping from server');
    socket.emit('pong');
    console.log('   → Sent pong to server');
  });
  
  // Subscribe to metrics
  console.log('\n📊 Subscribing to metrics...');
  socket.emit('metrics:subscribe', {});
  
  socket.on('metrics:update', (event) => {
    console.log('\n📈 Metrics update received:');
    if (event.data?.dashboard) {
      console.log(`   Active Farms: ${event.data.dashboard.activeFarms}`);
      console.log(`   Total Agents: ${event.data.dashboard.totalAgents}`);
      console.log(`   Tasks Completed: ${event.data.dashboard.tasksCompleted}`);
      console.log(`   Success Rate: ${event.data.dashboard.successRate}%`);
    }
  });
  
  // Disconnect after 10 seconds
  setTimeout(() => {
    console.log('\n🔌 Disconnecting...');
    socket.disconnect();
    process.exit(0);
  }, 10000);
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error.message);
  console.error('   Type:', error.type);
  process.exit(1);
});

socket.on('disconnect', (reason) => {
  if (connected) {
    console.log(`\n🔌 Disconnected: ${reason}`);
  }
});

// Timeout if no connection after 5 seconds
setTimeout(() => {
  if (!connected) {
    console.error('\n❌ Connection timeout - no response from server');
    process.exit(1);
  }
}, 5000);