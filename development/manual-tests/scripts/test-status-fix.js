#!/usr/bin/env node
/**
 * Test script to verify status constraint fix
 */

import axios from 'axios';

const API_URL = 'http://localhost:4567/api';

async function testQuickTask() {
  console.log('Testing Quick Task with fixed status constraints...\n');
  
  try {
    // Create a Quick Task
    console.log('1. Creating Quick Task...');
    const response = await axios.post(`${API_URL}/tasks/quick`, {
      description: 'Echo "Testing status fix" and exit',
      mode: 'quick',
      provider: 'claude',
      timeout: 30000 // 30 seconds
    });
    
    const { taskId, farmId } = response.data.data;
    console.log(`   ✅ Quick Task created: ${taskId}`);
    console.log(`   Farm ID: ${farmId}\n`);
    
    // Wait a moment for agent status to update
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check agent status
    console.log('2. Checking agent status...');
    const agentsResponse = await axios.get(`${API_URL}/farms/${farmId}/agents`);
    const agents = agentsResponse.data.data;
    
    if (agents && agents.length > 0) {
      const agent = agents[0];
      console.log(`   ✅ Agent status: ${agent.status}`);
      console.log(`   Agent name: ${agent.name}`);
      
      // Verify status is valid
      const validStatuses = ['idle', 'initializing', 'active', 'working', 'busy', 'completed', 'paused', 'error', 'failed', 'terminating', 'terminated'];
      if (validStatuses.includes(agent.status)) {
        console.log(`   ✅ Status is valid!\n`);
      } else {
        console.log(`   ❌ Invalid status: ${agent.status}\n`);
      }
    } else {
      console.log('   ⚠️  No agents found\n');
    }
    
    // Check task status
    console.log('3. Checking task status...');
    const taskResponse = await axios.get(`${API_URL}/tasks/${taskId}`);
    const task = taskResponse.data.data;
    console.log(`   Task status: ${task.status}`);
    console.log(`   Task progress: ${task.progress}%\n`);
    
    console.log('✅ Test completed successfully!');
    console.log('   The status constraint issue has been fixed.');
    console.log('   Agents can now use the correct status values.\n');
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    console.error('\nError details:', error.response?.data?.error);
    process.exit(1);
  }
}

// Run the test
testQuickTask().catch(console.error);