#!/usr/bin/env node

// Start a harvest for the farm-harvest-demo session
import fetch from 'node-fetch';

async function startHarvest() {
  console.log('🌾 Starting harvest for farm-harvest-demo...\n');
  
  // First, register the farm properly
  const farmResponse = await fetch('http://localhost:4567/api/farms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      id: 'farm-harvest-demo',
      name: 'Production Harvest Test',
      description: 'Testing harvest with real Claude agents',
      status: 'active',
      sessionName: 'farm-harvest-demo',
      agentCount: 3,
      agents: [
        { 
          id: 'agent_0', 
          name: 'WebSocket Analyzer',
          role: 'Analyze WebSocket implementation',
          status: 'active'
        },
        { 
          id: 'agent_1', 
          name: 'Harvest Service Inspector',
          role: 'Review harvest service',
          status: 'active'
        },
        { 
          id: 'agent_2', 
          name: 'Terminal Stream Documenter',
          role: 'Document terminal streaming',
          status: 'active'
        }
      ],
      config: {
        provider: 'claude',
        model: 'claude-3-sonnet',
        timeout: 600
      }
    })
  });
  
  const farmResult = await farmResponse.json();
  console.log('Farm registration:', farmResult.success ? '✅ Success' : '❌ Failed');
  if (!farmResult.success) {
    console.log('Farm error:', farmResult.error);
  }
  
  // Start a harvest for this farm
  const harvestResponse = await fetch('http://localhost:4567/api/farms/farm-harvest-demo/harvest', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      includeSystemFiles: false,
      includeNodeModules: false
    })
  });
  
  const harvestResult = await harvestResponse.json();
  console.log('Harvest start:', harvestResult.success ? '✅ Success' : '❌ Failed');
  
  if (harvestResult.success && harvestResult.data) {
    console.log('\n📊 Harvest Details:');
    console.log('=================');
    console.log(`Harvest ID: ${harvestResult.data.id}`);
    console.log(`Status: ${harvestResult.data.status}`);
    console.log(`Farm ID: ${harvestResult.data.farmId}`);
    
    // Trigger file collection
    const collectResponse = await fetch(`http://localhost:4567/api/harvests/${harvestResult.data.id}/collect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('\nFile collection:', collectResponse.ok ? '✅ Triggered' : '❌ Failed');
    
    console.log('\n📺 View harvest at:');
    console.log(`http://localhost:3000/harvest?farmId=farm-harvest-demo`);
    
    return harvestResult.data;
  } else {
    console.error('Harvest error:', harvestResult.error);
    return null;
  }
}

// Run the harvest
startHarvest()
  .then(harvest => {
    if (harvest) {
      console.log('\n✨ Harvest started successfully!');
      console.log('The harvest view should now show data.');
    }
  })
  .catch(err => {
    console.error('Error:', err);
  });