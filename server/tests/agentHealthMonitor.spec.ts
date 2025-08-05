import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { AgentHealthMonitor } from '../services/agentHealthMonitor.js';
import type { HeartbeatData, AgentHealth } from '../types/agentHealth.js';

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('AgentHealthMonitor', () => {
  let monitor: AgentHealthMonitor;
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(tmpdir(), `test-heartbeats-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    monitor = new AgentHealthMonitor(testDir);
  });

  afterEach(async () => {
    await monitor.shutdown();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('initialize', () => {
    it('should create heartbeat directory and start monitoring', async () => {
      await monitor.initialize();
      
      const dirExists = await fs.access(testDir).then(() => true).catch(() => false);
      expect(dirExists).toBe(true);
    });

    it('should load existing heartbeat files', async () => {
      // Create a test heartbeat file
      const testAgent = {
        agentId: 'test-agent-1',
        status: 'working',
        lastHeartbeat: new Date().toISOString(),
        startTime: new Date().toISOString(),
        contextPercentage: 50,
        cycleTime: 30000,
        errorCount: 0,
        totalCycles: 10
      };
      
      await fs.writeFile(
        path.join(testDir, 'test-agent-1.json'),
        JSON.stringify(testAgent, null, 2)
      );
      
      await monitor.initialize();
      
      const agent = monitor.getAgentHealth('test-agent-1');
      expect(agent).toBeDefined();
      expect(agent?.agentId).toBe('test-agent-1');
      expect(agent?.totalCycles).toBe(10);
    });
  });

  describe('updateHeartbeat', () => {
    beforeEach(async () => {
      await monitor.initialize();
    });

    it('should create new agent on first heartbeat', async () => {
      const heartbeat: HeartbeatData = {
        agentId: 'agent-1',
        timestamp: new Date(),
        contextPercentage: 25,
        currentTask: 'Testing'
      };
      
      await monitor.updateHeartbeat(heartbeat);
      
      const agent = monitor.getAgentHealth('agent-1');
      expect(agent).toBeDefined();
      expect(agent?.status).toBe('working');
      expect(agent?.contextPercentage).toBe(25);
      expect(agent?.metadata?.currentTask).toBe('Testing');
    });

    it('should update existing agent', async () => {
      const agentId = 'agent-2';
      const firstHeartbeat: HeartbeatData = {
        agentId,
        timestamp: new Date(),
        contextPercentage: 30
      };
      
      await monitor.updateHeartbeat(firstHeartbeat);
      
      // Wait a bit for cycle time calculation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const secondHeartbeat: HeartbeatData = {
        agentId,
        timestamp: new Date(),
        contextPercentage: 40
      };
      
      await monitor.updateHeartbeat(secondHeartbeat);
      
      const agent = monitor.getAgentHealth(agentId);
      expect(agent?.totalCycles).toBe(2);
      expect(agent?.contextPercentage).toBe(40);
    });

    it('should increment error count on error', async () => {
      const agentId = 'agent-3';
      
      await monitor.updateHeartbeat({
        agentId,
        timestamp: new Date(),
        error: 'Test error'
      });
      
      const agent = monitor.getAgentHealth(agentId);
      expect(agent?.errorCount).toBe(1);
      expect(agent?.lastError).toBe('Test error');
    });

    it('should set error status after threshold', async () => {
      const agentId = 'agent-4';
      
      // Send multiple error heartbeats
      for (let i = 0; i < 3; i++) {
        await monitor.updateHeartbeat({
          agentId,
          timestamp: new Date(),
          error: `Error ${i + 1}`
        });
      }
      
      const agent = monitor.getAgentHealth(agentId);
      expect(agent?.status).toBe('error');
      expect(agent?.errorCount).toBe(3);
    });

    it('should emit context warning when threshold exceeded', async () => {
      const warningHandler = vi.fn();
      monitor.on('contextWarning', warningHandler);
      
      await monitor.updateHeartbeat({
        agentId: 'agent-5',
        timestamp: new Date(),
        contextPercentage: 90
      });
      
      expect(warningHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-5',
          contextPercentage: 90
        })
      );
    });

    it('should write heartbeat file', async () => {
      const agentId = 'agent-6';
      
      await monitor.updateHeartbeat({
        agentId,
        timestamp: new Date(),
        contextPercentage: 50
      });
      
      const filePath = path.join(testDir, `${agentId}.json`);
      const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
      
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      expect(data.agentId).toBe(agentId);
      expect(data.contextPercentage).toBe(50);
    });
  });

  describe('detectHealthStatus', () => {
    beforeEach(async () => {
      await monitor.initialize();
    });

    it('should detect idle agents after timeout', async () => {
      const agentId = 'agent-7';
      const oldTimestamp = new Date(Date.now() - 120000); // 2 minutes ago
      
      await monitor.updateHeartbeat({
        agentId,
        timestamp: oldTimestamp
      });
      
      const agents = monitor.detectHealthStatus();
      const agent = agents.find(a => a.agentId === agentId);
      expect(agent?.status).toBe('idle');
    });

    it('should detect disabled agents after stale threshold', async () => {
      const agentId = 'agent-8';
      const veryOldTimestamp = new Date(Date.now() - 600000); // 10 minutes ago
      
      await monitor.updateHeartbeat({
        agentId,
        timestamp: veryOldTimestamp
      });
      
      const agents = monitor.detectHealthStatus();
      const agent = agents.find(a => a.agentId === agentId);
      expect(agent?.status).toBe('disabled');
    });
  });

  describe('calculateAdaptiveTimeout', () => {
    beforeEach(async () => {
      await monitor.initialize();
    });

    it('should return default timeout for unknown agent', () => {
      const timeout = monitor.calculateAdaptiveTimeout('unknown-agent');
      expect(timeout).toBe(90000); // 30s * 3
    });

    it('should calculate adaptive timeout based on cycle times', async () => {
      const agentId = 'agent-9';
      
      // Simulate multiple heartbeats with varying intervals
      const intervals = [25000, 30000, 35000, 28000, 32000];
      let lastTime = Date.now();
      
      for (const interval of intervals) {
        await monitor.updateHeartbeat({
          agentId,
          timestamp: new Date(lastTime)
        });
        lastTime += interval;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      const timeout = monitor.calculateAdaptiveTimeout(agentId);
      
      // Should be greater than average but less than max
      expect(timeout).toBeGreaterThan(30000);
      expect(timeout).toBeLessThan(300000);
    });
  });

  describe('getSummary', () => {
    beforeEach(async () => {
      await monitor.initialize();
    });

    it('should return accurate summary', async () => {
      // Create agents with different statuses
      await monitor.updateHeartbeat({
        agentId: 'working-1',
        timestamp: new Date(),
        contextPercentage: 60
      });
      
      await monitor.updateHeartbeat({
        agentId: 'working-2',
        timestamp: new Date(),
        contextPercentage: 40
      });
      
      await monitor.updateHeartbeat({
        agentId: 'idle-1',
        timestamp: new Date(Date.now() - 120000),
        contextPercentage: 20
      });
      
      // Force error status
      for (let i = 0; i < 3; i++) {
        await monitor.updateHeartbeat({
          agentId: 'error-1',
          timestamp: new Date(),
          error: 'Test error'
        });
      }
      
      monitor.detectHealthStatus();
      const summary = monitor.getSummary();
      
      expect(summary.totalAgents).toBe(4);
      expect(summary.workingAgents).toBe(2);
      expect(summary.idleAgents).toBe(1);
      expect(summary.errorAgents).toBe(1);
      expect(summary.disabledAgents).toBe(0);
      expect(summary.averageContextUsage).toBeCloseTo(30); // (60+40+20+0)/4
    });
  });

  describe('event emission', () => {
    beforeEach(async () => {
      await monitor.initialize();
    });

    it('should emit heartbeat event', async () => {
      const heartbeatHandler = vi.fn();
      monitor.on('heartbeat', heartbeatHandler);
      
      await monitor.updateHeartbeat({
        agentId: 'agent-10',
        timestamp: new Date()
      });
      
      expect(heartbeatHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-10'
        })
      );
    });

    it('should emit periodic health checks', async () => {
      const healthCheckHandler = vi.fn();
      monitor.on('healthCheck', healthCheckHandler);
      
      // Wait for at least one health check (every 10 seconds)
      await new Promise(resolve => setTimeout(resolve, 11000));
      
      expect(healthCheckHandler).toHaveBeenCalled();
    }, 15000);
  });

  describe('error handling', () => {
    it('should handle file write errors gracefully', async () => {
      // Make directory read-only to cause write error
      await fs.chmod(testDir, 0o444);
      
      await monitor.initialize();
      
      // This should not throw
      await expect(monitor.updateHeartbeat({
        agentId: 'agent-11',
        timestamp: new Date()
      })).rejects.toThrow();
      
      // Reset permissions
      await fs.chmod(testDir, 0o755);
    });
  });
});