/**
 * Farm Creation to Barn Storage Test - 5 Minute Time Limit
 * Tests: Farm Creation → Agent Execution (5 min) → Harvest → Barn Storage
 */

import http from 'http';

// API utilities
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function testFarm5MinutePipeline() {
  console.log('🚀 Starting Farm 5-Minute Pipeline Test');
  console.log('================================================');
  
  const results = {
    farmCreation: false,
    farmStarted: false,
    farmStopped: false,
    harvestCreated: false,
    harvestCompleted: false,
    barnStorage: false,
    errors: [],
    warnings: [],
    farmId: null,
    harvestId: null,
    barnItemId: null,
    startTime: null,
    stopTime: null,
    duration: null
  };

  try {
    // Step 1: Create a Farm with 5-minute timeout
    console.log('\n📝 Step 1: Creating Farm with 5-minute timeout...');
    const farmPayload = {
      name: `Test Farm 5min - ${new Date().toISOString()}`,
      description: 'Test farm with 5-minute execution limit',
      agents: [
        {
          name: 'Agent-1',
          model: 'claude-3-5-sonnet',
          role: 'developer',
          prompt: `Write a comprehensive Python module for data analysis.
                   Include the following:
                   1. Data loading functions for CSV, JSON, and Excel
                   2. Statistical analysis functions (mean, median, mode, std dev)
                   3. Data visualization functions using matplotlib
                   4. Data cleaning utilities
                   5. Comprehensive documentation and examples
                   6. Unit tests for all functions
                   
                   Take your time to make it thorough and well-documented.`
        }
      ],
      config: {
        timeout: 300,  // 5 minutes in seconds
        maxAgents: 1,
        autoScale: false,
        collaborative: false
      }
    };

    const createResponse = await makeRequest({
      hostname: 'localhost',
      port: 4567,
      path: '/api/farms',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, farmPayload);

    if (createResponse.status === 201 || createResponse.status === 200) {
      results.farmId = createResponse.data.data?.id || createResponse.data.id;
      results.farmCreation = true;
      results.startTime = new Date();
      console.log(`✅ Farm created with ID: ${results.farmId}`);
      console.log(`   Timeout: 5 minutes`);
      console.log(`   Started at: ${results.startTime.toLocaleTimeString()}`);
    } else {
      throw new Error(`Failed to create farm: ${JSON.stringify(createResponse.data)}`);
    }

    // Step 2: Start the farm
    console.log('\n▶️ Step 2: Starting farm agents...');
    const startResponse = await makeRequest({
      hostname: 'localhost',
      port: 4567,
      path: `/api/farms/${results.farmId}/start`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (startResponse.status === 200) {
      results.farmStarted = true;
      console.log('✅ Farm started successfully');
    } else {
      results.warnings.push('Farm start returned unexpected status');
    }

    // Step 3: Monitor farm status and timing
    console.log('\n⏱️ Step 3: Monitoring farm execution (max 6 minutes)...');
    let farmActive = true;
    let attempts = 0;
    const maxAttempts = 180; // 6 minutes (180 * 2 seconds)
    const checkInterval = 2000; // Check every 2 seconds
    
    console.log('   Checking farm status every 2 seconds...');
    const monitorStart = Date.now();
    
    while (farmActive && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      
      const statusResponse = await makeRequest({
        hostname: 'localhost',
        port: 4567,
        path: `/api/farms/${results.farmId}`,
        method: 'GET'
      });
      
      if (statusResponse.status === 200) {
        const farm = statusResponse.data.data || statusResponse.data;
        const elapsed = Math.floor((Date.now() - monitorStart) / 1000);
        
        // Log status every 10 seconds
        if (attempts % 5 === 0) {
          console.log(`   [${elapsed}s] Status: ${farm.status}, Agents: ${farm.agents?.length || 0}`);
        }
        
        // Check if farm stopped
        if (farm.status === 'stopped' || farm.status === 'completed' || farm.status === 'failed') {
          farmActive = false;
          results.farmStopped = true;
          results.stopTime = new Date();
          results.duration = (results.stopTime - results.startTime) / 1000;
          console.log(`\n✅ Farm ${farm.status} after ${results.duration} seconds`);
          
          // Verify it stopped around 5 minutes
          if (results.duration >= 290 && results.duration <= 320) {
            console.log('   ✓ Farm stopped within expected 5-minute window');
          } else if (results.duration < 290) {
            results.warnings.push(`Farm stopped early at ${results.duration} seconds`);
          } else {
            results.warnings.push(`Farm ran longer than expected: ${results.duration} seconds`);
          }
        }
      }
      
      attempts++;
    }
    
    if (farmActive) {
      results.errors.push('Farm did not stop within monitoring period');
      // Try to manually stop it
      console.log('\n⚠️ Farm still running, attempting manual stop...');
      await makeRequest({
        hostname: 'localhost',
        port: 4567,
        path: `/api/farms/${results.farmId}/stop`,
        method: 'POST'
      });
    }

    // Step 4: Check for harvest creation
    console.log('\n🌾 Step 4: Checking for harvest...');
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for harvest processing
    
    const harvestsResponse = await makeRequest({
      hostname: 'localhost',
      port: 4567,
      path: `/api/harvests/farms/${results.farmId}`,
      method: 'GET'
    });
    
    if (harvestsResponse.status === 200) {
      const harvests = Array.isArray(harvestsResponse.data) ? 
        harvestsResponse.data : 
        (harvestsResponse.data.data || []);
      
      if (harvests.length > 0) {
        const harvest = harvests[0];
        results.harvestId = harvest.id;
        results.harvestCreated = true;
        console.log(`✅ Harvest found with ID: ${results.harvestId}`);
        console.log(`   Status: ${harvest.status}`);
        console.log(`   Results: ${harvest.results?.length || 0}`);
        console.log(`   Yield files: ${harvest.yield?.length || 0}`);
        
        // Check if harvest is ready
        if (harvest.status === 'ready' || harvest.status === 'completed') {
          results.harvestCompleted = true;
          console.log('   ✓ Harvest is ready for collection');
        } else {
          // Try to complete the harvest
          console.log('   Attempting to complete harvest...');
          const completeResponse = await makeRequest({
            hostname: 'localhost',
            port: 4567,
            path: `/api/harvest/${results.harvestId}/complete`,
            method: 'POST'
          });
          
          if (completeResponse.status === 200) {
            results.harvestCompleted = true;
            console.log('   ✅ Harvest completed successfully');
          }
        }
      } else {
        results.warnings.push('No harvests found for the farm');
      }
    }

    // Step 5: Store in barn
    console.log('\n🏚️ Step 5: Storing harvest in barn...');
    if (results.harvestId) {
      const storeResponse = await makeRequest({
        hostname: 'localhost',
        port: 4567,
        path: `/api/barn/store/${results.harvestId}`,
        method: 'POST'
      });
      
      if (storeResponse.status === 200 || storeResponse.status === 201) {
        results.barnStorage = true;
        results.barnItemId = storeResponse.data.data?.id || storeResponse.data.id;
        console.log(`✅ Harvest stored in barn with ID: ${results.barnItemId}`);
      } else {
        // Try alternate barn storage endpoint
        const altStoreResponse = await makeRequest({
          hostname: 'localhost',
          port: 4567,
          path: '/api/barn/store',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }, {
          harvestId: results.harvestId,
          name: 'Farm 5min Test Results',
          type: 'farm-test'
        });
        
        if (altStoreResponse.status === 200 || altStoreResponse.status === 201) {
          results.barnStorage = true;
          results.barnItemId = altStoreResponse.data.data?.id;
          console.log(`✅ Harvest stored in barn (alt method)`);
        } else {
          results.errors.push('Failed to store harvest in barn');
        }
      }
    }

    // Step 6: Verify barn items
    console.log('\n📦 Step 6: Verifying barn storage...');
    const barnResponse = await makeRequest({
      hostname: 'localhost',
      port: 4567,
      path: '/api/barn/items',
      method: 'GET'
    });
    
    if (barnResponse.status === 200) {
      const items = Array.isArray(barnResponse.data) ? 
        barnResponse.data : 
        (barnResponse.data.data || []);
      
      const ourItem = items.find(item => 
        item.harvestId === results.harvestId || 
        item.id === results.barnItemId
      );
      
      if (ourItem) {
        console.log('✅ Verified barn item:');
        console.log(`   Name: ${ourItem.name}`);
        console.log(`   Type: ${ourItem.type}`);
        console.log(`   Created: ${new Date(ourItem.createdAt).toLocaleString()}`);
      } else {
        results.warnings.push('Could not find barn item in listing');
      }
    }

  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    results.errors.push(error.message || error.toString());
  }

  // Final Report
  console.log('\n' + '='.repeat(50));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('='.repeat(50));
  
  console.log('\nSuccess Metrics:');
  console.log(`  ✅ Farm Creation: ${results.farmCreation ? 'PASSED' : 'FAILED'}`);
  console.log(`  ✅ Farm Started: ${results.farmStarted ? 'PASSED' : 'FAILED'}`);
  console.log(`  ✅ Farm Stopped (5min): ${results.farmStopped ? 'PASSED' : 'FAILED'}`);
  console.log(`  ✅ Harvest Created: ${results.harvestCreated ? 'PASSED' : 'FAILED'}`);
  console.log(`  ✅ Harvest Completed: ${results.harvestCompleted ? 'PASSED' : 'FAILED'}`);
  console.log(`  ✅ Barn Storage: ${results.barnStorage ? 'PASSED' : 'FAILED'}`);
  
  if (results.duration) {
    console.log(`\n⏱️ Timing Results:`);
    console.log(`  Duration: ${results.duration} seconds`);
    console.log(`  Expected: 300 seconds (5 minutes)`);
    console.log(`  Variance: ${Math.abs(300 - results.duration)} seconds`);
  }
  
  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    results.errors.forEach(err => console.log(`  - ${err}`));
  }
  
  if (results.warnings.length > 0) {
    console.log('\n⚠️ Warnings:');
    results.warnings.forEach(warn => console.log(`  - ${warn}`));
  }
  
  console.log('\n🔗 Resources Created:');
  if (results.farmId) {
    console.log(`  - Farm ID: ${results.farmId}`);
    console.log(`    View at: http://localhost:3000/farm/${results.farmId}`);
  }
  if (results.harvestId) {
    console.log(`  - Harvest ID: ${results.harvestId}`);
    console.log(`    View at: http://localhost:3000/harvest/${results.farmId}`);
  }
  if (results.barnItemId) {
    console.log(`  - Barn Item ID: ${results.barnItemId}`);
    console.log(`    View at: http://localhost:3000/barn`);
  }
  
  const allPassed = results.farmCreation && results.farmStarted && 
                    results.farmStopped && results.harvestCreated && 
                    results.harvestCompleted && results.barnStorage;
  
  console.log('\n' + '='.repeat(50));
  console.log(allPassed ? '🎉 ALL TESTS PASSED!' : '⚠️ SOME TESTS FAILED - Review errors above');
  console.log('='.repeat(50));
  
  return results;
}

// Run the test
console.log('Starting Farm 5-Minute Pipeline Test...');
console.log('This will create a real farm and monitor it for up to 6 minutes.');
console.log('The farm should automatically stop after 5 minutes.');
console.log('');

testFarm5MinutePipeline().then(results => {
  console.log('\nTest completed.');
  process.exit(results.errors.length > 0 ? 1 : 0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});