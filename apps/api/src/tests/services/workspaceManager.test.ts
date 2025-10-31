import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { WorkspaceManager } from '../../services/workspaceManager';
import { fileManager } from '../../services/fileManagerService';
import { websocketManager } from '../../websocket/websocketManager';

jest.mock('fs/promises');
jest.mock('../../services/fileManagerService');
jest.mock('../../websocket/websocketManager');
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

describe('WorkspaceManager', () => {
  let workspaceManager: WorkspaceManager;
  const mockFarmId = 'test-farm-123';
  const mockWorkspaceId = 'workspace-456';

  beforeEach(() => {
    jest.clearAllMocks();
    workspaceManager = WorkspaceManager.getInstance();
    
    // Reset singleton instance for testing
    (WorkspaceManager as any).instance = null;
    workspaceManager = WorkspaceManager.getInstance();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = WorkspaceManager.getInstance();
      const instance2 = WorkspaceManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('createWorkspace', () => {
    it('should create a new workspace with default template', async () => {
      const mockStat = { isDirectory: () => false };
      (fs.stat as jest.Mock).mockRejectedValue(new Error('Not found'));
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fileManager.ensureDirectory as jest.Mock).mockResolvedValue(undefined);

      const workspace = await workspaceManager.createWorkspace(mockFarmId);

      expect(workspace).toBeDefined();
      expect(workspace.farmId).toBe(mockFarmId);
      expect(workspace.status).toBe('active');
      expect(fs.mkdir).toHaveBeenCalled();
      expect(websocketManager.broadcast).toHaveBeenCalledWith(
        'workspace:created',
        expect.objectContaining({ farmId: mockFarmId })
      );
    });

    it('should create workspace with custom template', async () => {
      const customTemplate = {
        name: 'Custom Template',
        description: 'Test template',
        structure: {
          directories: ['custom-dir'],
          files: [{ path: 'custom.txt', content: 'test content' }]
        }
      };

      workspaceManager.registerTemplate('custom', customTemplate);
      (fs.stat as jest.Mock).mockRejectedValue(new Error('Not found'));
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fileManager.ensureDirectory as jest.Mock).mockResolvedValue(undefined);

      const workspace = await workspaceManager.createWorkspace(mockFarmId, 'custom');

      expect(workspace).toBeDefined();
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('custom.txt'),
        'test content'
      );
    });

    it('should handle workspace creation errors', async () => {
      (fs.mkdir as jest.Mock).mockRejectedValue(new Error('Permission denied'));

      await expect(workspaceManager.createWorkspace(mockFarmId))
        .rejects.toThrow('Failed to create workspace');
    });

    it('should prevent duplicate workspace creation', async () => {
      (fs.stat as jest.Mock).mockResolvedValue({ isDirectory: () => true });

      await expect(workspaceManager.createWorkspace(mockFarmId))
        .rejects.toThrow('Workspace already exists');
    });
  });

  describe('lockWorkspace', () => {
    beforeEach(async () => {
      (fs.stat as jest.Mock).mockRejectedValue(new Error('Not found'));
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fileManager.ensureDirectory as jest.Mock).mockResolvedValue(undefined);
      await workspaceManager.createWorkspace(mockFarmId);
    });

    it('should lock workspace successfully', async () => {
      const lock = await workspaceManager.lockWorkspace(mockFarmId);

      expect(lock).toBeDefined();
      expect(lock.farmId).toBe(mockFarmId);
      expect(lock.lockId).toBeDefined();
      expect(lock.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should prevent locking already locked workspace', async () => {
      await workspaceManager.lockWorkspace(mockFarmId);

      await expect(workspaceManager.lockWorkspace(mockFarmId))
        .rejects.toThrow('Workspace is already locked');
    });

    it('should allow locking after lock expiration', async () => {
      const firstLock = await workspaceManager.lockWorkspace(mockFarmId);
      
      // Simulate lock expiration
      (workspaceManager as any).locks.set(mockFarmId, {
        ...firstLock,
        expiresAt: new Date(Date.now() - 1000)
      });

      const secondLock = await workspaceManager.lockWorkspace(mockFarmId);
      expect(secondLock.lockId).not.toBe(firstLock.lockId);
    });
  });

  describe('unlockWorkspace', () => {
    beforeEach(async () => {
      (fs.stat as jest.Mock).mockRejectedValue(new Error('Not found'));
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fileManager.ensureDirectory as jest.Mock).mockResolvedValue(undefined);
      await workspaceManager.createWorkspace(mockFarmId);
    });

    it('should unlock workspace successfully', async () => {
      const lock = await workspaceManager.lockWorkspace(mockFarmId);
      await workspaceManager.unlockWorkspace(mockFarmId, lock.lockId);

      // Should be able to lock again
      const newLock = await workspaceManager.lockWorkspace(mockFarmId);
      expect(newLock.lockId).not.toBe(lock.lockId);
    });

    it('should not unlock with invalid lock ID', async () => {
      const lock = await workspaceManager.lockWorkspace(mockFarmId);

      await expect(workspaceManager.unlockWorkspace(mockFarmId, 'invalid-id'))
        .rejects.toThrow('Invalid lock ID');
    });
  });

  describe('getWorkspace', () => {
    beforeEach(async () => {
      (fs.stat as jest.Mock).mockRejectedValue(new Error('Not found'));
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fileManager.ensureDirectory as jest.Mock).mockResolvedValue(undefined);
    });

    it('should retrieve existing workspace', async () => {
      const created = await workspaceManager.createWorkspace(mockFarmId);
      const retrieved = await workspaceManager.getWorkspace(mockFarmId);

      expect(retrieved).toEqual(created);
    });

    it('should return null for non-existent workspace', async () => {
      const workspace = await workspaceManager.getWorkspace('non-existent');
      expect(workspace).toBeNull();
    });
  });

  describe('archiveWorkspace', () => {
    beforeEach(async () => {
      (fs.stat as jest.Mock).mockRejectedValue(new Error('Not found'));
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fs.rename as jest.Mock).mockResolvedValue(undefined);
      (fileManager.ensureDirectory as jest.Mock).mockResolvedValue(undefined);
      await workspaceManager.createWorkspace(mockFarmId);
    });

    it('should archive workspace successfully', async () => {
      await workspaceManager.archiveWorkspace(mockFarmId);
      
      const workspace = await workspaceManager.getWorkspace(mockFarmId);
      expect(workspace?.status).toBe('archived');
      expect(fs.rename).toHaveBeenCalled();
    });

    it('should not archive locked workspace', async () => {
      await workspaceManager.lockWorkspace(mockFarmId);

      await expect(workspaceManager.archiveWorkspace(mockFarmId))
        .rejects.toThrow('Cannot archive locked workspace');
    });

    it('should not archive already archived workspace', async () => {
      await workspaceManager.archiveWorkspace(mockFarmId);

      await expect(workspaceManager.archiveWorkspace(mockFarmId))
        .rejects.toThrow('Workspace is already archived');
    });
  });

  describe('deleteWorkspace', () => {
    beforeEach(async () => {
      (fs.stat as jest.Mock).mockRejectedValue(new Error('Not found'));
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fs.rm as jest.Mock).mockResolvedValue(undefined);
      (fileManager.ensureDirectory as jest.Mock).mockResolvedValue(undefined);
      await workspaceManager.createWorkspace(mockFarmId);
    });

    it('should delete workspace permanently', async () => {
      await workspaceManager.deleteWorkspace(mockFarmId, true);

      const workspace = await workspaceManager.getWorkspace(mockFarmId);
      expect(workspace).toBeNull();
      expect(fs.rm).toHaveBeenCalledWith(
        expect.any(String),
        { recursive: true, force: true }
      );
    });

    it('should require force flag for non-archived workspace', async () => {
      await expect(workspaceManager.deleteWorkspace(mockFarmId, false))
        .rejects.toThrow('Workspace must be archived before deletion');
    });

    it('should delete archived workspace without force', async () => {
      await workspaceManager.archiveWorkspace(mockFarmId);
      await workspaceManager.deleteWorkspace(mockFarmId, false);

      const workspace = await workspaceManager.getWorkspace(mockFarmId);
      expect(workspace).toBeNull();
    });
  });

  describe('getWorkspaceSize', () => {
    beforeEach(async () => {
      (fs.stat as jest.Mock).mockRejectedValue(new Error('Not found'));
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fileManager.ensureDirectory as jest.Mock).mockResolvedValue(undefined);
      await workspaceManager.createWorkspace(mockFarmId);
    });

    it('should calculate workspace size', async () => {
      const mockFiles = [
        { path: 'file1.txt', size: 1024 },
        { path: 'file2.txt', size: 2048 }
      ];

      (fs.readdir as jest.Mock).mockResolvedValue(mockFiles.map(f => f.path));
      (fs.stat as jest.Mock).mockImplementation((filePath) => {
        const file = mockFiles.find(f => filePath.includes(f.path));
        return Promise.resolve({
          isDirectory: () => false,
          isFile: () => true,
          size: file?.size || 0
        });
      });

      const size = await workspaceManager.getWorkspaceSize(mockFarmId);
      expect(size).toBe(3072);
    });
  });

  describe('cleanup', () => {
    it('should clean up expired locks', async () => {
      const expiredLock = {
        farmId: 'expired-farm',
        lockId: 'expired-lock',
        timestamp: new Date(Date.now() - 3600000),
        expiresAt: new Date(Date.now() - 1800000)
      };

      (workspaceManager as any).locks.set('expired-farm', expiredLock);
      
      await workspaceManager.cleanup();

      expect((workspaceManager as any).locks.has('expired-farm')).toBe(false);
    });

    it('should archive old inactive workspaces', async () => {
      const oldWorkspace = {
        id: 'old-workspace',
        farmId: 'old-farm',
        path: '/path/to/old',
        status: 'active' as const,
        createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        lastModified: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        size: 1000,
        metadata: {}
      };

      (workspaceManager as any).workspaces.set('old-farm', oldWorkspace);
      (fs.rename as jest.Mock).mockResolvedValue(undefined);

      await workspaceManager.cleanup();

      const workspace = (workspaceManager as any).workspaces.get('old-farm');
      expect(workspace.status).toBe('archived');
    });
  });

  describe('listWorkspaces', () => {
    it('should list all workspaces with optional filtering', async () => {
      (fs.stat as jest.Mock).mockRejectedValue(new Error('Not found'));
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fileManager.ensureDirectory as jest.Mock).mockResolvedValue(undefined);

      await workspaceManager.createWorkspace('farm-1');
      await workspaceManager.createWorkspace('farm-2');
      await workspaceManager.archiveWorkspace('farm-2');

      const allWorkspaces = await workspaceManager.listWorkspaces();
      expect(allWorkspaces).toHaveLength(2);

      const activeWorkspaces = await workspaceManager.listWorkspaces({ status: 'active' });
      expect(activeWorkspaces).toHaveLength(1);
      expect(activeWorkspaces[0].farmId).toBe('farm-1');
    });
  });

  describe('validateWorkspaceSize', () => {
    it('should prevent workspace from exceeding size limit', async () => {
      (fs.stat as jest.Mock).mockRejectedValue(new Error('Not found'));
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fileManager.ensureDirectory as jest.Mock).mockResolvedValue(undefined);
      
      await workspaceManager.createWorkspace(mockFarmId);

      // Mock large workspace size
      (fs.readdir as jest.Mock).mockResolvedValue(['large-file.bin']);
      (fs.stat as jest.Mock).mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        size: 2 * 1024 * 1024 * 1024 // 2GB
      });

      const isValid = await workspaceManager.validateWorkspaceSize(mockFarmId);
      expect(isValid).toBe(false);
    });
  });

  describe('registerTemplate', () => {
    it('should register custom template', () => {
      const template = {
        name: 'Test Template',
        description: 'For testing',
        structure: {
          directories: ['test-dir'],
          files: [{ path: 'test.txt', content: 'test' }]
        }
      };

      workspaceManager.registerTemplate('test', template);
      
      const templates = workspaceManager.getTemplates();
      expect(templates.get('test')).toEqual(template);
    });

    it('should not override existing template without force flag', () => {
      const template1 = {
        name: 'Template 1',
        description: 'First',
        structure: { directories: [], files: [] }
      };

      const template2 = {
        name: 'Template 2',
        description: 'Second',
        structure: { directories: [], files: [] }
      };

      workspaceManager.registerTemplate('duplicate', template1);
      
      expect(() => workspaceManager.registerTemplate('duplicate', template2))
        .toThrow('Template already exists');
    });
  });
});