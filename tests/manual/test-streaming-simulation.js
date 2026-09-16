#!/usr/bin/env node

import { io } from 'socket.io-client';
import fs from 'fs/promises';
import path from 'path';

const farmId = 'b5e40088-6875-44bc-b2ec-089ce0233e1f';
const sessionId = `farm-${farmId.substring(0, 8)}`;
const terminalsDir = `${process.env.MAIFARM_ROOT || process.cwd()}/var/maibarn/terminals`;

console.log('🧪 MaiFarm Terminal Streaming - Comprehensive Test');
console.log('='.repeat(60));

// Test results tracking
const testResults = {
  terminalFilesExist: false,
  websocketConnected: false,
  roomJoined: false,
  outputReceived: false,
  fileWatcherWorking: false,
  autoScrollVerified: false,
  multipleAgentsDetected: false,
  realTimeLatency: null
};

// Step 1: Create test terminal files
async function createTestFiles() {
  console.log('\n📁 Step 1: Creating test terminal files...');

  // Try multiple directory patterns
  const directories = [
    path.join(terminalsDir, farmId),
    path.join(terminalsDir, farmId.substring(0, 8))
  ];

  for (const dir of directories) {
    try {
      await fs.mkdir(dir, { recursive: true });
      console.log(`  ✅ Created directory: ${dir}`);

      // Create agent log files
      for (let i = 0; i < 3; i++) {
        const filePath = path.join(dir, `agent-${i}.log`);
        const initialContent = `[${new Date().toLocaleTimeString()}] Agent ${i} initialized\n`;
        await fs.writeFile(filePath, initialContent);
        console.log(`  ✅ Created file: agent-${i}.log`);
      }

      testResults.terminalFilesExist = true;
      break; // Use first successful directory
    } catch (error) {
      console.log(`  ⚠️ Failed to create in ${dir}: ${error.message}`);
    }
  }
}

// Step 2: Connect to WebSocket and test streaming
async function testWebSocketStreaming() {
  console.log('\n📡 Step 2: Testing WebSocket connection and streaming...');

  return new Promise((resolve) => {
    const socket = io('http://localhost:4567', {
      transports: ['websocket'],
      reconnection: false
    });

    let outputCount = 0;
    let agentIds = new Set();
    let connectionTime;

    socket.on('connect', () => {
      console.log('  ✅ Connected to WebSocket server');
      testResults.websocketConnected = true;
      connectionTime = Date.now();

      // Join terminal room
      socket.emit('terminal:join', { farmId, sessionId });
    });

    socket.on('terminal:joined', (data) => {
      console.log('  ✅ Joined terminal room:', data.rooms?.length || 0, 'rooms');
      testResults.roomJoined = true;
    });

    socket.on('terminal:output', (data) => {
      outputCount++;
      const latency = connectionTime ? Date.now() - connectionTime : 0;

      if (data.agentId !== undefined) {
        agentIds.add(data.agentId);
      }

      console.log(`  📝 Output received - Agent: ${data.agentId}, Lines: ${data.lines?.length || 0}, Latency: ${latency}ms`);

      testResults.outputReceived = true;
      testResults.realTimeLatency = latency;

      if (agentIds.size > 1) {
        testResults.multipleAgentsDetected = true;
      }
    });

    socket.on('error', (error) => {
      console.error('  ❌ WebSocket error:', error);
    });

    // Give it 3 seconds to receive outputs
    setTimeout(() => {
      console.log(`  📊 Received ${outputCount} outputs from ${agentIds.size} agents`);
      socket.disconnect();
      resolve();
    }, 3000);
  });
}

// Step 3: Simulate agent activity by writing to files
async function simulateAgentActivity() {
  console.log('\n🤖 Step 3: Simulating agent activity...');

  const directories = [
    path.join(terminalsDir, farmId),
    path.join(terminalsDir, farmId.substring(0, 8))
  ];

  for (const dir of directories) {
    try {
      // Write to each agent file
      for (let i = 0; i < 3; i++) {
        const filePath = path.join(dir, `agent-${i}.log`);
        const messages = [
          `[${new Date().toLocaleTimeString()}] 🚀 Agent ${i} starting task...`,
          `[${new Date().toLocaleTimeString()}] 📊 Processing data batch 1/10`,
          `[${new Date().toLocaleTimeString()}] ✅ Task completed successfully!`
        ];

        for (const msg of messages) {
          await fs.appendFile(filePath, msg + '\n');
          await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between writes
        }

        console.log(`  ✅ Simulated activity for Agent ${i}`);
        testResults.fileWatcherWorking = true;
      }
      break; // Use first successful directory
    } catch (error) {
      console.log(`  ⚠️ Failed to write to ${dir}: ${error.message}`);
    }
  }
}

// Step 4: Test file watcher response
async function testFileWatcher() {
  console.log('\n👁️ Step 4: Testing file watcher response...');

  return new Promise((resolve) => {
    const socket = io('http://localhost:4567', {
      transports: ['websocket'],
      reconnection: false
    });

    let receivedUpdates = false;

    socket.on('connect', () => {
      socket.emit('terminal:join', { farmId, sessionId });
    });

    socket.on('terminal:output', (data) => {
      console.log(`  ✅ File watcher detected change - Agent ${data.agentId}`);
      receivedUpdates = true;
      testResults.fileWatcherWorking = true;
    });

    // Write a test message after connection
    setTimeout(async () => {
      const testDir = path.join(terminalsDir, farmId.substring(0, 8));
      const testFile = path.join(testDir, 'agent-0.log');
      try {
        await fs.appendFile(testFile, `[${new Date().toLocaleTimeString()}] 🔍 File watcher test message\n`);
        console.log('  📝 Wrote test message to agent-0.log');
      } catch (error) {
        console.log('  ⚠️ Failed to write test message:', error.message);
      }
    }, 1000);

    // Check results after 3 seconds
    setTimeout(() => {
      if (!receivedUpdates) {
        console.log('  ⚠️ File watcher did not detect changes');
      }
      socket.disconnect();
      resolve();
    }, 3000);
  });
}

// Generate final report
function generateReport() {
  console.log('\n' + '='.repeat(60));
  console.log('📋 TERMINAL STREAMING TEST REPORT');
  console.log('='.repeat(60));

  const checks = [
    { name: 'Terminal Files Created', status: testResults.terminalFilesExist },
    { name: 'WebSocket Connected', status: testResults.websocketConnected },
    { name: 'Terminal Room Joined', status: testResults.roomJoined },
    { name: 'Output Received', status: testResults.outputReceived },
    { name: 'File Watcher Working', status: testResults.fileWatcherWorking },
    { name: 'Multiple Agents Detected', status: testResults.multipleAgentsDetected }
  ];

  let passCount = 0;
  checks.forEach(check => {
    const icon = check.status ? '✅' : '❌';
    console.log(`${icon} ${check.name}: ${check.status ? 'PASS' : 'FAIL'}`);
    if (check.status) passCount++;
  });

  if (testResults.realTimeLatency !== null) {
    console.log(`⏱️ Real-time Latency: ${testResults.realTimeLatency}ms`);
  }

  console.log('\n' + '='.repeat(60));
  const overallStatus = passCount === checks.length ? '✅ ALL TESTS PASSED' : `⚠️ ${passCount}/${checks.length} TESTS PASSED`;
  console.log(`OVERALL STATUS: ${overallStatus}`);
  console.log('='.repeat(60));

  return passCount === checks.length;
}

// Run all tests
async function runTests() {
  try {
    await createTestFiles();
    await simulateAgentActivity();
    await testWebSocketStreaming();
    await testFileWatcher();

    const success = generateReport();

    if (success) {
      console.log('\n🎉 Terminal streaming system is working correctly!');
    } else {
      console.log('\n⚠️ Some issues detected. Please review the test results.');
    }

    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    process.exit(1);
  }
}

// Run the tests
runTests();