#!/usr/bin/env node

// Link the harvest to the tmux session for terminal output
import { io } from 'socket.io-client';

const socket = io('http://localhost:4567');

socket.on('connect', () => {
  console.log('Connected to WebSocket server');
  
  // Link the harvest to the session
  socket.emit('harvest:link-session', {
    harvestId: 'cfd2a29c-6c0f-4275-a087-b2963742a68a',
    farmId: '87c70ed4-59b1-46be-b825-b57bdc03a7d7',
    sessionName: 'farm-harvest-demo',
    windowName: 'agents'
  });
  
  // Request terminal output for the harvest
  socket.emit('harvest:get-terminal-output', {
    harvestId: 'cfd2a29c-6c0f-4275-a087-b2963742a68a',
    farmId: '87c70ed4-59b1-46be-b825-b57bdc03a7d7',
    sessionName: 'farm-harvest-demo'
  });
  
  // Trigger harvest data collection
  socket.emit('harvest:collect-files', {
    harvestId: 'cfd2a29c-6c0f-4275-a087-b2963742a68a',
    farmId: '87c70ed4-59b1-46be-b825-b57bdc03a7d7',
    workspacePath: '/Users/rohnspringfield/maifarm/maibarn/workspaces/active/harvest-demo-1754926713'
  });
  
  // Update harvest status
  socket.emit('harvest:update', {
    harvestId: 'cfd2a29c-6c0f-4275-a087-b2963742a68a',
    status: 'collecting',
    summary: {
      description: 'Collecting outputs from 3 Claude agents',
      totalFiles: 3,
      filesGenerated: 0,
      filesFailed: 0,
      totalTasks: 3,
      completedTasks: 0,
      failedTasks: 0
    }
  });
  
  console.log('Harvest-session link events sent');
  
  // Listen for responses
  socket.on('harvest:terminal-output', (data) => {
    console.log('Terminal output received:', data.lines?.length || 0, 'lines');
  });
  
  socket.on('harvest:updated', (data) => {
    console.log('Harvest updated:', data.status);
  });
  
  setTimeout(() => {
    console.log('\n✨ Check harvest view at:');
    console.log('http://localhost:3000/harvest?farmId=87c70ed4-59b1-46be-b825-b57bdc03a7d7');
    socket.disconnect();
    process.exit(0);
  }, 3000);
});

socket.on('error', (error) => {
  console.error('WebSocket error:', error);
});