const io = require('socket.io-client');

console.log('Testing WebSocket connection to MaiFarm server...\n');

// Connect to the server
const socket = io('http://localhost:4567', {
  transports: ['websocket', 'polling'],
  auth: {
    userId: 'test-user'
  }
});

// Track connection status
let connected = false;

socket.on('connect', () => {
  connected = true;
  console.log('✅ Connected successfully!');
  console.log('   Socket ID:', socket.id);
  console.log('   Transport:', socket.io.engine.transport.name);
  
  // Test sending a message
  socket.emit('test:ping', { timestamp: new Date() });
  
  // Disconnect after 2 seconds
  setTimeout(() => {
    console.log('\n📤 Disconnecting...');
    socket.disconnect();
  }, 2000);
});

socket.on('connected', (data) => {
  console.log('✅ Received connection confirmation:', data);
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', {
    message: error.message,
    type: error.type
  });
});

socket.on('disconnect', (reason) => {
  console.log('🔌 Disconnected:', reason);
  if (connected) {
    console.log('\n✅ Test completed successfully!');
  } else {
    console.log('\n❌ Test failed - could not establish connection');
  }
  process.exit(connected ? 0 : 1);
});

// Timeout after 10 seconds
setTimeout(() => {
  if (!connected) {
    console.error('\n❌ Connection timeout - could not connect within 10 seconds');
    process.exit(1);
  }
}, 10000);