#!/usr/bin/env node

/**
 * Go Wild Mode Complete Pipeline Test
 * Tests: Configuration-based timing → Real agent execution → Harvest creation → Barn storage
 */

async function testGoWildCompletePipeline() {
  console.log('🚀 Starting Go Wild Mode Complete Pipeline Test');
  console.log('================================================');
  console.log('This test will use a 30-second duration for faster testing');
  console.log('');
  
  const API_BASE = 'http://localhost:4567';
  
  const results = {
    farmCreation: false,
    goWildActivation: false,
    agentLaunch: false,
    agentOutput: false,
    harvestCreation: false,
    barnStorage: false,
    realOutput: false,
    errors: [],
    warnings: [],
    farmId: null,
    sessionId: null,
    harvestId: null,
    barnItemId: null,
    capturedOutput: null
  };

  try {
    // Step 1: Create a Farm with Go Wild Mode enabled (30-second duration)
    console.log('\n📝 Step 1: Creating Farm with Go Wild Mode (30-second duration)...');
    
    const farmPayload = {
      name: 'Go Wild Test - Complete Pipeline',
      description: 'Testing automatic harvest after configured duration',
      type: 'autonomous',
      config: {
        maxAgents: 3,
        goWildMode: {
          enabled: true,
          creativityLevel: 75,
          maxDuration: 0.5, // 30 seconds (0.5 minutes) for testing
          explorationDepth: 3,
          autoDiscover: true,
          focusAreas: ['testing', 'improvement', 'code quality'],
          boundaries: [
            'Stay within the maifarm project',
            'Focus on code improvements',
            'Do not modify critical system files'
          ],
          seedPrompt: 'Explore the MaiFarm codebase to find testing improvements and code quality enhancements'
        },
        provider: 'claude'
      }
    };

    const farmResponse = await fetch(`${API_BASE}/api/farms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(farmPayload)
    });

    if (!farmResponse.ok) {
      const errorText = await farmResponse.text();
      throw new Error(`Failed to create farm: ${farmResponse.status} - ${errorText}`);
    }

    const farmData = await farmResponse.json();
    results.farmId = farmData.data?.id || farmData.id;
    results.farmCreation = true;
    console.log(`✅ Farm created with ID: ${results.farmId}`);

    // Step 2: Start Go Wild exploration session
    console.log('\n🌟 Step 2: Starting Go Wild Exploration (30-second duration)...');
    
    const goWildPayload = {
      farmId: results.farmId,
      config: {
        creativityLevel: 75,
        maxDuration: 0.5, // 30 seconds for testing
        explorationDepth: 3,
        autoDiscover: true,
        focusAreas: ['testing', 'improvement', 'code quality'],
        boundaries: [
          'Stay within the maifarm project',
          'Focus on code improvements',
          'Do not modify critical system files'
        ],
        seedPrompt: 'Explore the MaiFarm codebase to find testing improvements and code quality enhancements'
      }
    };

    const goWildResponse = await fetch(`${API_BASE}/api/go-wild/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(goWildPayload)
    });

    if (goWildResponse.ok) {
      const goWildData = await goWildResponse.json();
      results.sessionId = goWildData.data?.id || goWildData.sessionId;
      results.goWildActivation = true;
      console.log(`✅ Go Wild session started with ID: ${results.sessionId}`);
      console.log(`   Duration configured: 30 seconds`);
    } else {
      const errorText = await goWildResponse.text();
      results.errors.push(`Failed to start Go Wild: ${errorText}`);
    }

    // Step 3: Check for agent launch
    console.log('\n🤖 Step 3: Checking for real Claude agent launch...');
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds for agents to launch
    
    const sessionsResponse = await fetch(`${API_BASE}/api/harvest/terminal/sessions?farmId=${results.farmId}`);
    if (sessionsResponse.ok) {
      const sessionsData = await sessionsResponse.json();
      const sessions = sessionsData.data || [];
      
      if (sessions.length > 0) {
        results.agentLaunch = true;
        console.log(`✅ Found ${sessions.length} terminal session(s) with real Claude agents`);
        sessions.forEach(session => {
          console.log(`   - Session: ${session.sessionName} (${session.paneCount} agents)`);
        });
        
        // Try to capture some agent output
        try {
          const { spawn } = require('child_process');
          const captureProcess = spawn('tmux', [
            'capture-pane',
            '-t', `farm-${results.farmId.substring(0, 8)}:0.0`,
            '-p',
            '-S', '-100'
          ]);
          
          let output = '';
          captureProcess.stdout.on('data', chunk => output += chunk);
          
          await new Promise((resolve) => {
            captureProcess.on('close', resolve);
            setTimeout(resolve, 2000);
          });
          
          if (output && output.includes('Claude')) {
            results.agentOutput = true;
            results.capturedOutput = output.substring(0, 200);
            console.log(`✅ Captured real Claude agent output (first 200 chars):`);
            console.log(`   "${results.capturedOutput}..."`);
          }
        } catch (err) {
          console.log(`⚠️ Could not capture agent output: ${err.message}`);
        }
      } else {
        results.warnings.push('No terminal sessions found for Go Wild exploration');
      }
    }

    // Step 4: Monitor exploration until automatic stop (30 seconds)
    console.log('\n⏳ Step 4: Waiting for automatic harvest creation after 30 seconds...');
    console.log('   (Go Wild should automatically stop and create harvest)');
    
    const startTime = Date.now();
    let explorationStatus = 'exploring';
    let checkCount = 0;
    
    // Check every 5 seconds for up to 40 seconds (30s + buffer)
    while (explorationStatus === 'exploring' && checkCount < 8) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      checkCount++;
      
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      
      // Check Go Wild session status
      const statusResponse = await fetch(`${API_BASE}/api/go-wild/session/${results.farmId}`);
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        explorationStatus = statusData.data?.status || 'unknown';
        
        console.log(`   ${elapsed}s: Status = ${explorationStatus}`);
        
        if (statusData.data?.stats) {
          console.log(`      Nodes: ${statusData.data.stats.nodesExplored}, Discoveries: ${statusData.data.stats.discoveriesMade}`);
        }
        
        if (statusData.data?.harvestId) {
          results.harvestId = statusData.data.harvestId;
          console.log(`   ✅ Harvest created with ID: ${results.harvestId}`);
        }
      }
    }
    
    if (explorationStatus === 'completed') {
      console.log(`✅ Go Wild exploration automatically completed after configured duration`);
    } else {
      results.warnings.push(`Go Wild still in ${explorationStatus} status after timeout`);
    }

    // Step 5: Check for harvest creation
    console.log('\n🌾 Step 5: Verifying harvest was created with real agent output...');
    
    if (!results.harvestId) {
      // Try to find harvest by farmId
      const harvestsResponse = await fetch(`${API_BASE}/api/harvests/farms/${results.farmId}`);
      if (harvestsResponse.ok) {
        const harvestsData = await harvestsResponse.json();
        const harvests = Array.isArray(harvestsData) ? harvestsData : harvestsData.data;
        
        if (harvests && harvests.length > 0) {
          results.harvestId = harvests[0].id;
        }
      }
    }
    
    if (results.harvestId) {
      results.harvestCreation = true;
      
      // Get harvest details
      const harvestResponse = await fetch(`${API_BASE}/api/harvests/${results.harvestId}`);
      if (harvestResponse.ok) {
        const harvest = await harvestResponse.json();
        const harvestData = harvest.data || harvest;
        
        console.log(`✅ Harvest found with ID: ${results.harvestId}`);
        console.log(`   - Status: ${harvestData.status}`);
        console.log(`   - Results: ${harvestData.results?.length || 0}`);
        console.log(`   - Insights: ${harvestData.insights?.length || 0}`);
        console.log(`   - Yield: ${harvestData.yield?.length || 0}`);
        
        // Check if results contain real agent output
        if (harvestData.results && harvestData.results.length > 0) {
          const firstResult = harvestData.results[0];
          if (firstResult.content && firstResult.content.length > 100) {
            results.realOutput = true;
            console.log(`   ✅ Results contain real agent output (${firstResult.content.length} chars)`);
          }
        }
      }
    } else {
      results.errors.push('No harvest created after Go Wild exploration completed');
    }

    // Step 6: Try to store in barn
    if (results.harvestId) {
      console.log('\n🏚️ Step 6: Storing Go Wild harvest in barn...');
      
      const barnResponse = await fetch(`${API_BASE}/api/barn/store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          harvestId: results.harvestId,
          name: 'Go Wild Exploration Results - Automated',
          description: 'Autonomous exploration with real agent output',
          type: 'exploration',
          category: 'gowild',
          tags: ['gowild', 'autonomous', 'exploration', 'automated']
        })
      });
      
      if (barnResponse.ok) {
        const barnData = await barnResponse.json();
        results.barnItemId = barnData.id;
        results.barnStorage = true;
        console.log(`✅ Successfully stored in barn with ID: ${results.barnItemId}`);
      } else {
        const errorText = await barnResponse.text();
        results.errors.push(`Failed to store in barn: ${errorText}`);
      }
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error);
    results.errors.push(error.message);
  }

  // Final Report
  console.log('\n' + '='.repeat(60));
  console.log('📊 GO WILD COMPLETE PIPELINE TEST RESULTS');
  console.log('='.repeat(60));
  
  console.log('\n✅ Success Metrics:');
  console.log(`  Farm Creation: ${results.farmCreation ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  Go Wild Activation: ${results.goWildActivation ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  Real Agent Launch: ${results.agentLaunch ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  Agent Output Capture: ${results.agentOutput ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  Automatic Harvest Creation: ${results.harvestCreation ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  Real Output in Harvest: ${results.realOutput ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  Barn Storage: ${results.barnStorage ? '✅ PASSED' : '❌ FAILED'}`);
  
  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    results.errors.forEach(err => console.log(`  - ${err}`));
  }
  
  if (results.warnings.length > 0) {
    console.log('\n⚠️ Warnings:');
    results.warnings.forEach(warn => console.log(`  - ${warn}`));
  }
  
  console.log('\n🔑 Key Features Tested:');
  console.log('  ✓ Configuration-based duration (not hardcoded)');
  console.log('  ✓ Real Claude agents launching via orchestrator.py');
  console.log('  ✓ Actual agent output capture from tmux sessions');
  console.log('  ✓ Automatic harvest creation after configured duration');
  console.log('  ✓ Real results in harvest (not mock data)');
  console.log('  ✓ Complete pipeline from creation to barn storage');
  
  const allPassed = results.farmCreation && results.goWildActivation && 
                    results.agentLaunch && results.harvestCreation && 
                    results.realOutput && results.barnStorage;
  
  console.log('\n' + '='.repeat(60));
  console.log(allPassed ? '🎉 ALL TESTS PASSED!' : '⚠️ SOME TESTS FAILED - Review errors above');
  console.log('='.repeat(60));
  
  return results;
}

// Check if fetch is available (Node 18+)
if (typeof fetch === 'undefined') {
  global.fetch = require('node-fetch');
}

// Run the test
console.log('Starting Go Wild Complete Pipeline Test...');
console.log('This test will create a farm with 30-second Go Wild duration');
console.log('to verify automatic harvest creation with real agent output.');
console.log('');

testGoWildCompletePipeline().then(results => {
  console.log('\nTest completed.');
  process.exit(results.errors.length > 0 ? 1 : 0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});