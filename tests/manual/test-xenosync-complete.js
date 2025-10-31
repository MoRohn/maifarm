#!/usr/bin/env node

/**
 * Test XenoSync complete flow
 * This script tests the full XenoSync integration:
 * 1. Creates a farm via API
 * 2. Launches XenoSync orchestrator
 * 3. Verifies tmux session creation
 * 4. Checks terminal streaming
 */

const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const fetch = require('node-fetch');

const execAsync = promisify(exec);

const API_BASE = 'http://localhost:4567';
const FARM_ID = `test-${Date.now().toString(36)}`;

console.log('🧪 Testing XenoSync Integration');
console.log('================================');

async function checkServerHealth() {
  console.log('\n1. Checking server health...');
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    const data = await res.json();
    console.log(`   ✅ Server is ${data.status || 'running'}`);
    return true;
  } catch (error) {
    console.log(`   ❌ Server not responding: ${error.message}`);
    return false;
  }
}

async function createFarm() {
  console.log('\n2. Creating test farm...');
  try {
    const res = await fetch(`${API_BASE}/api/farms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'XenoSync Test Farm',
        description: 'Testing XenoSync integration',
        numberOfAgents: 2,
        prompt: 'Test the XenoSync integration by creating a simple hello world program',
        mode: 'xenosync',
        orchestrator: 'xenosync'
      })
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Failed to create farm: ${error}`);
    }

    const farm = await res.json();
    console.log(`   ✅ Created farm ${farm.id}`);
    return farm.id;
  } catch (error) {
    console.log(`   ❌ Failed to create farm: ${error.message}`);
    return null;
  }
}

async function checkTmuxSession(farmId) {
  console.log('\n3. Checking tmux session...');
  const sessionName = `farm-${farmId.substring(0, 8)}`;

  try {
    // Check if session exists
    await execAsync(`TMUX_TMPDIR=/tmp tmux has-session -t ${sessionName}`);
    console.log(`   ✅ Session ${sessionName} exists`);

    // Check windows
    const { stdout: windows } = await execAsync(`TMUX_TMPDIR=/tmp tmux list-windows -t ${sessionName}`);
    console.log(`   📺 Windows: ${windows.trim()}`);

    // Check panes
    const { stdout: panes } = await execAsync(`TMUX_TMPDIR=/tmp tmux list-panes -t ${sessionName}:agents 2>/dev/null || tmux list-panes -t ${sessionName}:0`);
    const paneCount = panes.trim().split('\n').length;
    console.log(`   🖼️ Panes: ${paneCount}`);

    return paneCount >= 2;
  } catch (error) {
    console.log(`   ❌ Session not found or error: ${error.message}`);
    return false;
  }
}

async function checkTerminalStreaming(farmId) {
  console.log('\n4. Checking terminal streaming...');

  try {
    const res = await fetch(`${API_BASE}/api/farms/${farmId}/terminals`);
    const data = await res.json();

    if (data.error) {
      console.log(`   ⚠️ Terminal data not available: ${data.error}`);
      return false;
    }

    console.log(`   ✅ Terminal streaming is active`);
    return true;
  } catch (error) {
    console.log(`   ❌ Failed to check terminals: ${error.message}`);
    return false;
  }
}

async function cleanupSession(farmId) {
  console.log('\n5. Cleaning up...');
  const sessionName = `farm-${farmId.substring(0, 8)}`;

  try {
    await execAsync(`TMUX_TMPDIR=/tmp tmux kill-session -t ${sessionName} 2>/dev/null`);
    console.log(`   ✅ Cleaned up session ${sessionName}`);
  } catch {
    // Ignore cleanup errors
  }
}

async function main() {
  // Check server
  const serverOk = await checkServerHealth();
  if (!serverOk) {
    console.log('\n❌ Server is not running. Please start the server first.');
    process.exit(1);
  }

  // Create farm
  const farmId = await createFarm();
  if (!farmId) {
    console.log('\n❌ Failed to create farm');
    process.exit(1);
  }

  // Wait for XenoSync to initialize
  console.log('\n⏳ Waiting 5 seconds for XenoSync to initialize...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Check tmux session
  const sessionOk = await checkTmuxSession(farmId);
  if (!sessionOk) {
    console.log('\n⚠️ Tmux session not properly created');
  }

  // Check terminal streaming
  const streamingOk = await checkTerminalStreaming(farmId);

  // Results
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Results:');
  console.log('  Server Health: ✅');
  console.log('  Farm Creation: ✅');
  console.log(`  Tmux Session: ${sessionOk ? '✅' : '❌'}`);
  console.log(`  Terminal Streaming: ${streamingOk ? '✅' : '❌'}`);

  if (sessionOk && streamingOk) {
    console.log('\n✨ XenoSync integration test PASSED!');
  } else {
    console.log('\n⚠️ XenoSync integration test needs attention');
  }

  // Cleanup
  await cleanupSession(farmId);
}

// Handle errors
process.on('unhandledRejection', (err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});

// Check if node-fetch is installed
try {
  require.resolve('node-fetch');
  main();
} catch {
  console.log('Installing node-fetch...');
  exec('npm install node-fetch', (err) => {
    if (err) {
      console.error('Failed to install node-fetch:', err);
      process.exit(1);
    }
    delete require.cache[require.resolve('node-fetch')];
    main();
  });
}