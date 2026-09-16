#!/bin/bash

MAIFARM_ROOT="${MAIFARM_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
export MAIFARM_ROOT

# Real-time Terminal Streaming Activator
# This script starts the terminal file watcher and emits WebSocket events

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Starting Terminal Streaming Service${NC}"
echo -e "${BLUE}========================================${NC}"
echo

# Parse arguments
FARM_ID="${1:-325dca22-4d8e-4365-bbd5-8a333d44ea7a}"
SESSION_NAME="${2:-farm-325dca22}"

echo -e "${YELLOW}Farm ID: $FARM_ID${NC}"
echo -e "${YELLOW}Session: $SESSION_NAME${NC}"
echo

# Terminal directory
TERMINAL_DIR="${MAIFARM_ROOT}/var/maibarn/terminals/$FARM_ID"

# Check if terminal directory exists
if [ ! -d "$TERMINAL_DIR" ]; then
    echo -e "${RED}Terminal directory not found: $TERMINAL_DIR${NC}"
    exit 1
fi

# Start monitoring in background using Node.js script
echo -e "${YELLOW}Starting terminal file monitor...${NC}"

# Create a Node.js script to watch and emit changes
cat > /tmp/terminal-watcher.js << 'EOF'
const fs = require('fs');
const path = require('path');
const http = require('http');
const io = require('socket.io-client');

const farmId = process.argv[2];
const sessionName = process.argv[3];
const terminalDir = `${process.env.MAIFARM_ROOT || process.cwd()}/var/maibarn/terminals/${farmId}`;

console.log(`Starting terminal watcher for ${farmId}`);
console.log(`Terminal directory: ${terminalDir}`);

// Connect to WebSocket server
const socket = io('http://localhost:4567', {
    transports: ['websocket', 'polling']
});

socket.on('connect', () => {
    console.log('Connected to WebSocket server');

    // Join terminal room
    socket.emit('terminal:join', {
        sessionId: sessionName,
        farmId: farmId
    });
});

// Track last position for each file
const lastPositions = {};
const readBuffer = {};

// Function to read new content from file
function readNewContent(filePath, agentId) {
    const stats = fs.statSync(filePath);
    const currentSize = stats.size;
    const lastPosition = lastPositions[filePath] || 0;

    if (currentSize > lastPosition) {
        const stream = fs.createReadStream(filePath, {
            start: lastPosition,
            end: currentSize - 1
        });

        let buffer = '';
        stream.on('data', (chunk) => {
            buffer += chunk.toString();
        });

        stream.on('end', () => {
            if (buffer) {
                // Split into lines and emit
                const lines = buffer.split('\n').filter(line => line.trim());

                if (lines.length > 0) {
                    console.log(`Agent ${agentId}: ${lines.length} new lines`);

                    // Emit terminal output event
                    socket.emit('terminal:output', {
                        farmId: farmId,
                        sessionId: sessionName,
                        agentId: parseInt(agentId),
                        lines: lines,
                        timestamp: new Date().toISOString()
                    });
                }
            }

            lastPositions[filePath] = currentSize;
        });
    }
}

// Watch each agent log file
const agents = fs.readdirSync(terminalDir)
    .filter(file => file.match(/^agent-\d+\.log$/))
    .map(file => {
        const agentId = file.match(/agent-(\d+)\.log$/)[1];
        return { file, agentId, path: path.join(terminalDir, file) };
    });

console.log(`Found ${agents.length} agent log files`);

// Initial read to get current positions
agents.forEach(agent => {
    if (fs.existsSync(agent.path)) {
        const stats = fs.statSync(agent.path);
        lastPositions[agent.path] = stats.size;
        console.log(`Agent ${agent.agentId}: Starting at position ${stats.size}`);
    }
});

// Set up file watchers
agents.forEach(agent => {
    console.log(`Watching ${agent.file}`);

    fs.watchFile(agent.path, { interval: 100 }, (curr, prev) => {
        if (curr.size > prev.size) {
            readNewContent(agent.path, agent.agentId);
        }
    });
});

// Send heartbeat every 5 seconds
setInterval(() => {
    socket.emit('terminal:heartbeat', {
        farmId: farmId,
        sessionId: sessionName,
        timestamp: new Date().toISOString()
    });
}, 5000);

console.log('Terminal watcher started. Press Ctrl+C to stop.');

// Clean up on exit
process.on('SIGINT', () => {
    console.log('\nShutting down terminal watcher...');
    socket.disconnect();
    process.exit(0);
});
EOF

# Install socket.io-client if not present
if ! npm list socket.io-client >/dev/null 2>&1; then
    echo -e "${YELLOW}Installing socket.io-client...${NC}"
    npm install socket.io-client --no-save >/dev/null 2>&1
fi

# Run the watcher
echo -e "${GREEN}✓ Starting real-time terminal streaming${NC}"
node /tmp/terminal-watcher.js "$FARM_ID" "$SESSION_NAME" &
WATCHER_PID=$!

echo -e "${GREEN}✓ Terminal watcher started (PID: $WATCHER_PID)${NC}"
echo
echo -e "${BLUE}Terminal streaming is now active!${NC}"
echo -e "${YELLOW}The harvest page should now auto-update in real-time.${NC}"
echo
echo -e "Press Ctrl+C to stop the watcher"

# Wait for the watcher
wait $WATCHER_PID