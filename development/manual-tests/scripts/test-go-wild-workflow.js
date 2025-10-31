#!/usr/bin/env node

/**
 * Test script for Go Wild workflow
 * Tests the complete flow from farm creation to barn storage
 */

const fetch = require('node-fetch');
const WebSocket = require('ws');

const API_BASE = 'http://localhost:4567/api';
const WS_URL = 'ws://localhost:4567';

// Test data
const testFarmData = {
  name: 'Test Go Wild Explorer',
  description: 'Testing Go Wild exploration workflow',
  type: 'autonomous',
  config: {
    maxAgents: 3,
    autoScale: true,
    timeout: 300, // 5 minutes
    goWildMode: {
      enabled: true,
      creativityLevel: 4,
      boundaries: ['allowFileSystem', 'allowNetworkRequests']
    }
  }
};

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testGoWildWorkflow() {
  console.log('🚀 Starting Go Wild Workflow Test...\n');
  
  let farmId = null;
  let harvestId = null;
  
  try {
    // Step 1: Create Go Wild Farm
    console.log('1️⃣ Creating Go Wild farm...');
    const createResponse = await fetch(`${API_BASE}/farms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testFarmData)
    });
    
    const createResult = await createResponse.json();
    console.log('Farm creation response:', JSON.stringify(createResult, null, 2));
    
    if (!createResult.success || !createResult.data?.id) {
      throw new Error(`Failed to create farm: ${JSON.stringify(createResult)}`);
    }
    
    farmId = createResult.data.id;
    console.log(`✅ Farm created successfully: ${farmId}\n`);
    
    // Step 2: Launch Farm with Go Wild Mode
    console.log('2️⃣ Launching farm with Go Wild mode...');
    const launchResponse = await fetch(`${API_BASE}/farms/${farmId}/launch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        numberOfAgents: 3,
        collaborative: true,
        prompt: 'Explore innovative solutions for sustainable farming',
        goWildMode: true,
        provider: 'claude'
      })
    });
    
    const launchResult = await launchResponse.json();
    console.log('Launch response:', JSON.stringify(launchResult, null, 2));
    
    if (!launchResult.success) {
      throw new Error(`Failed to launch farm: ${JSON.stringify(launchResult)}`);
    }
    
    harvestId = launchResult.data?.harvestId;
    console.log(`✅ Farm launched successfully with harvest: ${harvestId}\n`);
    
    // Step 3: Check Terminal Sessions
    console.log('3️⃣ Checking for terminal sessions...');
    await delay(2000); // Wait for sessions to be created
    
    const sessionsResponse = await fetch(`${API_BASE}/terminal/sessions?farmId=${farmId}`);
    const sessionsResult = await sessionsResponse.json();
    console.log('Terminal sessions:', JSON.stringify(sessionsResult, null, 2));
    
    if (sessionsResult.data && sessionsResult.data.length > 0) {
      console.log(`✅ Found ${sessionsResult.data.length} terminal session(s)\n`);
    } else {
      console.log('⚠️ No terminal sessions found yet\n');
    }
    
    // Step 4: Check Harvest Status
    console.log('4️⃣ Checking harvest status...');
    if (harvestId) {
      const harvestResponse = await fetch(`${API_BASE}/harvests/${harvestId}`);
      const harvestResult = await harvestResponse.json();
      console.log('Harvest status:', harvestResult.data?.status);
      
      if (harvestResult.success) {
        console.log(`✅ Harvest is ${harvestResult.data.status}\n`);
      }
    }
    
    // Step 5: Check Farm Status
    console.log('5️⃣ Checking farm status...');
    const farmResponse = await fetch(`${API_BASE}/farms/${farmId}`);
    const farmResult = await farmResponse.json();
    console.log('Farm status:', farmResult.data?.status);
    console.log('Farm agents:', farmResult.data?.agents?.length || 0);
    
    // Step 6: Test WebSocket Connection
    console.log('\n6️⃣ Testing WebSocket connection...');
    const ws = new WebSocket(WS_URL);
    
    await new Promise((resolve, reject) => {
      ws.on('open', () => {
        console.log('✅ WebSocket connected');
        
        // Join harvest room for updates
        ws.send(JSON.stringify({
          type: 'harvest:join',
          data: { harvestId, farmId }
        }));
        
        resolve();
      });
      
      ws.on('error', reject);
      
      // Set timeout
      setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
    });
    
    // Listen for events for a few seconds
    console.log('Listening for WebSocket events...');
    ws.on('message', (data) => {
      try {
        const event = JSON.parse(data);
        console.log(`📨 Event: ${event.type}`, event.data ? JSON.stringify(event.data).substring(0, 100) : '');
      } catch (e) {
        console.log('📨 Raw message:', data.toString().substring(0, 100));
      }
    });
    
    await delay(3000);
    ws.close();
    
    // Step 7: Check Barn Items
    console.log('\n7️⃣ Checking barn items...');
    const barnResponse = await fetch(`${API_BASE}/barn/items`);
    const barnResult = await barnResponse.json();
    console.log(`Found ${barnResult.length || 0} items in barn`);
    
    // Summary
    console.log('\n✅ Go Wild Workflow Test Complete!');
    console.log('================================');
    console.log(`Farm ID: ${farmId}`);
    console.log(`Harvest ID: ${harvestId}`);
    console.log(`Status: ${farmResult.data?.status}`);
    console.log(`Agents: ${farmResult.data?.agents?.length || 0}`);
    console.log('================================\n');
    
    // Cleanup: Delete the test farm
    console.log('🧹 Cleaning up test farm...');
    const deleteResponse = await fetch(`${API_BASE}/farms/${farmId}`, {
      method: 'DELETE'
    });
    
    if (deleteResponse.ok) {
      console.log('✅ Test farm deleted successfully');
    } else {
      console.log('⚠️ Failed to delete test farm');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    
    // Cleanup on error
    if (farmId) {
      try {
        await fetch(`${API_BASE}/farms/${farmId}`, { method: 'DELETE' });
      } catch (e) {
        console.error('Failed to cleanup farm:', e.message);
      }
    }
    
    process.exit(1);
  }
  
  process.exit(0);
}

// Run the test
testGoWildWorkflow();