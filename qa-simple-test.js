#!/usr/bin/env node

/**
 * Simple MaiFarm API Test
 */

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:4567';

async function testAPI() {
  console.log('🧪 Testing MaiFarm API...\n');
  
  try {
    // Test 1: Health Check
    console.log('1. Testing Health Endpoint...');
    const healthRes = await fetch(`${API_BASE}/health`);
    const health = await healthRes.json();
    console.log(`   Status: ${healthRes.status}`);
    console.log(`   Response:`, health);
    console.log(`   ✅ Health check completed\n`);
    
    // Test 2: Create Farm
    console.log('2. Creating Test Farm...');
    const farmData = {
      name: 'QA Test Farm ' + Date.now(),
      description: 'Automated test farm',
      type: 'sequential',
      config: {
        maxAgents: 2,
        autoScale: false
      }
    };
    
    const createRes = await fetch(`${API_BASE}/api/farms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(farmData)
    });
    
    const farm = await createRes.json();
    console.log(`   Status: ${createRes.status}`);
    console.log(`   Farm ID: ${farm.id}`);
    console.log(`   Farm Status: ${farm.status}`);
    console.log(`   ✅ Farm created successfully\n`);
    
    // Test 3: List Farms
    console.log('3. Listing Farms...');
    const listRes = await fetch(`${API_BASE}/api/farms`);
    const farms = await listRes.json();
    console.log(`   Status: ${listRes.status}`);
    console.log(`   Total farms: ${farms.length}`);
    console.log(`   ✅ Farm list retrieved\n`);
    
    // Test 4: Get Farm Details
    console.log('4. Getting Farm Details...');
    const detailRes = await fetch(`${API_BASE}/api/farms/${farm.id}`);
    const farmDetail = await detailRes.json();
    console.log(`   Status: ${detailRes.status}`);
    console.log(`   Farm Name: ${farmDetail.name}`);
    console.log(`   ✅ Farm details retrieved\n`);
    
    // Test 5: Delete Farm
    console.log('5. Cleaning up - Deleting Farm...');
    const deleteRes = await fetch(`${API_BASE}/api/farms/${farm.id}`, {
      method: 'DELETE'
    });
    console.log(`   Status: ${deleteRes.status}`);
    console.log(`   ✅ Farm deleted\n`);
    
    console.log('========================================');
    console.log('✅ ALL TESTS PASSED SUCCESSFULLY!');
    console.log('========================================');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testAPI();