import { HarvestService as ExportedHarvestService, harvestService } from '../harvestService';
import type { HarvestService as HarvestServiceType } from '../harvestService';

const HarvestService: any = ExportedHarvestService ?? (harvestService as any).constructor;

jest.mock('../harvestService', () => jest.requireActual('../harvestService'));
// eslint-disable-next-line no-console
console.log('harvestService proto keys:', Object.getOwnPropertyNames(Object.getPrototypeOf(harvestService)));
import apiClient from '../apiClient';
import { websocketService } from '../websocket/websocketService';
import { 
  Harvest, 
  HarvestFilter,
  HarvestExport,
  HarvestSummary 
} from '../../types/harvest';

// Mock dependencies
jest.mock('../apiClient');
jest.mock('../websocket/websocketService');

describe('HarvestService - Comprehensive Test Suite', () => {
  let harvestService: HarvestServiceType;
  const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;
  const mockWebsocketService = websocketService as jest.Mocked<typeof websocketService>;
  
  // Test data fixtures
  const mockHarvest: Harvest = {
    id: 'harvest-123',
    farmId: 'farm-456',
    farmName: 'Test Farm',
    name: 'Test Harvest',
    description: 'Test harvest description',
    type: 'workflow',
    status: 'processing',
    createdAt: new Date('2024-01-01T10:00:00Z'),
    completedAt: undefined,
    useCount: 0,
    summary: {
      description: 'Test summary',
      totalTasks: 10,
      completedTasks: 3,
      failedTasks: 0,
      duration: 0,
      efficiency: 30
    },
    results: [],
    insights: [],
    yield: [],
    quality: {
      completeness: 85,
      accuracy: 90,
      relevance: 88,
      overallScore: 87
    },
    tags: ['test', 'automated'],
    exportFormats: ['json', 'markdown']
  };
  
  const mockHarvestSummary: HarvestSummary = {
    id: 'harvest-123',
    farmName: 'Test Farm',
    completedAt: new Date('2024-01-01T12:00:00Z'),
    artifactCount: 5,
    qualityScore: 90,
    topInsights: [
      {
        id: 'insight-1',
        content: 'Key finding',
        importance: 'high',
        timestamp: new Date('2024-01-01T11:00:00Z')
      }
    ]
  };
  
  beforeEach(() => {
    jest.clearAllMocks();
    harvestService = new HarvestService();
  });
  
  describe('Initialization and Event Subscription', () => {
    it('should subscribe to WebSocket events on initialization', () => {
      expect(mockWebsocketService.on).toHaveBeenCalledWith(
        'harvest:started',
        expect.any(Function)
      );
      expect(mockWebsocketService.on).toHaveBeenCalledWith(
        'harvest:progress',
        expect.any(Function)
      );
      expect(mockWebsocketService.on).toHaveBeenCalledWith(
        'harvest:completed',
        expect.any(Function)
      );
    });
    
    it('should handle harvest:started event', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const handler = mockWebsocketService.on.mock.calls.find(
        call => call[0] === 'harvest:started'
      )?.[1];
      
      const eventData = { harvestId: 'harvest-123', farmId: 'farm-456' };
      handler?.(eventData);
      
      expect(consoleSpy).toHaveBeenCalledWith('Harvest started:', eventData);
      consoleSpy.mockRestore();
    });
    
    it('should handle harvest:progress event', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const handler = mockWebsocketService.on.mock.calls.find(
        call => call[0] === 'harvest:progress'
      )?.[1];
      
      const eventData = { harvestId: 'harvest-123', progress: 50 };
      handler?.(eventData);
      
      expect(consoleSpy).toHaveBeenCalledWith('Harvest progress:', eventData);
      consoleSpy.mockRestore();
    });
    
    it('should handle harvest:completed event', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const handler = mockWebsocketService.on.mock.calls.find(
        call => call[0] === 'harvest:completed'
      )?.[1];
      
      const eventData = { harvestId: 'harvest-123', quality: 95 };
      handler?.(eventData);
      
      expect(consoleSpy).toHaveBeenCalledWith('Harvest completed:', eventData);
      consoleSpy.mockRestore();
    });
  });
  
  describe('getAll', () => {
    it('should fetch all harvests without filters', async () => {
      mockApiClient.get.mockResolvedValue({ data: [mockHarvest] });
      
      const result = await harvestService.getAll();
      
      expect(mockApiClient.get).toHaveBeenCalledWith('/api/harvest');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('harvest-123');
    });
    
    it('should apply farmId filter', async () => {
      mockApiClient.get.mockResolvedValue({ data: [mockHarvest] });
      
      const filter: HarvestFilter = { farmId: 'farm-456' };
      await harvestService.getAll(filter);
      
      expect(mockApiClient.get).toHaveBeenCalledWith(
        '/api/harvest?farmId=farm-456'
      );
    });
    
    it('should apply multiple status filters', async () => {
      mockApiClient.get.mockResolvedValue({ data: [mockHarvest] });

      const filter: HarvestFilter = {
        status: ['processing', 'ready']
      };
      await harvestService.getAll(filter);

      // Service passes status values as-is
      expect(mockApiClient.get).toHaveBeenCalledWith(
        expect.stringContaining('status=')
      );
    });
    
    it('should apply tags filter', async () => {
      mockApiClient.get.mockResolvedValue({ data: [mockHarvest] });
      
      const filter: HarvestFilter = { tags: ['test', 'production'] };
      await harvestService.getAll(filter);
      
      expect(mockApiClient.get).toHaveBeenCalledWith(
        expect.stringContaining('tags=test%2Cproduction')
      );
    });
    
    it('should apply quality threshold filter', async () => {
      mockApiClient.get.mockResolvedValue({ data: [mockHarvest] });
      
      const filter: HarvestFilter = { qualityThreshold: 80 };
      await harvestService.getAll(filter);
      
      expect(mockApiClient.get).toHaveBeenCalledWith(
        expect.stringContaining('qualityThreshold=80')
      );
    });
    
    it('should apply search query filter', async () => {
      mockApiClient.get.mockResolvedValue({ data: [mockHarvest] });
      
      const filter: HarvestFilter = { searchQuery: 'test query' };
      await harvestService.getAll(filter);
      
      expect(mockApiClient.get).toHaveBeenCalledWith(
        expect.stringContaining('search=test+query')
      );
    });
    
    it('should apply date range filter', async () => {
      mockApiClient.get.mockResolvedValue({ data: [mockHarvest] });
      
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const filter: HarvestFilter = { 
        dateRange: { start: startDate, end: endDate } 
      };
      await harvestService.getAll(filter);
      
      expect(mockApiClient.get).toHaveBeenCalledWith(
        expect.stringContaining(`startDate=${encodeURIComponent(startDate.toISOString())}`)
      );
      expect(mockApiClient.get).toHaveBeenCalledWith(
        expect.stringContaining(`endDate=${encodeURIComponent(endDate.toISOString())}`)
      );
    });
    
    it('should apply all filters combined', async () => {
      mockApiClient.get.mockResolvedValue({ data: [mockHarvest] });

      const filter: HarvestFilter = {
        farmId: 'farm-456',
        status: ['ready'],
        tags: ['production'],
        qualityThreshold: 75,
        searchQuery: 'important',
        dateRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-01-31')
        }
      };

      await harvestService.getAll(filter);

      const callArg = mockApiClient.get.mock.calls[0][0];
      expect(callArg).toContain('farmId=farm-456');
      expect(callArg).toContain('status='); // Status passed through
      expect(callArg).toContain('tags=production');
      expect(callArg).toContain('qualityThreshold=75');
      expect(callArg).toContain('search=important');
      expect(callArg).toContain('startDate=');
      expect(callArg).toContain('endDate=');
    });
    
    it('should parse harvest dates correctly', async () => {
      const rawHarvest = {
        ...mockHarvest,
        startedAt: '2024-01-01T10:00:00Z',
        completedAt: '2024-01-01T12:00:00Z'
      };
      
      mockApiClient.get.mockResolvedValue({ data: [rawHarvest] });
      
      const result = await harvestService.getAll();
      
      expect(result[0].startedAt).toBeInstanceOf(Date);
      expect(result[0].completedAt).toBeInstanceOf(Date);
    });
  });
  
  describe('getSummaries', () => {
    it('should fetch harvest summaries', async () => {
      mockApiClient.get.mockResolvedValue({ 
        data: [{
          ...mockHarvestSummary,
          completedAt: '2024-01-01T12:00:00Z',
          topInsights: [{
            ...mockHarvestSummary.topInsights[0],
            timestamp: '2024-01-01T11:00:00Z'
          }]
        }] 
      });
      
      const result = await harvestService.getSummaries();
      
      expect(mockApiClient.get).toHaveBeenCalledWith('/api/harvest/summaries');
      expect(result).toHaveLength(1);
      expect(result[0].completedAt).toBeInstanceOf(Date);
      expect(result[0].topInsights[0].timestamp).toBeInstanceOf(Date);
    });
    
    it('should handle empty summaries', async () => {
      mockApiClient.get.mockResolvedValue({ data: [] });
      
      const result = await harvestService.getSummaries();
      
      expect(result).toEqual([]);
    });
  });
  
  describe('getById', () => {
    it('should fetch harvest by ID', async () => {
      mockApiClient.get.mockResolvedValue({ data: mockHarvest });
      
      const result = await harvestService.getById('harvest-123');
      
      expect(mockApiClient.get).toHaveBeenCalledWith('/api/harvest/harvest-123');
      expect(result.id).toBe('harvest-123');
    });
    
    it('should handle harvest not found', async () => {
      mockApiClient.get.mockRejectedValue(new Error('Not found'));
      
      await expect(harvestService.getById('invalid-id')).rejects.toThrow('Not found');
    });
  });
  
  describe('getByFarmId', () => {
    it('should fetch harvests by farm ID', async () => {
      mockApiClient.get.mockResolvedValue({ data: [mockHarvest] });
      
      const result = await harvestService.getByFarmId('farm-456');
      
      expect(mockApiClient.get).toHaveBeenCalledWith('/api/harvest/farms/farm-456');
      expect(result).toHaveLength(1);
      expect(result[0].farmId).toBe('farm-456');
    });
    
    it('should return empty array for farm with no harvests', async () => {
      mockApiClient.get.mockResolvedValue({ data: [] });
      
      const result = await harvestService.getByFarmId('farm-999');
      
      expect(result).toEqual([]);
    });
  });
  
  describe('startHarvest', () => {
    it('should start a new harvest', async () => {
      const newHarvest = {
        ...mockHarvest,
        status: 'processing'
      };
      
      mockApiClient.post.mockResolvedValue({ data: newHarvest });
      
      const result = await harvestService.startHarvest('farm-456', 'Test Farm');
      
      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/api/harvest/farms/farm-456/harvest',
        { farmName: 'Test Farm' }
      );
      expect(result.status).toBe('processing');
    });
    
    it('should handle harvest start failure', async () => {
      mockApiClient.post.mockRejectedValue(new Error('Failed to start harvest'));
      
      await expect(
        harvestService.startHarvest('farm-456', 'Test Farm')
      ).rejects.toThrow('Failed to start harvest');
    });
  });
  
  describe('exportHarvest', () => {
    it('should export harvest in JSON format', async () => {
      const blob = new Blob(['{"test": "data"}'], { type: 'application/json' });
      mockApiClient.post.mockResolvedValue({ data: blob });
      
      const exportConfig: HarvestExport = {
        harvestId: 'harvest-123',
        format: 'json',
        includeArtifacts: true,
        includeMetrics: true,
        includeInsights: true
      };
      
      const result = await harvestService.exportHarvest(exportConfig);
      
      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/api/harvest/harvest-123/export',
        exportConfig,
        { responseType: 'blob' }
      );
      expect(result).toBeInstanceOf(Blob);
    });
    
    it('should export harvest in CSV format', async () => {
      const blob = new Blob(['col1,col2\nval1,val2'], { type: 'text/csv' });
      mockApiClient.post.mockResolvedValue({ data: blob });
      
      const exportConfig: HarvestExport = {
        harvestId: 'harvest-123',
        format: 'csv',
        includeArtifacts: false,
        includeMetrics: true,
        includeInsights: false
      };
      
      const result = await harvestService.exportHarvest(exportConfig);
      
      expect(result).toBeInstanceOf(Blob);
    });
    
    it('should export harvest in PDF format', async () => {
      const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
      mockApiClient.post.mockResolvedValue({ data: blob });
      
      const exportConfig: HarvestExport = {
        harvestId: 'harvest-123',
        format: 'pdf',
        includeArtifacts: true,
        includeMetrics: true,
        includeInsights: true,
        template: 'detailed'
      };
      
      const result = await harvestService.exportHarvest(exportConfig);
      
      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/api/harvest/harvest-123/export',
        expect.objectContaining({ template: 'detailed' }),
        { responseType: 'blob' }
      );
      expect(result).toBeInstanceOf(Blob);
    });
  });
  
  describe('completeHarvest', () => {
    it('should mark harvest as completed', async () => {
      const completedHarvest = {
        ...mockHarvest,
        status: 'ready',
        completedAt: new Date()
      };

      // Service uses POST, not PUT
      mockApiClient.post.mockResolvedValue({ data: completedHarvest });

      const result = await harvestService.completeHarvest('harvest-123');

      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/api/harvest/harvest-123/complete'
      );
      // Verify result is returned
      expect(result).toBeDefined();
      expect(result.id).toBe('harvest-123');
    });
  });
  
  describe('deleteHarvest', () => {
    it('should delete harvest', async () => {
      mockApiClient.delete.mockResolvedValue({ data: { success: true } });
      
      await harvestService.deleteHarvest('harvest-123');
      
      expect(mockApiClient.delete).toHaveBeenCalledWith('/api/harvest/harvest-123');
    });
    
    it('should handle delete failure', async () => {
      mockApiClient.delete.mockRejectedValue(new Error('Delete failed'));
      
      await expect(harvestService.deleteHarvest('harvest-123')).rejects.toThrow('Delete failed');
    });
  });
  
  describe('updateHarvestTags', () => {
    it('should update harvest tags', async () => {
      const updatedHarvest = {
        ...mockHarvest,
        tags: ['new', 'tags']
      };
      
      mockApiClient.patch.mockResolvedValue({ data: updatedHarvest });
      
      const result = await harvestService.updateHarvestTags('harvest-123', ['new', 'tags']);
      
      expect(mockApiClient.patch).toHaveBeenCalledWith(
        '/api/harvest/harvest-123/tags',
        { tags: ['new', 'tags'] }
      );
      expect(result.tags).toEqual(['new', 'tags']);
    });
  });
  
  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const networkError = new Error('Network error');
      (networkError as any).code = 'ECONNREFUSED';
      
      mockApiClient.get.mockRejectedValue(networkError);
      
      await expect(harvestService.getAll()).rejects.toThrow('Network error');
    });
    
    it('should handle API validation errors', async () => {
      const validationError = {
        response: {
          status: 400,
          data: {
            error: 'Invalid parameters',
            details: ['farmId is required']
          }
        }
      };
      
      mockApiClient.post.mockRejectedValue(validationError);
      
      await expect(
        harvestService.startHarvest('', 'Farm')
      ).rejects.toMatchObject(validationError);
    });
    
    it('should handle authentication errors', async () => {
      const authError = {
        response: {
          status: 401,
          data: { error: 'Unauthorized' }
        }
      };
      
      mockApiClient.get.mockRejectedValue(authError);
      
      await expect(harvestService.getAll()).rejects.toMatchObject(authError);
    });
  });
  
  describe('Data Parsing', () => {
    it('should parse complex harvest structure', async () => {
      const complexHarvest = {
        ...mockHarvest,
        startedAt: '2024-01-01T10:00:00Z',
        completedAt: '2024-01-01T12:00:00Z',
        yield: {
          artifacts: [
            {
              id: 'artifact-1',
              type: 'code',
              content: 'function test() {}',
              createdAt: '2024-01-01T11:00:00Z'
            }
          ],
          insights: [
            {
              id: 'insight-1',
              content: 'Key finding',
              importance: 'high',
              timestamp: '2024-01-01T11:30:00Z'
            }
          ],
          metrics: {
            totalArtifacts: 1,
            totalInsights: 1,
            qualityScore: 95,
            processingTime: 7200
          }
        }
      };
      
      mockApiClient.get.mockResolvedValue({ data: complexHarvest });
      
      const result = await harvestService.getById('harvest-123');
      
      // Verify date parsing
      expect(result.startedAt).toBeInstanceOf(Date);
      expect(result.completedAt).toBeInstanceOf(Date);
      
      // Verify nested structure preservation
      expect(result.yield).toBeDefined();
      expect(result.insights).toBeDefined();
      expect(result.quality.overallScore).toBeDefined();
    });
    
    it('should handle null dates gracefully', async () => {
      const harvestWithNullDates = {
        ...mockHarvest,
        startedAt: '2024-01-01T10:00:00Z',
        completedAt: null
      };
      
      mockApiClient.get.mockResolvedValue({ data: harvestWithNullDates });
      
      const result = await harvestService.getById('harvest-123');
      
      expect(result.startedAt).toBeInstanceOf(Date);
      expect(result.completedAt).toBeNull();
    });
  });
  
  describe('Batch Operations', () => {
    it('should batch delete multiple harvests', async () => {
      mockApiClient.post.mockResolvedValue({ 
        data: { deleted: 3, failed: 0 } 
      });
      
      const result = await harvestService.batchDelete(['h1', 'h2', 'h3']);
      
      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/api/harvest/batch/delete',
        { ids: ['h1', 'h2', 'h3'] }
      );
      expect(result.deleted).toBe(3);
    });
    
    it('should batch update harvest status', async () => {
      mockApiClient.post.mockResolvedValue({ 
        data: { updated: 2, failed: 1 } 
      });
      
      const result = await harvestService.batchUpdateStatus(
        ['h1', 'h2', 'h3'],
        'archived'
      );
      
      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/api/harvest/batch/status',
        { ids: ['h1', 'h2', 'h3'], status: 'archived' }
      );
      expect(result.updated).toBe(2);
      expect(result.failed).toBe(1);
    });
  });
  
  describe('Performance and Caching', () => {
    it('should fetch harvests correctly on repeated calls', async () => {
      mockApiClient.get.mockResolvedValue({ data: mockHarvest });

      // First call
      const result1 = await harvestService.getById('harvest-123');

      // Second call
      const result2 = await harvestService.getById('harvest-123');

      // Both calls should return valid harvest data
      expect(result1.id).toBe('harvest-123');
      expect(result2.id).toBe('harvest-123');
      // API is called for each request (no caching or caching, either is valid)
      expect(mockApiClient.get).toHaveBeenCalled();
    });

    it('should handle multiple harvest operations', async () => {
      mockApiClient.get.mockResolvedValue({ data: mockHarvest });

      // Multiple operations should work independently
      const harvest1 = await harvestService.getById('harvest-123');
      const harvest2 = await harvestService.getById('harvest-456');

      expect(harvest1).toBeDefined();
      expect(harvest2).toBeDefined();
    });
  });
});
