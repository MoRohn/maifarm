// Test Seeds → Farms → Harvest → Barn workflow

import axios from 'axios';
import { io } from 'socket.io-client';

const API_URL = 'http://localhost:4567/api';

// Since auth is required, let's create a mock token
const headers = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer mock-token-for-testing'
};

async function testWorkflow() {
  console.log('=== Testing Seeds → Farms → Harvest → Barn Workflow ===\n');

  try {
    // 1. Get available seeds
    console.log('1. Fetching available seeds...');
    const seedsResponse = await axios.get(`${API_URL}/seeds`);
    console.log(`Found ${seedsResponse.data.length} seeds`);
    
    if (seedsResponse.data.length > 0) {
      const seed = seedsResponse.data[0];
      console.log(`Selected seed: ${seed.name} (${seed.id})`);

      // 2. Create farm from seed (will fail due to auth but shows workflow)
      console.log('\n2. Attempting to create farm from seed...');
      try {
        const farmData = {
          name: 'Test Farm from Seed',
          description: 'Testing farm creation workflow',
          seedId: seed.id,
          configuration: {
            farmType: seed.farmType
          }
        };
        
        const farmResponse = await axios.post(`${API_URL}/farms`, farmData, { headers });
        console.log('Farm created:', farmResponse.data);
      } catch (error) {
        console.log('Farm creation failed (expected due to auth):', error.response?.data?.error?.message || error.message);
      }

      // 3. Test harvest endpoint
      console.log('\n3. Testing harvest endpoint...');
      try {
        const harvestResponse = await axios.get(`${API_URL}/harvest`);
        console.log('Harvest endpoint response:', harvestResponse.data);
      } catch (error) {
        console.log('Harvest endpoint error:', error.response?.status || error.message);
      }

      // 4. Test barn endpoint
      console.log('\n4. Testing barn endpoint...');
      try {
        const barnResponse = await axios.get(`${API_URL}/barn`);
        console.log('Barn endpoint response:', barnResponse.data);
      } catch (error) {
        console.log('Barn endpoint error:', error.response?.status || error.message);
      }
    }

    // Test WebSocket connection
    console.log('\n5. Testing WebSocket connection...');
    const socket = io('ws://localhost:4567', {
      transports: ['websocket'],
      reconnection: false
    });

    socket.on('connect', () => {
      console.log('WebSocket connected successfully');
      socket.disconnect();
    });

    socket.on('connect_error', (error) => {
      console.log('WebSocket connection error:', error.message);
    });

    // Give WebSocket time to connect
    await new Promise(resolve => setTimeout(resolve, 2000));

  } catch (error) {
    console.error('Test error:', error.message);
  }
}

testWorkflow();