#!/usr/bin/env node

/**
 * Test script for Quick Task workflow
 * Tests: Form submission → Terminal monitoring → Harvest collection → Barn display
 */

import fetch from 'node-fetch';
import WebSocket from 'ws';

const API_URL = process.env.API_URL || 'http://localhost:4567';
const WS_URL = process.env.WS_URL || 'ws://localhost:4567';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = '') {
  console.log(`${color}${message}${colors.reset}`);
}

function logStep(step, message) {
  console.log(`\n${colors.bright}${colors.blue}[Step ${step}]${colors.reset} ${message}`);
}

function logSuccess(message) {
  console.log(`${colors.green}✓ ${message}${colors.reset}`);
}

function logError(message) {
  console.log(`${colors.red}✗ ${message}${colors.reset}`);
}

function logInfo(message) {
  console.log(`${colors.cyan}ℹ ${message}${colors.reset}`);
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testQuickTaskWorkflow() {
  log('\n' + '='.repeat(60), colors.bright);
  log('Quick Task Workflow Test', colors.bright + colors.yellow);
  log('='.repeat(60) + '\n', colors.bright);

  let farmId = null;
  let harvestId = null;
  let taskId = null;
  let sessionName = null;
  let ws = null;

  try {
    // Step 1: Create Quick Task
    logStep(1, 'Creating Quick Task via API');
    
    const quickTaskPayload = {
      title: 'Test Quick Task',
      description: 'Create a simple hello world Python script',
      provider: 'claude',
      metadata: {
        source: 'test-script',
        timestamp: new Date().toISOString()
      }
    };

    const createResponse = await fetch(`${API_URL}/api/tasks/quick`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token' // Add if auth is required
      },
      body: JSON.stringify(quickTaskPayload)
    });

    if (!createResponse.ok) {
      const error = await createResponse.text();
      throw new Error(`Failed to create quick task: ${error}`);
    }

    const result = await createResponse.json();
    logInfo('Quick task response:', result);

    if (!result.success) {
      throw new Error(`Quick task creation failed: ${result.error?.message || 'Unknown error'}`);
    }

    // Extract IDs from response
    farmId = result.data?.farmId || result.farmId;
    harvestId = result.data?.harvestId || result.harvestId;
    taskId = result.data?.taskId || result.data?.id;
    sessionName = result.data?.sessionName || result.data?.tmuxSession || `quick_${farmId?.substring(0, 8)}`;

    logSuccess(`Quick task created successfully`);
    logInfo(`Task ID: ${taskId}`);
    logInfo(`Farm ID: ${farmId}`);
    logInfo(`Harvest ID: ${harvestId || 'Will be created soon'}`);
    logInfo(`Session Name: ${sessionName}`);

    // Step 2: Connect WebSocket to monitor events
    logStep(2, 'Connecting WebSocket to monitor farm events');
    
    ws = new WebSocket(WS_URL);
    const wsEvents = [];
    
    await new Promise((resolve, reject) => {
      ws.on('open', () => {
        logSuccess('WebSocket connected');
        resolve();
      });
      ws.on('error', reject);
    });

    // Listen for relevant events
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        const { event, payload } = message;
        
        if (payload?.farmId === farmId || payload?.data?.farmId === farmId) {
          wsEvents.push({ event, payload, timestamp: new Date() });
          
          // Log important events
          switch(event) {
            case 'farm:status':
              logInfo(`Farm status: ${payload.status}`);
              break;
            case 'harvest:created':
              if (!harvestId) {
                harvestId = payload.harvestId;
                logSuccess(`Harvest created: ${harvestId}`);
              }
              break;
            case 'farm:tmux:ready':
              logSuccess(`Terminal session ready: ${payload.sessionName}`);
              break;
            case 'farm:graceful_shutdown_started':
              logInfo('Graceful shutdown started...');
              break;
            case 'harvest:collected':
              logSuccess('Harvest files collected');
              break;
            case 'barn:item:stored':
              logSuccess('Harvest stored in barn');
              break;
          }
        }
      } catch (err) {
        // Ignore parse errors
      }
    });

    // Step 3: Check terminal session
    logStep(3, 'Checking terminal session availability');
    
    await delay(2000); // Wait for session to be created
    
    const sessionsResponse = await fetch(`${API_URL}/api/terminal/sessions?farmId=${farmId}`);
    if (sessionsResponse.ok) {
      const sessionsData = await sessionsResponse.json();
      const sessions = sessionsData.data || [];
      
      const quickTaskSession = sessions.find(s => 
        s.sessionName === sessionName || 
        s.sessionName.includes(farmId.substring(0, 8))
      );
      
      if (quickTaskSession) {
        logSuccess(`Terminal session found: ${quickTaskSession.sessionName}`);
        logInfo(`Pane count: ${quickTaskSession.paneCount}`);
      } else {
        logError('Terminal session not found');
        logInfo('Available sessions:', sessions.map(s => s.sessionName));
      }
    }

    // Step 4: Monitor for harvest creation
    logStep(4, 'Waiting for harvest creation (max 30 seconds)');
    
    let attempts = 0;
    while (!harvestId && attempts < 15) {
      await delay(2000);
      
      // Check harvests endpoint
      const harvestsResponse = await fetch(`${API_URL}/api/harvests?farmId=${farmId}`);
      if (harvestsResponse.ok) {
        const harvestsData = await harvestsResponse.json();
        const harvests = harvestsData.data || [];
        const farmHarvest = harvests.find(h => h.farmId === farmId);
        
        if (farmHarvest) {
          harvestId = farmHarvest.id;
          logSuccess(`Harvest found: ${harvestId}`);
          break;
        }
      }
      
      attempts++;
      if (attempts % 3 === 0) {
        logInfo(`Still waiting for harvest... (${attempts * 2}s)`);
      }
    }

    if (!harvestId) {
      logError('Harvest was not created within timeout');
    }

    // Step 5: Wait for task completion or timeout
    logStep(5, 'Waiting for task completion (Quick Task has 5-minute timeout)');
    
    logInfo('Quick tasks run for up to 5 minutes...');
    logInfo('Graceful shutdown occurs 30 seconds before timeout (at 4:30)');
    
    // For testing, we'll wait just 30 seconds to see initial progress
    await delay(30000);

    // Step 6: Check if harvest has been collected
    logStep(6, 'Checking harvest collection status');
    
    if (harvestId) {
      const harvestResponse = await fetch(`${API_URL}/api/harvests/${harvestId}`);
      if (harvestResponse.ok) {
        const harvestData = await harvestResponse.json();
        const harvest = harvestData.data;
        
        logInfo(`Harvest status: ${harvest.status}`);
        logInfo(`Yield items: ${harvest.yield?.length || 0}`);
        
        if (harvest.status === 'ready' || harvest.status === 'completed') {
          logSuccess('Harvest is ready');
        }
      }
    }

    // Step 7: Check barn storage
    logStep(7, 'Checking if harvest is available in barn');
    
    const barnResponse = await fetch(`${API_URL}/api/barn/items`);
    if (barnResponse.ok) {
      const barnItems = await barnResponse.json();
      const quickTaskItem = barnItems.find(item => 
        item.farmId === farmId || 
        item.name?.includes('Quick Task')
      );
      
      if (quickTaskItem) {
        logSuccess('Quick task harvest found in barn');
        logInfo(`Barn item ID: ${quickTaskItem.id}`);
        logInfo(`Name: ${quickTaskItem.name}`);
        logInfo(`Yield items: ${quickTaskItem.yield?.length || 0}`);
      } else {
        logError('Quick task harvest not found in barn');
        logInfo(`Total barn items: ${barnItems.length}`);
      }
    }

    // Summary
    log('\n' + '='.repeat(60), colors.bright);
    log('Test Summary', colors.bright + colors.yellow);
    log('='.repeat(60), colors.bright);
    
    const eventTypes = [...new Set(wsEvents.map(e => e.event))];
    logInfo(`WebSocket events received: ${wsEvents.length}`);
    logInfo(`Event types: ${eventTypes.join(', ')}`);
    
    logSuccess('Quick Task workflow test completed');

  } catch (error) {
    logError(`Test failed: ${error.message}`);
    console.error(error);
  } finally {
    // Cleanup
    if (ws) {
      ws.close();
    }
  }
}

// Run test
testQuickTaskWorkflow().catch(console.error);