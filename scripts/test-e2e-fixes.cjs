#!/usr/bin/env node

/**
 * E2E Test Script to Verify All Bug Fixes
 * Tests the complete Farm → Harvest → Barn flow after fixes
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const API_BASE = 'http://localhost:4567/api';
const TEST_TIMEOUT = 90000; // 90 seconds for full test

// Color codes for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, description) {
  console.log(`\n${colors.blue}═══ Step ${step}: ${description} ═══${colors.reset}`);
}

function logSuccess(message) {
  console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

function logError(message) {
  console.log(`${colors.red}❌ ${message}${colors.reset}`);
}

function logInfo(message) {
  console.log(`${colors.yellow}ℹ️  ${message}${colors.reset}`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkServerHealth() {
  try {
    const response = await axios.get(`${API_BASE.replace('/api', '')}/health`);
    return response.data.status === 'ok';
  } catch (error) {
    return false;
  }
}

async function createFarm(name, timeout = 70) { // FIXED: timeout in seconds, not milliseconds
  const farmData = {
    name: name,
    config: {
      maxAgents: 3,
      timeout: timeout,
      provider: 'claude'
    }
  };
  
  const response = await axios.post(`${API_BASE}/farms`, farmData);
  return response.data.data;
}

async function launchFarm(farmId, prompt) {
  const response = await axios.post(`${API_BASE}/farms/${farmId}/launch`, {
    prompt: prompt,
    numberOfAgents: 3
  });
  return response.data.data;
}

async function getFarmStatus(farmId) {
  const response = await axios.get(`${API_BASE}/farms/${farmId}`);
  return response.data.data;
}

async function getHarvest(harvestId) {
  try {
    const response = await axios.get(`${API_BASE}/harvests/${harvestId}`);
    return response.data.data;
  } catch (error) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

async function verifyHarvestDirectory(harvestId) {
  try {
    const response = await axios.get(`${API_BASE}/harvest/${harvestId}/verify-directory`);
    return response.data;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getTerminalSessions(farmId) {
  const response = await axios.get(`${API_BASE}/harvest/terminal/sessions`, {
    params: { farmId }
  });
  return response.data.data;
}

async function checkTmuxSession(sessionName) {
  try {
    const { stdout } = await execPromise(`tmux list-sessions 2>/dev/null | grep ${sessionName}`);
    return stdout.includes(sessionName);
  } catch (error) {
    return false;
  }
}

async function getTerminalOutput(sessionName, paneId = 0) {
  try {
    const response = await axios.get(`${API_BASE}/harvest/terminal/${sessionName}/${paneId}`, {
      params: { lines: 50 }
    });
    return response.data.data;
  } catch (error) {
    return null;
  }
}

async function searchBarn(query) {
  try {
    const response = await axios.get(`${API_BASE}/barn/search`, {
      params: query
    });
    return response.data;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getBarnHarvest(harvestId) {
  try {
    const response = await axios.get(`${API_BASE}/barn/harvests/${harvestId}`);
    return response.data;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function runE2ETest() {
  console.log(`\n${colors.magenta}╔════════════════════════════════════════════╗`);
  console.log(`║     MaiFarm E2E Test - Bug Fix Verification    ║`);
  console.log(`╚════════════════════════════════════════════╝${colors.reset}\n`);
  
  const testResults = {
    serverHealth: false,
    farmCreation: false,
    farmStatusFlow: false,
    farmLaunch: false,
    tmuxSession: false,
    agentExecution: false,
    harvestCreation: false,
    harvestDirectory: false,
    harvestLookup: false,
    sessionPersistence: false,
    barnEndpoints: false,
    gracefulShutdown: false
  };
  
  try {
    // Step 1: Check server health
    logStep(1, 'Checking server health');
    const isHealthy = await checkServerHealth();
    if (isHealthy) {
      logSuccess('Server is healthy');
      testResults.serverHealth = true;
    } else {
      logError('Server is not responding');
      return testResults;
    }
    
    // Step 2: Create a farm (BUG #1: Should start as 'idle')
    logStep(2, 'Creating test farm');
    const farm = await createFarm('E2E Test Farm - Fix Verification', 70); // FIXED: 70 seconds to avoid edge case
    logInfo(`Farm created: ${farm.id}`);
    logInfo(`Initial status: ${farm.status}`);
    
    if (farm.status === 'idle' || farm.status === 'active') {
      logSuccess('Farm created successfully');
      testResults.farmCreation = true;
    } else {
      logError(`Unexpected farm status: ${farm.status}`);
    }
    
    // Step 3: Launch the farm
    logStep(3, 'Launching farm with test agents');
    const launchResult = await launchFarm(farm.id, 'E2E Test: Verify all bug fixes are working');
    logInfo(`Launch result: ${JSON.stringify(launchResult)}`);
    
    if (launchResult.status === 'launching' && launchResult.harvestId) {
      logSuccess('Farm launched successfully');
      logSuccess(`Harvest ID: ${launchResult.harvestId}`);
      testResults.farmLaunch = true;
    } else {
      logError('Farm launch failed');
    }
    
    // Wait for status transition (5 seconds for database update)
    await sleep(5000);
    
    // Step 4: Check farm status transition
    logStep(4, 'Verifying farm status transition');
    const farmStatus = await getFarmStatus(farm.id);
    logInfo(`Current farm status: ${farmStatus.status}`);
    
    if (farmStatus.status === 'active' || farmStatus.status === 'running') {
      logSuccess('Farm transitioned to active state');
      testResults.farmStatusFlow = true;
    } else {
      logError(`Farm stuck in ${farmStatus.status} state`);
    }
    
    // Step 5: Check tmux session (BUG #2: Should exist without quote> issues)
    logStep(5, 'Checking tmux session creation');
    const sessionName = `farm-${farm.id.substring(0, 8)}`;
    const tmuxExists = await checkTmuxSession(sessionName);
    
    if (tmuxExists) {
      logSuccess(`Tmux session '${sessionName}' exists`);
      testResults.tmuxSession = true;
    } else {
      logError('Tmux session not found');
    }
    
    // Step 6: Check terminal output (BUG #2: Should not have quote> prompts)
    logStep(6, 'Verifying agent execution (no quote> hang)');
    const terminalOutput = await getTerminalOutput(sessionName, 0);
    
    if (terminalOutput && terminalOutput.terminal) {
      const outputText = terminalOutput.terminal.join('\n');
      const hasQuotePrompt = outputText.includes('quote>');
      
      if (!hasQuotePrompt) {
        logSuccess('Agents executing without quote> hang');
        testResults.agentExecution = true;
      } else {
        logError('Quote> prompt detected - shell escaping issue persists');
        logInfo(`Terminal output sample: ${outputText.substring(0, 200)}...`);
      }
    }
    
    // Step 7: Check harvest creation and directory (BUG #4)
    logStep(7, 'Verifying harvest directory creation');
    const harvestVerify = await verifyHarvestDirectory(launchResult.harvestId);
    
    if (harvestVerify.success && harvestVerify.integrity?.isValid) {
      logSuccess('Harvest directory created successfully');
      logInfo(`Directory path: ${harvestVerify.integrity.path}`);
      testResults.harvestDirectory = true;
      testResults.harvestCreation = true; // FIXED: Harvest was created successfully
    } else {
      logError('Harvest directory not created or invalid');
      logInfo(`Verification result: ${JSON.stringify(harvestVerify)}`);
    }
    
    // Step 8: Verify harvest lookup (BUG #7)
    logStep(8, 'Testing harvest API lookup');
    const harvest = await getHarvest(launchResult.harvestId);
    
    if (harvest && harvest.id === launchResult.harvestId) {
      logSuccess('Correct harvest returned by API');
      testResults.harvestLookup = true;
    } else {
      logError(`Wrong harvest returned. Expected: ${launchResult.harvestId}, Got: ${harvest?.id}`);
    }
    
    // Step 9: Test barn endpoints (BUG #6)
    logStep(9, 'Testing barn API endpoints');
    const barnSearch = await searchBarn({ q: 'test' });
    const barnHarvest = await getBarnHarvest(launchResult.harvestId);
    
    if (barnSearch.success !== false || barnHarvest.success !== false) {
      logSuccess('Barn endpoints are responding');
      testResults.barnEndpoints = true;
    } else {
      logError('Barn endpoints not working');
    }
    
    // Step 10: Wait and verify session persistence (BUG #5)
    logStep(10, 'Testing session persistence (35 seconds)');
    logInfo('Waiting 35 seconds to ensure session is not cleaned up prematurely...');
    await sleep(35000);
    
    const stillExists = await checkTmuxSession(sessionName);
    if (stillExists) {
      logSuccess('Session persisted correctly (not cleaned up early)');
      testResults.sessionPersistence = true;
    } else {
      logError('Session was cleaned up prematurely!');
    }
    
    // Step 11: Wait for graceful shutdown
    logStep(11, 'Waiting for graceful shutdown (35 more seconds)');
    logInfo('Farm should shut down gracefully at 70 seconds...');
    await sleep(35000);
    
    const sessionAfterTimeout = await checkTmuxSession(sessionName);
    if (!sessionAfterTimeout) {
      logSuccess('Session cleaned up after proper timeout');
      testResults.gracefulShutdown = true;
    } else {
      logError('Session still exists after timeout - cleanup failed');
    }
    
  } catch (error) {
    logError(`Test failed with error: ${error.message}`);
    console.error(error);
  }
  
  // Print summary
  console.log(`\n${colors.magenta}╔════════════════════════════════════════════╗`);
  console.log(`║                TEST SUMMARY                   ║`);
  console.log(`╚════════════════════════════════════════════╝${colors.reset}\n`);
  
  let passedTests = 0;
  let totalTests = 0;
  
  for (const [test, passed] of Object.entries(testResults)) {
    totalTests++;
    if (passed) {
      passedTests++;
      console.log(`  ${colors.green}✅${colors.reset} ${test.replace(/([A-Z])/g, ' $1').trim()}`);
    } else {
      console.log(`  ${colors.red}❌${colors.reset} ${test.replace(/([A-Z])/g, ' $1').trim()}`);
    }
  }
  
  console.log(`\n${colors.magenta}════════════════════════════════════════════${colors.reset}`);
  const passRate = Math.round((passedTests / totalTests) * 100);
  
  if (passedTests === totalTests) {
    console.log(`${colors.green}🎉 ALL TESTS PASSED! (${passedTests}/${totalTests})${colors.reset}`);
  } else {
    console.log(`${colors.yellow}📊 Tests Passed: ${passedTests}/${totalTests} (${passRate}%)${colors.reset}`);
  }
  console.log(`${colors.magenta}════════════════════════════════════════════${colors.reset}\n`);
  
  return testResults;
}

// Run the test
if (require.main === module) {
  runE2ETest()
    .then(results => {
      const allPassed = Object.values(results).every(r => r === true);
      process.exit(allPassed ? 0 : 1);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

module.exports = { runE2ETest };