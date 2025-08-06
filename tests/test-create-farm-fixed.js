#!/usr/bin/env node

/**
 * Test script for Create Farm functionality with persistence fixes
 * Tests farm creation, persistence, retrieval, and WebSocket updates
 */

const axios = require('axios');
const { io } = require('socket.io-client');

const API_BASE = 'http://localhost:4567/api';
const WS_URL = 'http://localhost:4567';

// Test configuration
const TEST_CONFIG = {
  farmName: `test-farm-${Date.now()}`,
  description: 'Test farm for persistence validation',
  duration: 30000, // 30 seconds
  numberOfAgents: 2
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

let socket = null;
let farmId = null;
let testResults = {
  passed: [],
  failed: [],
  warnings: []
};

// Helper function to log with colors
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Helper function to make API requests
async function apiRequest(method, endpoint, data = null) {
  try {
    const config = {
      method,
      url: `${API_BASE}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer dev-token'
      }
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
}

// Test 1: Create Farm
async function testCreateFarm() {
  log('\n📝 Test 1: Create Farm', 'blue');
  
  try {
    const response = await apiRequest('POST', '/farms', {
      name: TEST_CONFIG.farmName,
      description: TEST_CONFIG.description,
      config: {
        maxAgents: TEST_CONFIG.numberOfAgents,
        timeout: TEST_CONFIG.duration / 1000,
        yaml: `
agents:
  - name: Agent 1
    role: Primary processor
    tasks:
      - Process data
      - Generate reports
  - name: Agent 2
    role: Quality checker
    tasks:
      - Validate output
      - Run tests
`
      },
      type: 'collaborative'
    });
    
    if (response.success && response.data?.id) {
      farmId = response.data.id;
      log(`✅ Farm created successfully: ${farmId}`, 'green');
      testResults.passed.push('Farm Creation');
      
      // Verify farm properties
      if (response.data.status === 'active') {
        log(`✅ Farm status is 'active' as expected`, 'green');
        testResults.passed.push('Farm Initial Status');
      } else {
        log(`⚠️ Farm status is '${response.data.status}' instead of 'active'`, 'yellow');
        testResults.warnings.push(`Unexpected initial status: ${response.data.status}`);
      }
      
      return true;
    } else {
      throw new Error('Farm creation response missing ID');
    }
  } catch (error) {
    log(`❌ Failed to create farm: ${error.message || JSON.stringify(error)}`, 'red');
    testResults.failed.push('Farm Creation');
    return false;
  }
}

// Test 2: Retrieve Farm (Test Persistence)
async function testRetrieveFarm() {
  log('\n🔍 Test 2: Retrieve Farm (Persistence Check)', 'blue');
  
  if (!farmId) {
    log('⏭️ Skipping - no farm ID', 'yellow');
    return false;
  }
  
  try {
    // Wait a moment for database write
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const response = await apiRequest('GET', `/farms/${farmId}`);
    
    if (response.success && response.data?.farm) {
      log(`✅ Farm retrieved successfully`, 'green');
      testResults.passed.push('Farm Retrieval');
      
      // Verify farm data
      const farm = response.data.farm;
      if (farm.name === TEST_CONFIG.farmName) {
        log(`✅ Farm name matches: ${farm.name}`, 'green');
        testResults.passed.push('Farm Data Integrity');
      } else {
        log(`❌ Farm name mismatch: expected ${TEST_CONFIG.farmName}, got ${farm.name}`, 'red');
        testResults.failed.push('Farm Data Integrity');
      }
      
      if (farm.status) {
        log(`ℹ️ Farm status: ${farm.status}`, 'blue');
      }
      
      return true;
    } else {
      throw new Error('Farm not found in response');
    }
  } catch (error) {
    if (error.response?.status === 404) {
      log(`❌ Farm not found (404) - persistence issue!`, 'red');
      testResults.failed.push('Farm Persistence');
    } else {
      log(`❌ Failed to retrieve farm: ${error.message || JSON.stringify(error)}`, 'red');
      testResults.failed.push('Farm Retrieval');
    }
    return false;
  }
}

// Test 3: List All Farms
async function testListFarms() {
  log('\n📋 Test 3: List All Farms', 'blue');
  
  try {
    const response = await apiRequest('GET', '/farms');
    
    if (response.success && Array.isArray(response.data)) {
      log(`✅ Retrieved ${response.data.length} farms`, 'green');
      testResults.passed.push('Farm Listing');
      
      // Check if our farm is in the list
      if (farmId) {
        const ourFarm = response.data.find(f => f.id === farmId);
        if (ourFarm) {
          log(`✅ Our farm found in list with status: ${ourFarm.status}`, 'green');
          testResults.passed.push('Farm in List');
        } else {
          log(`❌ Our farm not found in list - persistence issue!`, 'red');
          testResults.failed.push('Farm in List');
        }
      }
      
      return true;
    } else {
      throw new Error('Invalid response format');
    }
  } catch (error) {
    log(`❌ Failed to list farms: ${error.message || JSON.stringify(error)}`, 'red');
    testResults.failed.push('Farm Listing');
    return false;
  }
}

// Test 4: WebSocket Connection and Events
async function testWebSocketConnection() {
  log('\n🔌 Test 4: WebSocket Connection', 'blue');
  
  return new Promise((resolve) => {
    socket = io(WS_URL, {
      auth: {
        userId: 'test-user'
      },
      transports: ['websocket', 'polling']
    });
    
    const timeout = setTimeout(() => {
      log(`⚠️ WebSocket connection timeout`, 'yellow');
      testResults.warnings.push('WebSocket Connection Timeout');
      resolve(false);
    }, 5000);
    
    socket.on('connect', () => {
      clearTimeout(timeout);
      log(`✅ WebSocket connected: ${socket.id}`, 'green');
      testResults.passed.push('WebSocket Connection');
      
      // Subscribe to farm events if we have a farm
      if (farmId) {
        socket.emit('farm:subscribe', farmId);
        log(`📡 Subscribed to farm ${farmId}`, 'blue');
      }
      
      resolve(true);
    });
    
    socket.on('connect_error', (error) => {
      clearTimeout(timeout);
      log(`❌ WebSocket connection error: ${error.message}`, 'red');
      testResults.failed.push('WebSocket Connection');
      resolve(false);
    });
    
    // Listen for farm events
    socket.on('farm:state', (data) => {
      log(`📊 Received farm state: ${JSON.stringify(data)}`, 'blue');
    });
    
    socket.on('farm:updated', (data) => {
      log(`🔄 Farm updated: ${JSON.stringify(data)}`, 'blue');
    });
    
    socket.on('farm:created', (data) => {
      log(`🆕 Farm created event: ${data.farm?.name}`, 'blue');
    });
  });
}

// Test 5: Update Farm Status
async function testUpdateFarmStatus() {
  log('\n🔄 Test 5: Update Farm Status', 'blue');
  
  if (!farmId) {
    log('⏭️ Skipping - no farm ID', 'yellow');
    return false;
  }
  
  try {
    const response = await apiRequest('PUT', `/farms/${farmId}`, {
      status: 'running'
    });
    
    if (response.success) {
      log(`✅ Farm status updated to 'running'`, 'green');
      testResults.passed.push('Farm Status Update');
      
      // Verify the update persisted
      await new Promise(resolve => setTimeout(resolve, 500));
      const getResponse = await apiRequest('GET', `/farms/${farmId}`);
      
      if (getResponse.data?.farm?.status === 'running') {
        log(`✅ Status update persisted correctly`, 'green');
        testResults.passed.push('Status Update Persistence');
      } else {
        log(`❌ Status not persisted: ${getResponse.data?.farm?.status}`, 'red');
        testResults.failed.push('Status Update Persistence');
      }
      
      return true;
    } else {
      throw new Error('Update failed');
    }
  } catch (error) {
    log(`❌ Failed to update farm status: ${error.message || JSON.stringify(error)}`, 'red');
    testResults.failed.push('Farm Status Update');
    return false;
  }
}

// Test 6: Launch Multi-Agent Farm
async function testLaunchFarm() {
  log('\n🚀 Test 6: Launch Multi-Agent Farm', 'blue');
  
  if (!farmId) {
    log('⏭️ Skipping - no farm ID', 'yellow');
    return false;
  }
  
  try {
    const response = await apiRequest('POST', `/farms/${farmId}/launch`, {
      numberOfAgents: TEST_CONFIG.numberOfAgents,
      prompt: 'Test multi-agent coordination'
    });
    
    if (response.success) {
      log(`✅ Farm launched with process ID: ${response.data.processId}`, 'green');
      testResults.passed.push('Farm Launch');
      
      // Check for harvest creation
      if (response.data.harvestId) {
        log(`✅ Harvest created: ${response.data.harvestId}`, 'green');
        testResults.passed.push('Harvest Creation');
      } else {
        log(`⚠️ No harvest created during launch`, 'yellow');
        testResults.warnings.push('No harvest during launch');
      }
      
      return true;
    } else {
      throw new Error('Launch failed');
    }
  } catch (error) {
    log(`⚠️ Farm launch not available: ${error.message}`, 'yellow');
    testResults.warnings.push('Farm Launch (expected in dev mode)');
    return false;
  }
}

// Test 7: Delete Farm (Cleanup)
async function testDeleteFarm() {
  log('\n🗑️ Test 7: Delete Farm (Cleanup)', 'blue');
  
  if (!farmId) {
    log('⏭️ Skipping - no farm ID', 'yellow');
    return false;
  }
  
  try {
    const response = await apiRequest('DELETE', `/farms/${farmId}`);
    
    if (response.success) {
      log(`✅ Farm deleted successfully`, 'green');
      testResults.passed.push('Farm Deletion');
      
      // Verify deletion
      await new Promise(resolve => setTimeout(resolve, 500));
      try {
        await apiRequest('GET', `/farms/${farmId}`);
        log(`❌ Farm still exists after deletion!`, 'red');
        testResults.failed.push('Farm Deletion Verification');
      } catch (error) {
        if (error.response?.status === 404) {
          log(`✅ Farm properly deleted (404 on retrieval)`, 'green');
          testResults.passed.push('Farm Deletion Verification');
        }
      }
      
      return true;
    } else {
      throw new Error('Deletion failed');
    }
  } catch (error) {
    log(`❌ Failed to delete farm: ${error.message || JSON.stringify(error)}`, 'red');
    testResults.failed.push('Farm Deletion');
    return false;
  }
}

// Main test runner
async function runTests() {
  log('\n🧪 Starting Create Farm Test Suite', 'blue');
  log('================================', 'blue');
  
  try {
    // Run tests in sequence
    await testCreateFarm();
    await testRetrieveFarm();
    await testListFarms();
    await testWebSocketConnection();
    await testUpdateFarmStatus();
    await testLaunchFarm();
    await testDeleteFarm();
    
    // Print summary
    log('\n📊 Test Summary', 'blue');
    log('==============', 'blue');
    log(`✅ Passed: ${testResults.passed.length}`, 'green');
    log(`❌ Failed: ${testResults.failed.length}`, 'red');
    log(`⚠️ Warnings: ${testResults.warnings.length}`, 'yellow');
    
    if (testResults.passed.length > 0) {
      log('\nPassed Tests:', 'green');
      testResults.passed.forEach(test => log(`  ✓ ${test}`, 'green'));
    }
    
    if (testResults.failed.length > 0) {
      log('\nFailed Tests:', 'red');
      testResults.failed.forEach(test => log(`  ✗ ${test}`, 'red'));
    }
    
    if (testResults.warnings.length > 0) {
      log('\nWarnings:', 'yellow');
      testResults.warnings.forEach(warning => log(`  ⚠ ${warning}`, 'yellow'));
    }
    
    // Overall result
    const allPassed = testResults.failed.length === 0;
    log('\n' + (allPassed ? '🎉 All critical tests passed!' : '❌ Some tests failed'), allPassed ? 'green' : 'red');
    
    // Exit code based on failures
    process.exit(testResults.failed.length > 0 ? 1 : 0);
    
  } catch (error) {
    log(`\n💥 Test suite error: ${error.message}`, 'red');
    process.exit(1);
  } finally {
    // Cleanup
    if (socket) {
      socket.disconnect();
    }
  }
}

// Check if server is running
async function checkServerHealth() {
  try {
    await axios.get(`${API_BASE}/health`);
    return true;
  } catch (error) {
    log('❌ Server is not running. Please start the server first.', 'red');
    log('Run: npm run dev', 'yellow');
    return false;
  }
}

// Entry point
(async () => {
  const serverHealthy = await checkServerHealth();
  if (serverHealthy) {
    await runTests();
  } else {
    process.exit(1);
  }
})();