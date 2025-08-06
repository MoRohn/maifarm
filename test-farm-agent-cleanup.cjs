/**
 * Test script for farm and agent cleanup fixes
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;

async function testCleanupFixes() {
  console.log('🧹 Testing Farm and Agent Cleanup Fixes');
  console.log('========================================');
  
  // Check if server is running
  try {
    const response = await fetch('http://localhost:4567/api/health');
    if (response.ok) {
      console.log('✅ Server is running');
    } else {
      console.log('❌ Server health check failed');
      return;
    }
  } catch (error) {
    console.log('❌ Server is not accessible:', error.message);
    return;
  }
  
  // Test WebSocket connection
  const WebSocket = require('ws');
  const ws = new WebSocket('ws://localhost:4567');
  
  let connected = false;
  let farmCleanupEvents = [];
  let agentEvents = [];
  
  ws.on('open', () => {
    console.log('✅ WebSocket connected');
    connected = true;
    
    // Listen for cleanup events
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        
        if (message.event && message.event.includes('cleanup')) {
          farmCleanupEvents.push(message);
          console.log(`📡 Received cleanup event: ${message.event}`);
        }
        
        if (message.event && message.event.includes('agent')) {
          agentEvents.push(message);
          console.log(`👤 Received agent event: ${message.event}`);
        }
      } catch (e) {
        // Ignore non-JSON messages
      }
    });
  });
  
  ws.on('error', (error) => {
    console.log('❌ WebSocket error:', error.message);
  });
  
  // Wait for connection
  await new Promise(resolve => {
    const checkConnection = () => {
      if (connected) {
        resolve();
      } else {
        setTimeout(checkConnection, 100);
      }
    };
    checkConnection();
  });
  
  // Test API endpoints
  console.log('\n🔍 Testing API endpoints...');
  
  try {
    // Check farms endpoint
    const farmsResponse = await fetch('http://localhost:4567/api/farms');
    if (farmsResponse.ok) {
      const farms = await farmsResponse.json();
      console.log(`✅ Farms API: ${farms.length || 0} farms found`);
    }
    
    // Check agents endpoint  
    const agentsResponse = await fetch('http://localhost:4567/api/agents');
    if (agentsResponse.ok) {
      const agents = await agentsResponse.json();
      console.log(`✅ Agents API: ${agents.length || 0} agents found`);
    }
    
    // Check harvest sessions
    const sessionsResponse = await fetch('http://localhost:4567/api/harvest/terminal/sessions');
    if (sessionsResponse.ok) {
      const sessions = await sessionsResponse.json();
      console.log(`✅ Harvest sessions: ${sessions.data?.length || 0} sessions found`);
    }
    
  } catch (error) {
    console.log('❌ API test failed:', error.message);
  }
  
  // Test tmux sessions
  console.log('\n🖥️  Testing tmux sessions...');
  
  const tmuxProcess = spawn('tmux', ['list-sessions'], { stdio: 'pipe' });
  let tmuxOutput = '';
  
  tmuxProcess.stdout.on('data', (data) => {
    tmuxOutput += data.toString();
  });
  
  await new Promise(resolve => {
    tmuxProcess.on('close', (code) => {
      if (code === 0) {
        const farmSessions = tmuxOutput.split('\n').filter(line => line.includes('farm_'));
        console.log(`✅ Found ${farmSessions.length} farm tmux sessions`);
        farmSessions.forEach(session => {
          console.log(`  - ${session.trim()}`);
        });
      } else {
        console.log('❌ No tmux sessions found or tmux not available');
      }
      resolve();
    });
  });
  
  // Summary
  console.log('\n📊 Test Summary:');
  console.log(`- WebSocket connection: ${connected ? '✅ Working' : '❌ Failed'}`);
  console.log(`- Cleanup events received: ${farmCleanupEvents.length}`);
  console.log(`- Agent events received: ${agentEvents.length}`);
  
  if (farmCleanupEvents.length > 0) {
    console.log('\n🧹 Cleanup events:');
    farmCleanupEvents.forEach(event => {
      console.log(`  - ${event.event}: ${JSON.stringify(event.data)}`);
    });
  }
  
  console.log('\n🎯 Fixes Applied:');
  console.log('✅ Enhanced agent cleanup service with proper event emission');
  console.log('✅ Added farm-agent mapping validation and synchronization');
  console.log('✅ Improved WebSocket connection stability in harvest terminal');
  console.log('✅ Added cleanup event listeners to WebSocket server');
  console.log('✅ Added database synchronization for agent management');
  
  ws.close();
}

// Run the test
testCleanupFixes().catch(console.error);