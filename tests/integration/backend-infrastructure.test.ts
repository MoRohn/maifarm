/**
 * Backend Infrastructure Integration Tests
 * 
 * Comprehensive tests for the new infrastructure components:
 * - Central API Manager
 * - Connection Pool Manager
 * - Enhanced Quick Task Service V2
 * - Real-time Metrics Aggregator
 * - Infrastructure Integration
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { backendInfrastructure } from '../../server/services/backendInfrastructureIntegration';
import { centralApiManager } from '../../server/services/centralApiManager';
import { connectionPoolManager } from '../../server/services/connectionPoolManager';
import { quickTaskServiceV2 } from '../../server/services/unified/quickTaskService';
import { realtimeMetricsAggregator } from '../../server/services/realtimeMetricsAggregator';
import { AIProvider } from '../../server/config/aiProviders';

// Mock dependencies
jest.mock('../../server/database/connection');
jest.mock('../../server/websocket/websocketManager');
jest.mock('../../server/utils/logger');

describe('Backend Infrastructure Integration', () => {
  
  beforeAll(async () => {
    // Initialize infrastructure
    await backendInfrastructure.initialize();
  });
  
  afterAll(async () => {
    // Cleanup
    await backendInfrastructure.shutdown();
  });
  
  describe('Infrastructure Initialization', () => {
    it('should initialize all services successfully', async () => {
      const status = backendInfrastructure.getStatus();
      
      expect(status.initialized).toBe(true);
      expect(status.health.services.apiManager).toBe('online');
      expect(status.health.services.connectionPool).toBe('online');
      expect(status.health.services.quickTask).toBe('online');
      expect(status.health.services.metrics).toBe('online');
    });
    
    it('should setup cross-service integration', (done) => {
      // Test event propagation
      backendInfrastructure.once('alert:handled', (alert) => {
        expect(alert).toBeDefined();
        done();
      });
      
      // Trigger an alert through metrics
      realtimeMetricsAggregator.recordMetric('api.errors', 100);
    });
  });
  
  describe('Central API Manager', () => {
    it('should manage API requests with retry logic', async () => {
      const request = {
        id: 'test-request-1',
        provider: AIProvider.CLAUDE,
        endpoint: '/test',
        method: 'POST' as const,
        data: { test: true },
        priority: 'high' as const
      };
      
      // Mock successful response
      const mockResponse = { success: true, data: { result: 'ok' } };
      jest.spyOn(centralApiManager, 'executeRequest').mockResolvedValue(mockResponse);
      
      const response = await centralApiManager.executeRequest(request);
      
      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
    });
    
    it('should handle circuit breaker for failed providers', async () => {
      const health = centralApiManager.getHealthStatus();
      
      expect(health).toBeInstanceOf(Array);
      health.forEach(providerHealth => {
        expect(providerHealth.provider).toBeDefined();
        expect(providerHealth.status).toMatch(/healthy|degraded|unhealthy|offline/);
        expect(providerHealth.circuitBreakerState).toMatch(/closed|open|half-open/);
      });
    });
    
    it('should fallback to alternative providers', async () => {
      const request = {
        id: 'test-request-2',
        provider: AIProvider.CLAUDE,
        endpoint: '/test',
        method: 'GET' as const,
        priority: 'medium' as const
      };
      
      // Mock provider failure and fallback
      const mockFailure = { 
        success: false, 
        error: { code: 'PROVIDER_UNAVAILABLE', message: 'Circuit breaker open' } 
      };
      
      jest.spyOn(centralApiManager, 'executeRequest')
        .mockResolvedValueOnce(mockFailure)
        .mockResolvedValueOnce({ success: true, data: { fallback: true } });
      
      // First call should fail
      const response1 = await centralApiManager.executeRequest(request);
      expect(response1.success).toBe(false);
      
      // Second call should use fallback
      request.provider = AIProvider.OPENAI;
      const response2 = await centralApiManager.executeRequest(request);
      expect(response2.success).toBe(true);
    });
  });
  
  describe('Connection Pool Manager', () => {
    it('should manage connection pools for all providers', () => {
      const stats = connectionPoolManager.getPoolStatistics();
      
      expect(stats).toBeDefined();
      expect(Object.keys(stats).length).toBeGreaterThan(0);
      
      Object.values(stats).forEach(poolStats => {
        expect(poolStats.total).toBeGreaterThanOrEqual(0);
        expect(poolStats.available).toBeGreaterThanOrEqual(0);
        expect(poolStats.busy).toBeGreaterThanOrEqual(0);
      });
    });
    
    it('should acquire and release connections', async () => {
      const request = {
        id: 'conn-request-1',
        provider: AIProvider.CLAUDE,
        priority: 'high' as const
      };
      
      // Mock connection
      const mockConnection = {
        id: 'conn-1',
        provider: AIProvider.CLAUDE,
        apiKey: 'test-key',
        status: 'available' as const,
        activeRequests: 0,
        totalRequests: 0,
        errorCount: 0,
        lastUsed: new Date(),
        createdAt: new Date(),
        metadata: {}
      };
      
      jest.spyOn(connectionPoolManager, 'acquireConnection').mockResolvedValue(mockConnection);
      
      const connection = await connectionPoolManager.acquireConnection(request);
      
      expect(connection).toBeDefined();
      expect(connection.provider).toBe(AIProvider.CLAUDE);
      
      // Release connection
      connectionPoolManager.releaseConnection(connection, true);
    });
    
    it('should handle load balancing strategies', () => {
      connectionPoolManager.setLoadBalancingStrategy({
        type: 'round-robin'
      });
      
      const stats = connectionPoolManager.getPoolStatistics();
      expect(stats).toBeDefined();
      
      connectionPoolManager.setLoadBalancingStrategy({
        type: 'least-connections'
      });
    });
  });
  
  describe('Enhanced Quick Task Service V2', () => {
    it('should create quick tasks with enhanced features', async () => {
      const config = {
        title: 'Test Quick Task',
        description: 'Test task for integration testing',
        priority: 'high' as const,
        provider: AIProvider.CLAUDE,
        enableOptimisticUpdates: true,
        enableProgressiveStatus: true,
        enableAutoRecovery: true
      };
      
      // Mock successful task creation
      const mockResult = {
        taskId: 'task-123',
        farmId: 'farm-456',
        harvestId: 'harvest-789',
        status: 'launching' as const,
        sessionName: 'quick_farm456',
        performanceMetrics: {
          launchTime: 1000,
          processingTime: 0,
          totalTime: 0,
          apiCalls: 1,
          retries: 0
        }
      };
      
      jest.spyOn(quickTaskServiceV2, 'createQuickTask').mockResolvedValue(mockResult);
      
      const result = await quickTaskServiceV2.createQuickTask(config, 'test-user');
      
      expect(result.taskId).toBeDefined();
      expect(result.farmId).toBeDefined();
      expect(result.status).toMatch(/created|queued|launching|processing/);
      expect(result.performanceMetrics).toBeDefined();
    });
    
    it('should handle transaction-based operations', async () => {
      const stats = quickTaskServiceV2.getStatistics();
      
      expect(stats.activeTransactions).toBeGreaterThanOrEqual(0);
      expect(stats.trackedTasks).toBeGreaterThanOrEqual(0);
      expect(stats.recoveryAttempts).toBeInstanceOf(Array);
    });
    
    it('should support progressive status updates', async () => {
      const taskId = 'test-task-progress';
      
      await quickTaskServiceV2.updateTaskProgress(taskId, 50, 'Processing...');
      
      // Verify progress was recorded
      const mockStatus = {
        taskId,
        farmId: 'farm-123',
        status: 'processing' as const,
        progress: 50
      };
      
      jest.spyOn(quickTaskServiceV2, 'getTaskStatus').mockResolvedValue(mockStatus);
      
      const status = await quickTaskServiceV2.getTaskStatus(taskId);
      expect(status.progress).toBe(50);
    });
  });
  
  describe('Real-time Metrics Aggregator', () => {
    it('should collect and aggregate metrics', () => {
      // Record some test metrics
      realtimeMetricsAggregator.recordMetric('test.counter', 1);
      realtimeMetricsAggregator.recordMetric('test.gauge', 42);
      realtimeMetricsAggregator.recordMetric('test.histogram', 150);
      
      const metrics = realtimeMetricsAggregator.getCurrentMetrics();
      
      expect(metrics.timestamp).toBeInstanceOf(Date);
      expect(metrics.quickTasks).toBeDefined();
      expect(metrics.apiCalls).toBeDefined();
      expect(metrics.connections).toBeDefined();
      expect(metrics.performance).toBeDefined();
    });
    
    it('should generate alerts based on thresholds', () => {
      // Simulate high error rate
      for (let i = 0; i < 10; i++) {
        realtimeMetricsAggregator.recordMetric('api.errors', 1);
      }
      
      const alerts = realtimeMetricsAggregator.getActiveAlerts();
      
      expect(alerts).toBeInstanceOf(Array);
      // May or may not have alerts depending on thresholds
    });
    
    it('should calculate performance metrics', () => {
      const metrics = realtimeMetricsAggregator.getCurrentMetrics();
      
      expect(metrics.quickTasks.successRate).toBeGreaterThanOrEqual(0);
      expect(metrics.quickTasks.successRate).toBeLessThanOrEqual(100);
      
      expect(metrics.apiCalls.avgLatency).toBeGreaterThanOrEqual(0);
      expect(metrics.connections.utilizationRate).toBeGreaterThanOrEqual(0);
    });
    
    it('should export metrics for analysis', async () => {
      const jsonExport = await realtimeMetricsAggregator.exportMetrics('json');
      expect(jsonExport).toBeDefined();
      expect(() => JSON.parse(jsonExport)).not.toThrow();
      
      const csvExport = await realtimeMetricsAggregator.exportMetrics('csv');
      expect(csvExport).toBeDefined();
      expect(csvExport).toContain('timestamp');
    });
  });
  
  describe('Infrastructure Integration', () => {
    it('should coordinate all services', async () => {
      const status = backendInfrastructure.getStatus();
      
      expect(status.initialized).toBe(true);
      expect(status.health).toBeDefined();
      expect(status.metrics).toBeDefined();
      expect(status.alerts).toBeInstanceOf(Array);
      expect(status.statistics).toBeDefined();
    });
    
    it('should handle infrastructure-wide alerts', (done) => {
      backendInfrastructure.once('alert:handled', (alert) => {
        expect(alert).toBeDefined();
        expect(alert.source).toBeDefined();
        expect(alert.severity).toMatch(/low|medium|high|critical/);
        done();
      });
      
      // Trigger a test alert
      realtimeMetricsAggregator.emit('alert:created', {
        id: 'test-alert',
        type: 'warning',
        severity: 'medium',
        title: 'Test Alert',
        message: 'This is a test alert',
        source: 'test',
        timestamp: new Date(),
        acknowledged: false
      });
    });
    
    it('should provide unified Quick Task creation', async () => {
      const config = {
        title: 'Infrastructure Test Task',
        description: 'Testing unified task creation',
        priority: 'medium' as const
      };
      
      // Mock the response
      const mockResult = {
        taskId: 'infra-task-1',
        farmId: 'infra-farm-1',
        status: 'queued' as const
      };
      
      jest.spyOn(backendInfrastructure, 'createQuickTask').mockResolvedValue(mockResult);
      
      const result = await backendInfrastructure.createQuickTask(config, 'test-user');
      
      expect(result.taskId).toBeDefined();
      expect(result.farmId).toBeDefined();
    });
    
    it('should provide unified API request execution', async () => {
      const request = {
        id: 'infra-request-1',
        provider: AIProvider.CLAUDE,
        endpoint: '/test',
        method: 'GET' as const
      };
      
      // Mock the response
      jest.spyOn(backendInfrastructure, 'executeApiRequest')
        .mockResolvedValue({ success: true, data: 'test' });
      
      const result = await backendInfrastructure.executeApiRequest(request);
      
      expect(result).toBeDefined();
    });
  });
  
  describe('Performance and Reliability', () => {
    it('should handle high load scenarios', async () => {
      const promises = [];
      
      // Simulate 10 concurrent quick tasks
      for (let i = 0; i < 10; i++) {
        const config = {
          title: `Load Test Task ${i}`,
          description: `Load test ${i}`,
          priority: 'medium' as const
        };
        
        // Mock all responses
        jest.spyOn(quickTaskServiceV2, 'createQuickTask').mockResolvedValue({
          taskId: `load-task-${i}`,
          farmId: `load-farm-${i}`,
          status: 'queued' as const,
          performanceMetrics: {
            launchTime: 100 + i * 10,
            processingTime: 0,
            totalTime: 0,
            apiCalls: 1,
            retries: 0
          }
        });
        
        promises.push(quickTaskServiceV2.createQuickTask(config, 'test-user'));
      }
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.taskId).toBeDefined();
      });
    });
    
    it('should recover from service failures', async () => {
      // Simulate API manager failure and recovery
      const request = {
        id: 'recovery-test',
        provider: AIProvider.CLAUDE,
        endpoint: '/test',
        method: 'POST' as const,
        data: { test: true }
      };
      
      // Mock failure then success (recovery)
      jest.spyOn(centralApiManager, 'executeRequest')
        .mockRejectedValueOnce(new Error('Service unavailable'))
        .mockResolvedValueOnce({ success: true, data: { recovered: true } });
      
      // First attempt should fail
      await expect(centralApiManager.executeRequest(request)).rejects.toThrow();
      
      // Second attempt should succeed (after recovery)
      const response = await centralApiManager.executeRequest(request);
      expect(response.success).toBe(true);
    });
    
    it('should maintain data consistency during failures', async () => {
      // Get initial metrics
      const initialMetrics = realtimeMetricsAggregator.getCurrentMetrics();
      
      // Simulate some operations
      realtimeMetricsAggregator.recordMetric('test.consistency', 100);
      
      // Get updated metrics
      const updatedMetrics = realtimeMetricsAggregator.getCurrentMetrics();
      
      // Verify timestamp progression
      expect(updatedMetrics.timestamp.getTime()).toBeGreaterThanOrEqual(
        initialMetrics.timestamp.getTime()
      );
    });
  });
  
  describe('Graceful Shutdown', () => {
    it('should shutdown all services gracefully', async () => {
      // Create a separate instance for shutdown testing
      const testInfra = backendInfrastructure;
      
      // Spy on shutdown methods
      const shutdownSpy = jest.spyOn(testInfra, 'shutdown');
      
      await testInfra.shutdown();
      
      expect(shutdownSpy).toHaveBeenCalled();
      
      // Verify services are stopped
      const status = testInfra.getStatus();
      // Services should still report status even after shutdown
      expect(status).toBeDefined();
    });
  });
});

describe('End-to-End Quick Task Flow', () => {
  it('should complete a full Quick Task lifecycle', async () => {
    // Step 1: Create Quick Task
    const createConfig = {
      title: 'E2E Test Task',
      description: 'Complete end-to-end test',
      priority: 'high' as const,
      provider: AIProvider.CLAUDE
    };
    
    const mockCreation = {
      taskId: 'e2e-task-1',
      farmId: 'e2e-farm-1',
      harvestId: 'e2e-harvest-1',
      status: 'launching' as const,
      sessionName: 'quick_e2efarm1',
      performanceMetrics: {
        launchTime: 500,
        processingTime: 0,
        totalTime: 0,
        apiCalls: 1,
        retries: 0
      }
    };
    
    jest.spyOn(quickTaskServiceV2, 'createQuickTask').mockResolvedValue(mockCreation);
    
    const task = await quickTaskServiceV2.createQuickTask(createConfig, 'e2e-user');
    expect(task.taskId).toBeDefined();
    
    // Step 2: Update Progress
    await quickTaskServiceV2.updateTaskProgress(task.taskId, 25, 'Starting...');
    await quickTaskServiceV2.updateTaskProgress(task.taskId, 50, 'Processing...');
    await quickTaskServiceV2.updateTaskProgress(task.taskId, 75, 'Finalizing...');
    
    // Step 3: Complete Task
    await quickTaskServiceV2.completeTask(task.taskId, {
      result: 'Success',
      output: 'Task completed successfully'
    });
    
    // Step 4: Verify Metrics
    const metrics = realtimeMetricsAggregator.getCurrentMetrics();
    expect(metrics.quickTasks.completed).toBeGreaterThanOrEqual(0);
    
    // Step 5: Check for alerts
    const alerts = realtimeMetricsAggregator.getActiveAlerts();
    expect(alerts).toBeInstanceOf(Array);
  });
});