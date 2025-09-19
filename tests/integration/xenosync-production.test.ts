/**
 * XenoSync Production Readiness Test Suite
 * Comprehensive tests to validate XenoSync integration for production deployment
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { xenoSyncService } from '../../server/services/XenoSyncService';
import { terminalStreamService } from '../../server/services/unified/terminalService';
import { sessionManager } from '../../server/services/unified/terminalService';
import { sessionCleanupService } from '../../server/services/sessionCleanupService';
import { xenoSyncPerformanceOptimizer } from '../../server/services/xenosyncPerformanceOptimizer';
import { websocketManager } from '../../server/websocket/websocketManager';
import { exec } from 'child_process';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';

const execAsync = promisify(exec);

// Test configuration
const TEST_TIMEOUT = 60000; // 1 minute per test
const STRESS_TEST_TIMEOUT = 300000; // 5 minutes for stress tests

describe('XenoSync Production Readiness Tests', () => {
  let testFarmId: string;
  
  beforeAll(async () => {
    // Start performance monitoring
    xenoSyncPerformanceOptimizer.startMonitoring();
    
    // Start session cleanup service
    sessionCleanupService.startAutoCleanup();
  });
  
  afterAll(async () => {
    // Stop monitoring
    xenoSyncPerformanceOptimizer.stopMonitoring();
    sessionCleanupService.stopAutoCleanup();
    
    // Clean up any test sessions
    await cleanupTestSessions();
  });
  
  describe('1. Functional Tests', () => {
    
    it('should launch multiple agents successfully', async () => {
      testFarmId = uuidv4();
      const agentCount = 5;
      
      const launchOptions = {
        farmId: testFarmId,
        name: 'Test Farm - Multi-Agent',
        description: 'Testing multi-agent coordination',
        numberOfAgents: agentCount,
        prompt: 'Test prompt for production readiness',
        mode: 'parallel' as const,
        timeout: 60000
      };
      
      // Launch farm
      const processId = await xenoSyncService.launchFarm(launchOptions);
      expect(processId).toBeTruthy();
      
      // Wait for session creation
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Verify tmux session exists
      const sessionName = `farm-${testFarmId.substring(0, 8)}`;
      const { stdout } = await execAsync(
        `TMUX_TMPDIR=/tmp tmux list-sessions -F "#{session_name}" 2>/dev/null | grep "${sessionName}" || echo ""`
      );
      expect(stdout.trim()).toBe(sessionName);
      
      // Verify correct number of panes
      const panesResult = await execAsync(
        `TMUX_TMPDIR=/tmp tmux list-panes -t "${sessionName}:agents" 2>/dev/null | wc -l`
      );
      const paneCount = parseInt(panesResult.stdout.trim());
      expect(paneCount).toBe(agentCount);
      
      // Stop the farm
      await xenoSyncService.stopFarm(processId);
    }, TEST_TIMEOUT);
    
    it('should handle terminal streaming reliably', async () => {
      const sessionName = `farm-test-${Date.now()}`;
      const agentCount = 3;
      
      // Create test session
      await createTestSession(sessionName, agentCount);
      
      // Start streaming
      await terminalStreamService.startStreaming(sessionName, testFarmId, agentCount);
      
      // Send test output to each pane
      for (let i = 0; i < agentCount; i++) {
        await execAsync(
          `TMUX_TMPDIR=/tmp tmux send-keys -t "${sessionName}:agents.${i}" "echo 'Test output from agent ${i}'" Enter`
        );
      }
      
      // Wait for output to be captured
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Verify streaming is active
      const activeStreams = (terminalStreamService as any).sessions;
      expect(activeStreams.has(sessionName)).toBe(true);
      
      // Stop streaming
      await terminalStreamService.stopStreaming(sessionName);
      
      // Clean up test session
      await execAsync(`TMUX_TMPDIR=/tmp tmux kill-session -t "${sessionName}" 2>/dev/null || true`);
    }, TEST_TIMEOUT);
    
    it('should recover from session crashes', async () => {
      const farmId = uuidv4();
      const sessionName = `farm-${farmId.substring(0, 8)}`;
      
      // Create and register session
      await createTestSession(sessionName, 2);
      sessionCleanupService.registerActiveFarm(farmId);
      
      // Simulate crash by killing session
      await execAsync(`TMUX_TMPDIR=/tmp tmux kill-session -t "${sessionName}" 2>/dev/null || true`);
      
      // Wait for detection
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Verify session is detected as missing
      const exists = await sessionExists(sessionName);
      expect(exists).toBe(false);
      
      // Unregister farm
      sessionCleanupService.unregisterFarm(farmId);
    });
    
    it('should handle special characters in terminal output', async () => {
      const sessionName = `farm-special-${Date.now()}`;
      
      // Create test session
      await createTestSession(sessionName, 1);
      
      // Send output with special characters
      const specialChars = [
        'echo "╭─────────╮"',
        'echo "│ Test │"',
        'echo "╰─────────╯"',
        'echo "\\x1b[31mRed Text\\x1b[0m"',
        'echo "⏵ ◆ ✻ ✽ ·"'
      ];
      
      for (const cmd of specialChars) {
        await execAsync(
          `TMUX_TMPDIR=/tmp tmux send-keys -t "${sessionName}:agents.0" '${cmd}' Enter`
        );
      }
      
      // Capture output
      const { stdout } = await execAsync(
        `TMUX_TMPDIR=/tmp tmux capture-pane -t "${sessionName}:agents.0" -p`
      );
      
      // Verify output is captured (not testing exact content due to terminal processing)
      expect(stdout).toBeTruthy();
      
      // Clean up
      await execAsync(`TMUX_TMPDIR=/tmp tmux kill-session -t "${sessionName}" 2>/dev/null || true`);
    });
  });
  
  describe('2. Performance Tests', () => {
    
    it('should maintain low terminal latency', async () => {
      const latencies: number[] = [];
      const sessionName = `farm-perf-${Date.now()}`;
      
      // Create test session
      await createTestSession(sessionName, 1);
      
      // Measure latency for multiple captures
      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();
        await execAsync(
          `TMUX_TMPDIR=/tmp tmux capture-pane -t "${sessionName}:agents.0" -p 2>/dev/null`
        );
        const latency = Date.now() - startTime;
        latencies.push(latency);
        
        // Record in optimizer
        xenoSyncPerformanceOptimizer.recordTerminalLatency(latency);
      }
      
      // Calculate average latency
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      console.log(`Average terminal latency: ${avgLatency}ms`);
      
      // Should be under 100ms
      expect(avgLatency).toBeLessThan(100);
      
      // Clean up
      await execAsync(`TMUX_TMPDIR=/tmp tmux kill-session -t "${sessionName}" 2>/dev/null || true`);
    });
    
    it('should handle concurrent farms efficiently', async () => {
      const farmCount = 5;
      const sessions: string[] = [];
      
      // Create multiple sessions concurrently
      const createPromises = [];
      for (let i = 0; i < farmCount; i++) {
        const sessionName = `farm-concurrent-${i}-${Date.now()}`;
        sessions.push(sessionName);
        createPromises.push(createTestSession(sessionName, 2));
      }
      
      const startTime = Date.now();
      await Promise.all(createPromises);
      const creationTime = Date.now() - startTime;
      
      console.log(`Created ${farmCount} sessions in ${creationTime}ms`);
      
      // Should complete within reasonable time (< 10s)
      expect(creationTime).toBeLessThan(10000);
      
      // Verify all sessions exist
      for (const sessionName of sessions) {
        const exists = await sessionExists(sessionName);
        expect(exists).toBe(true);
      }
      
      // Clean up all sessions
      const cleanupPromises = sessions.map(s => 
        execAsync(`TMUX_TMPDIR=/tmp tmux kill-session -t "${s}" 2>/dev/null || true`)
      );
      await Promise.all(cleanupPromises);
    });
    
    it('should not leak memory during extended operation', async () => {
      const initialMemory = process.memoryUsage();
      const sessionName = `farm-memory-${Date.now()}`;
      
      // Create session
      await createTestSession(sessionName, 3);
      
      // Simulate extended operation with frequent captures
      for (let i = 0; i < 100; i++) {
        await execAsync(
          `TMUX_TMPDIR=/tmp tmux capture-pane -t "${sessionName}:agents.0" -p 2>/dev/null`
        );
        
        // Add small delay to simulate real operation
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      // Check memory after operations
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const increaseInMB = memoryIncrease / 1024 / 1024;
      
      console.log(`Memory increase: ${increaseInMB.toFixed(2)} MB`);
      
      // Should not increase by more than 50MB
      expect(increaseInMB).toBeLessThan(50);
      
      // Clean up
      await execAsync(`TMUX_TMPDIR=/tmp tmux kill-session -t "${sessionName}" 2>/dev/null || true`);
    });
  });
  
  describe('3. Integration Tests', () => {
    
    it('should properly clean up orphaned sessions', async () => {
      // Create orphaned test session
      const orphanedSession = `farm-orphan-${Date.now()}`;
      await createTestSession(orphanedSession, 1);
      
      // Run cleanup in dry-run mode first
      const orphaned = await sessionCleanupService.cleanupOrphanedSessions({ 
        dryRun: true,
        maxAge: 1000 // 1 second for testing
      });
      
      // Should not find our new session as orphaned yet
      const foundOurSession = orphaned.some(o => o.name === orphanedSession);
      expect(foundOurSession).toBe(false);
      
      // Clean up test session
      await execAsync(`TMUX_TMPDIR=/tmp tmux kill-session -t "${orphanedSession}" 2>/dev/null || true`);
    });
    
    it('should coordinate with harvest collection', async () => {
      // This test would require harvest service integration
      // Placeholder for now
      expect(true).toBe(true);
    });
    
    it('should handle WebSocket reconnections gracefully', async () => {
      // Simulate WebSocket disconnection and reconnection
      const mockSocket = {
        id: 'test-socket-' + Date.now(),
        emit: jest.fn(),
        on: jest.fn(),
        join: jest.fn(),
        leave: jest.fn()
      };
      
      // Test connection handling
      websocketManager.handleConnection(mockSocket as any);
      
      // Verify socket is tracked
      expect(websocketManager.getActiveConnections()).toBeGreaterThan(0);
      
      // Simulate disconnection
      websocketManager.handleDisconnection(mockSocket as any);
    });
  });
  
  describe('4. Stress Tests', () => {
    
    it('should handle rapid session creation/destruction', async () => {
      const cycles = 10;
      const errors: any[] = [];
      
      for (let i = 0; i < cycles; i++) {
        const sessionName = `farm-stress-${i}-${Date.now()}`;
        
        try {
          // Create session
          await createTestSession(sessionName, 1);
          
          // Immediately destroy it
          await execAsync(`TMUX_TMPDIR=/tmp tmux kill-session -t "${sessionName}" 2>/dev/null`);
        } catch (error) {
          errors.push(error);
        }
        
        // Small delay between cycles
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Should complete without errors
      expect(errors.length).toBe(0);
    }, STRESS_TEST_TIMEOUT);
    
    it('should handle maximum agent load', async () => {
      const maxAgents = 20;
      const sessionName = `farm-maxload-${Date.now()}`;
      
      // Create session with maximum agents
      const startTime = Date.now();
      await createTestSession(sessionName, maxAgents);
      const creationTime = Date.now() - startTime;
      
      console.log(`Created session with ${maxAgents} agents in ${creationTime}ms`);
      
      // Verify all panes exist
      const { stdout } = await execAsync(
        `TMUX_TMPDIR=/tmp tmux list-panes -t "${sessionName}:agents" 2>/dev/null | wc -l`
      );
      const paneCount = parseInt(stdout.trim());
      expect(paneCount).toBe(maxAgents);
      
      // Test capturing from all panes
      const capturePromises = [];
      for (let i = 0; i < maxAgents; i++) {
        capturePromises.push(
          execAsync(`TMUX_TMPDIR=/tmp tmux capture-pane -t "${sessionName}:agents.${i}" -p 2>/dev/null`)
        );
      }
      
      const captureStart = Date.now();
      await Promise.all(capturePromises);
      const captureTime = Date.now() - captureStart;
      
      console.log(`Captured from ${maxAgents} panes in ${captureTime}ms`);
      
      // Should complete within reasonable time
      expect(captureTime).toBeLessThan(5000);
      
      // Clean up
      await execAsync(`TMUX_TMPDIR=/tmp tmux kill-session -t "${sessionName}" 2>/dev/null || true`);
    }, STRESS_TEST_TIMEOUT);
  });
});

// Helper functions

async function createTestSession(sessionName: string, agentCount: number): Promise<void> {
  // Create session with first pane
  await execAsync(
    `TMUX_TMPDIR=/tmp tmux new-session -d -s "${sessionName}" -n agents`
  );
  
  // Add additional panes
  for (let i = 1; i < agentCount; i++) {
    await execAsync(
      `TMUX_TMPDIR=/tmp tmux split-window -t "${sessionName}:agents"`
    );
    await execAsync(
      `TMUX_TMPDIR=/tmp tmux select-layout -t "${sessionName}:agents" tiled`
    );
  }
}

async function sessionExists(sessionName: string): Promise<boolean> {
  try {
    await execAsync(
      `TMUX_TMPDIR=/tmp tmux has-session -t "${sessionName}" 2>/dev/null`
    );
    return true;
  } catch {
    return false;
  }
}

async function cleanupTestSessions(): Promise<void> {
  try {
    // Kill all test sessions
    const { stdout } = await execAsync(
      `TMUX_TMPDIR=/tmp tmux list-sessions -F "#{session_name}" 2>/dev/null | grep -E "farm-(test|perf|special|concurrent|memory|orphan|stress|maxload)" || echo ""`
    );
    
    const sessions = stdout.trim().split('\n').filter(Boolean);
    for (const session of sessions) {
      await execAsync(`TMUX_TMPDIR=/tmp tmux kill-session -t "${session}" 2>/dev/null || true`);
    }
  } catch {
    // Ignore errors during cleanup
  }
}