import { EventEmitter } from 'events';
import { indexedDB as indexedDBManager, MaiFarmDB } from '../utils/indexedDB';
import { encryptionService } from './encryptionService';
import { IDBPDatabase } from 'idb';

export interface BackupConfig {
  autoBackupEnabled: boolean;
  autoBackupInterval: number; // in milliseconds
  maxBackups: number;
  encryptBackups: boolean;
  compressionEnabled: boolean;
  backupTypes: BackupType[];
  retentionDays: number;
}

export type BackupType = 'farms' | 'agents' | 'settings' | 'analytics' | 'all';

export interface BackupMetadata {
  id: string;
  timestamp: string;
  type: 'manual' | 'auto' | 'pre-update' | 'emergency';
  version: string;
  size: number;
  checksum: string;
  encrypted: boolean;
  compressed: boolean;
  items: {
    farms: number;
    agents: number;
    tasks: number;
    settings: number;
  };
  createdBy?: string;
  description?: string;
}

export interface RestoreOptions {
  decryptionKey?: string;
  selective?: {
    farms?: string[];
    agents?: string[];
    settings?: boolean;
  };
  overwrite: boolean;
  validateChecksum: boolean;
}

export interface BackupProgress {
  stage: 'preparing' | 'collecting' | 'processing' | 'storing' | 'complete';
  progress: number; // 0-100
  itemsProcessed: number;
  totalItems: number;
  currentItem?: string;
}

class BackupService extends EventEmitter {
  private config: BackupConfig;
  private autoBackupInterval?: NodeJS.Timeout;
  private backupInProgress: boolean = false;
  private db?: IDBPDatabase<MaiFarmDB>;
  
  constructor(config: BackupConfig) {
    super();
    this.config = config;
    this.initialize();
  }
  
  private async initialize() {
    await indexedDBManager.initialize();
    // Access the db property directly since getDB() doesn't exist
    this.db = (indexedDBManager as any).db;
    
    if (this.config.autoBackupEnabled) {
      this.startAutoBackup();
    }
    
    // Schedule cleanup of old backups
    this.scheduleBackupCleanup();
  }
  
  // Create a backup
  async createBackup(
    type: 'manual' | 'auto' | 'pre-update' | 'emergency' = 'manual',
    description?: string
  ): Promise<BackupMetadata> {
    if (this.backupInProgress) {
      throw new Error('Backup already in progress');
    }
    
    this.backupInProgress = true;
    const backupId = `backup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      this.emitProgress({
        stage: 'preparing',
        progress: 0,
        itemsProcessed: 0,
        totalItems: 0
      });
      
      // Collect data
      const backupData = await this.collectBackupData();
      
      this.emitProgress({
        stage: 'processing',
        progress: 50,
        itemsProcessed: backupData.totalItems,
        totalItems: backupData.totalItems
      });
      
      // Process backup (compress/encrypt if needed)
      const processedData = await this.processBackupData(backupData.data);
      
      // Calculate checksum
      const checksum = await this.calculateChecksum(processedData);
      
      // Create metadata
      const metadata: BackupMetadata = {
        id: backupId,
        timestamp: new Date().toISOString(),
        type,
        version: '1.0.0',
        size: new Blob([processedData]).size,
        checksum,
        encrypted: this.config.encryptBackups,
        compressed: this.config.compressionEnabled,
        items: backupData.itemCounts,
        description
      };
      
      this.emitProgress({
        stage: 'storing',
        progress: 75,
        itemsProcessed: backupData.totalItems,
        totalItems: backupData.totalItems
      });
      
      // Store backup
      await this.storeBackup(backupId, processedData, metadata);
      
      this.emitProgress({
        stage: 'complete',
        progress: 100,
        itemsProcessed: backupData.totalItems,
        totalItems: backupData.totalItems
      });
      
      this.emit('backup:created', metadata);
      
      return metadata;
    } catch (error) {
      this.emit('backup:error', { backupId, error });
      throw error;
    } finally {
      this.backupInProgress = false;
    }
  }
  
  // Collect data for backup
  private async collectBackupData(): Promise<{
    data: any;
    itemCounts: {
      farms: number;
      agents: number;
      tasks: number;
      settings: number;
    };
    totalItems: number;
  }> {
    if (!this.db) throw new Error('Database not initialized');
    
    const data: any = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      data: {}
    };
    
    const itemCounts = {
      farms: 0,
      agents: 0,
      tasks: 0,
      settings: 0
    };
    
    // Collect farms
    if (this.shouldBackup('farms')) {
      data.data.farms = await this.db.getAll('farms');
      itemCounts.farms = data.data.farms.length;
      this.emitProgress({
        stage: 'collecting',
        progress: 20,
        itemsProcessed: itemCounts.farms,
        totalItems: 0,
        currentItem: 'farms'
      });
    }
    
    // Collect agents
    if (this.shouldBackup('agents')) {
      data.data.agents = await this.db.getAll('agents');
      itemCounts.agents = data.data.agents.length;
      this.emitProgress({
        stage: 'collecting',
        progress: 40,
        itemsProcessed: itemCounts.farms + itemCounts.agents,
        totalItems: 0,
        currentItem: 'agents'
      });
    }
    
    // Collect tasks (last 1000 only for space)
    if (this.shouldBackup('all')) {
      const tasks = await this.db.getAll('tasks');
      data.data.tasks = tasks.slice(-1000); // Keep last 1000 tasks
      itemCounts.tasks = data.data.tasks.length;
    }
    
    // Collect settings from cached data
    if (this.shouldBackup('settings')) {
      const settings = await this.db.getAll('settings');
      data.data.settings = settings.filter(s => (s as any).type === 'config');
      itemCounts.settings = data.data.settings.length;
    }
    
    const totalItems = Object.values(itemCounts).reduce((sum, count) => sum + count, 0);
    
    return { data, itemCounts, totalItems };
  }
  
  // Check if type should be backed up
  private shouldBackup(type: BackupType): boolean {
    return this.config.backupTypes.includes(type) || 
           this.config.backupTypes.includes('all');
  }
  
  // Process backup data (compress/encrypt)
  private async processBackupData(data: any): Promise<string> {
    let processed = JSON.stringify(data);
    
    // Compress if enabled
    if (this.config.compressionEnabled) {
      processed = await this.compressData(processed);
    }
    
    // Encrypt if enabled
    if (this.config.encryptBackups) {
      processed = await encryptionService.encrypt(processed);
    }
    
    return processed;
  }
  
  // Compress data (simplified - in production use proper compression library)
  private async compressData(data: string): Promise<string> {
    // In a real implementation, use pako or similar compression library
    // This is a placeholder
    return btoa(data); // Base64 encode as placeholder
  }
  
  // Decompress data
  private async decompressData(data: string): Promise<string> {
    // In a real implementation, use pako or similar compression library
    // This is a placeholder
    return atob(data); // Base64 decode as placeholder
  }
  
  // Calculate checksum
  private async calculateChecksum(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  // Store backup
  private async storeBackup(
    backupId: string, 
    data: string, 
    metadata: BackupMetadata
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    await this.db.put('settings', {
      key: backupId,
      value: {
        id: backupId,
        timestamp: metadata.timestamp,
        type: metadata.type,
        data: {
          farms: metadata.items.farms,
          agents: metadata.items.agents,
          settings: metadata.items.settings
        },
        size: metadata.size,
        checksum: metadata.checksum
      },
      updated: Date.now()
    });
    
    // Store actual backup data in a separate location (could be file system, cloud, etc.)
    // For now, store in localStorage with size limit check
    const backupKey = `maifarm_backup_${backupId}`;
    try {
      localStorage.setItem(backupKey, data);
    } catch (e) {
      // Handle quota exceeded
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        await this.cleanupOldBackups(1); // Remove oldest backup
        localStorage.setItem(backupKey, data); // Try again
      }
    }
    
    // Enforce max backups limit
    await this.enforceBackupLimit();
  }
  
  // Restore from backup
  async restoreBackup(
    backupId: string, 
    options: RestoreOptions
  ): Promise<void> {
    this.emit('restore:start', { backupId });
    
    try {
      // Get backup metadata
      const metadata = await this.getBackupMetadata(backupId);
      if (!metadata) {
        throw new Error('Backup not found');
      }
      
      // Load backup data
      const backupKey = `maifarm_backup_${backupId}`;
      const rawData = localStorage.getItem(backupKey);
      if (!rawData) {
        throw new Error('Backup data not found');
      }
      
      // Validate checksum if required
      if (options.validateChecksum) {
        const checksum = await this.calculateChecksum(rawData);
        if (checksum !== metadata.checksum) {
          throw new Error('Backup checksum validation failed');
        }
      }
      
      // Process backup data (decrypt/decompress)
      let processedData = rawData;
      
      if (metadata.encrypted) {
        if (!options.decryptionKey) {
          throw new Error('Decryption key required for encrypted backup');
        }
        processedData = await encryptionService.decrypt(processedData);
      }
      
      if (metadata.compressed) {
        processedData = await this.decompressData(processedData);
      }
      
      const backupData = JSON.parse(processedData);
      
      // Restore data
      await this.restoreData(backupData.data, options);
      
      this.emit('restore:complete', { backupId });
    } catch (error) {
      this.emit('restore:error', { backupId, error });
      throw error;
    }
  }
  
  // Restore data to database
  private async restoreData(
    data: any, 
    options: RestoreOptions
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const tx = this.db.transaction(
      ['farms', 'agents', 'tasks', 'settings'], 
      'readwrite'
    );
    
    // Clear existing data if overwrite is enabled
    if (options.overwrite) {
      await Promise.all([
        tx.objectStore('farms').clear(),
        tx.objectStore('agents').clear(),
        tx.objectStore('tasks').clear()
      ]);
    }
    
    // Restore farms
    if (data.farms && (!options.selective || options.selective.farms)) {
      const farmsToRestore = options.selective?.farms 
        ? data.farms.filter((f: any) => options.selective!.farms!.includes(f.id))
        : data.farms;
      
      for (const farm of farmsToRestore) {
        await tx.objectStore('farms').put(farm);
      }
    }
    
    // Restore agents
    if (data.agents && (!options.selective || options.selective.agents)) {
      const agentsToRestore = options.selective?.agents
        ? data.agents.filter((a: any) => options.selective!.agents!.includes(a.id))
        : data.agents;
      
      for (const agent of agentsToRestore) {
        await tx.objectStore('agents').put(agent);
      }
    }
    
    // Restore tasks
    if (data.tasks) {
      for (const task of data.tasks) {
        await tx.objectStore('tasks').put(task);
      }
    }
    
    // Restore settings
    if (data.settings && (!options.selective || options.selective.settings)) {
      for (const setting of data.settings) {
        await tx.objectStore('settings').put(setting);
      }
    }
    
    await tx.done;
  }
  
  // Get backup metadata
  async getBackupMetadata(backupId: string): Promise<BackupMetadata | null> {
    if (!this.db) throw new Error('Database not initialized');
    
    const backup = await this.db.get('settings', backupId);
    if (!backup) return null;
    
    // Check if backup data still exists
    const backupKey = `maifarm_backup_${backupId}`;
    const hasData = localStorage.getItem(backupKey) !== null;
    
    if (!hasData) {
      // Backup data missing, remove metadata
      await this.db.delete('settings', backupId);
      return null;
    }
    
    const backupData = backup.value;
    return {
      id: backupData.id,
      timestamp: backupData.timestamp,
      type: backupData.type,
      version: '1.0.0',
      size: backupData.size,
      checksum: backupData.checksum,
      encrypted: false, // This should be stored in the backup
      compressed: false, // This should be stored in the backup
      items: {
        farms: backupData.data.farms,
        agents: backupData.data.agents,
        tasks: 0,
        settings: backupData.data.settings
      }
    };
  }
  
  // List all backups
  async listBackups(): Promise<BackupMetadata[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    const backups = await this.db.getAll('settings');
    const metadataList: BackupMetadata[] = [];
    
    for (const backup of backups) {
      const metadata = await this.getBackupMetadata(backup.key);
      if (metadata) {
        metadataList.push(metadata);
      }
    }
    
    // Sort by timestamp (newest first)
    return metadataList.sort((a, b) => 
      b.timestamp.localeCompare(a.timestamp)
    );
  }
  
  // Delete backup
  async deleteBackup(backupId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    // Remove from database
    await this.db.delete('settings', backupId);
    
    // Remove from storage
    const backupKey = `maifarm_backup_${backupId}`;
    localStorage.removeItem(backupKey);
    
    this.emit('backup:deleted', { backupId });
  }
  
  // Start auto backup
  private startAutoBackup(): void {
    if (this.autoBackupInterval) {
      clearInterval(this.autoBackupInterval);
    }
    
    this.autoBackupInterval = setInterval(async () => {
      try {
        await this.createBackup('auto', 'Automatic backup');
      } catch (error) {
        console.error('Auto backup failed:', error);
        this.emit('backup:error', { type: 'auto', error });
      }
    }, this.config.autoBackupInterval);
  }
  
  // Stop auto backup
  stopAutoBackup(): void {
    if (this.autoBackupInterval) {
      clearInterval(this.autoBackupInterval);
      this.autoBackupInterval = undefined;
    }
  }
  
  // Enforce backup limit
  private async enforceBackupLimit(): Promise<void> {
    const backups = await this.listBackups();
    
    if (backups.length > this.config.maxBackups) {
      // Sort by timestamp (oldest first)
      const sortedBackups = backups.sort((a, b) => 
        a.timestamp.localeCompare(b.timestamp)
      );
      
      // Remove oldest backups
      const toRemove = sortedBackups.slice(0, backups.length - this.config.maxBackups);
      for (const backup of toRemove) {
        await this.deleteBackup(backup.id);
      }
    }
  }
  
  // Clean up old backups
  private async cleanupOldBackups(keepCount?: number): Promise<void> {
    const backups = await this.listBackups();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);
    
    for (const backup of backups) {
      if (new Date(backup.timestamp) < cutoffDate) {
        await this.deleteBackup(backup.id);
      }
    }
    
    // If keepCount specified, ensure we don't have more than that
    if (keepCount !== undefined) {
      const remainingBackups = await this.listBackups();
      if (remainingBackups.length > keepCount) {
        const toRemove = remainingBackups.slice(keepCount);
        for (const backup of toRemove) {
          await this.deleteBackup(backup.id);
        }
      }
    }
  }
  
  // Schedule backup cleanup
  private scheduleBackupCleanup(): void {
    // Run cleanup daily
    setInterval(() => {
      this.cleanupOldBackups();
    }, 24 * 60 * 60 * 1000);
    
    // Run initial cleanup
    this.cleanupOldBackups();
  }
  
  // Emit progress
  private emitProgress(progress: BackupProgress): void {
    this.emit('backup:progress', progress);
  }
  
  // Update configuration
  updateConfig(config: Partial<BackupConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Restart auto backup if interval changed
    if (config.autoBackupEnabled !== undefined || config.autoBackupInterval !== undefined) {
      this.stopAutoBackup();
      if (this.config.autoBackupEnabled) {
        this.startAutoBackup();
      }
    }
  }
  
  // Export backup to file
  async exportBackup(backupId: string): Promise<Blob> {
    const backupKey = `maifarm_backup_${backupId}`;
    const data = localStorage.getItem(backupKey);
    
    if (!data) {
      throw new Error('Backup not found');
    }
    
    const metadata = await this.getBackupMetadata(backupId);
    if (!metadata) {
      throw new Error('Backup metadata not found');
    }
    
    const exportData = {
      metadata,
      data
    };
    
    return new Blob([JSON.stringify(exportData)], { 
      type: 'application/json' 
    });
  }
  
  // Import backup from file
  async importBackup(file: File): Promise<BackupMetadata> {
    const text = await file.text();
    const importData = JSON.parse(text);
    
    if (!importData.metadata || !importData.data) {
      throw new Error('Invalid backup file format');
    }
    
    const backupId = importData.metadata.id;
    
    // Store backup
    await this.storeBackup(backupId, importData.data, importData.metadata);
    
    this.emit('backup:imported', importData.metadata);
    
    return importData.metadata;
  }
  
  // Cleanup
  destroy(): void {
    this.stopAutoBackup();
    this.removeAllListeners();
  }
}

export const backupService = new BackupService({
  autoBackupEnabled: true,
  autoBackupInterval: 6 * 60 * 60 * 1000, // 6 hours
  maxBackups: 10,
  encryptBackups: true,
  compressionEnabled: true,
  backupTypes: ['all'],
  retentionDays: 30
});