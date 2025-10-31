#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');
const chokidar = require('chokidar');

// Configuration
const FARM_ID = process.argv[2] || '325dca22-4d8e-4365-bbd5-8a333d44ea7a';
const SESSION_NAME = process.argv[3] || `farm-${FARM_ID.substring(0, 8)}`;
const TERMINAL_DIR = `/Users/rohnspringfield/maifarm/var/maibarn/terminals/${FARM_ID}`;
const SOCKET_URL = 'http://localhost:4567';

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

console.log(`${colors.blue}========================================${colors.reset}`);
console.log(`${colors.blue}   WebSocket File Watcher Service${colors.reset}`);
console.log(`${colors.blue}========================================${colors.reset}`);
console.log(`${colors.cyan}Farm ID: ${FARM_ID}${colors.reset}`);
console.log(`${colors.cyan}Session: ${SESSION_NAME}${colors.reset}`);
console.log(`${colors.cyan}Terminal Dir: ${TERMINAL_DIR}${colors.reset}`);
console.log(`${colors.cyan}Socket URL: ${SOCKET_URL}${colors.reset}`);
console.log();

// Track file positions for incremental reads
const filePositions = new Map();
const lastEmittedLines = new Map();

// Connect to WebSocket server
const socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity
});

socket.on('connect', () => {
    console.log(`${colors.green}✓ Connected to WebSocket server${colors.reset}`);

    // Join the terminal room for this farm
    socket.emit('terminal:join', {
        farmId: FARM_ID,
        sessionName: SESSION_NAME
    });

    console.log(`${colors.green}✓ Joined terminal room for farm ${FARM_ID}${colors.reset}`);
});

socket.on('disconnect', (reason) => {
    console.log(`${colors.yellow}⚠ Disconnected from WebSocket: ${reason}${colors.reset}`);
});

socket.on('error', (error) => {
    console.error(`${colors.yellow}⚠ WebSocket error:${colors.reset}`, error);
});

// Function to read new content from file
function readNewContent(filePath, agentId) {
    try {
        const stats = fs.statSync(filePath);
        const lastPosition = filePositions.get(filePath) || 0;

        if (stats.size > lastPosition) {
            const buffer = Buffer.alloc(stats.size - lastPosition);
            const fd = fs.openSync(filePath, 'r');
            fs.readSync(fd, buffer, 0, buffer.length, lastPosition);
            fs.closeSync(fd);

            const newContent = buffer.toString('utf8');
            filePositions.set(filePath, stats.size);

            // Split into lines and process each
            const lines = newContent.split('\n').filter(line => line.trim());

            lines.forEach(line => {
                // Skip if we've already emitted this exact line
                const lastLine = lastEmittedLines.get(filePath);
                if (lastLine === line) return;

                lastEmittedLines.set(filePath, line);

                // Emit terminal output event
                const event = {
                    type: 'output',
                    sessionId: SESSION_NAME,
                    farmId: FARM_ID,
                    agentId: agentId,
                    data: line,
                    timestamp: new Date().toISOString()
                };

                socket.emit('terminal:output', event);

                // Also emit a generic update event
                socket.emit('terminal:update', {
                    farmId: FARM_ID,
                    agentId: agentId,
                    type: 'new_output',
                    line: line
                });

                console.log(`${colors.magenta}↑ Emitted output from agent-${agentId}:${colors.reset} ${line.substring(0, 60)}...`);
            });
        }
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.error(`${colors.yellow}⚠ Error reading ${filePath}:${colors.reset}`, err);
        }
    }
}

// Function to emit heartbeat
function emitHeartbeat() {
    const heartbeatFile = path.join(TERMINAL_DIR, 'orchestrator.heartbeat');
    try {
        const timestamp = fs.readFileSync(heartbeatFile, 'utf8').trim();
        socket.emit('terminal:heartbeat', {
            farmId: FARM_ID,
            sessionName: SESSION_NAME,
            timestamp: timestamp,
            alive: true
        });
        console.log(`${colors.cyan}♥ Heartbeat sent${colors.reset}`);
    } catch (err) {
        // Heartbeat file might not exist yet
    }
}

// Set up file watchers
const watcher = chokidar.watch([
    path.join(TERMINAL_DIR, 'agent-*.log'),
    path.join(TERMINAL_DIR, '*.heartbeat')
], {
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50
    }
});

watcher.on('add', (filePath) => {
    console.log(`${colors.green}+ Watching new file: ${path.basename(filePath)}${colors.reset}`);

    // Initialize file position for new files
    try {
        const stats = fs.statSync(filePath);
        filePositions.set(filePath, 0); // Start from beginning for new files
    } catch (err) {
        console.error(`${colors.yellow}⚠ Error initializing ${filePath}:${colors.reset}`, err);
    }
});

watcher.on('change', (filePath) => {
    const filename = path.basename(filePath);

    if (filename.endsWith('.heartbeat')) {
        emitHeartbeat();
    } else if (filename.startsWith('agent-') && filename.endsWith('.log')) {
        const agentMatch = filename.match(/agent-(\d+)\.log/);
        if (agentMatch) {
            const agentId = parseInt(agentMatch[1]);
            readNewContent(filePath, agentId);
        }
    }
});

// Send periodic status updates
setInterval(() => {
    const status = {
        farmId: FARM_ID,
        sessionName: SESSION_NAME,
        connected: socket.connected,
        watchedFiles: Array.from(filePositions.keys()).map(f => path.basename(f)),
        timestamp: new Date().toISOString()
    };

    socket.emit('terminal:status', status);
    console.log(`${colors.cyan}📊 Status update sent (${status.watchedFiles.length} files)${colors.reset}`);
}, 10000); // Every 10 seconds

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log(`\n${colors.yellow}Shutting down file watcher...${colors.reset}`);

    socket.emit('terminal:leave', {
        farmId: FARM_ID,
        sessionName: SESSION_NAME
    });

    watcher.close();
    socket.close();

    console.log(`${colors.green}✓ File watcher stopped${colors.reset}`);
    process.exit(0);
});

console.log(`${colors.green}✓ File watcher started${colors.reset}`);
console.log(`${colors.yellow}Press Ctrl+C to stop${colors.reset}`);