#!/usr/bin/env node

/**
 * Quick test script to verify agent connection fixes
 * Run with: node test-agent-connection.js
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🚀 Testing MaiFarm Agent Connection Fixes');
console.log('==========================================\n');

const testFarmId = `test-${Date.now().toString(36)}`;
const coordinationDir = path.join(__dirname, 'maibarn', 'coordination');
const workspaceDir = path.join(__dirname, 'maibarn', 'workspaces', testFarmId);

// Ensure directories exist
fs.mkdirSync(coordinationDir, { recursive: true });
fs.mkdirSync(workspaceDir, { recursive: true });

console.log(`📁 Test Farm ID: ${testFarmId}`);
console.log(`📁 Coordination Dir: ${coordinationDir}`);
console.log(`📁 Workspace Dir: ${workspaceDir}\n`);

// Test 1: Launch orchestrator with new agent wrapper
console.log('Test 1: Launching orchestrator with agent wrapper...');

const orchestratorPath = path.join(__dirname, 'orchestrator.py');
const orchestratorArgs = [
  '--farm-id', testFarmId,
  '--num-agents', '2',
  '--provider', 'mock',
  '--prompt', 'Test prompt: Verify agent connections are working',
  '--workspace-dir', workspaceDir,
  '--coordination-dir', coordinationDir,
  '--max-runtime', '30',
  '--debug'
];

console.log(`Running: python3 ${orchestratorPath} ${orchestratorArgs.join(' ')}\n`);

const orchestrator = spawn('python3', [orchestratorPath, ...orchestratorArgs], {
  cwd: __dirname,
  env: {
    ...process.env,
    AI_PROVIDER: 'mock',
    PYTHONUNBUFFERED: '1'
  }
});

let agentsConnected = 0;
let agentsReady = 0;
let tasksAssigned = 0;

orchestrator.stdout.on('data', (data) => {
  const output = data.toString();
  process.stdout.write(`[ORCHESTRATOR] ${output}`);
  
  // Check for agent registration
  if (output.includes('Registered agent') || output.includes('agent registered')) {
    agentsConnected++;
    console.log(`✅ Agent registered (${agentsConnected}/2)`);
  }
  
  // Check for agent ready status
  if (output.includes('Agent ready') || output.includes('status: ready')) {
    agentsReady++;
    console.log(`✅ Agent ready (${agentsReady}/2)`);
  }
  
  // Check for task assignment
  if (output.includes('task assigned') || output.includes('Task assigned')) {
    tasksAssigned++;
    console.log(`✅ Task assigned (${tasksAssigned})`);
  }
});

orchestrator.stderr.on('data', (data) => {
  console.error(`[ERROR] ${data}`);
});

// Test 2: Check agent registration files
setTimeout(() => {
  console.log('\nTest 2: Checking agent registration files...');
  
  const registrationFile = path.join(coordinationDir, 'agent_registrations.json');
  if (fs.existsSync(registrationFile)) {
    const registrations = JSON.parse(fs.readFileSync(registrationFile, 'utf-8'));
    console.log(`✅ Found ${registrations.length} agent registrations`);
    
    registrations.forEach(reg => {
      console.log(`  - Agent: ${reg.agent_name} (${reg.agent_id})`);
      console.log(`    Status: ${reg.status}, Provider: ${reg.provider}`);
    });
  } else {
    console.log('❌ No agent registration file found');
  }
}, 5000);

// Test 3: Check agent status files
setTimeout(() => {
  console.log('\nTest 3: Checking agent status files...');
  
  const statusFiles = fs.readdirSync(coordinationDir)
    .filter(f => f.includes('_status.json'));
  
  console.log(`✅ Found ${statusFiles.length} agent status files`);
  
  statusFiles.forEach(file => {
    const status = JSON.parse(fs.readFileSync(path.join(coordinationDir, file), 'utf-8'));
    console.log(`  - ${status.agent_name}: ${status.status}`);
    console.log(`    Queue: ${status.queue_length}, Completed: ${status.completed_tasks}`);
  });
}, 10000);

// Test 4: Check task queue files
setTimeout(() => {
  console.log('\nTest 4: Checking task queue files...');
  
  const queueFiles = fs.readdirSync(coordinationDir)
    .filter(f => f.includes('_queue.json'));
  
  console.log(`✅ Found ${queueFiles.length} agent queue files`);
  
  queueFiles.forEach(file => {
    const queue = JSON.parse(fs.readFileSync(path.join(coordinationDir, file), 'utf-8'));
    console.log(`  - ${file}: ${queue.length} tasks in queue`);
  });
}, 12000);

// Test results summary
setTimeout(() => {
  console.log('\n==========================================');
  console.log('Test Results Summary:');
  console.log('==========================================');
  
  const success = agentsConnected >= 2 && agentsReady >= 2;
  
  console.log(`Agents Connected: ${agentsConnected}/2 ${agentsConnected >= 2 ? '✅' : '❌'}`);
  console.log(`Agents Ready: ${agentsReady}/2 ${agentsReady >= 2 ? '✅' : '❌'}`);
  console.log(`Tasks Assigned: ${tasksAssigned} ${tasksAssigned > 0 ? '✅' : '⚠️'}`);
  
  if (success) {
    console.log('\n✅ SUCCESS: Agent connection system is working!');
    console.log('Agents are connecting, registering, and ready to receive tasks.');
  } else {
    console.log('\n⚠️  PARTIAL SUCCESS: Some components working');
    console.log('Check the logs above for more details.');
  }
  
  // Kill the orchestrator
  console.log('\nCleaning up test farm...');
  orchestrator.kill('SIGTERM');
  
  // Clean tmux session
  const { exec } = require('child_process');
  exec(`tmux kill-session -t farm-${testFarmId} 2>/dev/null`, () => {
    console.log('Test complete!');
    process.exit(success ? 0 : 1);
  });
}, 25000);

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n\nInterrupted, cleaning up...');
  orchestrator.kill('SIGTERM');
  process.exit(1);
});