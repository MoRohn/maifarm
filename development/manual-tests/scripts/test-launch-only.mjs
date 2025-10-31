#!/usr/bin/env node

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:4567/api';

async function testLaunchOnly() {
  console.log('Testing launch endpoint directly...\n');
  
  // First, get a farm that exists
  const farmsResponse = await fetch(`${API_BASE}/farms`);
  const farmsResult = await farmsResponse.json();
  
  console.log('Available farms:', farmsResult.data?.length || 0);
  
  if (!farmsResult.data || farmsResult.data.length === 0) {
    console.log('No farms available, creating one...');
    
    const createResponse = await fetch(`${API_BASE}/farms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Farm for Launch',
        description: 'Testing launch endpoint',
        type: 'sequential',
        config: {
          maxAgents: 2,
          timeout: 180
        }
      })
    });
    
    const createResult = await createResponse.json();
    console.log('Create result:', createResult);
    
    if (!createResult.success) {
      console.error('Failed to create farm');
      process.exit(1);
    }
    
    const farmId = createResult.data.id;
    console.log('Created farm:', farmId);
    
    // Now try to launch it
    console.log('\nAttempting to launch farm...');
    const launchResponse = await fetch(`${API_BASE}/farms/${farmId}/launch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        numberOfAgents: 2,
        prompt: 'Test launch'
      })
    });
    
    const launchText = await launchResponse.text();
    console.log('Raw launch response:', launchText);
    
    try {
      const launchResult = JSON.parse(launchText);
      console.log('Parsed launch result:', launchResult);
    } catch (e) {
      console.error('Failed to parse response as JSON');
    }
    
    // Cleanup
    await fetch(`${API_BASE}/farms/${farmId}`, { method: 'DELETE' });
    console.log('Cleaned up test farm');
  }
}

testLaunchOnly().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});