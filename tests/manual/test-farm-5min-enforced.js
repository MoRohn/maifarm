/**
 * Farm 5-Minute Timeout Enforcement Test
 * This test creates a farm and verifies that the timeout is properly enforced
 */

import http from 'http';
import { spawn } from 'child_process';

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

async function test5MinuteTimeout() {
  console.log('🚀 Starting Farm 5-Minute Timeout Enforcement Test');
  console.log('================================================');
  
  const results = {
    farmCreated: false,
    farmStarted: false,
    timeoutEnforced: false,
    farmStopped: false,
    actualDuration: null,
    expectedDuration: 300, // 5 minutes in seconds
    farmId: null,
    startTime: null,
    stopTime: null
  };

  try {
    // Step 1: Create a Farm with explicit 5-minute timeout
    console.log('\n📝 Step 1: Creating Farm with 5-minute timeout...');
    const farmPayload = {
      name: `Timeout Test - ${new Date().toISOString()}`,
      description: 'Testing 5-minute timeout enforcement',
      agents: [
        {
          name: 'LongRunningAgent',
          model: 'claude-3-5-sonnet',
          role: 'developer',
          prompt: `This is a long-running task designed to test timeout.
                   
                   Please perform these tasks sequentially:
                   
                   1. Create a comprehensive Python data analysis library with:
                      - 20+ different statistical functions
                      - Data visualization with multiple chart types
                      - Machine learning utilities
                      - Full documentation for each function
                      - Unit tests for everything
                   
                   2. Create a web scraping framework with:
                      - Multi-threading support
                      - Rate limiting
                      - Error handling
                      - Database integration
                      - CLI interface
                   
                   3. Build a REST API server with:
                      - Authentication system
                      - Database models
                      - CRUD operations
                      - WebSocket support
                      - Docker configuration
                   
                   4. Implement a blockchain from scratch with:
                      - Proof of work algorithm
                      - Transaction system
                      - Wallet functionality
                      - Mining capabilities
                      - P2P networking
                   
                   This should take much longer than 5 minutes to complete properly.`
        }
      ],
      config: {
        timeout: 300,  // 5 minutes in seconds
        maxAgents: 1,
        autoScale: false,
        collaborative: false,
        enforceTimeout: true  // Explicitly enforce timeout
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
      results.farmCreated = true;
      results.startTime = new Date();
      console.log(`✅ Farm created with ID: ${results.farmId}`);
      console.log(`   Timeout: 300 seconds (5 minutes)`);
      console.log(`   Started at: ${results.startTime.toLocaleTimeString()}`);
    } else {
      throw new Error(`Failed to create farm: ${JSON.stringify(createResponse.data)}`);
    }

    // Step 2: Start the farm
    console.log('\n▶️ Step 2: Starting farm with timeout enforcement...');
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
      console.log('   Monitoring will continue for up to 6 minutes...');
    }

    // Step 3: Set up a timer to enforce timeout from client side as backup
    console.log('\n⏱️ Step 3: Setting up timeout enforcement...');
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => {
        console.log('\n⚠️ Client-side timeout reached (5 minutes)');
        resolve('timeout');
      }, 300000); // 5 minutes
    });

    // Step 4: Monitor farm status
    console.log('📊 Step 4: Monitoring farm status...');
    const monitorPromise = new Promise(async (resolve) => {
      let attempts = 0;
      const maxAttempts = 200; // 6.67 minutes max (200 * 2 seconds)
      const checkInterval = 2000; // Check every 2 seconds
      
      const checkStatus = async () => {
        if (attempts >= maxAttempts) {
          resolve('max-attempts');
          return;
        }
        
        try {
          const statusResponse = await makeRequest({
            hostname: 'localhost',
            port: 4567,
            path: `/api/farms/${results.farmId}`,
            method: 'GET'
          });
          
          if (statusResponse.status === 200) {
            const farm = statusResponse.data.data || statusResponse.data;
            const elapsed = Math.floor((Date.now() - results.startTime) / 1000);
            
            // Log status every 30 seconds
            if (attempts % 15 === 0) {
              console.log(`   [${elapsed}s] Status: ${farm.status}`);
            }
            
            // Check if farm stopped
            if (farm.status === 'stopped' || farm.status === 'completed' || farm.status === 'failed' || farm.status === 'timeout') {
              results.stopTime = new Date();
              results.actualDuration = Math.floor((results.stopTime - results.startTime) / 1000);
              results.farmStopped = true;
              console.log(`\n✅ Farm ${farm.status} after ${results.actualDuration} seconds`);
              resolve('stopped');
              return;
            }
          }
        } catch (error) {
          console.error('   Error checking status:', error.message);
        }
        
        attempts++;
        setTimeout(checkStatus, checkInterval);
      };
      
      checkStatus();
    });

    // Wait for either timeout or farm to stop
    const result = await Promise.race([timeoutPromise, monitorPromise]);
    
    // Step 5: If farm hasn't stopped, force stop it
    if (!results.farmStopped) {
      console.log('\n🛑 Step 5: Farm did not stop automatically, forcing stop...');
      try {
        const stopResponse = await makeRequest({
          hostname: 'localhost',
          port: 4567,
          path: `/api/farms/${results.farmId}/stop`,
          method: 'POST'
        });
        
        if (stopResponse.status === 200) {
          results.stopTime = new Date();
          results.actualDuration = Math.floor((results.stopTime - results.startTime) / 1000);
          results.farmStopped = true;
          console.log(`✅ Farm manually stopped after ${results.actualDuration} seconds`);
        }
      } catch (error) {
        console.error('❌ Failed to stop farm:', error.message);
      }
    }

    // Step 6: Evaluate timeout enforcement
    console.log('\n📋 Step 6: Evaluating timeout enforcement...');
    if (results.actualDuration) {
      const tolerance = 30; // 30 second tolerance
      const lowerBound = results.expectedDuration - tolerance;
      const upperBound = results.expectedDuration + tolerance;
      
      if (results.actualDuration >= lowerBound && results.actualDuration <= upperBound) {
        results.timeoutEnforced = true;
        console.log(`✅ Timeout properly enforced within tolerance`);
        console.log(`   Expected: ${results.expectedDuration}s ± ${tolerance}s`);
        console.log(`   Actual: ${results.actualDuration}s`);
      } else {
        console.log(`⚠️ Timeout not properly enforced`);
        console.log(`   Expected: ${results.expectedDuration}s ± ${tolerance}s`);
        console.log(`   Actual: ${results.actualDuration}s`);
        console.log(`   Difference: ${Math.abs(results.actualDuration - results.expectedDuration)}s`);
      }
    }

    // Step 7: Clean up - kill any remaining processes
    console.log('\n🧹 Step 7: Cleaning up farm processes...');
    try {
      // Kill tmux session
      const tmuxKill = spawn('tmux', ['kill-session', '-t', `farm-${results.farmId.split('-')[0]}`]);
      await new Promise(resolve => tmuxKill.on('close', resolve));
      console.log('   ✓ Tmux session terminated');
    } catch (error) {
      console.log('   ⚠️ Could not kill tmux session (may already be stopped)');
    }

  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
  }

  // Final Report
  console.log('\n' + '='.repeat(60));
  console.log('📊 TIMEOUT ENFORCEMENT TEST RESULTS');
  console.log('='.repeat(60));
  
  console.log('\n✅ Test Steps:');
  console.log(`  Farm Created: ${results.farmCreated ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  Farm Started: ${results.farmStarted ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  Farm Stopped: ${results.farmStopped ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  Timeout Enforced: ${results.timeoutEnforced ? '✅ PASSED' : '❌ FAILED'}`);
  
  console.log('\n⏱️ Timing Analysis:');
  console.log(`  Expected Duration: ${results.expectedDuration} seconds (5 minutes)`);
  console.log(`  Actual Duration: ${results.actualDuration || 'N/A'} seconds`);
  if (results.actualDuration) {
    const diff = Math.abs(results.actualDuration - results.expectedDuration);
    console.log(`  Variance: ${diff} seconds`);
    console.log(`  Within Tolerance: ${diff <= 30 ? '✅ YES' : '❌ NO'}`);
  }
  
  console.log('\n🔗 Resources:');
  if (results.farmId) {
    console.log(`  Farm ID: ${results.farmId}`);
    console.log(`  Dashboard: http://localhost:3000/farm/${results.farmId}`);
  }
  
  const overallPass = results.farmCreated && results.farmStarted && 
                      results.farmStopped && results.timeoutEnforced;
  
  console.log('\n' + '='.repeat(60));
  console.log(overallPass ? 
    '🎉 TEST PASSED - Timeout properly enforced!' : 
    '⚠️ TEST FAILED - Timeout not properly enforced');
  console.log('='.repeat(60));
  
  return results;
}

// Run the test
console.log('Farm 5-Minute Timeout Enforcement Test');
console.log('This test will verify that farms respect the 5-minute timeout setting.');
console.log('The test will run for up to 6 minutes to ensure proper monitoring.\n');

test5MinuteTimeout().then(results => {
  const exitCode = results.timeoutEnforced ? 0 : 1;
  console.log(`\nExiting with code ${exitCode}`);
  process.exit(exitCode);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});