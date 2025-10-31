#!/usr/bin/env node

/**
 * Test script to verify farm launch fixes
 * Tests API key validation, agent startup, and status management
 */

const axios = require('axios');

const API_BASE = 'http://localhost:4567/api';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testFarmLaunch() {
  console.log('🧪 Testing MaiFarm Launch Fixes\n');
  console.log('================================\n');
  
  try {
    // Step 1: Check API key is configured
    console.log('1️⃣ Checking API key configuration...');
    const apiKeyCheck = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    if (!apiKeyCheck) {
      console.error('❌ No ANTHROPIC_API_KEY found in environment');
      console.log('   Please add ANTHROPIC_API_KEY to .env.development');
      process.exit(1);
    }
    console.log(`✅ API key found (length: ${apiKeyCheck.length})`);
    
    // Step 2: Create a test farm
    console.log('\n2️⃣ Creating test farm...');
    const createResponse = await axios.post(`${API_BASE}/farms`, {
      name: 'Test Farm - Launch Fixes',
      description: 'Testing API key validation and agent startup',
      type: 'collaborative',
      config: {
        maxAgents: 2,
        autoScale: false,
        timeout: 300 // 5 minutes
      }
    });
    
    const farmId = createResponse.data.data.id;
    console.log(`✅ Farm created: ${farmId}`);
    
    // Step 3: Launch the farm
    console.log('\n3️⃣ Launching farm with 2 agents...');
    const launchResponse = await axios.post(`${API_BASE}/farms/${farmId}/launch`, {
      numberOfAgents: 2,
      prompt: 'Hello! Please confirm you are running. Reply with "Agent ready and working!"',
      provider: 'claude'
    });
    
    if (!launchResponse.data.success) {
      console.error('❌ Farm launch failed:', launchResponse.data.error);
      process.exit(1);
    }
    
    console.log(`✅ Farm launch initiated`);
    
    // Step 4: Wait and check farm status
    console.log('\n4️⃣ Waiting for agents to start (30 seconds)...');
    await sleep(30000);
    
    // Step 5: Check farm status
    console.log('\n5️⃣ Checking farm status...');
    const statusResponse = await axios.get(`${API_BASE}/farms/${farmId}`);
    const farm = statusResponse.data.data;
    
    console.log(`   Farm status: ${farm.status}`);
    console.log(`   Expected: 'active' or 'running'`);
    
    if (farm.status === 'active' || farm.status === 'running') {
      console.log('✅ Farm is active - agents started successfully!');
    } else if (farm.status === 'failed') {
      console.error('❌ Farm failed to start - check API keys and Claude CLI');
      
      // Get more details
      const harvestResponse = await axios.get(`${API_BASE}/farms/${farmId}/harvest-terminal`);
      if (harvestResponse.data.data?.sessions?.length > 0) {
        console.log('\n   Terminal output from agents:');
        const session = harvestResponse.data.data.sessions[0];
        console.log(`   Session: ${session.sessionName}`);
        console.log(`   Panes: ${session.panes}`);
      }
    } else if (farm.status === 'launching') {
      console.log('⏳ Farm still launching - may need more time or there could be an issue');
    } else {
      console.log(`⚠️ Unexpected status: ${farm.status}`);
    }
    
    // Step 6: Check terminal output
    console.log('\n6️⃣ Checking terminal output...');
    const terminalResponse = await axios.get(`${API_BASE}/farms/${farmId}/harvest-terminal`);
    
    if (terminalResponse.data.success && terminalResponse.data.data?.sessions?.length > 0) {
      const session = terminalResponse.data.data.sessions[0];
      console.log(`✅ Terminal session found: ${session.sessionName}`);
      console.log(`   Panes active: ${session.panes}`);
      
      // Try to get actual output
      if (session.outputs && Object.keys(session.outputs).length > 0) {
        console.log('\n   Sample output from agents:');
        for (const [paneId, output] of Object.entries(session.outputs)) {
          if (output && output.length > 0) {
            console.log(`   Pane ${paneId}: ${output.substring(0, 100)}...`);
          }
        }
      } else {
        console.log('   No output captured yet');
      }
    } else {
      console.log('⚠️ No terminal session found');
    }
    
    // Step 7: Clean up - stop the farm
    console.log('\n7️⃣ Stopping test farm...');
    await axios.post(`${API_BASE}/farms/${farmId}/stop`);
    console.log('✅ Farm stopped');
    
    // Summary
    console.log('\n================================');
    console.log('📊 Test Summary:');
    console.log('================================');
    
    if (farm.status === 'active' || farm.status === 'running') {
      console.log('✅ SUCCESS: Farm launched and agents started properly!');
      console.log('   - API key validation working');
      console.log('   - Agents launched with Claude CLI');
      console.log('   - Status management working correctly');
    } else {
      console.log('❌ ISSUES DETECTED:');
      console.log('   - Farm status:', farm.status);
      console.log('   - Check .env.development for ANTHROPIC_API_KEY');
      console.log('   - Verify Claude CLI is installed: npm install -g @anthropic-ai/cli');
      console.log('   - Check server logs for detailed error messages');
    }
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    if (error.response?.data) {
      console.error('   API Error:', error.response.data);
    }
    process.exit(1);
  }
}

// Run the test
testFarmLaunch();