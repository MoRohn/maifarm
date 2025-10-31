#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import WebSocket from 'ws';

const execAsync = promisify(exec);

// Configuration
const API_URL = 'http://localhost:4567';
const WS_URL = 'ws://localhost:4567';
const TEST_FARM_NAME = 'Test Agent Output Farm';
const TEST_PROMPT = 'echo "Hello from test agent" && sleep 2 && echo "Processing..." && sleep 2 && echo "Task completed"';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Create test farm with mock agents
async function createTestFarm() {
  log('\n=== Creating Test Farm ===', 'bright');
  
  const farmConfig = {
    name: TEST_FARM_NAME,
    config: {
      description: 'Testing agent terminal output',
      mode: 'quick',
      agents: [
        {
          name: 'Test Agent 1',
          prompt: TEST_PROMPT,
          provider: 'mock'
        },
        {
          name: 'Test Agent 2', 
          prompt: 'for i in {1..5}; do echo "Agent 2: Message $i"; sleep 1; done',
          provider: 'mock'
        }
      ],
      timeout: 60
    }
  };

  try {
    const response = await fetch(`${API_URL}/api/farms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(farmConfig)
    });

    if (!response.ok) {
      throw new Error(`Failed to create farm: ${response.statusText}`);
    }

    const farm = await response.json();
    log(`✓ Farm created: ${farm.id}`, 'green');
    return farm.id;
  } catch (error) {
    log(`✗ Failed to create farm: ${error.message}`, 'red');
    throw error;
  }
}

// Create mock tmux session with test output
async function createMockTmuxSession(farmId) {
  log('\n=== Setting Up Mock Tmux Session ===', 'bright');
  
  const sessionName = `farm-${farmId}`;
  
  try {
    // Kill existing session if it exists
    await execAsync(`tmux kill-session -t "${sessionName}" 2>/dev/null || true`);
    
    // Create new session with two panes
    await execAsync(`tmux new-session -d -s "${sessionName}" -n agents -x 120 -y 40`);
    await execAsync(`tmux split-window -t "${sessionName}:agents" -h`);
    await execAsync(`tmux select-layout -t "${sessionName}:agents" even-horizontal`);
    
    // Send test commands to each pane
    await execAsync(`tmux send-keys -t "${sessionName}:agents.0" "clear && echo '=== AGENT 1 TERMINAL ===' && echo 'Test Agent 1' && echo 'Status: Active' && echo '---' && ${TEST_PROMPT}" Enter`);
    await execAsync(`tmux send-keys -t "${sessionName}:agents.1" "clear && echo '=== AGENT 2 TERMINAL ===' && echo 'Test Agent 2' && echo 'Status: Active' && echo '---' && for i in {1..5}; do echo \\"Agent 2: Message \\$i\\"; sleep 1; done" Enter`);
    
    log(`✓ Tmux session created: ${sessionName}`, 'green');
    
    // Set up pipe-pane for output capture
    const maibarnPath = '/Users/rohnspringfield/maifarm/maibarn/terminals';
    await execAsync(`mkdir -p "${maibarnPath}"`);
    
    for (let i = 0; i < 2; i++) {
      const outputFile = `${maibarnPath}/${sessionName}_agent${i + 1}.log`;
      await execAsync(`tmux pipe-pane -t "${sessionName}:agents.${i}" -o "cat >> '${outputFile}'"`);
      log(`✓ Pipe-pane set up for Agent ${i + 1}: ${outputFile}`, 'green');
    }
    
    return sessionName;
  } catch (error) {
    log(`✗ Failed to create tmux session: ${error.message}`, 'red');
    throw error;
  }
}

// Connect to WebSocket and monitor terminal events
async function monitorTerminalOutput(farmId) {
  log('\n=== Monitoring Terminal Output via WebSocket ===', 'bright');
  
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket timeout'));
    }, 30000); // 30 second timeout
    
    const receivedOutput = new Map();
    
    ws.on('open', () => {
      log('✓ WebSocket connected', 'green');
      
      // Join farm terminal room
      ws.send(JSON.stringify({
        type: 'terminal:join',
        farmId: farmId
      }));
      
      // Request terminal output
      ws.send(JSON.stringify({
        type: 'terminal:request',
        farmId: farmId
      }));
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'terminal:output') {
          const { agentId, agentName, output, timestamp } = message.data;
          
          if (!receivedOutput.has(agentId)) {
            receivedOutput.set(agentId, []);
          }
          
          receivedOutput.get(agentId).push(output);
          
          log(`\n${colors.cyan}[${new Date(timestamp).toLocaleTimeString()}] ${agentName || agentId}:${colors.reset}`, 'cyan');
          console.log(output);
        } else if (message.type === 'terminal:joined') {
          log(`✓ Joined terminal room for farm ${farmId}`, 'green');
        } else if (message.type === 'error') {
          log(`✗ WebSocket error: ${message.message}`, 'red');
        }
      } catch (error) {
        log(`✗ Failed to parse message: ${error.message}`, 'red');
      }
    });
    
    ws.on('error', (error) => {
      clearTimeout(timeout);
      log(`✗ WebSocket error: ${error.message}`, 'red');
      reject(error);
    });
    
    ws.on('close', () => {
      clearTimeout(timeout);
      log('\n✓ WebSocket connection closed', 'yellow');
      
      // Display summary
      log('\n=== Terminal Output Summary ===', 'bright');
      for (const [agentId, outputs] of receivedOutput) {
        log(`Agent ${agentId}: ${outputs.length} messages received`, 'blue');
      }
      
      resolve(receivedOutput);
    });
    
    // Close connection after 15 seconds
    setTimeout(() => {
      log('\nClosing WebSocket connection...', 'yellow');
      ws.close();
    }, 15000);
  });
}

// Test direct tmux output capture
async function testDirectTmuxCapture(sessionName) {
  log('\n=== Testing Direct Tmux Capture ===', 'bright');
  
  try {
    for (let i = 0; i < 2; i++) {
      const { stdout } = await execAsync(`tmux capture-pane -t "${sessionName}:agents.${i}" -p`);
      log(`\n${colors.blue}Agent ${i + 1} Terminal Content:${colors.reset}`, 'blue');
      console.log(stdout);
    }
    
    log('✓ Direct tmux capture successful', 'green');
  } catch (error) {
    log(`✗ Failed to capture tmux output: ${error.message}`, 'red');
  }
}

// Main test function
async function runTest() {
  log('\n🚀 Starting Agent Output Test', 'bright');
  
  let farmId = null;
  let sessionName = null;
  
  try {
    // Create test farm
    farmId = await createTestFarm();
    
    // Create mock tmux session
    sessionName = await createMockTmuxSession(farmId);
    
    // Wait for output to be generated
    log('\nWaiting for agent output...', 'yellow');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Test direct tmux capture
    await testDirectTmuxCapture(sessionName);
    
    // Monitor WebSocket output
    await monitorTerminalOutput(farmId);
    
    log('\n✅ Test completed successfully!', 'green');
  } catch (error) {
    log(`\n❌ Test failed: ${error.message}`, 'red');
    console.error(error);
  } finally {
    // Cleanup
    if (sessionName) {
      log('\nCleaning up tmux session...', 'yellow');
      await execAsync(`tmux kill-session -t "${sessionName}" 2>/dev/null || true`);
    }
    
    if (farmId) {
      log('Cleaning up farm...', 'yellow');
      try {
        await fetch(`${API_URL}/api/farms/${farmId}`, { method: 'DELETE' });
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }
}

// Run the test
runTest().catch(console.error);