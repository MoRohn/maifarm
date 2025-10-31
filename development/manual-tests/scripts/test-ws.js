import WebSocket from 'ws';

console.log('Testing WebSocket connection to localhost:4567...');

const ws = new WebSocket('ws://localhost:4567');

ws.on('open', () => {
  console.log('✅ WebSocket connected successfully!');
  console.log('Sending test message...');
  ws.send(JSON.stringify({ type: 'ping' }));
  
  setTimeout(() => {
    ws.close();
    console.log('Connection closed.');
    process.exit(0);
  }, 2000);
});

ws.on('message', (data) => {
  console.log('Received:', data.toString());
});

ws.on('error', (err) => {
  console.error('❌ WebSocket error:', err.message);
  process.exit(1);
});

ws.on('close', () => {
  console.log('WebSocket connection closed');
});

setTimeout(() => {
  console.error('❌ Timeout - no connection after 5 seconds');
  process.exit(1);
}, 5000);