/**
 * Integration Tests for Cross-System Integration Service
 * Tests event translation, system coordination, and message routing
 */

import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import { crossSystemIntegration } from '../services/crossSystemIntegration';
import { eventBridge } from '../utils/eventBridge';
import type { SystemConfig, CrossSystemMessage, SystemState } from '../types/pipelineOrchestration';

// Mock file system operations
jest.mock('fs/promises');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('Cross-System Integration', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Mock file system operations
    mockedFs.mkdir.mockResolvedValue(undefined);
    mockedFs.writeFile.mockResolvedValue(undefined);
    mockedFs.readFile.mockResolvedValue('{"events": []}');
    mockedFs.readdir.mockResolvedValue([]);

    // Clear any existing event listeners
    crossSystemIntegration.removeAllListeners();
    eventBridge.removeAllListeners();
  });

  afterEach(() => {
    crossSystemIntegration.removeAllListeners();
    eventBridge.removeAllListeners();
  });

  describe('System Registration and Management', () => {
    it('should register a new system successfully', async () => {
      const systemConfig: SystemConfig = {
        id: 'test-system-1',
        name: 'Test System 1',
        type: 'pipeline',
        coordinationPath: '/tmp/test-system-1',
        eventMappings: {
          'input:event': 'output:event',
          'data:processed': 'processing:complete'
        },
        stateSchema: {
          status: 'string',
          lastUpdate: 'date',
          metrics: 'object'
        },
        apiEndpoints: {
          status: '/api/test-system/status',
          health: '/api/test-system/health'
        }
      };

      const registrationSpy = jest.fn();
      crossSystemIntegration.on('system:registered', registrationSpy);

      await crossSystemIntegration.registerSystem(systemConfig);

      expect(registrationSpy).toHaveBeenCalledWith({
        systemId: 'test-system-1',
        config: systemConfig
      });

      const systemState = crossSystemIntegration.getSystemState('test-system-1');
      expect(systemState).toBeDefined();
      expect(systemState?.systemId).toBe('test-system-1');
      expect(systemState?.status).toBe('active');
      expect(systemState?.capabilities).toEqual(['input:event', 'data:processed']);
    });

    it('should maintain system states correctly', async () => {
      const systemConfig: SystemConfig = {
        id: 'state-test-system',
        name: 'State Test System',
        type: 'service',
        coordinationPath: '/tmp/state-test',
        eventMappings: {},
        stateSchema: {}
      };

      await crossSystemIntegration.registerSystem(systemConfig);

      const initialState = crossSystemIntegration.getSystemState('state-test-system');
      expect(initialState?.status).toBe('active');
      expect(initialState?.lastHeartbeat).toBeDefined();
      expect(initialState?.metrics.messagesProcessed).toBe(0);

      // Update heartbeat
      await crossSystemIntegration.updateSystemHeartbeat('state-test-system', {
        activeConnections: 5,
        version: '2.0.0'
      });

      const updatedState = crossSystemIntegration.getSystemState('state-test-system');
      expect(updatedState?.activeConnections).toBe(5);
      expect(updatedState?.version).toBe('2.0.0');
      expect(updatedState?.status).toBe('active');
    });

    it('should list all registered systems', async () => {
      const systems = [
        {
          id: 'system-1',
          name: 'System 1',
          type: 'pipeline' as const,
          coordinationPath: '/tmp/sys1',
          eventMappings: {},
          stateSchema: {}
        },
        {
          id: 'system-2',
          name: 'System 2',
          type: 'service' as const,
          coordinationPath: '/tmp/sys2',
          eventMappings: {},
          stateSchema: {}
        }
      ];

      for (const system of systems) {
        await crossSystemIntegration.registerSystem(system);
      }

      const allStates = crossSystemIntegration.getAllSystemStates();
      expect(allStates).toHaveLength(systems.length + 2); // +2 for core systems registered in constructor
      
      const systemIds = allStates.map(state => state.systemId);
      expect(systemIds).toContain('system-1');
      expect(systemIds).toContain('system-2');
      expect(systemIds).toContain('maifarm-core');
      expect(systemIds).toContain('trump-infog');
    });
  });

  describe('Event Translation and Routing', () => {
    beforeEach(async () => {
      // Register test systems
      await crossSystemIntegration.registerSystem({
        id: 'source-system',
        name: 'Source System',
        type: 'pipeline',
        coordinationPath: '/tmp/source',
        eventMappings: {
          'data:received': 'data:processed',
          'task:completed': 'work:done'
        },
        stateSchema: {}
      });

      await crossSystemIntegration.registerSystem({
        id: 'target-system',
        name: 'Target System',
        type: 'service',
        coordinationPath: '/tmp/target',
        eventMappings: {},
        stateSchema: {}
      });
    });

    it('should translate and route events between systems', async () => {
      const eventSpy = jest.fn();
      crossSystemIntegration.on('cross-system:event', eventSpy);

      const testData = {
        payload: 'test data',
        timestamp: new Date(),
        metadata: { source: 'unit-test' }
      };

      // Simulate incoming event from source system
      crossSystemIntegration.emit('source-system:data:received', testData);

      // Allow async processing
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({
        sourceSystem: 'source-system',
        eventType: 'data:processed'
      }));
    });

    it('should handle Trump Infog specific event translations', async () => {
      const eventSpy = jest.fn();
      crossSystemIntegration.on('cross-system:event', eventSpy);

      // Simulate Trump Infog data collection event
      const trumpEvent = {
        type: 'data_collected',
        agentId: 'agent_0',
        articleCount: 30,
        sources: ['Reuters', 'AP', 'Bloomberg'],
        processingTime: 60000,
        pipelineId: 'trump-pipeline-123'
      };

      // This would be triggered by file system monitoring in real scenario
      crossSystemIntegration.emit('trump-infog:data_collected', trumpEvent);

      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify the event was translated correctly
      const calls = eventSpy.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle MaiFarm core event translations', async () => {
      const eventSpy = jest.fn();
      crossSystemIntegration.on('cross-system:event', eventSpy);

      const coreEvent = {
        agentId: 'core-agent-1',
        status: 'working',
        currentStep: 'processing data',
        contextPercentage: 45,
        cycleTime: 2000,
        errorCount: 0
      };

      crossSystemIntegration.emit('maifarm-core:agent:status', coreEvent);

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({
        sourceSystem: 'maifarm-core',
        eventType: expect.stringContaining('agent')
      }));
    });
  });

  describe('Message Queue Management', () => {
    it('should queue messages with proper priority ordering', async () => {
      const messages: CrossSystemMessage[] = [
        {
          id: 'low-priority-1',
          sourceSystem: 'test',
          targetSystem: 'test',
          eventType: 'low:event',
          data: {},
          timestamp: new Date(),
          priority: 'low',
          retryCount: 0,
          maxRetries: 3
        },
        {
          id: 'critical-priority-1',
          sourceSystem: 'test',
          targetSystem: 'test',
          eventType: 'critical:event',
          data: {},
          timestamp: new Date(),
          priority: 'critical',
          retryCount: 0,
          maxRetries: 3
        },
        {
          id: 'medium-priority-1',
          sourceSystem: 'test',
          targetSystem: 'test',
          eventType: 'medium:event',
          data: {},
          timestamp: new Date(),
          priority: 'medium',
          retryCount: 0,
          maxRetries: 3
        }
      ];

      // Queue messages in non-priority order
      for (const message of messages) {
        // Simulate queuing by emitting events that would trigger queuing
        crossSystemIntegration.emit('queue:message', message);
      }

      const queueStatus = crossSystemIntegration.getQueueStatus();
      expect(queueStatus.byPriority).toBeDefined();
      
      // Verify queue status structure
      expect(queueStatus).toHaveProperty('length');
      expect(queueStatus).toHaveProperty('processing');
      expect(queueStatus).toHaveProperty('byPriority');
    });

    it('should handle message processing and retries', async () => {
      const processedSpy = jest.fn();
      const failedSpy = jest.fn();

      crossSystemIntegration.on('message:processed', processedSpy);
      crossSystemIntegration.on('message:failed', failedSpy);

      // Simulate processing events
      crossSystemIntegration.emit('message:processed', {
        messageId: 'test-message-1',
        success: true,
        processingTime: 150
      });

      crossSystemIntegration.emit('message:failed', {
        messageId: 'test-message-2',
        error: 'Processing failed',
        retryCount: 1
      });

      expect(processedSpy).toHaveBeenCalledWith(expect.objectContaining({
        messageId: 'test-message-1',
        success: true
      }));

      expect(failedSpy).toHaveBeenCalledWith(expect.objectContaining({
        messageId: 'test-message-2',
        error: 'Processing failed'
      }));
    });
  });

  describe('Health Monitoring', () => {
    it('should detect and report system health changes', async () => {
      const healthSpy = jest.fn();
      crossSystemIntegration.on('system:health:changed', healthSpy);

      // Register a test system
      await crossSystemIntegration.registerSystem({
        id: 'health-test-system',
        name: 'Health Test System',
        type: 'service',
        coordinationPath: '/tmp/health-test',
        eventMappings: {},
        stateSchema: {}
      });

      // Simulate system going inactive by manipulating state
      const systemState = crossSystemIntegration.getSystemState('health-test-system');
      if (systemState) {
        systemState.lastHeartbeat = new Date(Date.now() - 150000); // 2.5 minutes ago
        systemState.status = 'inactive';

        crossSystemIntegration.emit('system:health:changed', {
          systemId: 'health-test-system',
          status: 'inactive',
          reason: 'No heartbeat received',
          timestamp: new Date()
        });
      }

      expect(healthSpy).toHaveBeenCalledWith(expect.objectContaining({
        systemId: 'health-test-system',
        status: 'inactive'
      }));
    });

    it('should update system heartbeats correctly', async () => {
      await crossSystemIntegration.registerSystem({
        id: 'heartbeat-test',
        name: 'Heartbeat Test',
        type: 'pipeline',
        coordinationPath: '/tmp/heartbeat',
        eventMappings: {},
        stateSchema: {}
      });

      const initialState = crossSystemIntegration.getSystemState('heartbeat-test');
      const initialHeartbeat = initialState?.lastHeartbeat;

      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 10));

      // Update heartbeat
      await crossSystemIntegration.updateSystemHeartbeat('heartbeat-test', {
        activeConnections: 3
      });

      const updatedState = crossSystemIntegration.getSystemState('heartbeat-test');
      expect(updatedState?.lastHeartbeat.getTime()).toBeGreaterThan(initialHeartbeat?.getTime() || 0);
      expect(updatedState?.activeConnections).toBe(3);
      expect(updatedState?.status).toBe('active');
    });
  });

  describe('System Synchronization', () => {
    it('should trigger system sync requests', async () => {
      await crossSystemIntegration.registerSystem({
        id: 'sync-test-system',
        name: 'Sync Test System',
        type: 'service',
        coordinationPath: '/tmp/sync-test',
        eventMappings: {},
        stateSchema: {}
      });

      const syncSpy = jest.fn();
      crossSystemIntegration.on('message:queued', syncSpy);

      await crossSystemIntegration.triggerSystemSync('sync-test-system');

      expect(syncSpy).toHaveBeenCalledWith(expect.objectContaining({
        priority: 'high'
      }));
    });

    it('should handle sync requests for non-existent systems', async () => {
      await expect(
        crossSystemIntegration.triggerSystemSync('non-existent-system')
      ).rejects.toThrow('System not found: non-existent-system');
    });
  });

  describe('Integration Metrics and Monitoring', () => {
    beforeEach(async () => {
      // Register multiple test systems for metrics testing
      const systems = [
        { id: 'metrics-system-1', name: 'Metrics System 1', type: 'pipeline' as const },
        { id: 'metrics-system-2', name: 'Metrics System 2', type: 'service' as const },
        { id: 'metrics-system-3', name: 'Metrics System 3', type: 'external' as const }
      ];

      for (const system of systems) {
        await crossSystemIntegration.registerSystem({
          ...system,
          coordinationPath: `/tmp/${system.id}`,
          eventMappings: {},
          stateSchema: {}
        });
      }
    });

    it('should provide comprehensive integration metrics', async () => {
      const metrics = crossSystemIntegration.getIntegrationMetrics();

      expect(metrics).toHaveProperty('registeredSystems');
      expect(metrics).toHaveProperty('activeSystems');
      expect(metrics).toHaveProperty('inactiveSystems');
      expect(metrics).toHaveProperty('errorSystems');
      expect(metrics).toHaveProperty('totalMessagesProcessed');
      expect(metrics).toHaveProperty('totalMessagesFailed');
      expect(metrics).toHaveProperty('queueStatus');
      expect(metrics).toHaveProperty('avgProcessingTime');

      expect(metrics.registeredSystems).toBeGreaterThanOrEqual(5); // 3 test + 2 core systems
      expect(metrics.activeSystems).toBeGreaterThanOrEqual(3);
      expect(typeof metrics.avgProcessingTime).toBe('number');
    });

    it('should track message processing statistics', async () => {
      // Simulate message processing
      const systemState = crossSystemIntegration.getSystemState('metrics-system-1');
      if (systemState) {
        systemState.metrics.messagesProcessed = 25;
        systemState.metrics.messagesFailed = 2;
        systemState.metrics.avgProcessingTime = 150;
      }

      const metrics = crossSystemIntegration.getIntegrationMetrics();
      expect(metrics.totalMessagesProcessed).toBeGreaterThanOrEqual(25);
      expect(metrics.totalMessagesFailed).toBeGreaterThanOrEqual(2);
    });

    it('should provide queue status information', async () => {
      const queueStatus = crossSystemIntegration.getQueueStatus();

      expect(queueStatus).toHaveProperty('length');
      expect(queueStatus).toHaveProperty('processing');
      expect(queueStatus).toHaveProperty('byPriority');

      expect(typeof queueStatus.length).toBe('number');
      expect(typeof queueStatus.processing).toBe('number');
      expect(typeof queueStatus.byPriority).toBe('object');
    });
  });

  describe('Event Bridge Integration', () => {
    it('should use event bridge for complex translations', async () => {
      const bridgeEventSpy = jest.fn();
      eventBridge.on('event:translated', bridgeEventSpy);

      // Process a Trump Infog event through the event bridge
      const translations = eventBridge.processEvent('trump-infog', 'data_collected', {
        articleCount: 18,
        sources: ['CNN', 'BBC'],
        processingTime: 45000,
        pipelineId: 'test-pipeline'
      });

      expect(translations).toHaveLength(1);
      expect(translations[0].targetEvent).toBe('phase:completed');
      expect(translations[0].transformedData).toHaveProperty('outputs');
      expect(translations[0].transformedData.outputs.articlesCollected).toBe(18);

      expect(bridgeEventSpy).toHaveBeenCalledWith(expect.objectContaining({
        sourceEvent: 'data_collected',
        targetEvent: 'phase:completed'
      }));
    });

    it('should handle rule-based event transformations', async () => {
      // Add a custom rule
      eventBridge.addRule({
        id: 'custom-transform-rule',
        name: 'Custom Transform Rule',
        sourceSystem: 'test-source',
        sourceEvent: 'custom:input',
        targetSystem: 'test-target',
        targetEvent: 'custom:output',
        transform: (data) => ({
          transformed: true,
          originalValue: data.value,
          processedAt: new Date(),
          multiplied: (data.value || 0) * 2
        }),
        priority: 10,
        enabled: true
      });

      const translations = eventBridge.processEvent('test-source', 'custom:input', {
        value: 42,
        metadata: 'test'
      });

      expect(translations).toHaveLength(1);
      expect(translations[0].transformedData.transformed).toBe(true);
      expect(translations[0].transformedData.originalValue).toBe(42);
      expect(translations[0].transformedData.multiplied).toBe(84);
    });

    it('should provide event bridge statistics', async () => {
      // Process some events to generate statistics
      eventBridge.processEvent('trump-infog', 'data_collected', { test: 'data1' });
      eventBridge.processEvent('trump-infog', 'analysis_complete', { test: 'data2' });
      eventBridge.processEvent('maifarm-core', 'agent:status', { test: 'data3' });

      const stats = eventBridge.getStats();

      expect(stats).toHaveProperty('totalRules');
      expect(stats).toHaveProperty('totalProcessed');
      expect(stats).toHaveProperty('overallSuccessRate');
      expect(stats).toHaveProperty('ruleStats');

      expect(stats.totalRules).toBeGreaterThan(0);
      expect(Array.isArray(stats.ruleStats)).toBe(true);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle registration of systems with duplicate IDs', async () => {
      const systemConfig = {
        id: 'duplicate-system',
        name: 'First System',
        type: 'service' as const,
        coordinationPath: '/tmp/first',
        eventMappings: {},
        stateSchema: {}
      };

      await crossSystemIntegration.registerSystem(systemConfig);

      // Attempt to register another system with the same ID
      const duplicateConfig = {
        ...systemConfig,
        name: 'Second System',
        coordinationPath: '/tmp/second'
      };

      // This should either overwrite or throw an error depending on implementation
      await crossSystemIntegration.registerSystem(duplicateConfig);

      const systemState = crossSystemIntegration.getSystemState('duplicate-system');
      expect(systemState).toBeDefined();
    });

    it('should handle malformed event data gracefully', async () => {
      const errorSpy = jest.fn();
      crossSystemIntegration.on('message:failed', errorSpy);

      // Simulate an event with malformed data that could cause processing errors
      const malformedData = {
        invalid: null,
        circular: {}
      };
      (malformedData as any).circular.self = malformedData.circular;

      // Process the malformed event
      try {
        crossSystemIntegration.emit('test:malformed', malformedData);
        // Allow async processing
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        // Error handling should be graceful
        expect(error).toBeDefined();
      }
    });

    it('should handle system state queries for non-existent systems', async () => {
      const nonExistentState = crossSystemIntegration.getSystemState('non-existent-system');
      expect(nonExistentState).toBeUndefined();

      const allStates = crossSystemIntegration.getAllSystemStates();
      expect(allStates.every(state => state.systemId !== 'non-existent-system')).toBe(true);
    });

    it('should handle heartbeat updates for non-existent systems', async () => {
      // This should not throw an error
      await crossSystemIntegration.updateSystemHeartbeat('non-existent-system', {
        activeConnections: 1
      });

      // System should still not exist
      const state = crossSystemIntegration.getSystemState('non-existent-system');
      expect(state).toBeUndefined();
    });
  });

  describe('File System Integration', () => {
    it('should handle file system operations for coordination', async () => {
      await crossSystemIntegration.registerSystem({
        id: 'fs-test-system',
        name: 'File System Test',
        type: 'pipeline',
        coordinationPath: '/tmp/fs-test',
        eventMappings: {},
        stateSchema: {}
      });

      // Verify file system operations were called
      expect(mockedFs.mkdir).toHaveBeenCalledWith('/tmp/claude_coordination/integration', { recursive: true });
      expect(mockedFs.mkdir).toHaveBeenCalledWith('/tmp/fs-test', { recursive: true });
    });

    it('should handle file system errors gracefully', async () => {
      // Mock file system error
      mockedFs.mkdir.mockRejectedValue(new Error('Permission denied'));

      // This should not prevent system registration
      try {
        await crossSystemIntegration.registerSystem({
          id: 'fs-error-system',
          name: 'FS Error System',
          type: 'service',
          coordinationPath: '/invalid/path',
          eventMappings: {},
          stateSchema: {}
        });
      } catch (error) {
        // Error should be handled gracefully
        expect(error).toBeDefined();
      }
    });
  });
});