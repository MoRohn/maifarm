import { jest } from '@jest/globals';
import { analyticsService } from '../../services/analyticsService.js';
import { db } from '../../database/connection.js';
import { Socket } from 'socket.io';

// Mock database
jest.mock('../../database/connection.js', () => ({
  db: {
    query: jest.fn(),
  },
}));

// Mock socket for WebSocket tests
const mockSocket = {
  emit: jest.fn(),
  broadcast: {
    emit: jest.fn(),
  },
  to: jest.fn(() => ({
    emit: jest.fn(),
  })),
} as unknown as Socket;

describe('AnalyticsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getFarmCreationMetrics', () => {
    it('should return farm creation metrics with successful data', async () => {
      const mockDbQuery = db.query as jest.MockedFunction<typeof db.query>;
      
      // Mock successful queries
      mockDbQuery
        .mockResolvedValueOnce({
          rows: [{ total: '10', successful: '8', avg_time: '45.5' }],
          command: 'SELECT',
          rowCount: 1,
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [
            { id: '1', name: 'Farm1', created_at: new Date(), status: 'active' },
            { id: '2', name: 'Farm2', created_at: new Date(), status: 'active' },
          ],
          command: 'SELECT',
          rowCount: 2,
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [
            { date: '2025-08-01', count: '3' },
            { date: '2025-08-02', count: '5' },
          ],
          command: 'SELECT',
          rowCount: 2,
          oid: 0,
          fields: [],
        });

      const result = await analyticsService.getFarmCreationMetrics();

      expect(result).toMatchObject({
        totalFarms: 10,
        successRate: 80,
        avgCreationTime: 45.5,
        failureReasons: {},
        recentFarms: expect.arrayContaining([
          expect.objectContaining({ id: '1', name: 'Farm1' }),
          expect.objectContaining({ id: '2', name: 'Farm2' }),
        ]),
        trend: expect.arrayContaining([
          { date: '2025-08-01', count: 3 },
          { date: '2025-08-02', count: 5 },
        ]),
      });
    });

    it('should handle database errors gracefully', async () => {
      const mockDbQuery = db.query as jest.MockedFunction<typeof db.query>;
      mockDbQuery.mockRejectedValue(new Error('Database connection failed'));

      const result = await analyticsService.getFarmCreationMetrics();

      expect(result).toMatchObject({
        totalFarms: 0,
        successRate: 0,
        avgCreationTime: 0,
        failureReasons: {},
        recentFarms: [],
        trend: [],
      });
    });

    it('should handle empty results', async () => {
      const mockDbQuery = db.query as jest.MockedFunction<typeof db.query>;
      mockDbQuery
        .mockResolvedValueOnce({
          rows: [],
          command: 'SELECT',
          rowCount: 0,
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [],
          command: 'SELECT',
          rowCount: 0,
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [],
          command: 'SELECT',
          rowCount: 0,
          oid: 0,
          fields: [],
        });

      const result = await analyticsService.getFarmCreationMetrics();

      expect(result).toMatchObject({
        totalFarms: 0,
        successRate: 0,
        avgCreationTime: 0,
        failureReasons: {},
        recentFarms: [],
        trend: [],
      });
    });
  });

  describe('getGoWildMetrics', () => {
    it('should return GoWild metrics', async () => {
      const mockDbQuery = db.query as jest.MockedFunction<typeof db.query>;
      mockDbQuery
        .mockResolvedValueOnce({
          rows: [
            {
              sessions: '5',
              avg_duration: '3600',
              tasks_generated: '25',
              creativity_score: '85',
            },
          ],
          command: 'SELECT',
          rowCount: 1,
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [
            { id: 'd1', type: 'innovation', timestamp: new Date() },
            { id: 'd2', type: 'exploration', timestamp: new Date() },
          ],
          command: 'SELECT',
          rowCount: 2,
          oid: 0,
          fields: [],
        });

      const result = await analyticsService.getGoWildMetrics();

      expect(result).toMatchObject({
        sessions: 5,
        avgDuration: 3600,
        tasksGenerated: 25,
        creativityScore: 85,
        explorationDepth: expect.any(Number),
        discoveries: expect.arrayContaining([
          expect.objectContaining({ id: 'd1', type: 'innovation' }),
          expect.objectContaining({ id: 'd2', type: 'exploration' }),
        ]),
        boundaries: expect.any(Object),
      });
    });

    it('should handle errors in GoWild metrics', async () => {
      const mockDbQuery = db.query as jest.MockedFunction<typeof db.query>;
      mockDbQuery.mockRejectedValue(new Error('Query failed'));

      const result = await analyticsService.getGoWildMetrics();

      expect(result).toMatchObject({
        sessions: 0,
        avgDuration: 0,
        tasksGenerated: 0,
        creativityScore: 0,
        explorationDepth: 0,
        discoveries: [],
        boundaries: {},
      });
    });
  });

  describe('getQuickTaskMetrics', () => {
    it('should return quick task metrics', async () => {
      const mockDbQuery = db.query as jest.MockedFunction<typeof db.query>;
      mockDbQuery
        .mockResolvedValueOnce({
          rows: [
            {
              completed: '100',
              avg_time: '30',
              success_rate: '95',
            },
          ],
          command: 'SELECT',
          rowCount: 1,
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [
            { type: 'build', count: '40' },
            { type: 'test', count: '30' },
            { type: 'deploy', count: '20' },
          ],
          command: 'SELECT',
          rowCount: 3,
          oid: 0,
          fields: [],
        });

      const result = await analyticsService.getQuickTaskMetrics();

      expect(result).toMatchObject({
        completed: 100,
        avgTime: 30,
        successRate: 95,
        taskTypes: {
          build: 40,
          test: 30,
          deploy: 20,
        },
        popularTasks: expect.arrayContaining([
          { type: 'build', count: 40 },
          { type: 'test', count: 30 },
        ]),
        performanceScore: expect.any(Number),
      });
    });
  });

  describe('trackEvent', () => {
    it('should track analytics events', async () => {
      const mockDbQuery = db.query as jest.MockedFunction<typeof db.query>;
      mockDbQuery.mockResolvedValueOnce({
        rows: [],
        command: 'INSERT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const event = {
        type: 'farm_created',
        category: 'farms',
        data: { farmId: '123', name: 'TestFarm' },
        userId: 'user1',
      };

      await analyticsService.trackEvent(event);

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO analytics_events'),
        expect.arrayContaining([
          event.type,
          event.category,
          JSON.stringify(event.data),
          event.userId,
        ])
      );
    });

    it('should handle event tracking errors', async () => {
      const mockDbQuery = db.query as jest.MockedFunction<typeof db.query>;
      mockDbQuery.mockRejectedValueOnce(new Error('Insert failed'));

      const event = {
        type: 'error_event',
        category: 'errors',
        data: { error: 'test' },
        userId: 'user1',
      };

      // Should not throw
      await expect(analyticsService.trackEvent(event)).resolves.not.toThrow();
    });
  });

  describe('getSystemHealth', () => {
    it('should return system health metrics', async () => {
      const mockDbQuery = db.query as jest.MockedFunction<typeof db.query>;
      mockDbQuery.mockResolvedValueOnce({
        rows: [
          {
            cpu_usage: '45.5',
            memory_usage: '2048',
            disk_usage: '60',
            active_connections: '10',
            error_rate: '0.5',
          },
        ],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await analyticsService.getSystemHealth();

      expect(result).toMatchObject({
        cpuUsage: 45.5,
        memoryUsage: 2048,
        diskUsage: 60,
        activeConnections: 10,
        errorRate: 0.5,
        status: 'healthy',
      });
    });

    it('should indicate unhealthy status when metrics exceed thresholds', async () => {
      const mockDbQuery = db.query as jest.MockedFunction<typeof db.query>;
      mockDbQuery.mockResolvedValueOnce({
        rows: [
          {
            cpu_usage: '95',
            memory_usage: '4096',
            disk_usage: '90',
            active_connections: '100',
            error_rate: '5',
          },
        ],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await analyticsService.getSystemHealth();

      expect(result.status).toBe('critical');
    });
  });

  describe('WebSocket emission methods', () => {
    it('should emit farm metrics via WebSocket', async () => {
      const mockDbQuery = db.query as jest.MockedFunction<typeof db.query>;
      mockDbQuery
        .mockResolvedValueOnce({
          rows: [{ total: '5', successful: '4', avg_time: '30' }],
          command: 'SELECT',
          rowCount: 1,
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [],
          command: 'SELECT',
          rowCount: 0,
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [],
          command: 'SELECT',
          rowCount: 0,
          oid: 0,
          fields: [],
        });

      await analyticsService.emitFarmMetrics(mockSocket);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'analytics:farms',
        expect.objectContaining({
          totalFarms: 5,
          successRate: 80,
        })
      );
    });

    it('should emit GoWild metrics via WebSocket', async () => {
      const mockDbQuery = db.query as jest.MockedFunction<typeof db.query>;
      mockDbQuery
        .mockResolvedValueOnce({
          rows: [
            {
              sessions: '3',
              avg_duration: '1800',
              tasks_generated: '15',
              creativity_score: '75',
            },
          ],
          command: 'SELECT',
          rowCount: 1,
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [],
          command: 'SELECT',
          rowCount: 0,
          oid: 0,
          fields: [],
        });

      await analyticsService.emitGoWildMetrics(mockSocket);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'analytics:gowild',
        expect.objectContaining({
          sessions: 3,
          avgDuration: 1800,
          tasksGenerated: 15,
        })
      );
    });
  });

  describe('Aggregation methods', () => {
    it('should aggregate metrics by time period', async () => {
      const mockDbQuery = db.query as jest.MockedFunction<typeof db.query>;
      mockDbQuery.mockResolvedValueOnce({
        rows: [
          { period: '2025-08-01', metric_value: '100' },
          { period: '2025-08-02', metric_value: '150' },
          { period: '2025-08-03', metric_value: '200' },
        ],
        command: 'SELECT',
        rowCount: 3,
        oid: 0,
        fields: [],
      });

      const result = await analyticsService.aggregateByPeriod('farms', 'daily', 7);

      expect(result).toEqual([
        { period: '2025-08-01', value: 100 },
        { period: '2025-08-02', value: 150 },
        { period: '2025-08-03', value: 200 },
      ]);
    });

    it('should handle aggregation errors', async () => {
      const mockDbQuery = db.query as jest.MockedFunction<typeof db.query>;
      mockDbQuery.mockRejectedValueOnce(new Error('Aggregation failed'));

      const result = await analyticsService.aggregateByPeriod('farms', 'daily', 7);

      expect(result).toEqual([]);
    });
  });

  describe('Performance metrics', () => {
    it('should calculate performance scores correctly', async () => {
      const mockDbQuery = db.query as jest.MockedFunction<typeof db.query>;
      mockDbQuery.mockResolvedValueOnce({
        rows: [
          {
            avg_response_time: '100',
            success_rate: '95',
            throughput: '1000',
          },
        ],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await analyticsService.getPerformanceMetrics();

      expect(result).toMatchObject({
        avgResponseTime: 100,
        successRate: 95,
        throughput: 1000,
        performanceScore: expect.any(Number),
      });
      expect(result.performanceScore).toBeGreaterThan(0);
      expect(result.performanceScore).toBeLessThanOrEqual(100);
    });
  });

  describe('Data export methods', () => {
    it('should export analytics data in CSV format', async () => {
      const mockDbQuery = db.query as jest.MockedFunction<typeof db.query>;
      mockDbQuery.mockResolvedValueOnce({
        rows: [
          { date: '2025-08-01', farms: 10, tasks: 50 },
          { date: '2025-08-02', farms: 15, tasks: 75 },
        ],
        command: 'SELECT',
        rowCount: 2,
        oid: 0,
        fields: [],
      });

      const result = await analyticsService.exportData('csv', {
        startDate: new Date('2025-08-01'),
        endDate: new Date('2025-08-02'),
      });

      expect(result).toContain('date,farms,tasks');
      expect(result).toContain('2025-08-01,10,50');
      expect(result).toContain('2025-08-02,15,75');
    });

    it('should export analytics data in JSON format', async () => {
      const mockDbQuery = db.query as jest.MockedFunction<typeof db.query>;
      mockDbQuery.mockResolvedValueOnce({
        rows: [
          { date: '2025-08-01', farms: 10, tasks: 50 },
          { date: '2025-08-02', farms: 15, tasks: 75 },
        ],
        command: 'SELECT',
        rowCount: 2,
        oid: 0,
        fields: [],
      });

      const result = await analyticsService.exportData('json', {
        startDate: new Date('2025-08-01'),
        endDate: new Date('2025-08-02'),
      });

      const parsed = JSON.parse(result);
      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toMatchObject({ date: '2025-08-01', farms: 10, tasks: 50 });
    });
  });
});