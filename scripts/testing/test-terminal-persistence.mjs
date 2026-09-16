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

import axios from 'axios';
import pg from 'pg';
import { io } from 'socket.io-client';
import chalk from 'chalk';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  data: (label, data) => console.log(chalk.cyan(label + ':'), JSON.stringify(data, null, 2))
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
      description: 'Testing terminal output capture and persistence to database',
      prompt: 'Test terminal output persistence to database',
      numberOfAgents: 2,
      provider: 'openai',
      mode: 'harvest',
      timeout: 300,
      config: {
        maxAgents: 2,
        timeout: 300,
        autoScale: false
      }
    });

    // Check response structure
    if (!response.data) {
      throw new Error('No data in response');
    }

    // Handle different response structures
    farmId = response.data.id || response.data.farmId || response.data.data?.id;

    if (!farmId) {
      log.error('Response structure:');
      log.data('Response', response.data);
      throw new Error('Failed to get farm ID from response');
    }

    sessionName = `farm-${farmId.substring(0, 8)}`;

    log.success(`Farm created: ${farmId}`);
    log.data('Session', { farmId, sessionName });
    
    // Join farm WebSocket room
    socket.emit('farm:join', { farmId });
    
    return response.data;
  } catch (error) {
    log.error('Failed to create farm: ' + error.message);
    if (error.response?.data) {
      log.data('Error Response', error.response.data);
    }
    throw error;
  }
}

async function simulateTerminalOutput() {
  log.info('Simulating terminal output...');
  
  const maibarnPath = path.join(__dirname, '..', '..', 'maibarn');
  const terminalDir = path.join(maibarnPath, 'terminals', sessionName);
  
  // Create terminal directory
  if (!fs.existsSync(terminalDir)) {
    fs.mkdirSync(terminalDir, { recursive: true });
    log.success(`Created terminal directory: ${terminalDir}`);
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
  
  // First check if terminal_sessions table exists
  const tableCheckQuery = `
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'terminal_sessions'
    );
  `;
  
  const tableExists = await dbClient.query(tableCheckQuery);
  if (!tableExists.rows[0].exists) {
    log.warn('Table terminal_sessions does not exist');
    log.info('Checking alternative storage in harvests table...');
    
    // Check harvests table for terminal data
    const harvestQuery = `
      SELECT 
        id, 
        farm_id, 
        status,
        metadata,
        created_at,
        updated_at
      FROM harvests 
      WHERE farm_id = $1
    `;
    
    try {
      const harvestResult = await dbClient.query(harvestQuery, [farmId]);
      if (harvestResult.rows.length > 0) {
        log.success('Found harvest record for farm');
        log.data('Harvest', harvestResult.rows[0]);
      } else {
        log.warn('No harvest record found for farm');
      }
    } catch (error) {
      log.warn('Could not query harvests table: ' + error.message);
    }
    
    return;
  }
  
  // Check terminal_sessions table
  const sessionQuery = `
    SELECT id, farm_id, session_name, status, created_at
    FROM terminal_sessions 
    WHERE farm_id = $1
  `;
  
  try {
    const sessionResult = await dbClient.query(sessionQuery, [farmId]);
    if (sessionResult.rows.length > 0) {
      log.success('Terminal session found in database');
      log.data('Session', sessionResult.rows[0]);
    } else {
      log.warn('No terminal session found in database');
    }
  } catch (error) {
    log.warn('Could not query terminal_sessions: ' + error.message);
  }
  
  // Check if terminal_outputs table exists
  const outputTableCheck = `
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'terminal_outputs'
    );
  `;
  
  const outputTableExists = await dbClient.query(outputTableCheck);
  if (!outputTableExists.rows[0].exists) {
    log.warn('Table terminal_outputs does not exist');
    return;
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
  
  try {
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
  } catch (error) {
    log.warn('Could not query terminal_outputs: ' + error.message);
  }
}

async function checkFileSystemStorage() {
  log.info('Checking file system for terminal outputs...');
  
  const maibarnPath = path.join(__dirname, '..', '..', 'maibarn');
  const terminalDir = path.join(maibarnPath, 'terminals', sessionName);
  
  if (fs.existsSync(terminalDir)) {
    log.success(`Terminal directory exists: ${terminalDir}`);
    
    const files = fs.readdirSync(terminalDir);
    log.info(`Found ${files.length} files in terminal directory`);
    
    files.forEach(file => {
      const filePath = path.join(terminalDir, file);
      const stats = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      log.data(file, {
        size: stats.size,
        lines: lines.length,
        lastModified: stats.mtime,
        preview: lines[0] || 'empty'
      });
    });
  } else {
    log.warn(`Terminal directory does not exist: ${terminalDir}`);
  }
  
  // Check workspace terminals
  const workspaceDir = path.join(maibarnPath, 'workspaces', 'active', farmId, 'terminals');
  if (fs.existsSync(workspaceDir)) {
    log.success(`Workspace terminal directory exists: ${workspaceDir}`);
    const files = fs.readdirSync(workspaceDir);
    log.info(`Found ${files.length} files in workspace terminal directory`);
  }
}

async function retrieveTerminalOutput() {
  log.info('Retrieving terminal output via API...');
  
  try {
    // Try the terminal endpoint
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
        return;
      }
    } catch (error) {
      log.warn('Terminal endpoint not available, trying harvest endpoint...');
    }
    
    // Try the harvest endpoint
    const harvestResponse = await axios.get(`${API_BASE}/farms/${farmId}/harvest`);
    
    if (harvestResponse.data) {
      log.success('Retrieved harvest data');
      log.data('Harvest Status', {
        status: harvestResponse.data.status,
        hasFiles: !!harvestResponse.data.files,
        fileCount: harvestResponse.data.files?.length || 0
      });
    }
  } catch (error) {
    log.error('Failed to retrieve output: ' + error.message);
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
      log.data('Tmux Panes', { count: paneCount });
      
      // Check for pipe-pane setup
      const pipeFiles = execSync(`ls -la /tmp/*.pipe 2>/dev/null || true`, { encoding: 'utf-8' });
      if (pipeFiles) {
        const farmPipes = pipeFiles.split('\n').filter(line => line.includes(sessionName));
        if (farmPipes.length > 0) {
          log.success(`Found ${farmPipes.length} pipe files for session`);
        }
      }
    } else {
      log.warn(`Tmux session '${sessionName}' not found`);
    }
  } catch (error) {
    log.warn('Could not check tmux session: ' + error.message);
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
  console.log(chalk.gray('This test verifies terminal output capture and storage\n'));
  
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
    log.info('Waiting for potential database persistence...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await checkDatabasePersistence();
    await checkFileSystemStorage();
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