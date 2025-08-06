#!/usr/bin/env tsx

import { AgentCoordinator } from '../server/agents/AgentCoordinator.js';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function launchAgents() {
  console.log('🚀 Launching Trump Infographic Generation Agents...\n');

  const coordinator = new AgentCoordinator({
    farmId: 'trump-infog-test',
    numberOfAgents: 4,
    workingDirectory: path.join(__dirname, '..', 'tmp', 'infograph_output'),
    coordinationPath: '/tmp/claude_coordination',
    websocketUrl: process.env.WEBSOCKET_URL || 'http://localhost:4567'
  });

  try {
    // Initialize coordinator
    console.log('📋 Initializing Agent Coordinator...');
    await coordinator.initialize();
    console.log('✅ Coordinator initialized successfully\n');

    // Setup event listeners
    coordinator.on('agent:state:changed', ({ agent, state }) => {
      console.log(`📊 Agent ${agent}: ${state.status} (${state.progress}%)`);
    });

    coordinator.on('agent:error', ({ agent, error }) => {
      console.error(`❌ Agent ${agent} error:`, error.message);
    });

    coordinator.on('agent:complete', ({ agent, result }) => {
      console.log(`✅ Agent ${agent} completed successfully`);
    });

    coordinator.on('project:complete', () => {
      console.log('\n🎉 Infographic generation complete!');
      console.log('📁 Check the output directory for results');
      process.exit(0);
    });

    // Start the agents
    console.log('🏃 Starting agents...\n');
    await coordinator.start();

    // Keep the process alive
    process.on('SIGINT', async () => {
      console.log('\n⏹️  Stopping agents...');
      await coordinator.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error('💥 Failed to launch agents:', error);
    process.exit(1);
  }
}

// Run the launcher
launchAgents().catch(console.error);