import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { GoWildManager } from '../../services/unified/farmService';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';

// Mock dependencies
jest.mock('fs/promises');
jest.mock('../../services/harvestService');
jest.mock('../../services/coordinationService');

describe('GoWildManager', () => {
  let manager: GoWildManager;
  let mockEventEmitter: EventEmitter;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEventEmitter = new EventEmitter();
    manager = new GoWildManager();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Safety Boundaries', () => {
    it('should enforce creativity level boundaries', async () => {
      const config = {
        creativityLevel: 150, // Over max
        boundaries: {
          maxFileChanges: 100,
          allowedDomains: ['api.example.com'],
          restrictedPaths: ['/etc', '/usr'],
          maxExecutionTime: 3600000
        }
      };

      const result = await manager.initializeGoWild('test-farm', config);
      expect(result.creativityLevel).toBeLessThanOrEqual(100);
      expect(result.creativityLevel).toBeGreaterThanOrEqual(0);
    });

    it('should prevent access to restricted paths', async () => {
      const config = {
        creativityLevel: 75,
        boundaries: {
          maxFileChanges: 100,
          allowedDomains: ['api.example.com'],
          restrictedPaths: ['/etc', '/usr', '/private'],
          maxExecutionTime: 3600000
        }
      };

      await manager.initializeGoWild('test-farm', config);
      
      const isAllowed = await manager.checkPathAccess('/etc/passwd');
      expect(isAllowed).toBe(false);
    });

    it('should track and limit file changes', async () => {
      const config = {
        creativityLevel: 50,
        boundaries: {
          maxFileChanges: 3,
          allowedDomains: [],
          restrictedPaths: [],
          maxExecutionTime: 3600000
        }
      };

      await manager.initializeGoWild('test-farm', config);
      
      // Simulate file changes
      await manager.trackFileChange('test-farm', '/path/file1.txt');
      await manager.trackFileChange('test-farm', '/path/file2.txt');
      await manager.trackFileChange('test-farm', '/path/file3.txt');
      
      // Fourth change should be blocked
      await expect(
        manager.trackFileChange('test-farm', '/path/file4.txt')
      ).rejects.toThrow('Maximum file changes exceeded');
    });

    it('should enforce execution time limits', async () => {
      jest.useFakeTimers();
      
      const config = {
        creativityLevel: 75,
        boundaries: {
          maxFileChanges: 100,
          allowedDomains: [],
          restrictedPaths: [],
          maxExecutionTime: 5000 // 5 seconds
        }
      };

      await manager.initializeGoWild('test-farm', config);
      
      // Advance time beyond limit
      jest.advanceTimersByTime(6000);
      
      const isActive = await manager.isGoWildActive('test-farm');
      expect(isActive).toBe(false);
      
      jest.useRealTimers();
    });
  });

  describe('Rollback Mechanism', () => {
    it('should create snapshots before making changes', async () => {
      const mockFs = fs as jest.Mocked<typeof fs>;
      mockFs.readFile.mockResolvedValue('original content');
      mockFs.writeFile.mockResolvedValue(undefined);

      await manager.createSnapshot('test-farm', '/path/file.txt');
      
      expect(mockFs.readFile).toHaveBeenCalledWith('/path/file.txt', 'utf-8');
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('snapshot'),
        'original content'
      );
    });

    it('should rollback all changes when requested', async () => {
      const mockFs = fs as jest.Mocked<typeof fs>;
      mockFs.readFile.mockResolvedValue('snapshot content');
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(['file1.txt', 'file2.txt'] as any);

      const config = {
        creativityLevel: 50,
        boundaries: {
          maxFileChanges: 100,
          allowedDomains: [],
          restrictedPaths: [],
          maxExecutionTime: 3600000
        }
      };

      await manager.initializeGoWild('test-farm', config);
      await manager.createSnapshot('test-farm', '/path/file1.txt');
      await manager.createSnapshot('test-farm', '/path/file2.txt');
      
      const rollbackResult = await manager.rollback('test-farm');
      
      expect(rollbackResult.success).toBe(true);
      expect(rollbackResult.filesRestored).toBe(2);
      expect(mockFs.writeFile).toHaveBeenCalledTimes(4); // 2 snapshots + 2 restores
    });

    it('should handle rollback failures gracefully', async () => {
      const mockFs = fs as jest.Mocked<typeof fs>;
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      const result = await manager.rollback('test-farm');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('File not found');
    });
  });

  describe('External API Restrictions', () => {
    it('should block requests to non-allowed domains', async () => {
      const config = {
        creativityLevel: 75,
        boundaries: {
          maxFileChanges: 100,
          allowedDomains: ['api.github.com', 'api.openai.com'],
          restrictedPaths: [],
          maxExecutionTime: 3600000
        }
      };

      await manager.initializeGoWild('test-farm', config);
      
      const isAllowed = await manager.checkDomainAccess('test-farm', 'api.malicious.com');
      expect(isAllowed).toBe(false);
    });

    it('should allow requests to whitelisted domains', async () => {
      const config = {
        creativityLevel: 75,
        boundaries: {
          maxFileChanges: 100,
          allowedDomains: ['api.github.com', 'api.openai.com'],
          restrictedPaths: [],
          maxExecutionTime: 3600000
        }
      };

      await manager.initializeGoWild('test-farm', config);
      
      const isAllowed = await manager.checkDomainAccess('test-farm', 'api.github.com');
      expect(isAllowed).toBe(true);
    });

    it('should track API request counts', async () => {
      const config = {
        creativityLevel: 50,
        boundaries: {
          maxFileChanges: 100,
          allowedDomains: ['api.example.com'],
          restrictedPaths: [],
          maxExecutionTime: 3600000,
          maxApiRequests: 10
        }
      };

      await manager.initializeGoWild('test-farm', config);
      
      // Make 10 requests
      for (let i = 0; i < 10; i++) {
        await manager.trackApiRequest('test-farm', 'api.example.com');
      }
      
      // 11th request should be blocked
      await expect(
        manager.trackApiRequest('test-farm', 'api.example.com')
      ).rejects.toThrow('API request limit exceeded');
    });
  });

  describe('Exploration Tracking', () => {
    it('should track exploration paths', async () => {
      const config = {
        creativityLevel: 80,
        boundaries: {
          maxFileChanges: 100,
          allowedDomains: [],
          restrictedPaths: [],
          maxExecutionTime: 3600000
        }
      };

      await manager.initializeGoWild('test-farm', config);
      
      await manager.trackExploration('test-farm', {
        action: 'file_analysis',
        path: '/src/components',
        timestamp: Date.now(),
        insights: ['Found unused imports', 'Detected code duplication']
      });
      
      const explorationData = await manager.getExplorationData('test-farm');
      expect(explorationData.paths).toHaveLength(1);
      expect(explorationData.paths[0].action).toBe('file_analysis');
    });

    it('should generate exploration summaries', async () => {
      const config = {
        creativityLevel: 90,
        boundaries: {
          maxFileChanges: 100,
          allowedDomains: [],
          restrictedPaths: [],
          maxExecutionTime: 3600000
        }
      };

      await manager.initializeGoWild('test-farm', config);
      
      // Track multiple explorations
      await manager.trackExploration('test-farm', {
        action: 'test_creation',
        path: '/src/components/Button',
        timestamp: Date.now(),
        insights: ['Created unit tests']
      });
      
      await manager.trackExploration('test-farm', {
        action: 'refactoring',
        path: '/src/utils',
        timestamp: Date.now(),
        insights: ['Improved type safety']
      });
      
      const summary = await manager.generateExplorationSummary('test-farm');
      expect(summary.totalActions).toBe(2);
      expect(summary.categories).toContain('test_creation');
      expect(summary.categories).toContain('refactoring');
    });
  });

  describe('Emergency Stop', () => {
    it('should immediately halt all GoWild operations', async () => {
      const config = {
        creativityLevel: 100,
        boundaries: {
          maxFileChanges: 100,
          allowedDomains: [],
          restrictedPaths: [],
          maxExecutionTime: 3600000
        }
      };

      await manager.initializeGoWild('test-farm', config);
      expect(await manager.isGoWildActive('test-farm')).toBe(true);
      
      await manager.emergencyStop('test-farm');
      expect(await manager.isGoWildActive('test-farm')).toBe(false);
    });

    it('should trigger rollback on emergency stop if configured', async () => {
      const config = {
        creativityLevel: 100,
        boundaries: {
          maxFileChanges: 100,
          allowedDomains: [],
          restrictedPaths: [],
          maxExecutionTime: 3600000
        },
        rollbackOnStop: true
      };

      const mockFs = fs as jest.Mocked<typeof fs>;
      mockFs.readdir.mockResolvedValue([] as any);

      await manager.initializeGoWild('test-farm', config);
      await manager.emergencyStop('test-farm');
      
      // Verify rollback was triggered
      expect(mockFs.readdir).toHaveBeenCalled();
    });
  });

  describe('Resource Monitoring', () => {
    it('should track memory usage', async () => {
      const config = {
        creativityLevel: 75,
        boundaries: {
          maxFileChanges: 100,
          allowedDomains: [],
          restrictedPaths: [],
          maxExecutionTime: 3600000,
          maxMemoryMB: 512
        }
      };

      await manager.initializeGoWild('test-farm', config);
      
      const metrics = await manager.getResourceMetrics('test-farm');
      expect(metrics).toHaveProperty('memoryUsage');
      expect(metrics).toHaveProperty('cpuUsage');
      expect(metrics).toHaveProperty('diskOperations');
    });

    it('should enforce memory limits', async () => {
      const config = {
        creativityLevel: 75,
        boundaries: {
          maxFileChanges: 100,
          allowedDomains: [],
          restrictedPaths: [],
          maxExecutionTime: 3600000,
          maxMemoryMB: 1 // Very low limit
        }
      };

      await manager.initializeGoWild('test-farm', config);
      
      // Simulate high memory usage
      jest.spyOn(process, 'memoryUsage').mockReturnValue({
        rss: 1024 * 1024 * 1024, // 1GB
        heapTotal: 0,
        heapUsed: 0,
        external: 0,
        arrayBuffers: 0
      });
      
      const canContinue = await manager.checkResourceLimits('test-farm');
      expect(canContinue).toBe(false);
    });
  });

  describe('Creativity Level Behaviors', () => {
    it('should allow more aggressive changes at higher creativity levels', async () => {
      const lowCreativity = {
        creativityLevel: 25,
        boundaries: {
          maxFileChanges: 100,
          allowedDomains: [],
          restrictedPaths: [],
          maxExecutionTime: 3600000
        }
      };

      const highCreativity = {
        creativityLevel: 95,
        boundaries: {
          maxFileChanges: 100,
          allowedDomains: [],
          restrictedPaths: [],
          maxExecutionTime: 3600000
        }
      };

      const lowConfig = await manager.initializeGoWild('low-farm', lowCreativity);
      const highConfig = await manager.initializeGoWild('high-farm', highCreativity);
      
      expect(lowConfig.allowedOperations).not.toContain('major_refactoring');
      expect(highConfig.allowedOperations).toContain('major_refactoring');
      expect(highConfig.allowedOperations).toContain('architecture_changes');
    });

    it('should adjust exploration strategies based on creativity', async () => {
      const config = {
        creativityLevel: 85,
        boundaries: {
          maxFileChanges: 100,
          allowedDomains: [],
          restrictedPaths: [],
          maxExecutionTime: 3600000
        }
      };

      await manager.initializeGoWild('test-farm', config);
      
      const strategy = await manager.getExplorationStrategy('test-farm');
      expect(strategy.depth).toBeGreaterThan(3);
      expect(strategy.breadth).toBeGreaterThan(5);
      expect(strategy.riskTolerance).toBeGreaterThan(0.7);
    });
  });
});