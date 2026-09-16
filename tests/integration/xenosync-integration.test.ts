/**
 * XenoSync Integration Tests
 * Validates XenoSync operation across all three modes:
 * - Quick Task (5-minute sprint with 2 agents)
 * - Go Wild (autonomous exploration)
 * - New Farm (standard collaboration)
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { unifiedOrchestratorService } from '../../apps/api/src/services/UnifiedOrchestratorService';
import { xenoSyncService } from '../../apps/api/src/services/XenoSyncService';
import { terminalStreamEnhanced } from '../../apps/api/src/services/TerminalStreamEnhanced';
import { sessionManager } from '../../apps/api/src/services/unified/terminalService';
import { WebSocketManager } from '../../apps/api/src/websocket/websocketManager';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Increase timeout for integration tests
jest.setTimeout(60000);

describe('XenoSync Integration Tests', () => {
  let testFarmId: string;
  let correlationId: string;

  beforeAll(async () => {
    // Ensure XenoSync is available
    const xenosyncAvailable = await checkXenoSyncAvailable();
    if (!xenosyncAvailable) {
      console.warn('XenoSync not available, skipping integration tests');
      return;
    }

    // Mock WebSocket broadcasting
    jest.spyOn(WebSocketManager, 'broadcast').mockImplementation(() => {});
  });

  afterAll(async () => {
    // Cleanup any test sessions
    await cleanupTestSessions();
  });

  describe('Quick Task Mode', () => {
    it('should launch Quick Task with exactly 2 agents', async () => {
      testFarmId = uuidv4();
      correlationId = `test-qt-${testFarmId.substring(0, 8)}`;

      const launchOptions = {
        mode: 'quick-task' as const,
        farmId: testFarmId,
        name: 'Test Quick Task',
        description: 'Write a hello world function',
        numberOfAgents: 1, // Should be forced to 2
        timeout: 300, // 5 minutes
        useXenoSync: true,
        correlationId
      };

      // Launch the task
      const result = await unifiedOrchestratorService.launch(launchOptions);
      expect(result).toBe(testFarmId);

      // Verify session was created
      const sessionName = `quick_${testFarmId.substring(0, 8)}`;
      const sessionInfo = await sessionManager.findSession(sessionName, testFarmId);
      expect(sessionInfo).toBeDefined();

      // Verify exactly 2 agents were created (XenoSync minimum)
      const status = unifiedOrchestratorService.monitor(testFarmId);
      expect(status?.agentCount).toBe(2);

      // Verify correlation ID is tracked
      const trackedCorrelationId = unifiedOrchestratorService.getCorrelationId(testFarmId);
      expect(trackedCorrelationId).toBe(correlationId);

      // Cleanup
      await unifiedOrchestratorService.terminate(testFarmId);
    });

    it('should stream terminal output for Quick Task', async () => {
      testFarmId = uuidv4();
      const sessionName = `quick_${testFarmId.substring(0, 8)}`;
      
      // Setup terminal streaming listener
      let outputReceived = false;
      terminalStreamEnhanced.on('output:broadcast', (data) => {
        if (data.sessionName === sessionName) {
          outputReceived = true;
        }
      });

      // Launch Quick Task
      await unifiedOrchestratorService.launch({
        mode: 'quick-task',
        farmId: testFarmId,
        name: 'Test Terminal Streaming',
        description: 'Print test output',
        numberOfAgents: 2,
        timeout: 300,
        useXenoSync: true
      });

      // Wait for output
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      expect(outputReceived).toBe(true);

      // Cleanup
      await unifiedOrchestratorService.terminate(testFarmId);
    });
  });

  describe('Go Wild Mode', () => {
    it('should launch Go Wild with configurable agents', async () => {
      testFarmId = uuidv4();
      correlationId = `test-gw-${testFarmId.substring(0, 8)}`;

      const launchOptions = {
        mode: 'go-wild' as const,
        farmId: testFarmId,
        name: 'Test Go Wild',
        description: 'Explore AI consciousness',
        numberOfAgents: 3,
        timeout: 1800, // 30 minutes
        useXenoSync: true,
        correlationId
      };

      const result = await unifiedOrchestratorService.launch(launchOptions);
      expect(result).toBe(testFarmId);

      // Verify session
      const sessionName = `goWild-${testFarmId.substring(0, 8)}`;
      const sessionInfo = await sessionManager.findSession(sessionName, testFarmId);
      expect(sessionInfo).toBeDefined();

      // Verify agent count
      const status = unifiedOrchestratorService.monitor(testFarmId);
      expect(status?.agentCount).toBe(3);

      // Verify it's in autonomous mode
      expect(status?.status).toBe('running');

      // Cleanup
      await unifiedOrchestratorService.terminate(testFarmId);
    });
  });

  describe('New Farm Mode', () => {
    it('should launch New Farm with YAML configuration', async () => {
      testFarmId = uuidv4();
      correlationId = `test-nf-${testFarmId.substring(0, 8)}`;

      const yamlContent = `
name: Test Farm
description: Collaborative development farm
agents:
  - name: Agent 1
    role: Lead Developer
  - name: Agent 2
    role: Code Reviewer
  - name: Agent 3
    role: Tester
task:
  type: development
  prompt: Build a REST API
`;

      const launchOptions = {
        mode: 'new-farm' as const,
        farmId: testFarmId,
        name: 'Test New Farm',
        description: 'Build REST API collaboratively',
        numberOfAgents: 3,
        timeout: 3600, // 1 hour
        yamlContent,
        useXenoSync: true,
        correlationId
      };

      const result = await unifiedOrchestratorService.launch(launchOptions);
      expect(result).toBe(testFarmId);

      // Verify session
      const sessionName = `farm-${testFarmId.substring(0, 8)}`;
      const sessionInfo = await sessionManager.findSession(sessionName, testFarmId);
      expect(sessionInfo).toBeDefined();

      // Verify agent count
      const status = unifiedOrchestratorService.monitor(testFarmId);
      expect(status?.agentCount).toBe(3);

      // Cleanup
      await unifiedOrchestratorService.terminate(testFarmId);
    });
  });

  describe('Terminal Window Detection', () => {
    it('should detect agents window for XenoSync sessions', async () => {
      testFarmId = uuidv4();
      const sessionName = `farm-${testFarmId.substring(0, 8)}`;

      // Create a mock XenoSync session with agents window
      await createMockXenoSyncSession(sessionName);

      // Test window detection
      const windowTarget = await detectWindowTarget(sessionName);
      expect(windowTarget).toBe('agents');

      // Cleanup
      await cleanupSession(sessionName);
    });
  });

  describe('Performance Optimization', () => {
    it('should apply adaptive polling for terminal streaming', async () => {
      testFarmId = uuidv4();
      const sessionName = `farm-${testFarmId.substring(0, 8)}`;

      // Start streaming
      await terminalStreamEnhanced.startStreaming(sessionName, testFarmId, 2);

      // Get stream status
      const streamStatus = terminalStreamEnhanced.getStreamStatus(sessionName);
      expect(streamStatus).toBeDefined();
      expect(streamStatus?.activityStates).toBeDefined();

      // Verify adaptive intervals are set
      expect(streamStatus?.adaptiveIntervals.size).toBe(2);

      // Stop streaming
      await terminalStreamEnhanced.stopStreaming(sessionName);
    });
  });

  describe('Graceful Shutdown', () => {
    it('should handle timeout gracefully with harvest collection', async () => {
      testFarmId = uuidv4();
      
      // Launch with very short timeout
      await unifiedOrchestratorService.launch({
        mode: 'quick-task',
        farmId: testFarmId,
        name: 'Test Timeout',
        description: 'Test graceful shutdown',
        numberOfAgents: 2,
        timeout: 5, // 5 seconds
        useXenoSync: true
      });

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 6000));

      // Verify status changed to timeout
      const status = unifiedOrchestratorService.monitor(testFarmId);
      expect(status?.status).toBe('timeout');

      // Verify session was cleaned up
      const sessionName = `quick_${testFarmId.substring(0, 8)}`;
      const sessionExists = await checkSessionExists(sessionName);
      expect(sessionExists).toBe(false);
    });
  });

  describe('Correlation ID Tracking', () => {
    it('should track correlation IDs across all operations', async () => {
      testFarmId = uuidv4();
      correlationId = `test-corr-${Date.now()}`;

      // Track broadcast events
      const broadcastCalls: any[] = [];
      jest.spyOn(WebSocketManager, 'broadcast').mockImplementation((event, data) => {
        if (data.correlationId === correlationId) {
          broadcastCalls.push({ event, data });
        }
      });

      // Launch with correlation ID
      await unifiedOrchestratorService.launch({
        mode: 'quick-task',
        farmId: testFarmId,
        name: 'Test Correlation',
        description: 'Test correlation tracking',
        numberOfAgents: 2,
        timeout: 300,
        useXenoSync: true,
        correlationId
      });

      // Verify correlation ID was included in broadcasts
      expect(broadcastCalls.length).toBeGreaterThan(0);
      expect(broadcastCalls.some(call => call.event === 'farm:orchestrator:selected')).toBe(true);

      // Cleanup
      await unifiedOrchestratorService.terminate(testFarmId);
    });
  });
});

// Helper functions

async function checkXenoSyncAvailable(): Promise<boolean> {
  try {
    const { stdout } = await execAsync('python3 -c "import sys; print(sys.version)"');
    return stdout.length > 0;
  } catch {
    return false;
  }
}

async function createMockXenoSyncSession(sessionName: string): Promise<void> {
  try {
    // Create tmux session with agents window
    await execAsync(`TMUX_TMPDIR=/tmp tmux new-session -d -s "${sessionName}" -n agents`);
  } catch (error) {
    console.error('Failed to create mock session:', error);
  }
}

async function detectWindowTarget(sessionName: string): Promise<string> {
  try {
    const { stdout } = await execAsync(
      `TMUX_TMPDIR=/tmp tmux list-windows -t "${sessionName}" -F "#{window_name}" 2>/dev/null || echo ""`
    );
    const windows = stdout.trim().split('\n').filter(Boolean);
    return windows.includes('agents') ? 'agents' : '0';
  } catch {
    return '0';
  }
}

async function checkSessionExists(sessionName: string): Promise<boolean> {
  try {
    await execAsync(`TMUX_TMPDIR=/tmp tmux has-session -t "${sessionName}" 2>/dev/null`);
    return true;
  } catch {
    return false;
  }
}

async function cleanupSession(sessionName: string): Promise<void> {
  try {
    await execAsync(`TMUX_TMPDIR=/tmp tmux kill-session -t "${sessionName}" 2>/dev/null`);
  } catch {
    // Session might not exist
  }
}

async function cleanupTestSessions(): Promise<void> {
  try {
    // Kill all test sessions
    const { stdout } = await execAsync('TMUX_TMPDIR=/tmp tmux list-sessions -F "#{session_name}" 2>/dev/null || echo ""');
    const sessions = stdout.trim().split('\n').filter(Boolean);
    
    for (const session of sessions) {
      if (session.includes('test') || session.startsWith('quick_') || session.startsWith('farm-') || session.startsWith('goWild-')) {
        await cleanupSession(session);
      }
    }
  } catch {
    // No sessions to clean
  }
}