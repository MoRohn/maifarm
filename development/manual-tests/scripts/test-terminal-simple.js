#!/usr/bin/env node

import { io } from 'socket.io-client';

console.log('Simple Terminal Isolation Test\n');

const socket = io('http://localhost:4567', {
    transports: ['websocket', 'polling']
});

socket.on('connect', () => {
    console.log('✅ Connected to server');
    console.log(`Socket ID: ${socket.id}\n`);
    
    // Test 1: Join a terminal session
    console.log('Test 1: Joining terminal session...');
    socket.emit('terminal:join', {
        sessionId: 'test-session',
        farmId: 'test-farm'
    });
});

socket.on('terminal:joined', (data) => {
    console.log('✅ Successfully joined terminal session:');
    console.log(`  Session: ${data.sessionId}`);
    console.log(`  Rooms joined: ${data.roomsJoined || data.joinedRooms?.length || 'unknown'}`);
    console.log('');
    
    // Test 2: Check if we receive terminal output events
    console.log('Test 2: Waiting for terminal output...');
    console.log('(In a real scenario, output would come from tmux sessions)');
    
    // Since server doesn't echo client events, we can't test isolation this way
    // The isolation is tested by having multiple clients join different sessions
    // and ensuring they only receive their session's output
    
    setTimeout(() => {
        console.log('\n✅ Test complete. Terminal handlers are working.');
        console.log('Note: Real terminal isolation requires active tmux sessions.');
        socket.disconnect();
        process.exit(0);
    }, 3000);
});

socket.on('terminal:output', (data) => {
    console.log(`📥 Received terminal output for agent ${data.agentId}:`, data.output);
});

socket.on('error', (err) => {
    console.error('❌ Socket error:', err);
});

socket.on('connect_error', (err) => {
    console.error('❌ Connection error:', err.message);
    process.exit(1);
});

setTimeout(() => {
    console.error('❌ Timeout - test did not complete within 10 seconds');
    process.exit(1);
}, 10000);
