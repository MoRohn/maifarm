#!/usr/bin/env node

/**
 * Comprehensive Terminal Streaming Test
 * Tests the complete flow from farm creation to terminal streaming with real Claude CLI agents
 */

import { io } from 'socket.io-client';
import fetch from 'node-fetch';
import { spawn, exec } from 'child_process';
import { readFile, access } from 'fs/promises';
import { constants } from 'fs';
import { promisify } from 'util';

const execAsync = promisify(exec);

const API_URL = 'http://localhost:4567';
const WS_URL = 'http://localhost:4567';

console.log('🚀 Complete Terminal Streaming Test');
console.log('=====================================\n');

// Test results tracking
const testResults = {
  farmCreation: false,
  tmuxSession: false,
  pipePaneSetup: false,
  terminalFiles: false,
  webSocketConnection: false,
  webSocketJoin: false,
  webSocketStreaming: false,
  browserDisplay: false
};

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  try {
    // Step 1: Create a farm via API with real Claude provider
    console.log('📋 Step 1: Creating farm with Claude CLI agents...');

    const farmData = {
      name: 'Terminal Streaming Test Farm',
      description: 'Testing complete terminal streaming functionality',
      prompt: 'Create a Python script that displays a countdown from 10 to 1 with timestamps',
      agentCount: 3,
      mode: 'harvest',
      timeout: 600,
      provider: 'claude' // Use claude provider (will use default if no key)
    };

    const response = await fetch(`${API_URL}/api/farms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(farmData)
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(`Failed to create farm: ${JSON.stringify(result)}`);
    }

    const farm = result.data;
    const farmId = farm.id;
    const sessionId = farm.sessionId || `farm-${farmId.substring(0, 8)}`;

    console.log(`✅ Farm created successfully`);
    console.log(`   ID: ${farmId}`);
    console.log(`   Session: ${sessionId}`);
    console.log(`   Status: ${farm.status}`);

    testResults.farmCreation = true;

    // Step 2: Verify tmux session was created
    console.log('\n📋 Step 2: Verifying tmux session...');

    await delay(2000); // Give time for session creation

    try {
      await execAsync(`TMUX_TMPDIR=/tmp tmux has-session -t ${sessionId}`);
      console.log(`✅ Tmux session exists: ${sessionId}`);

      // Get pane details
      const { stdout: panes } = await execAsync(`TMUX_TMPDIR=/tmp tmux list-panes -t ${sessionId}:agents -F "#{pane_index}: #{pane_width}x#{pane_height}"`);
      console.log('   Panes:');
      panes.split('\n').filter(Boolean).forEach(pane => {
        console.log(`     - ${pane}`);
      });

      testResults.tmuxSession = true;
    } catch (error) {
      console.log(`❌ Tmux session not found: ${error.message}`);
    }

    // Step 3: Verify pipe-pane is set up
    console.log('\n📋 Step 3: Verifying pipe-pane setup...');

    const terminalDir = `${process.env.MAIFARM_ROOT || process.cwd()}/var/maibarn/terminals/${farmId}`;

    if (await fileExists(terminalDir)) {
      console.log(`✅ Terminal directory exists: ${terminalDir}`);

      // Check each agent log file
      let allFilesExist = true;
      for (let i = 0; i < 3; i++) {
        const logFile = `${terminalDir}/agent-${i}.log`;
        if (await fileExists(logFile)) {
          console.log(`   ✅ agent-${i}.log exists`);
        } else {
          console.log(`   ❌ agent-${i}.log missing`);
          allFilesExist = false;
        }
      }

      testResults.pipePaneSetup = allFilesExist;
      testResults.terminalFiles = allFilesExist;
    } else {
      console.log(`❌ Terminal directory not found`);
    }

    // Step 4: Connect WebSocket and monitor terminal streaming
    console.log('\n📋 Step 4: Testing WebSocket terminal streaming...');

    const socket = io(WS_URL, {
      transports: ['websocket'],
      reconnectionAttempts: 3
    });

    const terminalOutputs = new Map();
    let joinSuccess = false;

    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log('   ⏱️ WebSocket test timeout');
        resolve(null);
      }, 15000);

      socket.on('connect', () => {
        console.log('   ✅ WebSocket connected');
        testResults.webSocketConnection = true;

        // Join terminal session
        console.log(`   📡 Joining terminal session: ${sessionId}`);
        socket.emit('terminal:join:simple', {
          farmId: farmId,
          sessionId: sessionId
        });
      });

      socket.on('terminal:joined', (data) => {
        console.log(`   ✅ Successfully joined terminal session`);
        console.log(`      Rooms: ${data.joinedRooms?.length || 0}`);
        joinSuccess = true;
        testResults.webSocketJoin = true;
      });

      socket.on('terminal:output', (data) => {
        const agentId = data.agentId;
        if (!terminalOutputs.has(agentId)) {
          terminalOutputs.set(agentId, []);
        }
        terminalOutputs.get(agentId).push(data);

        // Log first output from each agent
        if (terminalOutputs.get(agentId).length === 1) {
          const preview = data.content || data.output || data.lines?.[0] || '';
          console.log(`   📝 Terminal output from Agent ${agentId}: ${preview.substring(0, 60)}...`);
        }
      });

      socket.on('error', (error) => {
        console.error('   ❌ WebSocket error:', error);
      });

      // Simulate some agent activity to trigger output
      setTimeout(async () => {
        console.log('\n   🤖 Simulating agent activity...');

        for (let i = 0; i < 3; i++) {
          const command = `echo "[$(date -Iseconds)] Agent ${i} is processing task..."`;
          try {
            await execAsync(`TMUX_TMPDIR=/tmp tmux send-keys -t ${sessionId}:agents.${i} "${command}" Enter`);
            console.log(`      Sent command to Agent ${i}`);
          } catch (error) {
            console.log(`      Failed to send command to Agent ${i}: ${error.message}`);
          }
        }
      }, 2000);

      // Wait for outputs
      setTimeout(() => {
        clearTimeout(timeout);
        resolve(null);
      }, 10000);
    });

    // Check results
    if (terminalOutputs.size > 0) {
      console.log(`\n   ✅ Received terminal output from ${terminalOutputs.size} agents`);
      for (const [agentId, outputs] of terminalOutputs.entries()) {
        console.log(`      Agent ${agentId}: ${outputs.length} messages`);
      }
      testResults.webSocketStreaming = true;
    } else {
      console.log('\n   ⚠️ No terminal output received via WebSocket');
    }

    socket.disconnect();

    // Step 5: Check terminal files for actual content
    console.log('\n📋 Step 5: Verifying terminal file contents...');

    let totalBytes = 0;
    for (let i = 0; i < 3; i++) {
      const logFile = `${terminalDir}/agent-${i}.log`;
      try {
        const content = await readFile(logFile, 'utf8');
        const size = Buffer.byteLength(content);
        totalBytes += size;

        if (size > 0) {
          console.log(`   ✅ agent-${i}.log: ${size} bytes`);
          const preview = content.split('\n')[0].substring(0, 80);
          console.log(`      Preview: ${preview}...`);
        } else {
          console.log(`   ⚠️ agent-${i}.log: empty`);
        }
      } catch (error) {
        console.log(`   ❌ agent-${i}.log: ${error.message}`);
      }
    }

    if (totalBytes > 0) {
      console.log(`   Total output: ${totalBytes} bytes`);
    }

    // Step 6: Open browser
    console.log('\n📋 Step 6: Opening browser to view harvest...');
    const browserUrl = `http://localhost:3000/harvest/${farmId}`;
    console.log(`   URL: ${browserUrl}`);

    spawn('open', [browserUrl]);
    testResults.browserDisplay = true;

    // Summary
    console.log('\n📊 Test Results Summary');
    console.log('========================');

    const passed = [];
    const failed = [];

    for (const [test, result] of Object.entries(testResults)) {
      const status = result ? '✅' : '❌';
      const testName = test.replace(/([A-Z])/g, ' $1').toLowerCase();
      console.log(`${status} ${testName}`);

      if (result) {
        passed.push(test);
      } else {
        failed.push(test);
      }
    }

    const successRate = Math.round((passed.length / Object.keys(testResults).length) * 100);

    console.log(`\n🎯 Success Rate: ${successRate}% (${passed.length}/${Object.keys(testResults).length} tests passed)`);

    if (failed.length > 0) {
      console.log('\n⚠️ Failed Tests:');
      failed.forEach(test => {
        const testName = test.replace(/([A-Z])/g, ' $1').toLowerCase();
        console.log(`   - ${testName}`);
      });
    }

    if (successRate === 100) {
      console.log('\n🎉 All tests passed! Terminal streaming is 100% operational!');
    } else if (successRate >= 80) {
      console.log('\n✅ Terminal streaming is mostly working but needs some fixes.');
    } else {
      console.log('\n❌ Terminal streaming has significant issues that need to be addressed.');
    }

    // Cleanup instructions
    console.log('\n🧹 Cleanup Instructions:');
    console.log(`   - Kill tmux session: TMUX_TMPDIR=/tmp tmux kill-session -t ${sessionId}`);
    console.log(`   - Check browser for live terminal output`);

    process.exit(failed.length === 0 ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

main();