#!/usr/bin/env node

const { io } = require('socket.io-client');

console.log('Testing Harvest WebSocket functionality...\n');

// Connect to WebSocket server
const socket = io('http://localhost:4567', {
  auth: {
    token: 'dev-token'
  }
});

// Subscribe to harvest events
const harvestEvents = [
  'harvest:created',
  'harvest:updated', 
  'harvest:completed',
  'harvest:started',
  'harvest:deleted',
  'barn:stored'
];

socket.on('connect', () => {
  console.log('✅ Connected to WebSocket server');
  console.log('   Socket ID:', socket.id);
  console.log('\n📡 Listening for harvest events...\n');
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error.message);
});

// Listen for harvest events
harvestEvents.forEach(event => {
  socket.on(event, (data) => {
    console.log(`📦 Event: ${event}`);
    console.log('   Data:', JSON.stringify(data, null, 2));
    console.log('   Time:', new Date().toISOString());
    console.log('');
  });
});

// Also listen for general farm events that might trigger harvests
socket.on('farm:completed', (data) => {
  console.log('🌾 Farm completed - harvest should follow');
  console.log('   Farm:', data.farmId);
  console.log('');
});

// Test creating a harvest after connection
socket.on('connect', async () => {
  setTimeout(async () => {
    console.log('\n🧪 Creating test harvest via API...\n');
    
    try {
      // First create a farm
      const farmResponse = await fetch('http://localhost:4567/api/farms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'WebSocket Test Farm',
          description: 'Testing harvest WebSocket events',
          agents: [{ name: 'test-agent', skills: ['analysis'] }]
        })
      });
      
      const farm = await farmResponse.json();
      console.log('✅ Created test farm:', farm.data.id);
      
      // Start a harvest
      const harvestResponse = await fetch(`http://localhost:4567/api/harvest/farms/${farm.data.id}/harvest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          farmName: 'WebSocket Test Farm'
        })
      });
      
      const harvest = await harvestResponse.json();
      console.log('✅ Started harvest:', harvest.id);
      console.log('\n⏳ Waiting for WebSocket events...\n');
      
      // Complete the harvest after a delay
      setTimeout(async () => {
        const completeResponse = await fetch(`http://localhost:4567/api/harvest/${harvest.id}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (completeResponse.ok) {
          console.log('✅ Marked harvest as complete');
        }
      }, 3000);
      
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  }, 2000);
});

// Keep the script running
console.log('Press Ctrl+C to exit\n');

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Disconnecting...');
  socket.disconnect();
  process.exit(0);
});