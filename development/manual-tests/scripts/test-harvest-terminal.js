#!/usr/bin/env node

import { io } from 'socket.io-client';

console.log('Testing Harvest Terminal with multiple agents...\n');

const socket = io('http://localhost:4567', {
    transports: ['websocket', 'polling']
});

const farmId = 'test-farm-' + Date.now();
const sessionId = `farm-${farmId}`;
const numAgents = 3;

socket.on('connect', () => {
    console.log('✅ Connected to MaiFarm server');
    console.log(`Socket ID: ${socket.id}`);
    console.log(`Session: ${sessionId}\n`);
    
    // Join the terminal session
    socket.emit('terminal:join', {
        sessionId: sessionId,
        farmId: farmId
    });
});

socket.on('terminal:joined', (data) => {
    console.log('📺 Terminal session joined:', data);
    console.log('\nSimulating terminal output for each agent...\n');
    
    // Simulate terminal output for each agent
    for (let i = 0; i < numAgents; i++) {
        setTimeout(() => {
            // Simulate terminal output from different agents
            const agentOutput = {
                sessionId: sessionId,
                farmId: farmId,
                agentId: i,  // Numeric agent ID
                agentName: `Agent ${i}`,
                output: `Hello from Agent ${i}`,
                lines: [
                    `[Agent ${i}] Starting task...`,
                    `[Agent ${i}] Processing request...`,
                    `[Agent ${i}] Task completed successfully!`
                ],
                timestamp: new Date().toISOString()
            };
            
            console.log(`📤 Sending output for Agent ${i}`);
            
            // Emit as terminal output
            socket.emit('terminal:output', agentOutput);
            
            // Also emit as agent-specific output
            socket.emit('agent:output', agentOutput);
            
        }, 1000 * (i + 1));  // Stagger the outputs
    }
});

socket.on('terminal:output', (data) => {
    if (data.sessionId === sessionId) {
        console.log(`📥 Received terminal output for Agent ${data.agentId}:`, data.output);
    }
});

socket.on('agent:output', (data) => {
    if (data.sessionId === sessionId) {
        console.log(`🤖 Received agent-specific output for Agent ${data.agentId}`);
    }
});

socket.on('error', (err) => {
    console.error('❌ Socket error:', err);
});

// Test cross-contamination by creating another session
setTimeout(() => {
    console.log('\n🧪 Testing session isolation...\n');
    
    const otherSessionId = 'farm-other-test';
    socket.emit('terminal:output', {
        sessionId: otherSessionId,
        farmId: 'other-farm',
        agentId: 99,
        output: 'This should NOT appear in our session'
    });
    
    console.log('Sent output to different session (should not receive it back)');
}, 5000);

// Disconnect after 10 seconds
setTimeout(() => {
    console.log('\n👋 Test complete, disconnecting...');
    socket.disconnect();
    process.exit(0);
}, 10000);

socket.on('disconnect', () => {
    console.log('Disconnected from server');
});
