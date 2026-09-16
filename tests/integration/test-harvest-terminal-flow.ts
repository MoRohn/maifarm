#!/usr/bin/env node
/**
 * End-to-end test for Harvest Terminal with multiple agents
 * Tests the complete flow from farm creation to terminal streaming
 */

import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import { TIMING } from '../../apps/shared/types/unified';

const API_URL = 'http://localhost:4567/api';
const WS_URL = 'http://localhost:4567';

interface TestResult {
  passed: boolean;
  message: string;
  details?: any;
}

class HarvestTerminalFlowTest {
  private socket: Socket | null = null;
  private farmId: string | null = null;
  private terminalOutputs: Map<number, string[]> = new Map();
  private correlationId: string;
  
  constructor() {
    this.correlationId = `test-${Date.now().toString(36)}`;
  }
  
  /**
   * Run complete test suite
   */
  async runTests(): Promise<void> {
    console.log('🧪 Starting Harvest Terminal Flow Tests\n');
    console.log(`📋 Correlation ID: ${this.correlationId}\n`);
    
    const tests = [
      { name: 'Server Health Check', fn: () => this.testServerHealth() },
      { name: 'WebSocket Connection', fn: () => this.testWebSocketConnection() },
      { name: 'Farm Creation', fn: () => this.testFarmCreation() },
      { name: 'Agent Launch Verification', fn: () => this.testAgentLaunch() },
      { name: 'Terminal Stream Setup', fn: () => this.testTerminalStream() },
      { name: 'Terminal Output Capture', fn: () => this.testTerminalOutput() },
      { name: 'Agent Health Monitoring', fn: () => this.testAgentHealth() },
      { name: 'Harvest Collection', fn: () => this.testHarvestCollection() },
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const test of tests) {
      process.stdout.write(`  ${test.name}... `);
      try {
        const result = await test.fn();
        if (result.passed) {
          console.log('✅', result.message);
          passed++;
        } else {
          console.log('❌', result.message);
          if (result.details) {
            console.log('     Details:', result.details);
          }
          failed++;
        }
      } catch (error: any) {
        console.log('❌ Error:', error.message);
        failed++;
      }
    }
    
    console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
    
    // Cleanup
    await this.cleanup();
    
    process.exit(failed > 0 ? 1 : 0);
  }
  
  /**
   * Test server health
   */
  async testServerHealth(): Promise<TestResult> {
    try {
      const response = await axios.get(`${API_URL}/health`);
      return {
        passed: response.data.status === 'healthy',
        message: 'Server is healthy'
      };
    } catch (error) {
      return {
        passed: false,
        message: 'Server health check failed',
        details: error.message
      };
    }
  }
  
  /**
   * Test WebSocket connection
   */
  async testWebSocketConnection(): Promise<TestResult> {
    return new Promise((resolve) => {
      this.socket = io(WS_URL, {
        transports: ['websocket'],
        reconnection: false
      });
      
      const timeout = setTimeout(() => {
        resolve({
          passed: false,
          message: 'WebSocket connection timeout'
        });
      }, 5000);
      
      this.socket.on('connect', () => {
        clearTimeout(timeout);
        
        // Set up event listeners for terminal output
        this.socket!.on('terminal:output', (data) => {
          const { agentId, lines } = data;
          if (!this.terminalOutputs.has(agentId)) {
            this.terminalOutputs.set(agentId, []);
          }
          this.terminalOutputs.get(agentId)!.push(...lines);
        });
        
        resolve({
          passed: true,
          message: 'WebSocket connected'
        });
      });
      
      this.socket.on('connect_error', (error) => {
        clearTimeout(timeout);
        resolve({
          passed: false,
          message: 'WebSocket connection failed',
          details: error.message
        });
      });
    });
  }
  
  /**
   * Test farm creation with multiple agents
   */
  async testFarmCreation(): Promise<TestResult> {
    try {
      const farmData = {
        name: `Test Farm ${this.correlationId}`,
        description: 'Test harvest terminal flow with 3 agents',
        type: 'collaborative',
        config: {
          maxAgents: 3,
          provider: 'claude',
          timeout: 60, // 1 minute for testing
          yaml: `
name: Test Harvest Terminal
agents:
  - name: Agent 1
    prompt: "Echo 'Agent 1 is running' every 5 seconds"
  - name: Agent 2
    prompt: "Echo 'Agent 2 is working' every 5 seconds"
  - name: Agent 3
    prompt: "Echo 'Agent 3 is active' every 5 seconds"
          `.trim()
        }
      };
      
      const response = await axios.post(`${API_URL}/farms`, farmData, {
        headers: { 'X-Correlation-ID': this.correlationId }
      });
      
      this.farmId = response.data.data.id;
      
      return {
        passed: response.data.success && this.farmId != null,
        message: `Farm created: ${this.farmId?.slice(0, 8)}...`
      };
    } catch (error: any) {
      return {
        passed: false,
        message: 'Farm creation failed',
        details: error.response?.data || error.message
      };
    }
  }
  
  /**
   * Test agent launch verification
   */
  async testAgentLaunch(): Promise<TestResult> {
    if (!this.farmId) {
      return {
        passed: false,
        message: 'No farm ID available'
      };
    }
    
    // Wait for agents to launch
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    try {
      const response = await axios.get(`${API_URL}/farms/${this.farmId}/agents`);
      const agents = response.data.data;
      
      const allActive = agents.every((agent: any) => 
        ['active', 'working', 'initializing'].includes(agent.status)
      );
      
      return {
        passed: agents.length === 3 && allActive,
        message: `${agents.length} agents launched and active`,
        details: agents.map((a: any) => `${a.name}: ${a.status}`)
      };
    } catch (error: any) {
      return {
        passed: false,
        message: 'Failed to verify agent launch',
        details: error.message
      };
    }
  }
  
  /**
   * Test terminal stream setup
   */
  async testTerminalStream(): Promise<TestResult> {
    if (!this.farmId || !this.socket) {
      return {
        passed: false,
        message: 'Prerequisites not met'
      };
    }
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({
          passed: false,
          message: 'Terminal stream setup timeout'
        });
      }, 10000);
      
      // Listen for streaming ready event
      this.socket!.once('terminal:streaming:ready', (data) => {
        clearTimeout(timeout);
        resolve({
          passed: data.farmId === this.farmId && data.agentCount === 3,
          message: `Terminal streaming ready for ${data.agentCount} agents`
        });
      });
      
      // Request terminal join
      this.socket!.emit('terminal:join', { 
        farmId: this.farmId,
        correlationId: this.correlationId
      });
    });
  }
  
  /**
   * Test terminal output capture
   */
  async testTerminalOutput(): Promise<TestResult> {
    // Wait for terminal outputs
    await new Promise(resolve => setTimeout(resolve, 8000));
    
    const hasOutputs = this.terminalOutputs.size > 0;
    const outputSummary = Array.from(this.terminalOutputs.entries())
      .map(([agentId, lines]) => `Agent ${agentId}: ${lines.length} lines`)
      .join(', ');
    
    return {
      passed: hasOutputs,
      message: hasOutputs ? `Captured outputs: ${outputSummary}` : 'No terminal outputs captured',
      details: hasOutputs ? 
        Array.from(this.terminalOutputs.entries())
          .map(([id, lines]) => `Agent ${id}: ${lines.slice(0, 3).join(' | ')}`)
        : undefined
    };
  }
  
  /**
   * Test agent health monitoring
   */
  async testAgentHealth(): Promise<TestResult> {
    if (!this.farmId) {
      return {
        passed: false,
        message: 'No farm ID available'
      };
    }
    
    try {
      const response = await axios.get(`${API_URL}/farms/${this.farmId}/health`);
      const health = response.data.data;
      
      const allHealthy = health.agents?.every((agent: any) => 
        agent.status === 'healthy' || agent.status === 'degraded'
      );
      
      return {
        passed: health.status === 'healthy' && allHealthy,
        message: `Farm health: ${health.status}`,
        details: health.agents?.map((a: any) => `${a.agentId}: ${a.status}`)
      };
    } catch (error: any) {
      return {
        passed: false,
        message: 'Health check failed',
        details: error.message
      };
    }
  }
  
  /**
   * Test harvest collection
   */
  async testHarvestCollection(): Promise<TestResult> {
    if (!this.farmId) {
      return {
        passed: false,
        message: 'No farm ID available'
      };
    }
    
    try {
      // Trigger harvest
      const response = await axios.post(`${API_URL}/farms/${this.farmId}/harvest`, {
        includeWorkspace: true,
        includeTerminalLogs: true
      });
      
      // Wait for harvest to complete
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Check harvest status
      const harvestId = response.data.data.harvestId;
      const statusResponse = await axios.get(`${API_URL}/harvests/${harvestId}`);
      const harvest = statusResponse.data.data;
      
      return {
        passed: harvest.status === 'completed' && harvest.files?.length > 0,
        message: `Harvest completed with ${harvest.files?.length || 0} files`,
        details: harvest.summary
      };
    } catch (error: any) {
      return {
        passed: false,
        message: 'Harvest collection failed',
        details: error.message
      };
    }
  }
  
  /**
   * Cleanup test resources
   */
  async cleanup(): Promise<void> {
    console.log('\n🧹 Cleaning up...');
    
    // Disconnect WebSocket
    if (this.socket) {
      this.socket.disconnect();
    }
    
    // Terminate farm if created
    if (this.farmId) {
      try {
        await axios.post(`${API_URL}/farms/${this.farmId}/terminate`);
        console.log(`  Farm ${this.farmId.slice(0, 8)}... terminated`);
      } catch (error) {
        console.log(`  Failed to terminate farm: ${error.message}`);
      }
    }
  }
}

// Run tests
if (require.main === module) {
  const test = new HarvestTerminalFlowTest();
  test.runTests().catch(console.error);
}

export default HarvestTerminalFlowTest;
