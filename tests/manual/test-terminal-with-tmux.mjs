import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { io } from 'socket.io-client';

// Configuration
const SERVER_URL = 'http://localhost:4567';
const TEST_FARM_ID = 'b5e40088-6875-44bc-b2ec-089ce0233e1f';
const TEST_SESSION_ID = 'farm-b5e40088';
const TERMINAL_DIR = `/Users/rohnspringfield/maifarm/var/maibarn/terminals/${TEST_FARM_ID}`;
const NUM_AGENTS = 3;

console.log('🚀 Starting Real Tmux Terminal Stream Test');
console.log('============================================');

// Helper to execute shell commands
function execAsync(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing: ${cmd}`, stderr);
        reject(error);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

// Create terminal directory
async function setupTerminalDir() {
  console.log('\n📁 Setting up terminal directory...');
  await fs.mkdir(TERMINAL_DIR, { recursive: true });
  console.log(`✅ Created directory: ${TERMINAL_DIR}`);
}

// Create tmux session with agents
async function createTmuxSession() {
  console.log('\n🖥️ Creating tmux session...');

  // Kill existing session if it exists
  try {
    await execAsync(`TMUX_TMPDIR=/tmp tmux kill-session -t ${TEST_SESSION_ID}`);
    console.log('  Killed existing session');
  } catch (e) {
    // Session doesn't exist, that's fine
  }

  // Create new session
  await execAsync(`TMUX_TMPDIR=/tmp tmux new-session -d -s ${TEST_SESSION_ID} -n agents`);
  console.log(`✅ Created tmux session: ${TEST_SESSION_ID}`);

  // Create additional panes for agents
  for (let i = 1; i < NUM_AGENTS; i++) {
    await execAsync(`TMUX_TMPDIR=/tmp tmux split-window -t ${TEST_SESSION_ID}:agents -h`);
  }

  // Balance panes layout
  await execAsync(`TMUX_TMPDIR=/tmp tmux select-layout -t ${TEST_SESSION_ID}:agents tiled`);
  console.log(`✅ Created ${NUM_AGENTS} panes for agents`);

  // Set up pipe-pane for each agent to write to terminal files
  for (let i = 0; i < NUM_AGENTS; i++) {
    const outputFile = path.join(TERMINAL_DIR, `agent-${i}.log`);

    // Create empty file first
    await fs.writeFile(outputFile, '');

    // Set up pipe-pane to capture output
    const pipeCmd = `TMUX_TMPDIR=/tmp tmux pipe-pane -t ${TEST_SESSION_ID}:agents.${i} -o "cat >> ${outputFile}"`;
    await execAsync(pipeCmd);
    console.log(`✅ Set up pipe-pane for agent-${i} -> ${outputFile}`);
  }

  // Send initial commands to each agent
  for (let i = 0; i < NUM_AGENTS; i++) {
    await execAsync(`TMUX_TMPDIR=/tmp tmux send-keys -t ${TEST_SESSION_ID}:agents.${i} "echo '[$(date +%Y-%m-%dT%H:%M:%S.%3NZ)] Agent ${i} initialized'" Enter`);
  }
}

// Simulate agent activity
async function simulateAgentActivity() {
  console.log('\n🤖 Starting agent activity simulation...');

  let iteration = 0;
  const interval = setInterval(async () => {
    for (let i = 0; i < NUM_AGENTS; i++) {
      const messages = [
        `Processing task ${iteration}...`,
        `Analyzing data chunk ${iteration * 10 + i}...`,
        `Executing operation ${iteration}-${i}...`,
        `Optimizing performance metrics...`,
        `Syncing with farm coordinator...`,
        `Harvesting results from workspace...`
      ];

      const message = messages[Math.floor(Math.random() * messages.length)];
      const cmd = `TMUX_TMPDIR=/tmp tmux send-keys -t ${TEST_SESSION_ID}:agents.${i} "echo '[$(date +%Y-%m-%dT%H:%M:%S.%3NZ)] Agent ${i} ${message}'" Enter`;

      try {
        await execAsync(cmd);
      } catch (e) {
        console.error(`Failed to send command to agent ${i}:`, e);
      }
    }

    iteration++;
    if (iteration >= 10) {
      clearInterval(interval);
      console.log('✅ Agent activity simulation complete');
    }
  }, 2000); // Every 2 seconds
}

// Connect to WebSocket and monitor
async function monitorWebSocket() {
  console.log('\n🔌 Connecting to WebSocket server...');

  const socket = io(SERVER_URL, {
    transports: ['websocket'],
    reconnection: true
  });

  return new Promise((resolve) => {
    let messagesReceived = 0;
    const startTime = Date.now();

    socket.on('connect', () => {
      console.log(`✅ Connected to server (Socket ID: ${socket.id})`);

      // Join terminal session
      console.log(`📡 Joining terminal session: ${TEST_SESSION_ID}`);
      socket.emit('terminal:join', {
        farmId: TEST_FARM_ID,
        sessionId: TEST_SESSION_ID
      });
    });

    socket.on('terminal:joined', (data) => {
      console.log(`✅ Joined terminal session:`, data);
    });

    socket.on('terminal:output', (data) => {
      messagesReceived++;
      console.log(`\n📨 Received terminal output [${messagesReceived}]:`);
      console.log(`   Session: ${data.sessionId || data.sessionName}`);
      console.log(`   Agent: ${data.agentId}`);
      console.log(`   Output: ${data.output?.substring(0, 100)}...`);

      // Success after receiving enough messages
      if (messagesReceived >= 10) {
        const elapsed = Date.now() - startTime;
        console.log(`\n✅ SUCCESS! Received ${messagesReceived} terminal outputs in ${elapsed}ms`);
        socket.disconnect();
        resolve();
      }
    });

    socket.on('terminal:ready', (data) => {
      console.log('📟 Terminal ready:', data);
    });

    socket.on('error', (error) => {
      console.error('❌ Socket error:', error);
    });

    socket.on('disconnect', (reason) => {
      console.log(`🔌 Disconnected: ${reason}`);
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (messagesReceived === 0) {
        console.log('\n⚠️ No terminal output received via WebSocket after 30 seconds');
        console.log('Checking if files are being updated...');

        // Check if files exist and have content
        Promise.all([0, 1, 2].map(async (i) => {
          const filePath = path.join(TERMINAL_DIR, `agent-${i}.log`);
          try {
            const stats = await fs.stat(filePath);
            const content = await fs.readFile(filePath, 'utf-8');
            console.log(`  agent-${i}.log: ${stats.size} bytes, ${content.split('\n').length} lines`);
          } catch (e) {
            console.log(`  agent-${i}.log: Not found or error`);
          }
        })).then(() => {
          socket.disconnect();
          resolve();
        });
      }
    }, 30000);
  });
}

// Cleanup
async function cleanup() {
  console.log('\n🧹 Cleaning up...');

  try {
    // Kill tmux session
    await execAsync(`TMUX_TMPDIR=/tmp tmux kill-session -t ${TEST_SESSION_ID}`);
    console.log('✅ Killed tmux session');
  } catch (e) {
    // Session might already be gone
  }
}

// Main execution
(async () => {
  try {
    // Setup
    await setupTerminalDir();
    await createTmuxSession();

    // Start activity simulation
    simulateAgentActivity();

    // Wait a bit for initial output
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Monitor WebSocket
    await monitorWebSocket();

    console.log('\n🎉 Test completed!');
    console.log('Check http://localhost:3000/harvest/' + TEST_FARM_ID + ' to see terminals');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
  } finally {
    await cleanup();
    process.exit(0);
  }
})();