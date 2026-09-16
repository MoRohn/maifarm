#!/usr/bin/env node

// Manually register the harvest-demo session with MaiFarm
import { io } from 'socket.io-client';

const socket = io('http://localhost:4567');

socket.on('connect', () => {
  console.log('Connected to WebSocket server');
  
  // Register the farm
  socket.emit('farm:register', {
    farmId: 'harvest-demo-1754926713',
    sessionName: 'harvest-demo',
    status: 'active',
    agentCount: 3,
    agents: [
      { id: 'agent_0', name: 'WebSocket Analyzer', pane: 'harvest-demo:agents.0', status: 'active' },
      { id: 'agent_1', name: 'Harvest Service Inspector', pane: 'harvest-demo:agents.1', status: 'active' },
      { id: 'agent_2', name: 'Terminal Stream Documenter', pane: 'harvest-demo:agents.2', status: 'active' }
    ]
  });
  
  // Start harvest
  socket.emit('harvest:start', {
    farmId: 'harvest-demo-1754926713',
    farmName: 'Production Harvest Test'
  });
  
  // Request terminal sessions
  socket.emit('harvest:get-sessions', {
    farmId: 'harvest-demo-1754926713'
  });
  
  console.log('Farm registration events sent');
  
  setTimeout(() => {
    console.log('Check: http://localhost:3000/harvest?farmId=harvest-demo-1754926713');
    socket.disconnect();
    process.exit(0);
  }, 2000);
});

socket.on('error', (error) => {
  console.error('WebSocket error:', error);
});