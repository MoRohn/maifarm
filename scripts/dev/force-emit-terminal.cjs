#!/usr/bin/env node
/**
 * Force emit existing terminal content to WebSocket
 * Run with: node scripts/force-emit-terminal.js <farmId>
 */

const { readFileSync, readdirSync } = require('fs');
const path = require('path');
const io = require('socket.io-client');

const farmId = process.argv[2];
if (!farmId) {
  console.error('Usage: node scripts/force-emit-terminal.js <farmId>');
  process.exit(1);
}

const MAIBARN_DIR = path.join(__dirname, '..', '..', 'var', 'maibarn');
const terminalsDir = path.join(MAIBARN_DIR, 'terminals', farmId);

console.log(`\n🚀 Force emitting terminal output for farm: ${farmId}`);
console.log(`📁 Reading from: ${terminalsDir}\n`);

// Connect to WebSocket
const socket = io('http://localhost:4567', {
  transports: ['websocket']
});

socket.on('connect', () => {
  console.log('✅ Connected to WebSocket server\n');

  try {
    // Read all agent log files
    const files = readdirSync(terminalsDir).filter(f => f.endsWith('.log'));
    console.log(`📄 Found ${files.length} log files: ${files.join(', ')}\n`);

    files.forEach(file => {
      const agentMatch = file.match(/agent-(\d+)\.log/);
      if (!agentMatch) return;

      const agentId = parseInt(agentMatch[1]);
      const filePath = path.join(terminalsDir, file);
      const content = readFileSync(filePath, 'utf8');

      console.log(`📤 Emitting ${content.length} bytes for agent ${agentId}...`);

      // Split into lines and emit in chunks
      const lines = content.split('\n').filter(line => line.trim());
      const chunkSize = 50;

      for (let i = 0; i < lines.length; i += chunkSize) {
        const chunk = lines.slice(i, i + chunkSize);

        socket.emit('terminal:force_output', {
          farmId,
          agentId,
          agentIndex: agentId,
          paneId: agentId,
          lines: chunk,
          output: chunk
        });
      }

      console.log(`   ✓ Sent ${lines.length} lines in ${Math.ceil(lines.length / chunkSize)} chunks`);
    });

    console.log('\n✅ All terminal output emitted!');
    console.log('🔄 Refresh your browser to see the output\n');

    setTimeout(() => {
      socket.disconnect();
      process.exit(0);
    }, 1000);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
});

socket.on('connect_error', (error) => {
  console.error('❌ WebSocket connection error:', error.message);
  process.exit(1);
});

socket.on('disconnect', () => {
  console.log('Disconnected from WebSocket server');
});
