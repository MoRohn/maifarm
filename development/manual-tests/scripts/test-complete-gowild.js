#!/usr/bin/env node

import axios from 'axios';

const API_URL = 'http://localhost:4567/api';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testCompleteGoWild() {
  console.log('🧪 Testing Complete GoWild Flow...\n');
  console.log('===============================================\n');
  
  try {
    // Step 1: Create a GoWild session
    console.log('1️⃣  Creating GoWild session...');
    const sessionResponse = await axios.post(`${API_URL}/gowild/session`, {
      config: {
        mode: 'open_exploration',
        focusAreas: ['testing', 'automation'],
        creativityLevel: 3,
        boundaries: []
      }
    });
    
    const sessionId = sessionResponse.data.data?.sessionId;
    console.log(`   ✅ Session created: ${sessionId}\n`);
    
    // Step 2: Start GoWild exploration
    console.log('2️⃣  Starting GoWild exploration...');
    const startResponse = await axios.post(`${API_URL}/gowild/session/${sessionId}/start`, {
      numberOfAgents: 2,
      prompt: 'Test GoWild exploration'
    });
    
    console.log(`   ✅ GoWild started with farm: ${startResponse.data.data?.farmId}\n`);
    
    // Step 3: Check farm status
    await sleep(2000);
    console.log('3️⃣  Checking farm status...');
    const farmId = startResponse.data.data?.farmId;
    const farmResponse = await axios.get(`${API_URL}/farms/${farmId}`);
    console.log(`   Farm status: ${farmResponse.data.data?.status}\n`);
    
    // Step 4: Check tmux sessions
    const { exec } = require('child_process');
    exec('tmux ls 2>/dev/null', (error, stdout) => {
      if (stdout) {
        console.log('4️⃣  Active tmux sessions:');
        console.log(`   ${stdout.trim()}\n`);
      } else {
        console.log('4️⃣  No tmux sessions found\n');
      }
    });
    
    await sleep(1000);
    
    // Step 5: Stop the session
    console.log('5️⃣  Stopping GoWild session...');
    await axios.post(`${API_URL}/gowild/session/${sessionId}/stop`);
    console.log('   ✅ Session stopped\n');
    
    console.log('===============================================');
    console.log('✅ Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

testCompleteGoWild();
