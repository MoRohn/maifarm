#!/usr/bin/env node
/**
 * Comprehensive test for terminal streaming with XenoSync
 * Tests the complete flow from farm launch to terminal display
 */

const axios = require('axios');
const io = require('socket.io-client');
const fs = require('fs');
const path = require('path');

const API_BASE = 'http://localhost:4567';
const testResults = {
  farmCreation: { status: 'pending', details: null },
  tmuxSession: { status: 'pending', details: null },
  pipePaneSetup: { status: 'pending', details: null },
  fileCapture: { status: 'pending', details: null },
  websocketEvents: { status: 'pending', details: null }
};

let socket;
let farmId;
let sessionId;
const terminalEvents = [];
const capturedOutput = [];

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testFarmCreation() {
  console.log('\n📋 Step 1: Creating farm with XenoSync orchestrator...');

  try {
    const response = await axios.post(`${API_BASE}/api/farms`, {
      name: 'Terminal Stream Test Farm',
      config: {
        prompt: 'Test the terminal streaming system by outputting test messages every 2 seconds',
        numberOfAgents: 3,
        orchestrator: 'xenosync',
        timeout: 600 // 10 minutes
      }
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    farmId = response.data.farm?.id;
    sessionId = `farm-${farmId?.substring(0, 8)}`;

    testResults.farmCreation = {
      status: 'passed',
      details: { farmId, sessionId, status: response.data.farm?.status }
    };

    console.log(`✅ Farm created: ${farmId}`);
    console.log(`   Session ID: ${sessionId}`);
    return true;
  } catch (error) {
    testResults.farmCreation = {
      status: 'failed',
      details: error.response?.data || error.message
    };
    console.error(`❌ Farm creation failed: ${error.message}`);
    return false;
  }
}

async function testTmuxSession() {
  console.log('\n🖥️  Step 2: Verifying tmux session creation...');

  // Wait for session to be created
  await delay(5000);

  const { exec } = require('child_process');

  return new Promise((resolve) => {
    exec(`TMUX_TMPDIR=/tmp tmux list-sessions 2>/dev/null | grep ${sessionId}`, (error, stdout) => {
      if (!error && stdout.includes(sessionId)) {
        // Check panes
        exec(`TMUX_TMPDIR=/tmp tmux list-panes -t ${sessionId}:agents 2>/dev/null`, (error2, stdout2) => {
          const paneCount = stdout2.trim().split('\n').filter(l => l).length;

          testResults.tmuxSession = {
            status: 'passed',
            details: { session: sessionId, panes: paneCount }
          };

          console.log(`✅ Tmux session exists with ${paneCount} panes`);
          resolve(true);
        });
      } else {
        testResults.tmuxSession = {
          status: 'failed',
          details: 'Session not found'
        };
        console.error('❌ Tmux session not found');
        resolve(false);
      }
    });
  });
}

async function testPipePaneSetup() {
  console.log('\n🔧 Step 3: Setting up pipe-pane for terminal capture...');

  try {
    // Trigger terminal streaming setup
    const response = await axios.post(`${API_BASE}/api/terminal/start-streaming`, {
      farmId,
      sessionId
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    testResults.pipePaneSetup = {
      status: 'passed',
      details: response.data
    };

    console.log('✅ Pipe-pane setup triggered');
    return true;
  } catch (error) {
    testResults.pipePaneSetup = {
      status: 'failed',
      details: error.message
    };
    console.error(`❌ Pipe-pane setup failed: ${error.message}`);
    return false;
  }
}

async function testWebSocketConnection() {
  console.log('\n🔌 Step 4: Connecting WebSocket and monitoring events...');

  return new Promise((resolve) => {
    socket = io(API_BASE, {
      transports: ['websocket'],
      reconnection: true
    });

    socket.on('connect', () => {
      console.log('✅ WebSocket connected');

      // Join farm room
      socket.emit('terminal:join', { farmId });
      console.log(`   Joined farm room: ${farmId}`);
    });

    socket.on('terminal:joined', (data) => {
      terminalEvents.push({ type: 'terminal:joined', data });
      console.log('   Received terminal:joined event');
    });

    socket.on('terminal:output', (data) => {
      terminalEvents.push({ type: 'terminal:output', data });
      capturedOutput.push(data);
      console.log(`   📝 Terminal output from ${data.agentId}: ${data.content.substring(0, 50)}...`);
    });

    socket.on('farm:status', (data) => {
      console.log(`   Farm status: ${data.status}`);
    });

    // Wait for events
    setTimeout(() => {
      testResults.websocketEvents = {
        status: terminalEvents.length > 0 ? 'passed' : 'failed',
        details: {
          totalEvents: terminalEvents.length,
          outputEvents: capturedOutput.length
        }
      };
      resolve(terminalEvents.length > 0);
    }, 15000); // Wait 15 seconds for events
  });
}

async function testFileCapture() {
  console.log('\n📁 Step 5: Checking terminal output files...');

  const terminalDir = path.join(path.join(process.env.MAIFARM_ROOT || process.cwd(), 'var/maibarn/terminals'), farmId);

  try {
    if (fs.existsSync(terminalDir)) {
      const files = fs.readdirSync(terminalDir);
      const logFiles = files.filter(f => f.endsWith('.log'));

      let totalContent = '';
      for (const file of logFiles) {
        const content = fs.readFileSync(path.join(terminalDir, file), 'utf8');
        totalContent += content;
        console.log(`   Found ${file}: ${content.length} bytes`);
      }

      testResults.fileCapture = {
        status: totalContent.length > 0 ? 'passed' : 'failed',
        details: {
          files: logFiles.length,
          totalBytes: totalContent.length
        }
      };

      if (totalContent.length > 0) {
        console.log(`✅ Terminal output captured to ${logFiles.length} files`);
        return true;
      } else {
        console.log('⚠️  Files exist but are empty');
        return false;
      }
    } else {
      testResults.fileCapture = {
        status: 'failed',
        details: 'Terminal directory not created'
      };
      console.error('❌ Terminal directory not found');
      return false;
    }
  } catch (error) {
    testResults.fileCapture = {
      status: 'failed',
      details: error.message
    };
    console.error(`❌ File check failed: ${error.message}`);
    return false;
  }
}

async function sendTestMessagesToAgents() {
  console.log('\n💬 Sending test messages to agents...');

  const { exec } = require('child_process');

  for (let i = 0; i < 3; i++) {
    const message = `Test message ${Date.now()} from test script to agent ${i}`;
    const cmd = `TMUX_TMPDIR=/tmp tmux send-keys -t ${sessionId}:agents.${i} -l "${message}" Enter`;

    exec(cmd, (error) => {
      if (!error) {
        console.log(`   Sent to agent ${i}: ${message}`);
      }
    });

    await delay(1000);
  }
}

async function runComprehensiveTest() {
  console.log('🚀 Starting Comprehensive Terminal Streaming Test');
  console.log('=' . repeat(60));

  try {
    // Step 1: Create farm
    if (!await testFarmCreation()) {
      throw new Error('Farm creation failed');
    }

    // Step 2: Verify tmux session
    if (!await testTmuxSession()) {
      console.warn('⚠️  Tmux session not ready, waiting...');
      await delay(5000);
      await testTmuxSession();
    }

    // Step 3: Setup pipe-pane
    await testPipePaneSetup();

    // Step 4: Connect WebSocket
    const websocketPromise = testWebSocketConnection();

    // Step 5: Send test messages
    await delay(3000);
    await sendTestMessagesToAgents();

    // Wait for WebSocket events
    await websocketPromise;

    // Step 6: Check files
    await testFileCapture();

    // Print results
    console.log('\n' + '=' . repeat(60));
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('=' . repeat(60));

    for (const [test, result] of Object.entries(testResults)) {
      const emoji = result.status === 'passed' ? '✅' :
                    result.status === 'failed' ? '❌' : '⏳';
      console.log(`  ${test}: ${emoji} ${result.status.toUpperCase()}`);
      if (result.details) {
        console.log(`    Details: ${JSON.stringify(result.details, null, 2)}`);
      }
    }

    // Overall result
    const allPassed = Object.values(testResults).every(r => r.status === 'passed');
    console.log('\n' + '=' . repeat(60));
    if (allPassed) {
      console.log('🎉 ALL TESTS PASSED - Terminal Streaming is 100% Operational!');
    } else {
      console.log('⚠️  Some tests failed - Terminal streaming needs attention');
    }

    // Cleanup
    if (socket) {
      socket.disconnect();
    }

    process.exit(allPassed ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    if (socket) {
      socket.disconnect();
    }
    process.exit(1);
  }
}

// Run the test
runComprehensiveTest();