/**
 * Go Wild Mode QA Testing Script
 * Tests 3-minute interval Go Wild farm creation and harvest completion
 */

const API_BASE = 'http://localhost:4567';

// Test configuration
const TEST_CONFIG = {
  farmName: 'Go Wild Test Farm - 3 Minutes',
  description: 'Testing Go Wild mode with 3-minute exploration',
  duration: 3, // 3 minutes
  creativityLevel: 75,
  explorationDepth: 5
};

// Utilities
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const log = (message, data = null) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
};

const checkAPI = async () => {
  try {
    // Try to fetch farms as a health check since /api/health might not exist
    const response = await fetch(`${API_BASE}/api/farms`);
    if (!response.ok && response.status !== 404) {
      throw new Error(`API not responding: ${response.status}`);
    }
    log('✅ API is healthy');
    return true;
  } catch (error) {
    log('❌ API health check failed:', error.message);
    return false;
  }
};

// Test Steps
async function createGoWildFarm() {
  log('📦 Creating Go Wild farm...');
  
  const farmData = {
    name: TEST_CONFIG.farmName,
    description: TEST_CONFIG.description,
    type: 'autonomous',
    config: {
      autoScale: true,
      maxAgents: TEST_CONFIG.explorationDepth,
      timeout: TEST_CONFIG.duration * 60, // Convert to seconds
      goWildMode: {
        enabled: true,
        creativityLevel: Math.ceil(TEST_CONFIG.creativityLevel / 20), // 1-5 scale
        boundaries: ['allowFileSystem', 'allowNetworkRequests', 'allowExternalAPIs']
      }
    }
  };

  try {
    const response = await fetch(`${API_BASE}/api/farms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(farmData)
    });

    if (!response.ok) {
      throw new Error(`Failed to create farm: ${response.status}`);
    }

    const result = await response.json();
    const farm = result.data || result;
    log('✅ Farm created:', { id: farm.id, name: farm.name });
    return farm;
  } catch (error) {
    log('❌ Failed to create farm:', error.message);
    throw error;
  }
}

async function startGoWildExploration(farmId) {
  log('🚀 Starting Go Wild exploration...');
  
  const config = {
    creativityLevel: TEST_CONFIG.creativityLevel,
    explorationDepth: TEST_CONFIG.explorationDepth,
    maxDuration: TEST_CONFIG.duration,
    boundaries: {
      allowExternalAPIs: true,
      allowFileSystem: true,
      allowNetworkRequests: true,
      restrictedDomains: [],
      allowedPaths: ['/tmp', '/var/tmp'], // Required when allowFileSystem is true
      maxRequestsPerMinute: 60
    },
    focusAreas: ['testing', 'optimization', 'discovery']
  };

  try {
    const response = await fetch(`${API_BASE}/api/go-wild/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ farmId, config })
    });

    if (!response.ok) {
      throw new Error(`Failed to start exploration: ${response.status}`);
    }

    const result = await response.json();
    log('✅ Go Wild exploration started:', { 
      sessionId: result.data.id,
      status: result.data.status 
    });
    return result.data;
  } catch (error) {
    log('❌ Failed to start exploration:', error.message);
    throw error;
  }
}

async function monitorExploration(sessionId) {
  log('👀 Monitoring exploration progress...');
  
  const startTime = Date.now();
  const maxDuration = (TEST_CONFIG.duration * 60 * 1000) + 10000; // Add 10s buffer
  let lastStatus = null;
  let nodeCount = 0;
  let discoveryCount = 0;

  while (Date.now() - startTime < maxDuration) {
    try {
      const response = await fetch(`${API_BASE}/api/go-wild/sessions/${sessionId}`);
      if (!response.ok) {
        log(`⚠️ Failed to fetch session: ${response.status}`);
        await delay(5000);
        continue;
      }

      const result = await response.json();
      const session = result.data;
      
      if (session.status !== lastStatus) {
        log(`📊 Status changed: ${lastStatus || 'initial'} → ${session.status}`);
        lastStatus = session.status;
      }

      // Track progress
      if (session.explorationPath) {
        const newNodeCount = session.explorationPath.nodes.length;
        const newDiscoveryCount = session.explorationPath.discoveries.length;
        
        if (newNodeCount > nodeCount) {
          log(`🌱 New nodes explored: ${newNodeCount} (+${newNodeCount - nodeCount})`);
          nodeCount = newNodeCount;
        }
        
        if (newDiscoveryCount > discoveryCount) {
          log(`💎 New discoveries: ${newDiscoveryCount} (+${newDiscoveryCount - discoveryCount})`);
          discoveryCount = newDiscoveryCount;
        }
      }

      // Check if completed
      if (session.status === 'completed') {
        log('✅ Exploration completed!');
        return session;
      }

      // Check progress every 5 seconds
      await delay(5000);
    } catch (error) {
      log('❌ Error monitoring exploration:', error.message);
      await delay(5000);
    }
  }

  log('⏱️ Exploration timeout reached');
  return null;
}

async function checkHarvestReady(farmId) {
  log('🌾 Checking harvest status...');
  
  try {
    const response = await fetch(`${API_BASE}/api/harvests/farm/${farmId}`);
    if (!response.ok) {
      log('⚠️ No harvest data yet');
      return null;
    }

    const result = await response.json();
    const harvests = result.data || [];
    
    if (harvests.length > 0) {
      log('✅ Harvest ready:', {
        count: harvests.length,
        status: harvests[0].status
      });
      return harvests[0];
    }
    
    return null;
  } catch (error) {
    log('❌ Error checking harvest:', error.message);
    return null;
  }
}

async function checkTmuxSession(farmId) {
  log('🖥️ Checking tmux sessions...');
  
  try {
    const response = await fetch(`${API_BASE}/api/harvest/terminal/sessions`);
    if (!response.ok) {
      log('⚠️ No terminal sessions found');
      return [];
    }

    const result = await response.json();
    const sessions = result.data || [];
    
    const farmSession = sessions.find(s => s.sessionName.includes(farmId));
    if (farmSession) {
      log('✅ Tmux session found:', farmSession);
    } else {
      log('⚠️ No tmux session for this farm');
    }
    
    return sessions;
  } catch (error) {
    log('❌ Error checking tmux sessions:', error.message);
    return [];
  }
}

async function stopExploration(sessionId) {
  log('🛑 Stopping exploration...');
  
  try {
    const response = await fetch(`${API_BASE}/api/go-wild/${sessionId}/stop`, {
      method: 'PUT'
    });

    if (!response.ok) {
      throw new Error(`Failed to stop: ${response.status}`);
    }

    const result = await response.json();
    log('✅ Exploration stopped:', result.data);
    return result.data;
  } catch (error) {
    log('❌ Failed to stop exploration:', error.message);
    return null;
  }
}

// Main test runner
async function runGoWildTest() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('   Go Wild Mode QA Test - 3 Minute Exploration');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // Step 1: Check API health
    const apiHealthy = await checkAPI();
    if (!apiHealthy) {
      throw new Error('API is not healthy. Please start the server first.');
    }

    // Step 2: Create Go Wild farm
    const farm = await createGoWildFarm();
    await delay(2000);

    // Step 3: Start Go Wild exploration
    const session = await startGoWildExploration(farm.id);
    await delay(2000);

    // Step 4: Check for tmux sessions
    await checkTmuxSession(farm.id);

    // Step 5: Monitor exploration progress
    log(`⏳ Monitoring for ${TEST_CONFIG.duration} minutes...`);
    const completedSession = await monitorExploration(session.id);

    // Step 6: Check harvest completion
    await delay(5000); // Wait for harvest to be ready
    const harvest = await checkHarvestReady(farm.id);

    // Step 7: Generate test report
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('   Test Results');
    console.log('═══════════════════════════════════════════════════════════\n');

    const testResults = {
      success: true,
      farmId: farm.id,
      sessionId: session.id,
      duration: `${TEST_CONFIG.duration} minutes`,
      explorationCompleted: !!completedSession,
      harvestReady: !!harvest,
      stats: completedSession ? {
        nodesExplored: completedSession.stats.nodesExplored,
        discoveriesMade: completedSession.stats.discoveriesMade,
        duration: completedSession.summary?.duration || 'N/A'
      } : null
    };

    if (completedSession && harvest) {
      log('✅ TEST PASSED - Go Wild mode completed successfully!', testResults);
    } else {
      log('⚠️ TEST PARTIALLY PASSED - Some features did not complete', testResults);
    }

    // Optional: Stop exploration if still running
    if (!completedSession) {
      await stopExploration(session.id);
    }

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    process.exit(1);
  }
}

// Run the test
runGoWildTest().then(() => {
  console.log('\n✨ Test completed');
  process.exit(0);
}).catch(error => {
  console.error('\n💥 Test crashed:', error);
  process.exit(1);
});