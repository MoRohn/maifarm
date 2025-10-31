import { io } from 'socket.io-client';

console.log('Testing Socket.io connection to localhost:4567...');

const socket = io('http://localhost:4567', {
  transports: ['websocket', 'polling'],
  reconnection: false
});

socket.on('connect', () => {
  console.log('✅ Socket.io connected successfully!');
  console.log('Socket ID:', socket.id);
  
  // Test terminal join
  socket.emit('terminal:join', {
    sessionId: 'test-session',
    farmId: 'test-farm'
  });
  
  setTimeout(() => {
    socket.disconnect();
    console.log('Connection closed.');
    process.exit(0);
  }, 2000);
});

socket.on('connect_error', (err) => {
  console.error('❌ Socket.io connection error:', err.message);
  process.exit(1);
});

socket.on('terminal:joined', (data) => {
  console.log('Terminal joined:', data);
});

socket.on('disconnect', () => {
  console.log('Socket.io disconnected');
});

setTimeout(() => {
  console.error('❌ Timeout - no connection after 5 seconds');
  process.exit(1);
}, 5000);