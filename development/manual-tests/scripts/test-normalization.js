#!/usr/bin/env node

import { io } from 'socket.io-client';

console.log('Testing Terminal Output Normalization\n');

const socket = io('http://localhost:4567', {
    transports: ['websocket', 'polling']
});

socket.on('connect', () => {
    console.log('✅ Connected to server');
    console.log(`Socket ID: ${socket.id}\n`);
    
    // Test: Send events with different agent ID types
    console.log('Sending test events with different agent ID types...\n');
    
    const testCases = [
        { agentId: 0, expected: 'number' },
        { agentId: '1', expected: 'string (should normalize to number)' },
        { agentId: 2, expected: 'number' },
    ];
    
    let receivedCount = 0;
    let normalizedCount = 0;
    
    // Listen for responses
    socket.on('terminal:output', (data) => {
        console.log('Received event:', {
            testMarker: data.testMarker,
            agentId: data.agentId,
            type: typeof data.agentId
        });
        
        if (data.testMarker === 'normalization-test') {
            receivedCount++;
            
            if (typeof data.agentId === 'number') {
                normalizedCount++;
                console.log(`✅ AgentId ${data.agentId} is properly normalized to number`);
            } else {
                console.log(`❌ AgentId ${data.agentId} is still ${typeof data.agentId}`);
            }
        }
    });
    
    // Send test events
    testCases.forEach((test, index) => {
        setTimeout(() => {
            console.log(`Sending test ${index + 1}: agentId=${test.agentId} (${test.expected})`);
            socket.emit('terminal:output', {
                sessionId: 'test-normalization',
                agentId: test.agentId,
                testMarker: 'normalization-test',
                output: `Test with agentId: ${test.agentId}`
            });
        }, index * 100);
    });
    
    // Check results after a delay
    setTimeout(() => {
        console.log('\n=== Results ===');
        console.log(`Received: ${receivedCount}/${testCases.length} responses`);
        console.log(`Normalized: ${normalizedCount}/${receivedCount} agent IDs`);
        
        if (normalizedCount === testCases.length) {
            console.log('\n✅ SUCCESS: All agent IDs properly normalized!');
        } else if (receivedCount === 0) {
            console.log('\n❌ FAIL: No responses received. Server may not be echoing test events.');
        } else {
            console.log('\n⚠️ PARTIAL: Some agent IDs were not normalized properly.');
        }
        
        socket.disconnect();
        process.exit(receivedCount === testCases.length && normalizedCount === testCases.length ? 0 : 1);
    }, 1000);
});

socket.on('error', (err) => {
    console.error('❌ Socket error:', err);
});

socket.on('connect_error', (err) => {
    console.error('❌ Connection error:', err.message);
    process.exit(1);
});

setTimeout(() => {
    console.error('❌ Timeout - test did not complete within 5 seconds');
    process.exit(1);
}, 5000);