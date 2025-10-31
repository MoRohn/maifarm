#!/usr/bin/env node

import fetch from 'node-fetch';

console.log('Testing GoWild farm creation with orchestrator debugging...');

const apiUrl = 'http://localhost:4567/api/gowild/start';
const payload = {
  prompt: "Test exploration for debug",
  numberOfAgents: 2,
  timeout: 180,  // 3 minutes in seconds
  config: {
    maxDuration: 3,  // minutes
    explorationDepth: 3,
    focusAreas: ["testing"],
    creativityLevel: 5,
    constraintLevel: 5,
    collaborationMode: "distributed"
  }
};

try {
  console.log('Sending request to:', apiUrl);
  console.log('Payload:', JSON.stringify(payload, null, 2));
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bypass-auth': 'true'
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  
  if (response.ok) {
    console.log('\n✅ GoWild session started successfully!');
    console.log('Result:', JSON.stringify(result, null, 2));
    console.log('\nWatch the server logs for Python orchestrator debug output.');
    console.log('Look for lines starting with:');
    console.log('  [Python stdout] - Python script output');
    console.log('  [Python stderr] - Python script errors'); 
    console.log('  [Orchestrator] Running: - The exact command being run');
  } else {
    console.error('\n❌ Failed to start GoWild session:');
    console.error(result);
  }
} catch (error) {
  console.error('\n❌ Request failed:', error.message);
  console.error('Make sure the server is running on port 4567');
}