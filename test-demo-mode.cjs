#!/usr/bin/env node

const axios = require('axios');
const io = require('socket.io-client');

const SERVER_URL = 'http://localhost:4567';
const WS_URL = 'http://localhost:4567';

console.log('🧪 Testing MaiFarm Demo Mode\n');

async function checkServerHealth() {
  try {
    const response = await axios.get(`${SERVER_URL}/api/health`, { timeout: 2000 });
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

async function testDemoMode() {
  console.log('1. Checking server availability...');
  const isServerUp = await checkServerHealth();
  
  if (isServerUp) {
    console.log('   ✅ Server is running at', SERVER_URL);
    console.log('   ℹ️  Demo mode will not activate when server is available\n');
    
    console.log('2. Testing normal WebSocket connection...');
    const socket = io(WS_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 3
    });
    
    return new Promise((resolve) => {
      socket.on('connect', () => {
        console.log('   ✅ WebSocket connected successfully');
        console.log('   📊 Connection type: Live server\n');
        
        socket.on('metrics:update', (data) => {
          console.log('3. Received live metrics:', JSON.stringify(data).substring(0, 100) + '...');
        });
        
        setTimeout(() => {
          socket.disconnect();
          resolve();
        }, 3000);
      });
      
      socket.on('connect_error', (error) => {
        console.log('   ⚠️  Connection error:', error.message);
        socket.disconnect();
        resolve();
      });
    });
    
  } else {
    console.log('   ⚠️  Server is not running');
    console.log('   ✅ Demo mode should activate automatically\n');
    
    console.log('2. Simulating offline mode with mock data...');
    
    // Import and test mock data provider directly
    const { MockDataProvider } = require('./src/services/mockDataProvider.ts');
    const mockProvider = new MockDataProvider({
      updateInterval: 1000,
      generateMetrics: true,
      generateFarms: true,
      generateAgents: true
    });
    
    console.log('   ✅ Mock data provider initialized\n');
    
    console.log('3. Starting mock data generation...');
    let messageCount = 0;
    
    mockProvider.start((message) => {
      messageCount++;
      console.log(`   📨 Mock message #${messageCount}:`, message.type);
      
      if (message.type === 'metrics:update') {
        console.log('      Dashboard metrics:', {
          activeFarms: message.data?.dashboard?.activeFarms,
          totalAgents: message.data?.dashboard?.totalAgents,
          tasksCompleted: message.data?.dashboard?.tasksCompleted
        });
      }
      
      if (message.type === 'farm:updated') {
        console.log('      Farm update:', {
          id: message.payload?.farm?.id,
          name: message.payload?.farm?.name,
          status: message.payload?.farm?.status
        });
      }
      
      if (message.type === 'agent_update') {
        console.log('      Agent update:', {
          id: message.payload?.id,
          name: message.payload?.name,
          status: message.payload?.status
        });
      }
    });
    
    console.log('\n4. Testing mock operations...');
    
    // Test farm creation
    setTimeout(() => {
      console.log('   🚜 Creating mock farm...');
      mockProvider.simulateFarmCreation('Test Demo Farm');
    }, 2000);
    
    // Test error simulation
    setTimeout(() => {
      console.log('   ❌ Simulating error...');
      mockProvider.simulateError('Test error for demo mode');
    }, 4000);
    
    // Stop after 6 seconds
    setTimeout(() => {
      console.log('\n5. Stopping mock data generation...');
      mockProvider.stop();
      console.log('   ✅ Mock data provider stopped');
      console.log(`\n📊 Total messages generated: ${messageCount}`);
    }, 6000);
  }
}

// Run the test
testDemoMode().then(() => {
  console.log('\n✅ Demo mode test completed');
  process.exit(0);
}).catch((error) => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});