#!/usr/bin/env node

/**
 * Test API Key Sync from Settings to Environment
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_BASE = 'http://localhost:4567/api';

// Test API key (you should replace with a real one for actual testing)
const TEST_API_KEY = process.argv[2];

if (!TEST_API_KEY) {
  console.log('❌ Please provide an API key as argument:');
  console.log('   node test-api-key-sync.js your-anthropic-api-key');
  process.exit(1);
}

async function testApiKeySync() {
  console.log('🔧 Testing API Key Sync System\n');
  console.log('================================\n');
  
  try {
    // Step 1: Check current .env.development
    console.log('1️⃣ Checking current .env.development...');
    const envPath = path.join(process.cwd(), '.env.development');
    const envContent = fs.readFileSync(envPath, 'utf-8');
    
    if (envContent.includes('ANTHROPIC_API_KEY=')) {
      const match = envContent.match(/ANTHROPIC_API_KEY=([^\n]+)/);
      if (match && match[1] && match[1].length > 30) {
        console.log('   ✅ ANTHROPIC_API_KEY already exists in .env.development');
        console.log(`   Length: ${match[1].length} characters`);
      } else {
        console.log('   ⚠️ ANTHROPIC_API_KEY exists but appears invalid');
      }
    } else {
      console.log('   ❌ ANTHROPIC_API_KEY not found in .env.development');
    }
    
    // Step 2: Save API key via Settings API
    console.log('\n2️⃣ Saving API key via Settings API...');
    const saveResponse = await axios.post(`${API_BASE}/apikeys/claude`, {
      apiKey: TEST_API_KEY,
      name: 'Claude API Key (Test)'
    });
    
    if (saveResponse.data.success) {
      console.log('   ✅ API key saved successfully');
    } else {
      console.error('   ❌ Failed to save API key:', saveResponse.data.error);
      process.exit(1);
    }
    
    // Step 3: Wait for sync to complete
    console.log('\n3️⃣ Waiting for sync to complete (3 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Step 4: Check if .env.development was updated
    console.log('\n4️⃣ Checking if .env.development was updated...');
    const updatedEnvContent = fs.readFileSync(envPath, 'utf-8');
    
    if (updatedEnvContent.includes(`ANTHROPIC_API_KEY=${TEST_API_KEY}`)) {
      console.log('   ✅ .env.development successfully updated with API key!');
    } else if (updatedEnvContent.includes('ANTHROPIC_API_KEY=')) {
      console.log('   ⚠️ .env.development has ANTHROPIC_API_KEY but with different value');
    } else {
      console.log('   ❌ .env.development was not updated');
    }
    
    // Step 5: Check if runtime env file was created
    console.log('\n5️⃣ Checking runtime environment file...');
    const runtimeEnvPath = path.join(process.cwd(), '.env.runtime');
    
    if (fs.existsSync(runtimeEnvPath)) {
      const runtimeContent = fs.readFileSync(runtimeEnvPath, 'utf-8');
      if (runtimeContent.includes('ANTHROPIC_API_KEY=')) {
        console.log('   ✅ Runtime environment file created with API key');
      } else {
        console.log('   ⚠️ Runtime environment file exists but missing API key');
      }
    } else {
      console.log('   ⚠️ Runtime environment file not created');
    }
    
    // Step 6: Test farm launch with the synced key
    console.log('\n6️⃣ Testing farm launch with synced API key...');
    
    // Create a test farm
    const createResponse = await axios.post(`${API_BASE}/farms`, {
      name: 'API Key Sync Test Farm',
      description: 'Testing API key sync from Settings',
      config: {
        maxAgents: 1,
        timeout: 60 // 1 minute
      }
    });
    
    const farmId = createResponse.data.data.id;
    console.log(`   Farm created: ${farmId}`);
    
    // Launch the farm
    const launchResponse = await axios.post(`${API_BASE}/farms/${farmId}/launch`, {
      numberOfAgents: 1,
      prompt: 'Test: Reply with "API key working!" if you can see this.',
      provider: 'claude'
    });
    
    if (launchResponse.data.success) {
      console.log('   ✅ Farm launched successfully - API key is working!');
    } else {
      console.log('   ❌ Farm launch failed:', launchResponse.data.error);
    }
    
    // Step 7: Wait and check farm status
    console.log('\n7️⃣ Waiting for agent to start (10 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    const statusResponse = await axios.get(`${API_BASE}/farms/${farmId}`);
    const farm = statusResponse.data.data;
    
    console.log(`   Farm status: ${farm.status}`);
    
    if (farm.status === 'active' || farm.status === 'running') {
      console.log('   ✅ Farm is active - API key sync successful!');
    } else if (farm.status === 'failed') {
      console.log('   ❌ Farm failed - API key may not be working');
    } else {
      console.log(`   ⚠️ Farm status: ${farm.status}`);
    }
    
    // Clean up
    console.log('\n8️⃣ Cleaning up test farm...');
    await axios.post(`${API_BASE}/farms/${farmId}/stop`);
    console.log('   ✅ Test farm stopped');
    
    // Summary
    console.log('\n================================');
    console.log('📊 Test Summary');
    console.log('================================');
    
    const envHasKey = updatedEnvContent.includes(`ANTHROPIC_API_KEY=${TEST_API_KEY}`);
    const farmActive = farm.status === 'active' || farm.status === 'running';
    
    if (envHasKey && farmActive) {
      console.log('✅ SUCCESS: API key sync is working perfectly!');
      console.log('   - Key saved to database');
      console.log('   - Key synced to .env.development');
      console.log('   - Key available to subprocesses');
      console.log('   - Farms can launch with Claude agents');
    } else {
      console.log('⚠️ PARTIAL SUCCESS:');
      if (envHasKey) {
        console.log('   ✅ Key synced to .env.development');
      } else {
        console.log('   ❌ Key NOT synced to .env.development');
      }
      if (farmActive) {
        console.log('   ✅ Farm launched successfully');
      } else {
        console.log('   ❌ Farm failed to become active');
      }
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
testApiKeySync();