#!/usr/bin/env node

/**
 * Enhanced Quick Task Agent Monitoring QA Test
 * Tests the complete pipeline from farm creation to harvest completion in Barn
 */

import http from 'http';
import WebSocket from 'ws';
import { spawn } from 'child_process';
import { readFileSync, existsSync, watchFile, unwatchFile } from 'fs';
import { join } from 'path';

const API_BASE = 'http://localhost:4567';
const WS_URL = 'ws://localhost:4567';
const COORDINATION_PATH = '/tmp/claude_coordination';
const ACTIVE_AGENTS_FILE = join(COORDINATION_PATH, 'active_agents.json');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  purple: '\x1b[35m',
  gray: '\x1b[90m'
};

function log(message, level = 'info') {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const color = {
    info: colors.blue,
    success: colors.green,
    error: colors.red,
    warning: colors.yellow,
    progress: colors.cyan,
    debug: colors.purple,
    trace: colors.gray
  }[level] || colors.reset;
  
  console.log(`[${timestamp}] ${color}${message}${colors.reset}`);
}

async function apiRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            body: data ? JSON.parse(data) : null
          });
        } catch (error) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function checkTmuxSessions() {
  return new Promise((resolve) => {
    const tmux = spawn('tmux', ['list-sessions', '-F', '#{session_name}']);
    let output = '';
    
    tmux.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    tmux.on('close', (code) => {
      if (code === 0) {
        const sessions = output.trim().split('\n').filter(Boolean);
        resolve(sessions);
      } else {
        resolve([]);
      }
    });
  });
}

async function getTmuxOutput(sessionName, paneId = '0.0') {
  return new Promise((resolve) => {
    const tmux = spawn('tmux', [
      'capture-pane',
      '-t', `${sessionName}:${paneId}`,
      '-p',
      '-S', '-50'
    ]);
    
    let output = '';
    tmux.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    tmux.on('close', () => {
      resolve(output);
    });
  });
}

function checkActiveAgentsFile() {
  try {
    if (!existsSync(ACTIVE_AGENTS_FILE)) {
      return { exists: false, agents: [], error: 'File does not exist' };
    }
    
    const content = readFileSync(ACTIVE_AGENTS_FILE, 'utf-8');
    if (!content.trim()) {
      return { exists: true, agents: [], error: 'File is empty' };
    }
    
    const data = JSON.parse(content);
    const agents = Object.entries(data).map(([id, agent]) => ({
      id,
      ...agent
    }));
    
    return { exists: true, agents, error: null };
  } catch (error) {
    return { exists: true, agents: [], error: error.message };
  }
}

class AgentMonitoringQA {
  constructor() {
    this.ws = null;
    this.taskId = null;
    this.farmId = null;
    this.harvestId = null;
    this.events = [];
    this.startTime = null;
    this.agentFileWatcher = null;
    this.testResults = {
      farmCreation: false,
      agentRegistration: false,
      coordinationFileUpdate: false,
      websocketEvents: false,
      dashboardVisibility: false,
      harvestCreation: false,
      harvestCompletion: false,
      barnAvailability: false
    };
    this.timeline = [];
    this.agentEvents = [];
  }

  addTimelineEvent(event, data = {}) {
    this.timeline.push({
      timestamp: new Date(),
      event,
      data,
      elapsed: Date.now() - this.startTime
    });
    log(`TIMELINE: ${event}`, 'trace');
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(WS_URL);
      
      this.ws.on('open', () => {
        log('WebSocket connected', 'success');
        this.addTimelineEvent('websocket_connected');
        resolve();
      });
      
      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          this.events.push({
            type: message.type,
            data: message,
            timestamp: new Date()
          });
          this.handleWebSocketMessage(message);
        } catch (error) {
          // Ignore parse errors
        }
      });
      
      this.ws.on('error', (error) => {
        log(`WebSocket error: ${error.message}`, 'error');
      });
      
      setTimeout(() => reject(new Error('WebSocket connection timeout')), 10000);
    });
  }

  handleWebSocketMessage(message) {
    const { type } = message;
    
    // Log all relevant events
    if (message.taskId === this.taskId || message.farmId === this.farmId || message.harvestId === this.harvestId) {
      this.addTimelineEvent(`websocket_${type}`, message);
      
      switch (type) {
        case 'task:created':
          log(`✓ Task created: ${message.taskId}`, 'success');
          this.testResults.farmCreation = true;
          break;
        case 'farm:launched':
          log(`✓ Farm launched: ${message.farmId}`, 'success');
          break;
        case 'farm:tmux:ready':
          log(`✓ Tmux ready: ${message.sessionName}`, 'success');
          break;
        case 'agent:updated':
        case 'agents:updated':
          log(`✓ Agent updated: ${JSON.stringify(message)}`, 'success');
          this.testResults.agentRegistration = true;
          this.testResults.websocketEvents = true;
          this.agentEvents.push({...message, timestamp: new Date()});
          break;
        case 'agent:status':
          log(`✓ Agent status: ${message.status}`, 'success');
          break;
        case 'harvest:started':
          log(`✓ Harvest started: ${message.harvestId}`, 'success');
          this.testResults.harvestCreation = true;
          this.harvestId = message.harvestId;
          break;
        case 'harvest:ready':
          log(`✓ Harvest ready: ${message.harvestId}`, 'success');
          this.testResults.harvestCompletion = true;
          break;
        case 'task:completed':
          log(`✓ Task completed: ${message.taskId}`, 'success');
          break;
        case 'task:failed':
          log(`✗ Task failed: ${message.error}`, 'error');
          break;
        default:
          if (type.includes('agent') || type.includes('farm') || type.includes('harvest')) {
            log(`📡 ${type}: ${JSON.stringify(message)}`, 'debug');
          }
      }
    }
  }

  setupActiveAgentsFileWatcher() {
    log('Setting up active_agents.json file watcher', 'info');
    
    // Check if directory exists
    const checkDir = spawn('ls', ['-la', COORDINATION_PATH]);
    checkDir.on('close', (code) => {
      log(`Coordination directory check: ${code === 0 ? 'exists' : 'missing'}`, code === 0 ? 'success' : 'warning');
    });
    
    if (existsSync(ACTIVE_AGENTS_FILE)) {
      const initialCheck = checkActiveAgentsFile();
      log(`Initial agents file: ${initialCheck.agents.length} agents`, 'info');
    }
    
    // Watch file with enhanced logging
    watchFile(ACTIVE_AGENTS_FILE, { interval: 1000 }, (curr, prev) => {
      log('Active agents file changed', 'info');
      const check = checkActiveAgentsFile();
      
      if (check.exists) {
        log(`Agents in file: ${check.agents.length}`, 'success');
        check.agents.forEach((agent, idx) => {
          log(`  Agent ${idx}: ${agent.id} - ${agent.status} (Farm: ${agent.farm_id})`, 'info');
        });
        
        if (check.agents.length > 0) {
          this.testResults.coordinationFileUpdate = true;
          this.addTimelineEvent('coordination_file_updated', { agentCount: check.agents.length });
        }
      } else {
        log(`Agents file error: ${check.error}`, 'error');
      }
    });
    
    this.agentFileWatcher = true;
  }

  async createQuickTask() {
    log('Creating Quick Task for agent monitoring test...', 'info');
    this.startTime = Date.now();
    this.addTimelineEvent('test_started');
    
    const taskData = {
      title: 'Agent Monitoring QA Test',
      description: 'Test task to validate agent monitoring pipeline: multi-claude agent registration → coordination file → websocket events → dashboard → harvest → barn',
      priority: 'medium',
      timeout: 300000, // 5 minutes
      metadata: {
        testType: 'agent-monitoring-qa',
        createdAt: new Date().toISOString(),
        purpose: 'pipeline-validation'
      }
    };
    
    this.addTimelineEvent('quick_task_creation_started', taskData);
    const response = await apiRequest('POST', '/api/tasks/quick', taskData);
    
    if (response.status !== 201 && response.status !== 200) {
      throw new Error(`Failed to create task: ${response.status}`);
    }
    
    if (!response.body.success) {
      throw new Error(`Task creation failed: ${JSON.stringify(response.body)}`);
    }
    
    this.taskId = response.body.data.taskId;
    this.farmId = response.body.data.farmId;
    this.harvestId = response.body.data.harvestId;
    
    log(`✓ Task created successfully!`, 'success');
    log(`  Task ID: ${this.taskId}`, 'info');
    log(`  Farm ID: ${this.farmId}`, 'info');
    log(`  Harvest ID: ${this.harvestId || 'Not yet assigned'}`, 'info');
    
    this.addTimelineEvent('quick_task_created', {
      taskId: this.taskId,
      farmId: this.farmId,
      harvestId: this.harvestId
    });
    
    return response.body.data;
  }

  async monitorAgentPipeline() {
    log('Starting comprehensive agent monitoring pipeline test...', 'info');
    
    const maxChecks = 60; // 5 minutes with 5-second intervals
    let checkCount = 0;
    
    return new Promise((resolve) => {
      const checkInterval = setInterval(async () => {
        checkCount++;
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        
        log(`Check #${checkCount}/${maxChecks} - Elapsed: ${elapsed}s`, 'progress');
        
        try {
          // 1. Check task status
          const taskResponse = await apiRequest('GET', `/api/tasks/${this.taskId}`);
          if (taskResponse.body?.data) {
            const status = taskResponse.body.data.status;
            log(`Task status: ${status}`, 'info');
            
            if (status === 'completed') {
              log('✓ Task completed - continuing monitoring for harvest', 'success');
            } else if (status === 'failed') {
              log(`✗ Task failed: ${taskResponse.body.data.error}`, 'error');
            }
          }
          
          // 2. Check tmux sessions
          const sessions = await checkTmuxSessions();
          const relevantSessions = sessions.filter(s => 
            s.includes(this.farmId) || 
            s.includes('quick-task') ||
            s.includes('farm-') ||
            (this.taskId && s.includes(this.taskId.substring(0, 8)))
          );
          
          if (relevantSessions.length > 0) {
            log(`✓ Found tmux sessions: ${relevantSessions.join(', ')}`, 'success');
            
            // Get terminal output from first session
            const output = await getTmuxOutput(relevantSessions[0]);
            if (output.trim()) {
              const recentLines = output.trim().split('\n').slice(-3);
              log('Recent terminal output:', 'info');
              recentLines.forEach(line => log(`  ${line}`, 'trace'));
            }
          }
          
          // 3. Check active_agents.json
          const agentsCheck = checkActiveAgentsFile();
          if (agentsCheck.exists && agentsCheck.agents.length > 0) {
            log(`✓ Coordination file has ${agentsCheck.agents.length} agents`, 'success');
            this.testResults.coordinationFileUpdate = true;
          }
          
          // 4. Check farm status
          const farmResponse = await apiRequest('GET', `/api/farms/${this.farmId}`);
          if (farmResponse.body?.data) {
            log(`Farm status: ${farmResponse.body.data.status}`, 'info');
          }
          
          // 5. Check harvest status
          if (this.harvestId) {
            const harvestResponse = await apiRequest('GET', `/api/harvests/${this.harvestId}`);
            if (harvestResponse.body?.data) {
              const harvest = harvestResponse.body.data;
              log(`Harvest status: ${harvest.status} (Progress: ${harvest.progress || 0}%)`, 'info');
              
              if (harvest.status === 'ready' || harvest.status === 'completed') {
                this.testResults.harvestCompletion = true;
                log('✓ Harvest completed!', 'success');
              }
            }
          }
          
          // 6. Check barn availability
          const barnResponse = await apiRequest('GET', '/api/barn');
          if (barnResponse.body?.data) {
            const barnItems = barnResponse.body.data;
            const ourHarvest = barnItems.find(item => 
              item.harvestId === this.harvestId || 
              item.farmId === this.farmId
            );
            
            if (ourHarvest) {
              log('✓ Harvest available in Barn!', 'success');
              this.testResults.barnAvailability = true;
            }
          }
          
          // 7. Check dashboard agent visibility (via analytics API)
          const analyticsResponse = await apiRequest('GET', '/api/analytics/agents');
          if (analyticsResponse.body?.data?.agents) {
            const agents = analyticsResponse.body.data.agents;
            const ourAgents = agents.filter(agent => 
              agent.farmId === this.farmId
            );
            
            if (ourAgents.length > 0) {
              log(`✓ Dashboard shows ${ourAgents.length} agents`, 'success');
              this.testResults.dashboardVisibility = true;
            }
          }
          
          // Check if we should stop monitoring
          const allCriticalTestsPassed = 
            this.testResults.farmCreation && 
            this.testResults.coordinationFileUpdate && 
            this.testResults.websocketEvents &&
            (this.testResults.harvestCompletion || checkCount > 30); // Give up on harvest after 2.5 minutes
          
          if (allCriticalTestsPassed || checkCount >= maxChecks) {
            clearInterval(checkInterval);
            resolve();
          }
          
        } catch (error) {
          log(`Check failed: ${error.message}`, 'warning');
        }
      }, 5000); // Check every 5 seconds
    });
  }

  generateReport() {
    log('\n=== AGENT MONITORING QA TEST REPORT ===', 'info');
    
    const duration = Math.floor((Date.now() - this.startTime) / 1000);
    log(`Test Duration: ${duration} seconds`, 'info');
    
    log('\n📊 Test Results:', 'info');
    Object.entries(this.testResults).forEach(([test, passed]) => {
      const status = passed ? '✓' : '✗';
      const color = passed ? 'success' : 'error';
      log(`  ${status} ${test.replace(/([A-Z])/g, ' $1').toLowerCase()}`, color);
    });
    
    const passedTests = Object.values(this.testResults).filter(Boolean).length;
    const totalTests = Object.keys(this.testResults).length;
    const successRate = Math.round((passedTests / totalTests) * 100);
    
    log(`\n📈 Overall Success Rate: ${passedTests}/${totalTests} (${successRate}%)`, 
         successRate >= 75 ? 'success' : 'error');
    
    log('\n📡 WebSocket Events Captured:', 'info');
    const eventTypes = {};
    this.events.forEach(e => {
      eventTypes[e.type] = (eventTypes[e.type] || 0) + 1;
    });
    
    Object.entries(eventTypes).forEach(([type, count]) => {
      log(`  - ${type}: ${count}`, 'trace');
    });
    
    log('\n👥 Agent Events:', 'info');
    if (this.agentEvents.length > 0) {
      this.agentEvents.forEach((event, idx) => {
        log(`  ${idx + 1}. ${event.type}: ${JSON.stringify(event, null, 2)}`, 'trace');
      });
    } else {
      log('  ❌ No agent events captured - this indicates the core issue!', 'error');
    }
    
    log('\n⏱️ Timeline (key events):', 'info');
    this.timeline.forEach((event, idx) => {
      const elapsed = Math.round(event.elapsed / 1000);
      log(`  ${idx + 1}. [+${elapsed}s] ${event.event}`, 'trace');
    });
    
    // Specific failure analysis
    log('\n🔍 Failure Analysis:', 'info');
    
    if (!this.testResults.agentRegistration) {
      log('  ❌ CRITICAL: Agents not registering properly', 'error');
      log('     - Check orchestrator.py agent registration', 'error');
      log('     - Verify coordination file writing', 'error');
    }
    
    if (!this.testResults.coordinationFileUpdate) {
      log('  ❌ CRITICAL: Coordination file not updating', 'error');
      log('     - Check /tmp/claude_coordination/ directory permissions', 'error');
      log('     - Verify active_agents.json file creation', 'error');
    }
    
    if (!this.testResults.websocketEvents) {
      log('  ❌ CRITICAL: WebSocket events missing', 'error');
      log('     - Check coordinationService.ts file watching', 'error');
      log('     - Verify WebSocket broadcasting in multiClaudeService.ts', 'error');
    }
    
    if (!this.testResults.dashboardVisibility) {
      log('  ❌ Dashboard not showing agents', 'error');
      log('     - Check database agent synchronization', 'error');
      log('     - Verify analytics API agent data', 'error');
    }
    
    if (!this.testResults.harvestCompletion) {
      log('  ❌ Harvest not completing', 'error');
      log('     - Check harvestService.ts trigger conditions', 'error');
      log('     - Verify agent output collection', 'error');
    }
  }

  cleanup() {
    if (this.agentFileWatcher) {
      unwatchFile(ACTIVE_AGENTS_FILE);
    }
    
    if (this.ws) {
      this.ws.close();
    }
  }

  async run() {
    try {
      log('=== ENHANCED AGENT MONITORING QA TEST ===', 'info');
      log('This test validates the complete pipeline:', 'info');
      log('  Quick Task → Farm Creation → Agent Registration → Coordination File → WebSocket Events → Dashboard → Harvest → Barn', 'info');
      
      // Check server health
      const healthResponse = await apiRequest('GET', '/api/health');
      if (healthResponse.status !== 200 && healthResponse.status !== 503) {
        throw new Error(`Server not healthy: ${healthResponse.status}`);
      }
      log(`✓ Server health check passed (${healthResponse.status})`, 'success');
      
      // Setup file watcher first
      this.setupActiveAgentsFileWatcher();
      
      // Connect WebSocket
      try {
        await this.connect();
      } catch (error) {
        log('WebSocket connection failed, continuing without it', 'warning');
      }
      
      // Create the test task
      await this.createQuickTask();
      
      // Monitor the complete pipeline
      await this.monitorAgentPipeline();
      
      // Generate comprehensive report
      this.generateReport();
      
    } catch (error) {
      log(`Test failed: ${error.message}`, 'error');
      console.error(error);
      
      this.generateReport(); // Generate report even on failure
      process.exit(1);
    } finally {
      this.cleanup();
    }
  }
}

// Run the test
const test = new AgentMonitoringQA();
test.run().catch(error => {
  log(`Fatal error: ${error.message}`, 'error');
  console.error(error);
  process.exit(1);
});