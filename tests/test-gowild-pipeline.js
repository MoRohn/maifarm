#!/usr/bin/env node

/**
 * Go Wild Mode Pipeline Test
 * Tests: Creation → Autonomous Exploration → Harvest → Barn Storage
 */

async function testGoWildPipeline() {
  console.log('🚀 Starting Go Wild Mode Pipeline Test');
  console.log('================================================');
  
  const API_BASE = 'http://localhost:4567';
  
  const results = {
    farmCreation: false,
    goWildActivation: false,
    agentLaunch: false,
    harvestCreation: false,
    barnStorage: false,
    errors: [],
    warnings: [],
    farmId: null,
    sessionId: null,
    harvestId: null,
    barnItemId: null
  };

  try {
    // Step 1: Create a Farm with Go Wild Mode enabled
    console.log('\n📝 Step 1: Creating Farm with Go Wild Mode...');
    
    const farmPayload = {
      name: 'Go Wild Test Farm',
      description: 'Autonomous exploration farm for testing Go Wild mode',
      type: 'autonomous',
      config: {
        maxAgents: 3,
        goWildMode: {
          enabled: true,
          creativityLevel: 5,
          interval: 300000, // 5 minutes in milliseconds
          explorationDepth: 3,
          autoDiscover: true,
          boundaries: [
            'Stay within the maifarm project',
            'Focus on code improvements',
            'Do not modify critical system files'
          ]
        },
        provider: 'claude' // Use Claude as configured
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
    console.log('\n🌟 Step 2: Starting Go Wild Exploration...');
    
    const goWildPayload = {
      farmId: results.farmId,
      config: {
        creativityLevel: 75, // Higher creativity for better exploration
        maxDuration: 5, // 5 minutes
        explorationDepth: 3,
        autoDiscover: true,
        focusAreas: ['testing', 'improvement', 'code quality'],
        boundaries: [
          'Stay within the maifarm project',
          'Focus on code improvements',
          'Do not modify critical system files'
        ],
        seedPrompt: 'Explore the codebase to find areas for improvement and testing'
      }
    };

    const goWildResponse = await fetch(`${API_BASE}/api/go-wild/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(goWildPayload)
    });

    if (goWildResponse.ok) {
      const goWildData = await goWildResponse.json();
      results.sessionId = goWildData.data?.sessionId || goWildData.sessionId;
      results.goWildActivation = true;
      console.log(`✅ Go Wild session started with ID: ${results.sessionId}`);
    } else {
      console.log('⚠️ Go Wild endpoint not found, checking if farm auto-started exploration...');
    }

    // Step 3: Check for tmux sessions and agents
    console.log('\n🤖 Step 3: Checking for agent launch...');
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds for agents to launch
    
    const sessionsResponse = await fetch(`${API_BASE}/api/harvest/terminal/sessions?farmId=${results.farmId}`);
    if (sessionsResponse.ok) {
      const sessionsData = await sessionsResponse.json();
      const sessions = sessionsData.data || [];
      
      if (sessions.length > 0) {
        results.agentLaunch = true;
        console.log(`✅ Found ${sessions.length} terminal session(s)`);
        sessions.forEach(session => {
          console.log(`   - Session: ${session.sessionName} (${session.paneCount} agents)`);
        });
      } else {
        results.warnings.push('No terminal sessions found for Go Wild exploration');
      }
    }

    // Step 4: Monitor exploration for 30 seconds (abbreviated test)
    console.log('\n⏳ Step 4: Monitoring exploration for 30 seconds...');
    
    for (let i = 1; i <= 6; i++) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      
      // Check Go Wild session status
      const statusResponse = await fetch(`${API_BASE}/api/go-wild/session/${results.farmId}`);
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        const status = statusData.data?.status || 'unknown';
        console.log(`   Check ${i}/6: Status = ${status}`);
        
        if (statusData.data?.stats) {
          console.log(`      Tasks: ${statusData.data.stats.tasksGenerated}, Discoveries: ${statusData.data.stats.discoveriesMade}`);
        }
      }
    }

    // Step 5: Check for harvest creation
    console.log('\n🌾 Step 5: Checking for harvest...');
    
    const harvestsResponse = await fetch(`${API_BASE}/api/harvests/farms/${results.farmId}`);
    if (harvestsResponse.ok) {
      const harvestsData = await harvestsResponse.json();
      const harvests = Array.isArray(harvestsData) ? harvestsData : harvestsData.data;
      
      if (harvests && harvests.length > 0) {
        results.harvestId = harvests[0].id;
        results.harvestCreation = true;
        console.log(`✅ Harvest found with ID: ${results.harvestId}`);
        console.log(`   - Status: ${harvests[0].status}`);
        console.log(`   - Results: ${harvests[0].results?.length || 0}`);
        console.log(`   - Yield: ${harvests[0].yield?.length || 0}`);
        console.log(`   - Insights: ${harvests[0].insights?.length || 0}`);
      } else {
        results.warnings.push('No harvests found for Go Wild exploration');
      }
    }

    // Step 6: Try to store in barn
    if (results.harvestId) {
      console.log('\n🏚️ Step 6: Storing harvest in barn...');
      
      const barnResponse = await fetch(`${API_BASE}/api/barn/store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          harvestId: results.harvestId,
          name: 'Go Wild Exploration Results',
          description: 'Autonomous exploration discoveries',
          type: 'exploration',
          category: 'gowild',
          tags: ['gowild', 'autonomous', 'exploration']
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

    // Step 7: Check coordination state
    console.log('\n🔄 Step 7: Checking coordination state...');
    
    const coordResponse = await fetch(`${API_BASE}/api/harvest/coordination/agents`);
    if (coordResponse.ok) {
      const coordData = await coordResponse.json();
      const agents = coordData.data || [];
      const farmAgents = agents.filter(a => a.farm_id === results.farmId);
      console.log(`   Found ${farmAgents.length} coordinated agent(s) for this farm`);
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error);
    results.errors.push(error.message);
  }

  // Final Report
  console.log('\n' + '='.repeat(50));
  console.log('📊 GO WILD TEST RESULTS SUMMARY');
  console.log('='.repeat(50));
  
  console.log('\nSuccess Metrics:');
  console.log(`  ✅ Farm Creation: ${results.farmCreation ? 'PASSED' : 'FAILED'}`);
  console.log(`  ✅ Go Wild Activation: ${results.goWildActivation ? 'PASSED' : 'FAILED'}`);
  console.log(`  ✅ Agent Launch: ${results.agentLaunch ? 'PASSED' : 'FAILED'}`);
  console.log(`  ✅ Harvest Creation: ${results.harvestCreation ? 'PASSED' : 'FAILED'}`);
  console.log(`  ✅ Barn Storage: ${results.barnStorage ? 'PASSED' : 'FAILED'}`);
  
  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    results.errors.forEach(err => console.log(`  - ${err}`));
  }
  
  if (results.warnings.length > 0) {
    console.log('\n⚠️ Warnings:');
    results.warnings.forEach(warn => console.log(`  - ${warn}`));
  }
  
  console.log('\n🔗 Quick Links:');
  if (results.farmId) {
    console.log(`  - Harvest Page: http://localhost:5173/harvest/${results.farmId}`);
  }
  if (results.harvestId) {
    console.log(`  - Harvest API: ${API_BASE}/api/harvests/${results.harvestId}`);
  }
  
  const allPassed = results.farmCreation && results.agentLaunch && 
                    results.harvestCreation;
  
  console.log('\n' + '='.repeat(50));
  console.log(allPassed ? '🎉 CORE TESTS PASSED!' : '⚠️ SOME TESTS FAILED - Review errors above');
  console.log('='.repeat(50));
  
  console.log('\n💡 Note: Go Wild mode runs on a 5-minute interval.');
  console.log('   Full exploration cycle may take several minutes to complete.');
  
  return results;
}

// Check if fetch is available (Node 18+)
if (typeof fetch === 'undefined') {
  global.fetch = require('node-fetch');
}

// Run the test
console.log('Starting Go Wild Mode Test...');
console.log('This will create a farm with autonomous exploration enabled.');
console.log('');

testGoWildPipeline().then(results => {
  console.log('\nTest completed. Results stored in memory.');
  process.exit(results.errors.length > 0 ? 1 : 0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});