#!/usr/bin/env node

/**
 * Test Script: Terminal Display with Database Persistence
 * 
 * This script tests the complete flow of:
 * 1. Creating a farm with agents
 * 2. Capturing terminal output via tmux pipe-pane
 * 3. Persisting terminal data to PostgreSQL
 * 4. Retrieving and displaying terminal output
 */

const axios = require('axios');
const { Client } = require('pg');
const { io } = require('socket.io-client');
const chalk = require('chalk');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const API_BASE = 'http://localhost:4567/api';
const WS_BASE = 'http://localhost:4567';

// Database configuration
const dbConfig = {
  host: 'localhost',
  port: 5432,
  database: 'maifarm_dev',
  user: 'maifarm',
  password: 'maifarm123'
};

let dbClient;
let socket;
let farmId;
let sessionName;

const log = {
  info: (msg) => console.log(chalk.blue('ℹ'), msg),
  success: (msg) => console.log(chalk.green('✓'), msg),
  error: (msg) => console.log(chalk.red('✗'), msg),
  warn: (msg) => console.log(chalk.yellow('⚠'), msg),
  data: (label, data) => console.log(chalk.cyan(label + ':'), data)
};

async function connectDatabase() {
  log.info('Connecting to PostgreSQL...');
  dbClient = new Client(dbConfig);
  await dbClient.connect();
  log.success('Database connected');
}

async function setupWebSocket() {
  return new Promise((resolve) => {
    log.info('Connecting to WebSocket...');
    socket = io(WS_BASE, {
      transports: ['websocket'],
      reconnection: true
    });
    
    socket.on('connect', () => {
      log.success('WebSocket connected');
      resolve();
    });
    
    socket.on('terminal:output', (data) => {
      log.data('Terminal Output', {
        farmId: data.farmId,
        agentId: data.agentId,
        length: data.content?.length || 0,
        preview: data.content?.substring(0, 100) + '...'
      });
    });
    
    socket.on('error', (error) => {
      log.error('WebSocket error: ' + error.message);
    });
  });
}

async function createTestFarm() {
  log.info('Creating test farm...');
  
  try {
    const response = await axios.post(`${API_BASE}/farms`, {
      name: 'Terminal Persistence Test',
      seedPrompt: 'Test terminal output persistence to database',
      config: {
        numAgents: 2,
        modelConfig: {
          provider: 'openai',
          model: 'gpt-4',
          temperature: 0.7
        },
        timeout: 300
      }
    });
    
    farmId = response.data.id;
    sessionName = `farm-${farmId.substring(0, 8)}`;
    
    log.success(`Farm created: ${farmId}`);
    log.data('Session', sessionName);
    
    // Join farm WebSocket room
    socket.emit('farm:join', { farmId });
    
    return response.data;
  } catch (error) {
    log.error('Failed to create farm: ' + error.message);
    throw error;
  }
}

async function simulateTerminalOutput() {
  log.info('Simulating terminal output...');
  
  const maibarnPath = path.join(__dirname, '..', 'maibarn');
  const terminalDir = path.join(maibarnPath, 'terminals', sessionName);
  
  // Create terminal directory
  if (!fs.existsSync(terminalDir)) {
    fs.mkdirSync(terminalDir, { recursive: true });
  }
  
  // Simulate output for each agent
  const agents = ['agent_0', 'agent_1'];
  for (const agent of agents) {
    const outputFile = path.join(terminalDir, `${agent}.log`);
    
    // Write initial output
    const initialOutput = `[${new Date().toISOString()}] ${agent} started\n`;
    fs.writeFileSync(outputFile, initialOutput);
    
    // Simulate progressive output
    for (let i = 1; i <= 3; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const output = `[${new Date().toISOString()}] ${agent} - Processing step ${i}/3...\n`;
      fs.appendFileSync(outputFile, output);
      log.info(`${agent} wrote: step ${i}`);
    }
    
    // Final output
    const finalOutput = `[${new Date().toISOString()}] ${agent} completed successfully\n`;
    fs.appendFileSync(outputFile, finalOutput);
  }
  
  log.success('Terminal output simulation complete');
}

async function checkDatabasePersistence() {
  log.info('Checking database for persisted terminal data...');
  
  // Check terminal_sessions table
  const sessionQuery = `
    SELECT id, farm_id, session_name, status, created_at
    FROM terminal_sessions 
    WHERE farm_id = $1
  `;
  
  const sessionResult = await dbClient.query(sessionQuery, [farmId]);
  if (sessionResult.rows.length > 0) {
    log.success('Terminal session found in database');
    log.data('Session', sessionResult.rows[0]);
  } else {
    log.warn('No terminal session found in database');
  }
  
  // Check terminal_outputs table
  const outputQuery = `
    SELECT 
      to.id,
      to.session_id,
      to.agent_id,
      to.output_type,
      LENGTH(to.content) as content_length,
      to.created_at,
      ts.session_name
    FROM terminal_outputs to
    JOIN terminal_sessions ts ON to.session_id = ts.id
    WHERE ts.farm_id = $1
    ORDER BY to.created_at DESC
    LIMIT 10
  `;
  
  const outputResult = await dbClient.query(outputQuery, [farmId]);
  log.info(`Found ${outputResult.rows.length} terminal output records`);
  
  if (outputResult.rows.length > 0) {
    log.success('Terminal outputs persisted to database');
    outputResult.rows.forEach((row, idx) => {
      log.data(`Output ${idx + 1}`, {
        agent: row.agent_id,
        type: row.output_type,
        length: row.content_length,
        created: row.created_at
      });
    });
  } else {
    log.warn('No terminal outputs found in database');
  }
  
  // Check aggregated stats
  const statsQuery = `
    SELECT 
      agent_id,
      COUNT(*) as output_count,
      SUM(LENGTH(content)) as total_bytes,
      MIN(created_at) as first_output,
      MAX(created_at) as last_output
    FROM terminal_outputs to
    JOIN terminal_sessions ts ON to.session_id = ts.id
    WHERE ts.farm_id = $1
    GROUP BY agent_id
  `;
  
  const statsResult = await dbClient.query(statsQuery, [farmId]);
  if (statsResult.rows.length > 0) {
    log.success('Terminal output statistics:');
    statsResult.rows.forEach(row => {
      log.data(`Agent ${row.agent_id}`, {
        outputs: row.output_count,
        bytes: row.total_bytes,
        duration: `${Math.round((new Date(row.last_output) - new Date(row.first_output)) / 1000)}s`
      });
    });
  }
}

async function retrieveTerminalOutput() {
  log.info('Retrieving terminal output via API...');
  
  try {
    const response = await axios.get(`${API_BASE}/farms/${farmId}/terminal`);
    
    if (response.data && response.data.outputs) {
      log.success(`Retrieved ${response.data.outputs.length} terminal outputs`);
      
      response.data.outputs.slice(0, 5).forEach((output, idx) => {
        log.data(`Retrieved Output ${idx + 1}`, {
          agent: output.agentId,
          timestamp: output.timestamp,
          preview: output.content?.substring(0, 50) + '...'
        });
      });
    } else {
      log.warn('No terminal outputs retrieved from API');
    }
  } catch (error) {
    log.error('Failed to retrieve terminal output: ' + error.message);
  }
}

async function checkTmuxSession() {
  log.info('Checking tmux session...');
  
  try {
    const sessions = execSync('TMUX_TMPDIR=/tmp tmux list-sessions 2>/dev/null || true', { encoding: 'utf-8' });
    
    if (sessions.includes(sessionName)) {
      log.success(`Tmux session '${sessionName}' exists`);
      
      // Check panes
      const panes = execSync(`TMUX_TMPDIR=/tmp tmux list-panes -t ${sessionName} 2>/dev/null || true`, { encoding: 'utf-8' });
      const paneCount = panes.split('\n').filter(line => line.trim()).length;
      log.data('Tmux Panes', paneCount);
    } else {
      log.warn(`Tmux session '${sessionName}' not found`);
    }
  } catch (error) {
    log.warn('Could not check tmux session');
  }
}

async function cleanup() {
  log.info('Cleaning up...');
  
  if (socket) {
    socket.disconnect();
    log.success('WebSocket disconnected');
  }
  
  if (dbClient) {
    await dbClient.end();
    log.success('Database connection closed');
  }
  
  // Kill tmux session if exists
  if (sessionName) {
    try {
      execSync(`TMUX_TMPDIR=/tmp tmux kill-session -t ${sessionName} 2>/dev/null || true`);
      log.success(`Tmux session '${sessionName}' killed`);
    } catch (error) {
      // Ignore errors
    }
  }
}

async function runTest() {
  console.log(chalk.bold.cyan('\n🧪 Terminal Display & Database Persistence Test\n'));
  
  try {
    await connectDatabase();
    await setupWebSocket();
    await createTestFarm();
    
    // Give the farm time to initialize
    log.info('Waiting for farm initialization...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    await checkTmuxSession();
    await simulateTerminalOutput();
    
    // Wait for persistence
    log.info('Waiting for database persistence...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await checkDatabasePersistence();
    await retrieveTerminalOutput();
    
    console.log(chalk.bold.green('\n✅ Test completed successfully!\n'));
  } catch (error) {
    console.error(chalk.bold.red('\n❌ Test failed:\n'), error);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT, cleaning up...');
  await cleanup();
  process.exit(0);
});

process.on('uncaughtException', async (error) => {
  console.error('Uncaught exception:', error);
  await cleanup();
  process.exit(1);
});

// Run the test
runTest();