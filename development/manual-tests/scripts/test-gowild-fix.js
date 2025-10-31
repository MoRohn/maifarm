#!/usr/bin/env node

// Test script to verify GoWild doesn't create duplicate farms

import axios from 'axios';

const API_URL = 'http://localhost:4567/api';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testGoWildDuplicates() {
  console.log('🧪 Testing GoWild duplicate farm issue...\n');
  console.log('===============================================\n');
  
  try {
    // Step 1: Get initial farm count
    console.log('1️⃣  Getting initial farm count...');
    const initialFarms = await axios.get(`${API_URL}/farms`);
    const initialCount = initialFarms.data.data?.length || 0;
    console.log(`   Initial farms in database: ${initialCount}\n`);
    
    // Step 2: Create a GoWild farm through the farms endpoint
    console.log('2️⃣  Creating a GoWild farm...');
    const createResponse = await axios.post(`${API_URL}/farms`, {
      name: 'Test GoWild Farm',
      description: 'Testing duplicate farm creation issue',
      type: 'autonomous',
      config: {
        autoScale: true,
        maxAgents: 3,
        timeout: 300,
        goWildMode: {
          enabled: true,
          creativityLevel: 3,
          boundaries: []
        }
      }
    });
    
    const farmId = createResponse.data.data?.id || createResponse.data.id;
    const farmName = createResponse.data.data?.name || createResponse.data.name || 'Test GoWild Farm';
    console.log(`   ✅ Created farm: ${farmName}`);
    console.log(`   Farm ID: ${farmId}\n`);
    
    // Step 3: Check farms after creation
    console.log('3️⃣  Checking farms after creation...');
    const afterCreate = await axios.get(`${API_URL}/farms`);
    const afterCreateCount = afterCreate.data.data?.length || 0;
    console.log(`   Farms after creation: ${afterCreateCount}`);
    console.log(`   New farms created: ${afterCreateCount - initialCount}\n`);
    
    // Step 4: Launch the farm with GoWild mode
    console.log('4️⃣  Launching farm with GoWild mode...');
    try {
      const launchResponse = await axios.post(`${API_URL}/farms/${farmId}/launch`, {
        numberOfAgents: 3,
        goWildMode: true,
        prompt: 'Explore creative solutions for testing',
        provider: 'claude'
      });
      console.log(`   ✅ Launch initiated successfully\n`);
    } catch (launchError) {
      console.log(`   ⚠️  Launch failed (might be expected): ${launchError.message}\n`);
    }
    
    // Step 5: Wait for any async operations
    console.log('⏳  Waiting 3 seconds for any background operations...\n');
    await sleep(3000);
    
    // Step 6: Check final farm count
    console.log('5️⃣  Checking final farm count...');
    const finalFarms = await axios.get(`${API_URL}/farms`);
    const finalCount = finalFarms.data.data?.length || 0;
    const finalFarmsList = finalFarms.data.data || [];
    
    console.log(`   Final farms in database: ${finalCount}`);
    console.log(`   Total new farms created: ${finalCount - initialCount}\n`);
    
    // Step 7: Check for duplicate "Go Wild: Open Exploration" farms
    console.log('6️⃣  Checking for duplicate GoWild farms...');
    const goWildFarms = finalFarmsList.filter(f => 
      f.name?.includes('Go Wild') || 
      f.name?.includes('GoWild') ||
      f.name?.includes('Open Exploration')
    );
    
    console.log(`   GoWild-related farms found: ${goWildFarms.length}`);
    if (goWildFarms.length > 0) {
      console.log('   List of GoWild farms:');
      goWildFarms.forEach(f => {
        console.log(`     - "${f.name}" (ID: ${f.id.substring(0, 8)}...)`);
      });
    }
    console.log();
    
    // Step 8: Determine test result
    console.log('===============================================\n');
    console.log('📊 TEST RESULTS:\n');
    
    const expectedNewFarms = 1; // We should only create 1 farm
    const actualNewFarms = finalCount - initialCount;
    
    if (actualNewFarms > expectedNewFarms) {
      console.log('❌ FAILED: Duplicate farms detected!');
      console.log(`   Expected: ${expectedNewFarms} new farm(s)`);
      console.log(`   Actual: ${actualNewFarms} new farm(s)`);
      console.log(`   Extra farms created: ${actualNewFarms - expectedNewFarms}`);
      
      // Check specifically for "Go Wild: Open Exploration" duplicate
      const openExplorationFarms = goWildFarms.filter(f => 
        f.name === 'Go Wild: Open Exploration'
      );
      if (openExplorationFarms.length > 0) {
        console.log(`\n   ⚠️  Found ${openExplorationFarms.length} "Go Wild: Open Exploration" farm(s)`);
        console.log('   This is the duplicate farm being created by goWildManager!');
      }
    } else if (actualNewFarms === expectedNewFarms) {
      console.log('✅ PASSED: No duplicate farms detected!');
      console.log(`   Created exactly ${expectedNewFarms} farm as expected`);
    } else {
      console.log('⚠️  WARNING: Fewer farms than expected');
      console.log(`   Expected: ${expectedNewFarms} new farm(s)`);
      console.log(`   Actual: ${actualNewFarms} new farm(s)`);
    }
    
    // Cleanup
    console.log('\n===============================================\n');
    console.log('🧹 Cleaning up...');
    try {
      await axios.post(`${API_URL}/farms/${farmId}/stop`, { graceful: false });
      console.log('   ✅ Test farm stopped\n');
    } catch (err) {
      console.log('   ⚠️  Could not stop farm (might already be stopped)\n');
    }
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the test
testGoWildDuplicates();