#!/usr/bin/env node

/**
 * Test script for harvest workflow
 * Tests the complete flow from farm creation to harvest
 */

import axios from 'axios';
import WebSocket from 'ws';

const BASE_URL = 'http://localhost:4567';
const WS_URL = 'ws://localhost:4567';

// Create axios instance
const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Test data
const testFarmData = {
  name: 'Test Harvest Farm',
  description: 'Testing harvest workflow',
  type: 'standard',
  maxAgents: 3,
  tags: ['test', 'harvest']
};

// WebSocket connection
let ws;

async function connectWebSocket() {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(WS_URL);
    
    ws.on('open', () => {
      console.log('✅ WebSocket connected');
      resolve();
    });
    
    ws.on('message', (data) => {
      const message = JSON.parse(data);
      console.log('📨 WebSocket event:', message.type || message.event, message);
    });
    
    ws.on('error', reject);
  });
}

async function testHarvestWorkflow() {
  console.log('🚀 Starting harvest workflow test...\n');
  
  try {
    // Connect WebSocket
    await connectWebSocket();
    
    // Step 1: Create a farm
    console.log('1️⃣ Creating farm...');
    const farmResponse = await api.post('/api/farms', testFarmData);
    const farm = farmResponse.data.data || farmResponse.data;
    console.log(`✅ Farm created: ${farm.id} - ${farm.name}`);
    
    // Step 2: Start the farm
    console.log('\n2️⃣ Starting farm...');
    await api.post(`/api/farms/${farm.id}/start`);
    console.log('✅ Farm started');
    
    // Wait a bit for farm to process
    console.log('\n⏳ Waiting for farm to process...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Step 3: Complete the farm with some outputs
    console.log('\n3️⃣ Completing farm...');
    const outputs = [
      {
        agentId: 'agent-1',
        agentName: 'Test Agent 1',
        type: 'analysis',
        data: { result: 'Analysis complete', score: 95 },
        duration: 120
      },
      {
        agentId: 'agent-2',
        agentName: 'Test Agent 2',
        type: 'generation',
        data: { result: 'Code generated', files: 5 },
        duration: 180
      }
    ];
    
    const completeResponse = await api.post(`/api/farms/${farm.id}/complete`, {
      outputs,
      summary: {
        totalTasks: 2,
        completedTasks: 2,
        failedTasks: 0,
        efficiency: 100
      }
    });
    
    console.log('✅ Farm completed and harvest created');
    const harvest = completeResponse.data.data?.harvest;
    if (harvest) {
      console.log(`   Harvest ID: ${harvest.id}`);
      console.log(`   Status: ${harvest.status}`);
    }
    
    // Step 4: Get harvest details
    console.log('\n4️⃣ Fetching harvest details...');
    const harvestsResponse = await api.get('/api/harvest');
    const harvests = harvestsResponse.data.data || harvestsResponse.data;
    console.log(`✅ Found ${harvests.length} harvests`);
    
    if (harvests.length > 0) {
      const latestHarvest = harvests[0];
      console.log('\n📦 Latest Harvest:');
      console.log(`   ID: ${latestHarvest.id}`);
      console.log(`   Farm: ${latestHarvest.farmName}`);
      console.log(`   Status: ${latestHarvest.status}`);
      console.log(`   Results: ${latestHarvest.results?.length || 0}`);
      console.log(`   Insights: ${latestHarvest.insights?.length || 0}`);
      console.log(`   Quality: ${latestHarvest.quality?.overallScore || 0}%`);
    }
    
    // Step 5: Check barn storage
    console.log('\n5️⃣ Checking barn storage...');
    const barnResponse = await api.get('/api/barn/items');
    const barnItems = barnResponse.data.data || barnResponse.data;
    console.log(`✅ Found ${barnItems.length} items in barn`);
    
    // Step 6: Test manual harvest creation
    console.log('\n6️⃣ Testing manual harvest creation...');
    const manualHarvestResponse = await api.post(`/api/farms/${farm.id}/harvest`);
    if (manualHarvestResponse.data.success) {
      console.log('✅ Manual harvest created successfully');
    }
    
    console.log('\n✨ Harvest workflow test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.response?.data || error.message);
  } finally {
    if (ws) {
      ws.close();
    }
  }
}

// Run the test
testHarvestWorkflow();