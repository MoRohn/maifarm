import { io } from 'socket.io-client';
import { promises as fs } from 'fs';
import path from 'path';

// Configuration
const SERVER_URL = 'http://localhost:4567';
const TEST_FARM_ID = 'b5e40088-6875-44bc-b2ec-089ce0233e1f';
const TEST_SESSION_ID = 'farm-b5e40088';
const TERMINAL_DIR = `/Users/rohnspringfield/maifarm/var/maibarn/terminals/${TEST_FARM_ID}`;

console.log('🚀 Starting WebSocket Terminal Stream Test');
console.log('============================================');

// Create terminal directory and test files
async function setupTestFiles() {
  console.log('\n📁 Setting up test files...');

  // Create directory
  await fs.mkdir(TERMINAL_DIR, { recursive: true });
  console.log(`✅ Created directory: ${TERMINAL_DIR}`);

  // Create initial log files
  for (let i = 0; i < 3; i++) {
    const filePath = path.join(TERMINAL_DIR, `agent-${i}.log`);
    await fs.writeFile(filePath, `[${new Date().toISOString()}] Agent ${i} initialized\n`);
    console.log(`✅ Created file: agent-${i}.log`);
  }
}

// Connect to WebSocket server
async function testWebSocket() {
  console.log('\n🔌 Connecting to WebSocket server...');

  const socket = io(SERVER_URL, {
    transports: ['websocket'],
    reconnection: true
  });

  return new Promise((resolve, reject) => {
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

      // Now update the files to trigger the file watcher
      console.log('\n📝 Updating terminal files to trigger file watcher...');
      updateFiles();
    });

    socket.on('terminal:output', (data) => {
      messagesReceived++;
      console.log(`\n📨 Received terminal output [${messagesReceived}]:`);
      console.log(`   Session: ${data.sessionId || data.sessionName}`);
      console.log(`   Agent: ${data.agentId}`);
      console.log(`   Output: ${data.output?.substring(0, 100)}...`);

      // Success after receiving some messages
      if (messagesReceived >= 3) {
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

    // Update files periodically to generate events
    async function updateFiles() {
      for (let round = 0; round < 5; round++) {
        await new Promise(resolve => setTimeout(resolve, 1000));

        for (let i = 0; i < 3; i++) {
          const filePath = path.join(TERMINAL_DIR, `agent-${i}.log`);
          const newLine = `[${new Date().toISOString()}] Agent ${i} processing task ${round}...\n`;
          await fs.appendFile(filePath, newLine);
          console.log(`   Updated agent-${i}.log (round ${round})`);
        }

        if (messagesReceived === 0 && round === 2) {
          console.log('\n⚠️  No terminal output received yet, checking server connection...');
        }
      }

      // Timeout if no messages received
      setTimeout(() => {
        if (messagesReceived === 0) {
          console.log('\n❌ TIMEOUT: No terminal output received after 10 seconds');
          socket.disconnect();
          reject(new Error('No terminal output received'));
        }
      }, 10000);
    }
  });
}

// Run the test
(async () => {
  try {
    await setupTestFiles();
    await testWebSocket();

    console.log('\n🎉 Test completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
})();