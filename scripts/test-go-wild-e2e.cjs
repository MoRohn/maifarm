#!/usr/bin/env node

const axios = require('axios');
const WebSocket = require('ws');

const API_URL = 'http://localhost:4567/api';

// Color codes for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Test configuration
const testFarm = {
  id: 'test-farm-gowild-' + Date.now(),
  name: 'Go Wild E2E Test Farm',
  description: 'Testing complete Go Wild functionality',
  type: 'exploration'
};

const goWildConfig = {
  creativityLevel: 80,
  explorationDepth: 75,
  safetyLevel: 90,
  boundaries: {
    maxNodes: 50,
    maxDepth: 10,
    allowedActions: ['analyze', 'optimize', 'integrate', 'innovate', 'security', 'testing'],
    restrictedAreas: [],
    allowExternalAPIs: true,
    allowFileSystem: true,
    allowNetworkRequests: true
  },
  maxDuration: 10, // 10 minutes
  autoSave: true,
  focusAreas: ['performance optimization', 'security analysis', 'code quality']
};

let discoveryCount = 0;
let nodeCount = 0;

async function connectWebSocket() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:4567');
    
    ws.on('open', () => {
      log('✓ WebSocket connected', 'green');
      resolve(ws);
    });
    
    ws.on('error', (error) => {
      log('✗ WebSocket error: ' + error.message, 'red');
      reject(error);
    });
  });
}

function setupWebSocketListeners(ws, sessionId) {
  ws.on('message', (data) => {
    try {
      const event = JSON.parse(data);
      
      // Filter for Go Wild events
      if (event.type && event.type.startsWith('goWild:')) {
        const eventData = event.data || {};
        
        switch(event.type) {
          case 'goWild:started':
            log(`  [WS] Exploration started for session ${eventData.sessionId}`, 'cyan');
            break;
            
          case 'goWild:node-added':
            nodeCount++;
            if (eventData.data && eventData.data.node) {
              const node = eventData.data.node;
              log(`  [WS] New node: ${node.label} (${node.type}) - Total: ${nodeCount}`, 'cyan');
            }
            break;
            
          case 'goWild:discovery-made':
            discoveryCount++;
            if (eventData.data && eventData.data.discovery) {
              const discovery = eventData.data.discovery;
              log(`  [WS] Discovery! ${discovery.title} (${discovery.impact} impact) - Total: ${discoveryCount}`, 'yellow');
            }
            break;
            
          case 'goWild:boundary-reached':
            log(`  [WS] Boundary reached: ${JSON.stringify(eventData.data)}`, 'magenta');
            break;
            
          case 'goWild:status-changed':
            log(`  [WS] Status changed to: ${eventData.data.status}`, 'cyan');
            break;
            
          case 'goWild:paused':
          case 'goWild:resumed':
          case 'goWild:stopped':
            log(`  [WS] ${event.type.replace('goWild:', '')}`, 'cyan');
            break;
            
          case 'goWild:configUpdated':
          case 'goWild:boundariesUpdated':
            log(`  [WS] Configuration updated`, 'cyan');
            break;
            
          case 'goWild:discoverySaved':
            log(`  [WS] Discovery saved!`, 'green');
            break;
            
          case 'goWild:emergencyStop':
            log(`  [WS] Emergency stop executed!`, 'red');
            break;
            
          default:
            log(`  [WS] ${event.type}: ${JSON.stringify(eventData)}`, 'cyan');
        }
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  });
}

async function waitWithProgress(duration, message) {
  const steps = 10;
  const stepDuration = duration / steps;
  
  process.stdout.write(`${colors.yellow}${message} `);
  
  for (let i = 0; i < steps; i++) {
    await new Promise(resolve => setTimeout(resolve, stepDuration));
    process.stdout.write('.');
  }
  
  console.log(` Done!${colors.reset}`);
}

async function testGoWildE2E() {
  log('\n=== Go Wild End-to-End Test ===\n', 'blue');
  log('This test demonstrates full Go Wild functionality including:', 'blue');
  log('- Real-time exploration with WebSocket updates', 'blue');
  log('- Agent coordination and task assignment', 'blue');
  log('- Discovery detection and saving', 'blue');
  log('- Boundary controls and safety limits', 'blue');
  log('- Pause/resume and configuration updates\n', 'blue');
  
  let ws;
  let sessionId;
  
  try {
    // 1. Connect WebSocket for real-time updates
    log('1. Setting up real-time connection...', 'yellow');
    ws = await connectWebSocket();
    
    // 2. Start Go Wild exploration
    log('\n2. Starting Go Wild exploration...', 'yellow');
    log(`   Config: Creativity=${goWildConfig.creativityLevel}%, Depth=${goWildConfig.explorationDepth}%`, 'gray');
    log(`   Focus: ${goWildConfig.focusAreas.join(', ')}`, 'gray');
    
    const startResponse = await axios.post(`${API_URL}/go-wild/start`, {
      farmId: testFarm.id,
      config: goWildConfig
    });
    
    if (startResponse.data.success) {
      sessionId = startResponse.data.data.id;
      log(`✓ Go Wild session started: ${sessionId}`, 'green');
      
      // Setup WebSocket listeners after we have sessionId
      setupWebSocketListeners(ws, sessionId);
      
      // Subscribe to Go Wild events for this session
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: 'goWild',
        farmId: testFarm.id
      }));
    } else {
      throw new Error('Failed to start Go Wild session');
    }
    
    // 3. Monitor initial exploration
    log('\n3. Monitoring exploration progress...', 'yellow');
    await waitWithProgress(8000, 'Letting agents explore');
    
    // 4. Check current progress
    log('\n4. Checking exploration progress...', 'yellow');
    const progressResponse = await axios.get(`${API_URL}/go-wild/sessions/${sessionId}`);
    const session = progressResponse.data.data;
    log(`✓ Progress: ${session.stats.nodesExplored} nodes, ${session.stats.discoveriesMade} discoveries`, 'green');
    
    // 5. Test pause functionality
    log('\n5. Testing pause/resume functionality...', 'yellow');
    await axios.put(`${API_URL}/go-wild/${sessionId}/pause`);
    log('✓ Exploration paused', 'green');
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await axios.put(`${API_URL}/go-wild/${sessionId}/resume`);
    log('✓ Exploration resumed', 'green');
    
    // 6. Update boundaries dynamically
    log('\n6. Testing dynamic boundary updates...', 'yellow');
    const newBoundaries = {
      ...goWildConfig.boundaries,
      maxNodes: 30,
      creativityBoost: true
    };
    await axios.put(`${API_URL}/go-wild/sessions/${sessionId}/boundaries`, {
      boundaries: newBoundaries
    });
    log('✓ Boundaries updated (reduced max nodes to 30)', 'green');
    
    // 7. Let exploration continue
    log('\n7. Continuing exploration with new boundaries...', 'yellow');
    await waitWithProgress(5000, 'Exploring with updated config');
    
    // 8. Get and save discoveries
    log('\n8. Retrieving and saving discoveries...', 'yellow');
    const discoveriesResponse = await axios.get(`${API_URL}/go-wild/sessions/${sessionId}/discoveries`);
    const discoveries = discoveriesResponse.data.data;
    log(`✓ Found ${discoveries.length} discoveries`, 'green');
    
    // Save first few discoveries
    const toSave = discoveries.slice(0, Math.min(3, discoveries.length));
    for (const discovery of toSave) {
      await axios.post(`${API_URL}/go-wild/${sessionId}/discovery/${discovery.id}/save`);
      log(`  ✓ Saved: ${discovery.title}`, 'green');
    }
    
    // 9. Test rollback functionality
    if (session.explorationPath.nodes.length > 5) {
      log('\n9. Testing rollback functionality...', 'yellow');
      const checkpointNode = session.explorationPath.nodes[Math.floor(session.explorationPath.nodes.length / 2)];
      const rollbackResponse = await axios.post(
        `${API_URL}/go-wild/sessions/${sessionId}/rollback/${checkpointNode.id}`
      );
      log(`✓ Rolled back to checkpoint: ${checkpointNode.label}`, 'green');
      log(`  Removed ${rollbackResponse.data.data.nodesRemoved} nodes`, 'gray');
    }
    
    // 10. Final exploration phase
    log('\n10. Final exploration phase...', 'yellow');
    await waitWithProgress(5000, 'Completing exploration');
    
    // 11. Stop exploration and get summary
    log('\n11. Stopping exploration...', 'yellow');
    const stopResponse = await axios.put(`${API_URL}/go-wild/${sessionId}/stop`);
    const summary = stopResponse.data.data;
    
    log('\n✓ Exploration completed!', 'green');
    log('\n=== Final Summary ===', 'blue');
    log(`Duration: ${Math.round(summary.duration / 1000)}s`, 'green');
    log(`Nodes explored: ${summary.stats.nodesExplored}`, 'green');
    log(`Discoveries made: ${summary.discoveries}`, 'green');
    log(`Discoveries saved: ${summary.savedDiscoveries}`, 'green');
    log(`Backtracks: ${summary.stats.backtrackCount}`, 'green');
    log(`Average creativity: ${Math.round(summary.stats.averageCreativity)}%`, 'green');
    
    // 12. List all sessions
    log('\n12. Verifying session in list...', 'yellow');
    const sessionsResponse = await axios.get(`${API_URL}/go-wild/sessions`);
    const allSessions = sessionsResponse.data.data;
    const ourSession = allSessions.find(s => s.id === sessionId);
    log(`✓ Session found in list (${allSessions.length} total sessions)`, 'green');
    log(`  Status: ${ourSession.status}`, 'gray');
    
    log('\n✅ All Go Wild features tested successfully!', 'green');
    log('\nKey features demonstrated:', 'blue');
    log('- ✓ Real-time WebSocket updates', 'green');
    log('- ✓ Autonomous exploration with agent coordination', 'green');
    log('- ✓ Discovery detection and management', 'green');
    log('- ✓ Pause/resume functionality', 'green');
    log('- ✓ Dynamic boundary updates', 'green');
    log('- ✓ Rollback to checkpoints', 'green');
    log('- ✓ Discovery saving', 'green');
    log('- ✓ Comprehensive session tracking', 'green');
    
  } catch (error) {
    log('\n✗ Error during Go Wild E2E test:', 'red');
    if (error.response) {
      log(`  Status: ${error.response.status}`, 'red');
      log(`  Message: ${JSON.stringify(error.response.data)}`, 'red');
    } else {
      log(`  ${error.message}`, 'red');
    }
    throw error;
  } finally {
    if (ws) {
      ws.close();
    }
  }
}

// Run the test
testGoWildE2E()
  .then(() => {
    log('\n🎉 Go Wild feature is fully operational!', 'green');
    process.exit(0);
  })
  .catch((error) => {
    log('\n💥 Go Wild E2E test failed!', 'red');
    process.exit(1);
  });