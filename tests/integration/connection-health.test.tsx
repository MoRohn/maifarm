// Jest test - converted from Vitest
import { render, screen, waitFor } from '@testing-library/react';
import { HealthStatus } from '@/components/Monitoring/HealthStatus';
import { connectionMonitor } from '@/services/monitoring/connectionMonitor';
import { websocketService } from '@/services/websocket';
import { api } from '@/services/apiClient';

// Mock dependencies
jest.mock('@/store/websocketStore', () => ({
  useWebSocketStore: () => ({
    sendMessage: jest.fn(),
    addMessageHandler: jest.fn(),
    removeMessageHandler: jest.fn()
  })
}));

jest.mock('@/services/websocket', () => ({
  websocketService: {
    getStatus: jest.fn(),
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn()
  }
}));

jest.mock('@/services/apiClient', () => ({
  api: {
    health: jest.fn()
  }
}));

describe('Connection Health Monitoring Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('HealthStatus Component', () => {
    it('should display connection status correctly', async () => {
      // Mock API health response
      (api.health as any).mockResolvedValue({
        data: {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: 3600,
          version: '2.0.0',
          checks: [
            {
              name: 'WebSocket',
              status: 'pass',
              componentType: 'service',
              time: 5
            },
            {
              name: 'Database',
              status: 'pass',
              componentType: 'datastore',
              time: 10
            }
          ]
        }
      });

      // Mock WebSocket status
      (websocketService.getStatus as any).mockReturnValue('connected');

      render(<HealthStatus />);

      // Wait for component to load
      await waitFor(() => {
        expect(screen.getByText('System Health')).toBeInTheDocument();
      });

      // Check if health status is displayed
      expect(screen.getByText('HEALTHY')).toBeInTheDocument();
      expect(screen.getByText('2.0.0')).toBeInTheDocument();
    });

    it('should handle API failures gracefully', async () => {
      // Mock API failure
      (api.health as any).mockRejectedValue(new Error('Network error'));

      render(<HealthStatus />);

      // Wait for error handling
      await waitFor(() => {
        expect(screen.getByText('System Health')).toBeInTheDocument();
      });

      // Should show unhealthy status with fallback data
      expect(screen.getByText('UNHEALTHY')).toBeInTheDocument();
      expect(screen.getByText('Unable to connect to API server')).toBeInTheDocument();
    });

    it('should update connection status in real-time', async () => {
      let healthChangeCallback: ((health: any) => void) | null = null;

      // Mock connection monitor
      jest.spyOn(connectionMonitor, 'onHealthChange').mockImplementation((callback) => {
        healthChangeCallback = callback;
        return () => {};
      });

      jest.spyOn(connectionMonitor, 'start').mockImplementation(() => {});
      jest.spyOn(connectionMonitor, 'stop').mockImplementation(() => {});

      // Mock initial API response
      (api.health as any).mockResolvedValue({
        data: {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: 3600,
          version: '2.0.0',
          checks: []
        }
      });

      render(<HealthStatus />);

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByText('System Health')).toBeInTheDocument();
      });

      // Simulate connection health update
      if (healthChangeCallback) {
        healthChangeCallback({
          websocket: {
            connected: false,
            latency: 0,
            lastPing: null,
            reconnectAttempts: 3,
            errorCount: 2
          },
          api: {
            available: true,
            latency: 150,
            lastCheck: new Date(),
            errorCount: 0
          },
          overall: 'degraded' as const
        });
      }

      // Check if UI updated
      await waitFor(() => {
        expect(screen.getByText('DEGRADED')).toBeInTheDocument();
        expect(screen.getByText('Disconnected')).toBeInTheDocument();
        expect(screen.getByText('Reconnect attempts: 3')).toBeInTheDocument();
      });
    });
  });

  describe('Connection Monitor Service', () => {
    it('should detect connection anomalies', () => {
      const monitor = connectionMonitor;
      
      // Mock unhealthy connection state
      const mockHealth = {
        websocket: {
          connected: false,
          latency: 6000, // High latency
          lastPing: new Date(Date.now() - 300000), // 5 minutes ago
          reconnectAttempts: 10,
          errorCount: 25
        },
        api: {
          available: false,
          latency: 0,
          lastCheck: new Date(Date.now() - 600000), // 10 minutes ago
          errorCount: 50
        },
        overall: 'unhealthy' as const
      };

      // Manually set connection health for testing
      (monitor as any).connectionHealth = mockHealth;

      const anomalies = monitor.detectAnomalies();

      expect(anomalies).toHaveLength(3);
      expect(anomalies.some(a => a.type === 'high_latency')).toBe(true);
      expect(anomalies.some(a => a.type === 'prolonged_disconnection')).toBe(true);
      expect(anomalies.some(a => a.severity === 'high')).toBe(true);
    });

    it('should calculate connection metrics correctly', () => {
      const monitor = connectionMonitor;
      
      // Mock connection history
      const mockHistory = [
        { timestamp: new Date(Date.now() - 60000), status: 'connected' as const, duration: 30000 },
        { timestamp: new Date(Date.now() - 30000), status: 'disconnected' as const, duration: 10000 },
        { timestamp: new Date(Date.now() - 20000), status: 'connected' as const, duration: 15000 },
        { timestamp: new Date(Date.now() - 5000), status: 'error' as const, duration: 5000 }
      ];

      (monitor as any).connectionMetrics.connectionHistory = mockHistory;

      // Manually trigger metrics calculation
      (monitor as any).calculateMetrics();

      const metrics = monitor.getConnectionMetrics();
      
      expect(metrics.totalDisconnects).toBe(1);
      expect(metrics.totalErrors).toBe(0); // Not counted in this implementation
      expect(metrics.uptimePercentage).toBeGreaterThan(0.6); // ~66% uptime
      expect(metrics.uptimePercentage).toBeLessThan(0.7);
    });
  });

  describe('WebSocket Fallback to Mock Data', () => {
    it('should use mock data when server is unavailable', async () => {
      // Mock WebSocket as using mock data
      (websocketService.getStatus as any).mockReturnValue('mock');
      (websocketService as any).isUsingMockData = jest.fn().mockReturnValue(true);

      // Mock connection monitor health
      const mockHealth = {
        websocket: {
          connected: false,
          latency: 0,
          lastPing: null,
          reconnectAttempts: 10,
          errorCount: 10
        },
        api: {
          available: false,
          latency: 0,
          lastCheck: null,
          errorCount: 5
        },
        overall: 'unhealthy' as const
      };

      let healthChangeCallback: ((health: any) => void) | null = null;
      jest.spyOn(connectionMonitor, 'onHealthChange').mockImplementation((callback) => {
        healthChangeCallback = callback;
        // Immediately call with mock health
        callback(mockHealth);
        return () => {};
      });

      render(<HealthStatus />);

      await waitFor(() => {
        expect(screen.getByText('Connection Status')).toBeInTheDocument();
        expect(screen.getByText('UNHEALTHY')).toBeInTheDocument();
      });
    });
  });
});