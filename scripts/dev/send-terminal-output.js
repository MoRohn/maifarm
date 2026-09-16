#!/usr/bin/env node

/**
 * Script to send terminal output events via WebSocket
 * This simulates what the terminal streaming service should be doing
 */

import { io } from 'socket.io-client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const FARM_ID = 'f60cbf3e-5bdd-4d49-ad0c-e95244bd668c';
const SOCKET_URL = 'http://localhost:4567';
const TERMINAL_DIR = `${process.env.MAIFARM_ROOT || process.cwd()}/var/maibarn/terminals/${FARM_ID}`;

// Agent names
const AGENT_NAMES = [
  'Billy the Goat',
  'Bessie the Cow',
  'Wilbur the Pig',
  'Charlotte the Spider',
  'Henrietta the Hen'
];

// Connect to WebSocket
const socket = io(SOCKET_URL, {
  transports: ['websocket'],
  reconnection: true
});

socket.on('connect', () => {
  console.log('Connected to WebSocket server');

  // Join the farm room
  socket.emit('join:room', `farm:${FARM_ID}`);
  socket.emit('join:room', `terminal:${FARM_ID}`);

  // Send agent info
  const agentInfo = AGENT_NAMES.map((name, index) => ({
    id: index,
    name: name,
    status: 'active'
  }));

  socket.emit('farm:agents:info', {
    farmId: FARM_ID,
    agents: agentInfo
  });

  // Start sending terminal output
  sendTerminalOutput();
});

socket.on('disconnect', () => {
  console.log('Disconnected from WebSocket server');
});

socket.on('error', (error) => {
  console.error('WebSocket error:', error);
});

function cleanTerminalOutput(content) {
  return content
    // Remove ANSI escape sequences
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\x1b\[?[0-9;]*[A-Za-z]/g, '')
    // Remove other control characters
    .replace(/\x1b/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Remove special control sequences
    .replace(/\[K/g, '')
    .replace(/\[\?2004[hl]/g, '')
    .replace(/\[0m/g, '')
    .replace(/\[27m/g, '')
    .replace(/\[24m/g, '')
    .replace(/\[J/g, '')
    .replace(/dquote>/g, '')
    // Clean up multiple spaces
    .replace(/ +/g, ' ')
    .trim();
}

function sendTerminalOutput() {
  console.log('Starting to send terminal output...');

  // Read and send output for each agent
  for (let i = 0; i < 5; i++) {
    const logFile = path.join(TERMINAL_DIR, `agent-${i}.log`);

    try {
      // Read the log file
      const content = fs.readFileSync(logFile, 'utf8');
      const cleanedContent = cleanTerminalOutput(content);

      if (cleanedContent) {
        // Split into lines and send them
        const lines = cleanedContent.split('\n').filter(line => line.trim());

        lines.forEach((line, lineIndex) => {
          setTimeout(() => {
            const payload = {
              farmId: FARM_ID,
              agentId: i,
              agentIndex: i,
              agentName: AGENT_NAMES[i],
              content: line + '\n',
              timestamp: new Date()
            };

            console.log(`Sending output for ${AGENT_NAMES[i]}: ${line.substring(0, 50)}...`);

            // Send on multiple channels to ensure it gets through
            socket.emit('terminal:output', payload);
            socket.emit('terminal:data', payload);
            socket.emit(`terminal:output:${FARM_ID}`, payload);
          }, lineIndex * 500); // Stagger the sends
        });
      }
    } catch (error) {
      console.error(`Error reading log file for agent ${i}:`, error.message);
    }
  }

  // Keep sending updates every 5 seconds
  setTimeout(() => {
    sendTerminalOutput();
  }, 5000);
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  socket.close();
  process.exit(0);
});

console.log(`Sending terminal output for farm ${FARM_ID}`);
console.log('Press Ctrl+C to stop');