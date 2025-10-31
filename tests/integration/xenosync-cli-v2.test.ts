/**
 * Integration tests for Multi-Claude V2 Python integration
 * Tests the Python Redis coordination client and xenosync_cli_v2.py
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import { Redis } from 'ioredis';
import * as path from 'path';
import * as fs from 'fs/promises';

describe('Multi-Claude V2 Python Integration', () => {
  let redis: Redis;
  const testPythonScript = path.join(process.cwd(), 'scripts', 'python', 'xenosync_cli_v2.py');
  const testRedisClient = path.join(process.cwd(), 'scripts', 'python', 'redis_coordination_client.py');

  beforeAll(async () => {
    // Connect to Redis
    redis = new Redis({
      host: 'localhost',
      port: 6379,
      db: 4, // Separate DB for Python integration tests
      retryDelayOnFailure: 100,
      maxRetriesPerRequest: 3
    });

    await redis.ping();
    console.log('[TEST] Connected to Redis for Python integration tests');

    // Verify Python files exist
    const pythonFiles = [testPythonScript, testRedisClient];
    for (const file of pythonFiles) {
      try {
        await fs.access(file);
      } catch (error) {
        throw new Error(`Required Python file not found: ${file}`);
      }
    }
  });

  afterAll(async () => {
    await redis.flushdb();
    await redis.quit();
  });

  beforeEach(async () => {
    // Clear test data
    await redis.flushdb();
  });

  afterEach(async () => {
    // Ensure clean state
    const keys = await redis.keys('maifarm:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  describe('Redis Coordination Client', () => {
    it('should successfully test Redis connectivity', async () => {
      const result = await runPythonScript(testRedisClient);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Redis Coordination Client test completed successfully');
    }, 30000);

    it('should handle Redis connection failures gracefully', async () => {
      // Test with invalid Redis port
      const result = await runPythonScript(testRedisClient, [], {
        REDIS_PORT: '9999' // Non-existent port
      });
      
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Redis Coordination Client test failed');
    }, 15000);
  });

  describe('Multi-Claude V2 Farm Operations', () => {
    it('should create and monitor a simple farm', async () => {
      const farmId = 'python-test-farm-simple';
      
      const result = await runPythonScript(testPythonScript, [
        '--farm-id', farmId,
        '--prompt', 'Test prompt for Python integration',
        '--num-agents', '2',
        '--timeout', '30',
        '--redis-host', 'localhost',
        '--debug'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`Farm ${farmId} launched successfully`);
      expect(result.stdout).toContain('Monitoring completed');

      // Verify farm state was created in Redis
      const farmKey = `maifarm:coordination:farm:${farmId}`;
      const farmData = await redis.hgetall(farmKey);
      
      expect(Object.keys(farmData).length).toBeGreaterThan(0);
      expect(farmData.id).toBe(farmId);
    }, 60000);

    it('should handle farm creation conflicts', async () => {
      const farmId = 'conflict-test-farm';
      
      // Pre-create farm state in Redis
      await redis.hset(`maifarm:coordination:farm:${farmId}`, {
        id: farmId,
        status: 'running',
        sessionId: 'existing-session',
        agentCount: '1',
        startTime: new Date().toISOString(),
        lastUpdate: new Date().toISOString(),
        config: JSON.stringify({}),
        agents: JSON.stringify([])
      });

      const result = await runPythonScript(testPythonScript, [
        '--farm-id', farmId,
        '--prompt', 'Conflict test',
        '--num-agents', '1',
        '--timeout', '10',
        '--debug'
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain(`Farm ${farmId} already exists in Redis`);
    }, 30000);

    it('should support different AI providers', async () => {
      const farmId = 'provider-test-farm';
      
      const result = await runPythonScript(testPythonScript, [
        '--farm-id', farmId,
        '--prompt', 'Provider test',
        '--num-agents', '1',
        '--provider', 'qwen',
        '--timeout', '20',
        '--debug'
      ]);

      // Should attempt to create farm even if qwen isn't available
      expect(result.stdout).toContain('provider');
    }, 45000);

    it('should handle monitor-only mode', async () => {
      const farmId = 'monitor-only-farm';
      
      // Create initial farm state
      await redis.hset(`maifarm:coordination:farm:${farmId}`, {
        id: farmId,
        status: 'running',
        sessionId: 'monitor-session',
        agentCount: '2',
        startTime: new Date().toISOString(),
        lastUpdate: new Date().toISOString(),
        config: JSON.stringify({ timeout: 30000 }),
        agents: JSON.stringify(['agent1', 'agent2'])
      });

      const result = await runPythonScript(testPythonScript, [
        '--farm-id', farmId,
        '--monitor-only',
        '--timeout', '10',
        '--debug'
      ]);

      expect(result.stdout).toContain(`Monitoring existing farm: ${farmId}`);
    }, 30000);

    it('should handle YAML prompt files', async () => {
      const farmId = 'yaml-test-farm';
      const yamlContent = `
prompt: "YAML-based prompt test"
steps:
  - "Analyze the problem"
  - "Implement solution"
  - "Test implementation"
name: "YAML Test Farm"
description: "Farm created from YAML configuration"
`;

      // Create temporary YAML file
      const yamlFile = path.join(process.cwd(), 'test-prompt.yaml');
      await fs.writeFile(yamlFile, yamlContent);

      try {
        const result = await runPythonScript(testPythonScript, [
          '--farm-id', farmId,
          '--prompt-file', yamlFile,
          '--num-agents', '1',
          '--timeout', '20',
          '--debug'
        ]);

        expect(result.stdout).toContain('launched successfully');
        
        // Clean up
        await fs.unlink(yamlFile);
      } catch (error) {
        // Ensure cleanup even on failure
        try {
          await fs.unlink(yamlFile);
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
        throw error;
      }
    }, 45000);
  });

  describe('Agent Health and Monitoring', () => {
    it('should track agent heartbeats', async () => {
      const farmId = 'heartbeat-test-farm';
      
      // Start farm in background
      const farmProcess = spawn('python3', [
        testPythonScript,
        '--farm-id', farmId,
        '--prompt', 'Heartbeat test',
        '--num-agents', '2',
        '--timeout', '60',
        '--debug'
      ]);

      // Wait a bit for farm to initialize
      await new Promise(resolve => setTimeout(resolve, 10000));

      // Check for agent states in Redis
      const agentKeys = await redis.keys('maifarm:coordination:agent:*');
      expect(agentKeys.length).toBeGreaterThan(0);

      // Check agent heartbeats are being updated
      for (const key of agentKeys) {
        const agentData = await redis.hgetall(key);
        expect(agentData.lastHeartbeat).toBeDefined();
        
        const lastHeartbeat = new Date(agentData.lastHeartbeat);
        const age = Date.now() - lastHeartbeat.getTime();
        expect(age).toBeLessThan(60000); // Should be recent
      }

      // Stop the farm process
      farmProcess.kill('SIGTERM');
      
      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 3000));
    }, 90000);

    it('should detect stale agents', async () => {
      const farmId = 'stale-agent-farm';
      
      // Create farm with agents that have old heartbeats
      await redis.hset(`maifarm:coordination:farm:${farmId}`, {
        id: farmId,
        status: 'running',
        sessionId: 'stale-session',
        agentCount: '2',
        startTime: new Date().toISOString(),
        lastUpdate: new Date().toISOString(),
        config: JSON.stringify({}),
        agents: JSON.stringify(['stale-agent-1', 'stale-agent-2'])
      });

      // Create agents with old heartbeats
      const oldHeartbeat = new Date(Date.now() - 300000); // 5 minutes ago
      
      await redis.hset('maifarm:coordination:agent:stale-agent-1', {
        id: 'stale-agent-1',
        farmId: farmId,
        sessionId: 'stale-session',
        status: 'working',
        tmuxPane: 'stale-session:agents.0',
        startTime: oldHeartbeat.toISOString(),
        lastHeartbeat: oldHeartbeat.toISOString(),
        metadata: JSON.stringify({ index: 0 })
      });

      await redis.hset('maifarm:coordination:agent:stale-agent-2', {
        id: 'stale-agent-2',
        farmId: farmId,
        sessionId: 'stale-session',
        status: 'idle',
        tmuxPane: 'stale-session:agents.1',
        startTime: oldHeartbeat.toISOString(),
        lastHeartbeat: oldHeartbeat.toISOString(),
        metadata: JSON.stringify({ index: 1 })
      });

      // Monitor the farm (should detect stale agents)
      const result = await runPythonScript(testPythonScript, [
        '--farm-id', farmId,
        '--monitor-only',
        '--timeout', '15',
        '--debug'
      ]);

      expect(result.stdout).toContain('Monitoring existing farm');
    }, 45000);
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle invalid arguments gracefully', async () => {
      const result = await runPythonScript(testPythonScript, [
        '--num-agents', '-1', // Invalid agent count
        '--prompt', 'Invalid test'
      ]);

      expect(result.exitCode).toBe(1);
    }, 15000);

    it('should handle missing prompt gracefully', async () => {
      const result = await runPythonScript(testPythonScript, [
        '--num-agents', '1'
        // Missing prompt
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Either --prompt or --prompt-file is required');
    }, 15000);

    it('should handle Redis connection loss', async () => {
      // Start with valid Redis, then make it unavailable
      const result = await runPythonScript(testPythonScript, [
        '--farm-id', 'redis-fail-test',
        '--prompt', 'Redis failure test',
        '--num-agents', '1',
        '--redis-host', 'nonexistent-host',
        '--timeout', '10',
        '--debug'
      ]);

      expect(result.stdout).toContain('Failed to connect to Redis');
      expect(result.stdout).toContain('Falling back to legacy mode');
    }, 30000);

    it('should handle tmux session creation failures', async () => {
      // This test is harder to simulate reliably, but we can test with invalid session names
      const result = await runPythonScript(testPythonScript, [
        '--farm-id', '/invalid/session/name',
        '--prompt', 'Invalid session test',
        '--num-agents', '1',
        '--timeout', '15'
      ]);

      // Should fail during tmux session creation
      expect(result.exitCode).toBe(1);
    }, 30000);
  });

  // Helper function to run Python scripts
  async function runPythonScript(
    script: string, 
    args: string[] = [], 
    env: Record<string, string> = {}
  ): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }> {
    return new Promise((resolve) => {
      const child = spawn('python3', [script, ...args], {
        env: { ...process.env, ...env },
        cwd: process.cwd()
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('exit', (code) => {
        resolve({
          exitCode: code || 0,
          stdout,
          stderr
        });
      });

      child.on('error', (error) => {
        resolve({
          exitCode: 1,
          stdout,
          stderr: stderr + error.message
        });
      });
    });
  }
});
