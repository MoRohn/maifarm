#!/usr/bin/env node

/**
 * Debug script to test farm creation and terminal streaming
 * Run with: node development/manual-tests/scripts/test-farm-launch-debug.cjs
 */

const fetch = require('node-fetch');
const io = require('socket.io-client');

const API_URL = 'http://localhost:4567';
const WS_URL = 'http://localhost:4567';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function testFarmCreation() {
  log('\n=== Testing Farm Creation ===', colors.bright + colors.cyan);
  
  const farmData = {
    name: 'Debug Test Farm',
    description: 'Testing farm creation and terminal streaming',
    type: 'sequential',
    config: {
      maxAgents: 2,
      timeout: 300,
      autoScale: false,
      yaml: `
name: Debug Test Farm
type: sequential
agents:
  - name: Agent 1
    role: developer
    tasks:
      - Write test code
  - name: Agent 2
    role: reviewer
    tasks:
      - Review code
`.trim()
    },
    provider: 'claude'
  };
  
  try {
    log('📤 Sending farm creation request...', colors.yellow);
    log(`   URL: ${API_URL}/api/farms`, colors.cyan);
    log(`   Data: ${JSON.stringify(farmData, null, 2)}`, colors.cyan);
    
    const response = await fetch(`${API_URL}/api/farms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(farmData)
    });
    
    const responseText = await response.text();
    log(`📥 Response Status: ${response.status}`, response.ok ? colors.green : colors.red);
    log(`   Headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2)}`, colors.cyan);
    
    let result;
    try {
      result = JSON.parse(responseText);
      log(`   Body: ${JSON.stringify(result, null, 2)}`, colors.cyan);
    } catch (e) {
      log(`   Raw Body: ${responseText}`, colors.red);
      throw new Error('Failed to parse response as JSON');
    }
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${result.error?.message || 'Unknown error'}`);
    }
    
    const farm = result.data || result;
    if (!farm.id) {
      throw new Error('Farm created but missing ID');
    }
    
    log(`✅ Farm created successfully!`, colors.green);
    log(`   Farm ID: ${farm.id}`, colors.green);
    log(`   Status: ${farm.status}`, colors.green);
    
    return farm;
  } catch (error) {
    log(`❌ Farm creation failed: ${error.message}`, colors.red);
    throw error;
  }
}

async function testWebSocketConnection(farmId) {
  log('\n=== Testing WebSocket Connection ===', colors.bright + colors.cyan);
  
  return new Promise((resolve, reject) => {
    const socket = io(WS_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5
    });
    
    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error('WebSocket connection timeout'));
    }, 10000);
    
    socket.on('connect', () => {
      log(`✅ Connected to WebSocket (ID: ${socket.id})`, colors.green);
      clearTimeout(timeout);
      
      // Join terminal session
      const sessionId = `farm-${farmId}`;
      log(`📤 Joining terminal session: ${sessionId}`, colors.yellow);
      
      socket.emit('terminal:join_session', {
        sessionId: sessionId,
        farmId: farmId
      });
    });
    
    socket.on('disconnect', () => {
      log('❌ WebSocket disconnected', colors.red);
    });
    
    socket.on('terminal:joined', (data) => {
      log(`✅ Joined terminal session: ${JSON.stringify(data)}`, colors.green);
    });
    
    socket.on('terminal:output', (data) => {
      log(`📥 Terminal Output:`, colors.magenta);
      log(`   Agent: ${data.agentId}`, colors.cyan);
      log(`   Output: ${data.output || data.lines?.join('\\n') || 'No output'}`, colors.white);
    });
    
    socket.on('terminal:ready', (data) => {
      log(`✅ Terminal ready: ${data.message}`, colors.green);
    });
    
    socket.on('error', (error) => {
      log(`❌ WebSocket error: ${error}`, colors.red);
    });
    
    // Keep connection open for 30 seconds to receive messages
    setTimeout(() => {
      log('🔌 Closing WebSocket connection...', colors.yellow);
      socket.disconnect();
      resolve();
    }, 30000);
  });
}

async function testLaunchFarm(farmId) {
  log('\n=== Testing Farm Launch ===', colors.bright + colors.cyan);
  
  const launchData = {
    numberOfAgents: 2,
    prompt: 'Test launch for debugging',
    provider: 'claude',
    collaborative: false
  };
  
  try {
    log('📤 Sending farm launch request...', colors.yellow);
    log(`   URL: ${API_URL}/api/farms/${farmId}/launch`, colors.cyan);
    log(`   Data: ${JSON.stringify(launchData, null, 2)}`, colors.cyan);
    
    const response = await fetch(`${API_URL}/api/farms/${farmId}/launch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(launchData)
    });
    
    const responseText = await response.text();
    log(`📥 Response Status: ${response.status}`, response.ok ? colors.green : colors.red);
    
    let result;
    try {
      result = JSON.parse(responseText);
      log(`   Body: ${JSON.stringify(result, null, 2)}`, colors.cyan);
    } catch (e) {
      log(`   Raw Body: ${responseText}`, colors.red);
      throw new Error('Failed to parse response as JSON');
    }
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${result.error?.message || 'Unknown error'}`);
    }
    
    log(`✅ Farm launched successfully!`, colors.green);
    return result;
  } catch (error) {
    log(`❌ Farm launch failed: ${error.message}`, colors.red);
    throw error;
  }
}

async function testDebugEndpoint() {
  log('\n=== Testing Debug Endpoint ===', colors.bright + colors.cyan);
  
  try {
    const response = await fetch(`${API_URL}/api/debug/terminal`);
    const data = await response.json();
    
    log('📊 Terminal Debug Info:', colors.yellow);
    log(`   Connected Sockets: ${data.data?.connectedSockets?.length || 0}`, colors.cyan);
    log(`   Terminal Rooms: ${data.data?.terminalRoomCount || 0}`, colors.cyan);
    log(`   All Rooms: ${JSON.stringify(data.data?.allRooms || {}, null, 2)}`, colors.cyan);
    
    return data;
  } catch (error) {
    log(`❌ Debug endpoint failed: ${error.message}`, colors.red);
  }
}

async function main() {
  log('🚀 Starting Farm Creation and Terminal Debug Test', colors.bright + colors.green);
  log(`   API URL: ${API_URL}`, colors.cyan);
  log(`   WebSocket URL: ${WS_URL}`, colors.cyan);
  
  try {
    // Test debug endpoint first
    await testDebugEndpoint();
    
    // Create a farm
    const farm = await testFarmCreation();
    
    // Start WebSocket monitoring (in parallel with launch)
    const wsPromise = testWebSocketConnection(farm.id).catch(err => {
      log(`⚠️  WebSocket monitoring error: ${err.message}`, colors.yellow);
    });
    
    // Wait a bit for farm to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Launch the farm
    await testLaunchFarm(farm.id);
    
    // Check debug endpoint again
    await testDebugEndpoint();
    
    // Wait for WebSocket monitoring to complete
    await wsPromise;
    
    log('\n✅ All tests completed!', colors.bright + colors.green);
  } catch (error) {
    log(`\n❌ Test failed: ${error.message}`, colors.bright + colors.red);
    process.exit(1);
  }
}

// Run the tests
main().catch(console.error);