#!/usr/bin/env node

/**
 * Test script to verify that Total Agents only counts agents from running farms
 */

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:4567';

async function testAgentCounting() {
  console.log('🧪 Testing Agent Counting Logic\n');
  console.log('=' .repeat(50));
  
  try {
    // 1. Get dashboard metrics
    console.log('\n📊 Fetching Dashboard Metrics...');
    const metricsResponse = await fetch(`${API_BASE}/api/metrics/dashboard`);
    const metrics = await metricsResponse.json();
    
    console.log('Dashboard Metrics:');
    console.log(`  - Active Farms: ${metrics.data.activeFarms}`);
    console.log(`  - Total Agents: ${metrics.data.totalAgents} (should only count from running farms)`);
    console.log(`  - Tasks Completed: ${metrics.data.tasksCompleted}`);
    console.log(`  - Success Rate: ${metrics.data.successRate}%`);
    
    // 2. Get all farms to verify
    console.log('\n🌱 Fetching All Farms...');
    const farmsResponse = await fetch(`${API_BASE}/api/farms`);
    const farmsData = await farmsResponse.json();
    
    if (farmsData.data && Array.isArray(farmsData.data)) {
      console.log(`Found ${farmsData.data.length} farm(s):\n`);
      
      let runningAgentCount = 0;
      let totalAgentCount = 0;
      
      farmsData.data.forEach(farm => {
        const agentCount = farm.agents?.length || farm.config?.maxAgents || 0;
        totalAgentCount += agentCount;
        
        const isRunning = farm.status === 'running' || farm.status === 'launching';
        if (isRunning) {
          runningAgentCount += agentCount;
        }
        
        console.log(`  Farm: ${farm.name}`);
        console.log(`    - ID: ${farm.id}`);
        console.log(`    - Status: ${farm.status} ${isRunning ? '✅ (counted)' : '❌ (not counted)'}`);
        console.log(`    - Agents: ${agentCount}`);
        console.log(`    - Created: ${new Date(farm.createdAt).toLocaleString()}`);
        console.log('');
      });
      
      console.log('=' .repeat(50));
      console.log('\n📈 Summary:');
      console.log(`  - Total farms: ${farmsData.data.length}`);
      console.log(`  - Running/Launching farms: ${farmsData.data.filter(f => f.status === 'running' || f.status === 'launching').length}`);
      console.log(`  - Agents in ALL farms: ${totalAgentCount}`);
      console.log(`  - Agents in RUNNING farms: ${runningAgentCount}`);
      console.log(`  - Dashboard reports: ${metrics.data.totalAgents} agents`);
      
      if (metrics.data.totalAgents === runningAgentCount) {
        console.log('\n✅ SUCCESS: Dashboard correctly reports only agents from running farms!');
      } else if (metrics.data.totalAgents === totalAgentCount) {
        console.log('\n⚠️  WARNING: Dashboard seems to be counting agents from ALL farms (including stopped/completed)');
        console.log('    This should be fixed to only count agents from running farms.');
      } else {
        console.log('\n⚠️  Note: Agent count might be using real-time data from tmux sessions');
      }
    } else {
      console.log('No farms found');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\nMake sure the MaiFarm server is running on port 4567');
  }
}

// Run the test
testAgentCounting().then(() => {
  console.log('\n✨ Test complete!');
  process.exit(0);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});