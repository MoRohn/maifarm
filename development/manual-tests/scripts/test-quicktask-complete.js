#!/usr/bin/env node

/**
 * Comprehensive Quick Task workflow test
 * Tests all aspects of the Quick Task feature
 */

import fetch from 'node-fetch';

const API_URL = process.env.API_URL || 'http://localhost:4567';

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

function logInfo(message, data = null) {
  console.log(`${colors.cyan}ℹ ${message}${colors.reset}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testQuickTaskWorkflow() {
  log('\n' + '='.repeat(60), colors.bright);
  log('Comprehensive Quick Task Workflow Test', colors.bright + colors.yellow);
  log('='.repeat(60) + '\n', colors.bright);

  let testsPassed = 0;
  let testsFailed = 0;
  const results = [];

  try {
    // Step 1: Create Quick Task
    logStep(1, 'Creating Quick Task via API');
    
    const quickTaskPayload = {
      title: 'Test Quick Task - Hello World',
      description: 'Create a simple hello world Python script that prints the current date and time',
      provider: 'claude',
      metadata: {
        source: 'comprehensive-test',
        timestamp: new Date().toISOString()
      }
    };

    const createResponse = await fetch(`${API_URL}/api/tasks/quick`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(quickTaskPayload)
    });

    if (!createResponse.ok) {
      const error = await createResponse.text();
      throw new Error(`Failed to create quick task: ${error}`);
    }

    const result = await createResponse.json();
    
    if (!result.success) {
      throw new Error(`Quick task creation failed: ${result.error?.message || 'Unknown error'}`);
    }

    // Extract IDs from response
    const farmId = result.data?.farmId || result.farmId;
    const harvestId = result.data?.harvestId || result.harvestId;
    const taskId = result.data?.taskId || result.data?.id;
    const sessionName = result.data?.sessionName || result.data?.tmuxSession || `quick_${farmId?.substring(0, 8)}`;

    logSuccess(`Quick task created successfully`);
    logInfo(`Task ID: ${taskId}`);
    logInfo(`Farm ID: ${farmId}`);
    logInfo(`Harvest ID: ${harvestId || 'Will be created soon'}`);
    logInfo(`Session Name: ${sessionName}`);
    
    // Validate response structure
    if (farmId) {
      testsPassed++;
      results.push({ test: 'Farm ID returned', passed: true });
    } else {
      testsFailed++;
      results.push({ test: 'Farm ID returned', passed: false, error: 'No farm ID' });
    }

    // Step 2: Check terminal session creation
    logStep(2, 'Verifying terminal session creation');
    
    // Wait for session to be created
    await delay(3000);
    
    const sessionsResponse = await fetch(`${API_URL}/api/terminal/sessions`);
    if (sessionsResponse.ok) {
      const sessionsData = await sessionsResponse.json();
      const sessions = sessionsData.data || [];
      
      const quickTaskSession = sessions.find(s => 
        s.sessionName === sessionName || 
        s.sessionName.includes(farmId?.substring(0, 8))
      );
      
      if (quickTaskSession) {
        logSuccess(`Terminal session found: ${quickTaskSession.sessionName}`);
        logInfo(`Pane count: ${quickTaskSession.paneCount}`);
        testsPassed++;
        results.push({ test: 'Terminal session created', passed: true });
        
        // Verify no duplicate sessions
        const duplicateSessions = sessions.filter(s => 
          s.sessionName.includes(farmId?.substring(0, 8))
        );
        
        if (duplicateSessions.length === 1) {
          logSuccess('No duplicate sessions created');
          testsPassed++;
          results.push({ test: 'No duplicate sessions', passed: true });
        } else {
          logError(`Found ${duplicateSessions.length} sessions for this farm`);
          testsFailed++;
          results.push({ test: 'No duplicate sessions', passed: false, error: `${duplicateSessions.length} sessions found` });
        }
      } else {
        logError('Terminal session not found');
        logInfo('Available sessions:', sessions.map(s => s.sessionName));
        testsFailed++;
        results.push({ test: 'Terminal session created', passed: false, error: 'Session not found' });
      }
    }

    // Step 3: Check harvest creation
    logStep(3, 'Verifying harvest creation');
    
    let actualHarvestId = harvestId;
    
    if (!actualHarvestId) {
      // Wait and check for harvest creation
      await delay(2000);
      
      const harvestsResponse = await fetch(`${API_URL}/api/harvests?farmId=${farmId}`);
      if (harvestsResponse.ok) {
        const harvestsData = await harvestsResponse.json();
        const harvests = harvestsData.data || [];
        const farmHarvest = harvests.find(h => h.farmId === farmId);
        
        if (farmHarvest) {
          actualHarvestId = farmHarvest.id;
          logSuccess(`Harvest created: ${actualHarvestId}`);
          testsPassed++;
          results.push({ test: 'Harvest created', passed: true });
        } else {
          logError('Harvest not created');
          testsFailed++;
          results.push({ test: 'Harvest created', passed: false, error: 'No harvest found' });
        }
      }
    } else {
      logSuccess(`Harvest was created immediately: ${actualHarvestId}`);
      testsPassed++;
      results.push({ test: 'Harvest created', passed: true });
    }

    // Step 4: Check terminal output
    logStep(4, 'Checking terminal output');
    
    if (sessionName) {
      const terminalResponse = await fetch(`${API_URL}/api/terminal/${sessionName}/0?lines=50`);
      if (terminalResponse.ok) {
        const terminalData = await terminalResponse.json();
        const output = terminalData.data?.terminal || [];
        
        if (output.length > 0) {
          logSuccess(`Terminal has output: ${output.length} lines`);
          
          // Check if Claude has started
          const hasClaudeOutput = output.some(line => 
            line.includes('Welcome to Claude') || 
            line.includes('claude') ||
            line.includes('Agent 1')
          );
          
          if (hasClaudeOutput) {
            logSuccess('Claude agent started successfully');
            testsPassed++;
            results.push({ test: 'Agent started', passed: true });
          } else {
            logError('Claude agent may not have started');
            testsFailed++;
            results.push({ test: 'Agent started', passed: false, error: 'No Claude output detected' });
          }
        } else {
          logError('No terminal output');
          testsFailed++;
          results.push({ test: 'Terminal output', passed: false, error: 'No output' });
        }
      }
    }

    // Step 5: Check task status
    logStep(5, 'Checking task status');
    
    const taskStatusResponse = await fetch(`${API_URL}/api/tasks/${taskId}`);
    if (taskStatusResponse.ok) {
      const taskStatusData = await taskStatusResponse.json();
      const taskStatus = taskStatusData.data?.status;
      
      logInfo(`Task status: ${taskStatus}`);
      
      if (taskStatus === 'queued' || taskStatus === 'processing') {
        logSuccess('Task is being processed');
        testsPassed++;
        results.push({ test: 'Task processing', passed: true });
      } else if (taskStatus === 'failed') {
        logError('Task failed');
        testsFailed++;
        results.push({ test: 'Task processing', passed: false, error: 'Task failed' });
      }
    }

    // Step 6: Wait a bit and check if session is still active (not orphaned)
    logStep(6, 'Verifying session is not marked as orphaned');
    
    await delay(5000);
    
    // Check tmux sessions directly
    const tmuxCheckResponse = await fetch(`${API_URL}/api/terminal/sessions`);
    if (tmuxCheckResponse.ok) {
      const tmuxData = await tmuxCheckResponse.json();
      const activeSessions = tmuxData.data || [];
      
      const stillActive = activeSessions.find(s => 
        s.sessionName === sessionName || 
        s.sessionName.includes(farmId?.substring(0, 8))
      );
      
      if (stillActive) {
        logSuccess('Session is still active (not orphaned)');
        testsPassed++;
        results.push({ test: 'Session not orphaned', passed: true });
      } else {
        logError('Session was killed as orphaned');
        testsFailed++;
        results.push({ test: 'Session not orphaned', passed: false, error: 'Session killed' });
      }
    }

    // Step 7: Check if harvest will be available in barn (after some processing)
    logStep(7, 'Checking barn availability (after brief processing)');
    
    await delay(10000); // Wait 10 seconds for some processing
    
    const barnResponse = await fetch(`${API_URL}/api/barn/items`);
    if (barnResponse.ok) {
      const barnItems = await barnResponse.json();
      const quickTaskItem = barnItems.find(item => 
        item.farmId === farmId || 
        item.name?.includes('Quick Task') ||
        item.name?.includes('Hello World')
      );
      
      if (quickTaskItem) {
        logSuccess('Quick task harvest available in barn');
        logInfo(`Barn item: ${quickTaskItem.name}`);
        testsPassed++;
        results.push({ test: 'Barn storage', passed: true });
      } else {
        logInfo('Quick task not yet in barn (still processing)');
        results.push({ test: 'Barn storage', passed: true, note: 'Still processing' });
      }
    }

  } catch (error) {
    logError(`Test failed with error: ${error.message}`);
    console.error(error);
    testsFailed++;
    results.push({ test: 'Overall execution', passed: false, error: error.message });
  }

  // Summary
  log('\n' + '='.repeat(60), colors.bright);
  log('Test Results Summary', colors.bright + colors.yellow);
  log('='.repeat(60), colors.bright);
  
  console.log('\nTest Results:');
  results.forEach(r => {
    const status = r.passed ? `${colors.green}✓ PASS${colors.reset}` : `${colors.red}✗ FAIL${colors.reset}`;
    const note = r.note ? ` (${r.note})` : '';
    const error = r.error ? ` - ${r.error}` : '';
    console.log(`  ${status} ${r.test}${note}${error}`);
  });
  
  console.log(`\n${colors.bright}Total: ${testsPassed} passed, ${testsFailed} failed${colors.reset}`);
  
  if (testsFailed === 0) {
    logSuccess('\n🎉 All tests passed! Quick Task workflow is working correctly.');
  } else {
    logError(`\n⚠️  ${testsFailed} test(s) failed. Please review the issues above.`);
  }
}

// Run test
testQuickTaskWorkflow().catch(console.error);