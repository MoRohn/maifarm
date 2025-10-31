#!/usr/bin/env npx tsx

import { terminalStreamService } from '../../../apps/api/src/services/unified/terminalService';

async function setupTerminalForActiveFarm() {
  const farmId = '88e28920'; // Active farm from screenshot
  const sessionName = 'farm-88e28920';
  const agentCount = 5; // 5 agents visible in screenshot
  
  console.log(`Setting up terminal streaming for ${sessionName}...`);
  
  try {
    await terminalStreamService.startStreaming(sessionName, farmId, agentCount);
    console.log('✅ Terminal streaming started successfully');
    
    // Keep the process alive to maintain streaming
    console.log('Terminal streaming is now active. Press Ctrl+C to stop.');
    
    // Keep process alive
    setInterval(() => {
      // Just keep the process alive
    }, 10000);
    
  } catch (error) {
    console.error('❌ Failed to start terminal streaming:', error);
    process.exit(1);
  }
}

// Run the setup
setupTerminalForActiveFarm().catch(console.error);