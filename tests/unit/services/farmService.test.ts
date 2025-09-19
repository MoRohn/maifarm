import { farmService } from '@/services/farmService';
import apiClient from '@/services/apiClient';
import { websocketService } from '@/services/websocket/websocketService';

// Mock dependencies
jest.mock('@/services/apiClient');
jest.mock('@/services/websocket/websocketService');

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;
const mockWebsocket = websocketService as jest.Mocked<typeof websocketService>;

describe('FarmService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAllFarms', () => {
    it('should fetch all farms successfully', async () => {
      const mockFarms = [
        { id: '1', name: 'Farm 1', status: 'running' },
        { id: '2', name: 'Farm 2', status: 'idle' }
      ];

      mockApiClient.get.mockResolvedValueOnce({
        data: { success: true, data: mockFarms }
      });

      const result = await farmService.getAllFarms();

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/farms');
      expect(result).toEqual(mockFarms);
    });

    it('should handle error when fetching farms fails', async () => {
      const error = new Error('Network error');
      mockApiClient.get.mockRejectedValueOnce(error);

      await expect(farmService.getAllFarms()).rejects.toThrow('Network error');
    });

    it('should apply filters when fetching farms', async () => {
      const filter = { status: 'running' };
      mockApiClient.get.mockResolvedValueOnce({
        data: { success: true, data: [] }
      });

      await farmService.getAllFarms(filter);

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/farms?status=running');
    });
  });

  describe('createFarm', () => {
    it('should create a new farm', async () => {
      const farmData = {
        name: 'Test Farm',
        prompt: 'Build a web app',
        agentCount: 3,
        provider: 'claude' as const
      };

      const createdFarm = {
        id: 'farm-123',
        ...farmData,
        status: 'launching',
        createdAt: new Date()
      };

      mockApiClient.post.mockResolvedValueOnce({
        data: { success: true, data: createdFarm }
      });

      const result = await farmService.createFarm(farmData);

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/farms', farmData);
      expect(result).toEqual(createdFarm);
    });

    it('should validate required fields', async () => {
      const invalidData = {
        name: '',
        prompt: '',
        agentCount: 0,
        provider: 'invalid' as any
      };

      await expect(farmService.createFarm(invalidData))
        .rejects.toThrow('Invalid farm configuration');
    });

    it('should emit WebSocket event after farm creation', async () => {
      const farmData = {
        name: 'Test Farm',
        prompt: 'Test prompt',
        agentCount: 2,
        provider: 'claude' as const
      };

      mockApiClient.post.mockResolvedValueOnce({
        data: { success: true, data: { id: 'farm-123', ...farmData } }
      });

      await farmService.createFarm(farmData);

      expect(mockWebsocket.emit).toHaveBeenCalledWith('farm:created',
        expect.objectContaining({ id: 'farm-123' })
      );
    });
  });

  describe('launchFarm', () => {
    it('should launch a farm', async () => {
      const farmId = 'farm-123';
      const launchedFarm = {
        id: farmId,
        status: 'launching',
        agents: ['agent-1', 'agent-2']
      };

      mockApiClient.post.mockResolvedValueOnce({
        data: { success: true, data: launchedFarm }
      });

      const result = await farmService.launchFarm(farmId);

      expect(mockApiClient.post).toHaveBeenCalledWith(`/api/farms/${farmId}/launch`);
      expect(result).toEqual(launchedFarm);
    });

    it('should handle launch timeout', async () => {
      const farmId = 'farm-123';

      // Mock timeout
      jest.useFakeTimers();

      const launchPromise = farmService.launchFarm(farmId, { timeout: 1000 });

      jest.advanceTimersByTime(1001);

      await expect(launchPromise).rejects.toThrow('Farm launch timeout');

      jest.useRealTimers();
    });
  });

  describe('stopFarm', () => {
    it('should stop a running farm', async () => {
      const farmId = 'farm-123';

      mockApiClient.post.mockResolvedValueOnce({
        data: { success: true }
      });

      await farmService.stopFarm(farmId);

      expect(mockApiClient.post).toHaveBeenCalledWith(`/api/farms/${farmId}/stop`);
    });

    it('should gracefully handle stop errors', async () => {
      const farmId = 'farm-123';
      const error = new Error('Farm not found');

      mockApiClient.post.mockRejectedValueOnce(error);

      await expect(farmService.stopFarm(farmId)).rejects.toThrow('Farm not found');
    });
  });

  describe('updateFarm', () => {
    it('should update farm configuration', async () => {
      const farmId = 'farm-123';
      const updates = {
        name: 'Updated Farm',
        timeout: 3600
      };

      const updatedFarm = {
        id: farmId,
        ...updates,
        updatedAt: new Date()
      };

      mockApiClient.put.mockResolvedValueOnce({
        data: { success: true, data: updatedFarm }
      });

      const result = await farmService.updateFarm(farmId, updates);

      expect(mockApiClient.put).toHaveBeenCalledWith(`/api/farms/${farmId}`, updates);
      expect(result).toEqual(updatedFarm);
    });
  });

  describe('getFarmMetrics', () => {
    it('should fetch farm metrics', async () => {
      const farmId = 'farm-123';
      const metrics = {
        agentEfficiency: 0.85,
        tasksCompleted: 42,
        resourceUsage: {
          cpu: 45,
          memory: 60
        }
      };

      mockApiClient.get.mockResolvedValueOnce({
        data: { success: true, data: metrics }
      });

      const result = await farmService.getFarmMetrics(farmId);

      expect(mockApiClient.get).toHaveBeenCalledWith(`/api/farms/${farmId}/metrics`);
      expect(result).toEqual(metrics);
    });
  });

  describe('WebSocket Integration', () => {
    it('should subscribe to farm status updates', () => {
      const callback = jest.fn();
      const unsubscribe = farmService.subscribeToFarmStatus('farm-123', callback);

      expect(mockWebsocket.on).toHaveBeenCalledWith('farm:status', expect.any(Function));

      // Simulate status update
      const handler = mockWebsocket.on.mock.calls[0][1];
      handler({ farmId: 'farm-123', status: 'completed' });

      expect(callback).toHaveBeenCalledWith({ farmId: 'farm-123', status: 'completed' });

      // Test unsubscribe
      unsubscribe();
      expect(mockWebsocket.off).toHaveBeenCalled();
    });

    it('should join farm room for real-time updates', () => {
      farmService.joinFarmRoom('farm-123');

      expect(mockWebsocket.emit).toHaveBeenCalledWith('farm:join', { farmId: 'farm-123' });
    });

    it('should leave farm room', () => {
      farmService.leaveFarmRoom('farm-123');

      expect(mockWebsocket.emit).toHaveBeenCalledWith('farm:leave', { farmId: 'farm-123' });
    });
  });

  describe('Error Recovery', () => {
    it('should retry failed requests', async () => {
      const farmId = 'farm-123';

      // First call fails, second succeeds
      mockApiClient.get
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          data: { success: true, data: { id: farmId } }
        });

      const result = await farmService.getFarmById(farmId, { retry: true });

      expect(mockApiClient.get).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ id: farmId });
    });

    it('should respect max retry attempts', async () => {
      const farmId = 'farm-123';

      // All calls fail
      mockApiClient.get.mockRejectedValue(new Error('Network error'));

      await expect(
        farmService.getFarmById(farmId, { retry: true, maxRetries: 3 })
      ).rejects.toThrow('Network error');

      expect(mockApiClient.get).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });
  });
});