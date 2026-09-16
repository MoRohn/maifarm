import { offlineStorage } from '@/utils/offlineStorage';
import { encryptionService } from '../encryptionService';

export interface BackupConfig {
  schedule: 'hourly' | 'daily' | 'weekly' | 'manual';
  retentionDays: number;
  encryptBackups: boolean;
  compressionEnabled: boolean;
  destinations: BackupDestination[];
  incrementalBackup: boolean;
  maxBackupSize: number; // in MB
}

export interface BackupDestination {
  type: 'local' | 's3' | 'azure' | 'gcs' | 'webdav';
  config: Record<string, any>;
  enabled: boolean;
}

export interface BackupMetadata {
  id: string;
  timestamp: number;
  version: string;
  type: 'full' | 'incremental';
  size: number;
  checksum: string;
  encrypted: boolean;
  compressed: boolean;
  destinations: string[];
}

export interface BackupResult {
  success: boolean;
  backup: BackupMetadata | null;
  errors: string[];
  duration: number;
}

export interface RestoreResult {
  success: boolean;
  itemsRestored: number;
  errors: string[];
  warnings: string[];
}

export class BackupService {
  private config: BackupConfig;
  private backupInterval: ReturnType<typeof setInterval> | null = null;
  private isBackupInProgress = false;
  private lastBackupTime: number | null = null;

  constructor(config: BackupConfig) {
    this.config = config;
    this.scheduleBackups();
  }

  /**
   * Safely get auth token from localStorage with iOS Safari private browsing protection
   */
  private getAuthToken(): string | null {
    try {
      return localStorage.getItem('auth_token');
    } catch {
      // iOS Safari private browsing mode - return null
      console.warn('[BackupService] localStorage unavailable (iOS Safari private mode?)');
      return null;
    }
  }

  private scheduleBackups(): void {
    if (this.config.schedule === 'manual') {
      return;
    }

    const intervalMs = this.getScheduleInterval();
    
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
    }

    this.backupInterval = setInterval(() => {
      this.performBackup();
    }, intervalMs);

    console.log(`[BackupService] Scheduled ${this.config.schedule} backups`);
  }

  private getScheduleInterval(): number {
    switch (this.config.schedule) {
      case 'hourly':
        return 60 * 60 * 1000;
      case 'daily':
        return 24 * 60 * 60 * 1000;
      case 'weekly':
        return 7 * 24 * 60 * 60 * 1000;
      default:
        return 24 * 60 * 60 * 1000;
    }
  }

  async performBackup(force: boolean = false): Promise<BackupResult> {
    if (this.isBackupInProgress && !force) {
      return {
        success: false,
        backup: null,
        errors: ['Backup already in progress'],
        duration: 0,
      };
    }

    const startTime = Date.now();
    this.isBackupInProgress = true;

    const result: BackupResult = {
      success: true,
      backup: null,
      errors: [],
      duration: 0,
    };

    try {
      console.log('[BackupService] Starting backup...');

      // Export all data from IndexedDB
      const data = await offlineStorage.exportData();
      
      // Add metadata
      const backupData = {
        metadata: {
          version: '1.0.0',
          timestamp: Date.now(),
          app: 'maifarm',
          environment: window.location.hostname,
        },
        data,
        checksum: await this.calculateChecksum(JSON.stringify(data)),
      };

      // Compress if enabled
      let backupContent = JSON.stringify(backupData);
      if (this.config.compressionEnabled) {
        backupContent = await this.compress(backupContent);
      }

      // Encrypt if enabled
      if (this.config.encryptBackups) {
        backupContent = await this.encrypt(backupContent);
      }

      // Check size limit
      const size = new Blob([backupContent]).size;
      if (size > this.config.maxBackupSize * 1024 * 1024) {
        throw new Error(`Backup size (${size} bytes) exceeds limit`);
      }

      // Create backup metadata
      const metadata: BackupMetadata = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        version: '1.0.0',
        type: this.config.incrementalBackup && this.lastBackupTime ? 'incremental' : 'full',
        size,
        checksum: await this.calculateChecksum(backupContent),
        encrypted: this.config.encryptBackups,
        compressed: this.config.compressionEnabled,
        destinations: [],
      };

      // Save to destinations
      const destinations = this.config.destinations.filter(d => d.enabled);
      for (const destination of destinations) {
        try {
          await this.saveToDestination(destination, backupContent, metadata);
          metadata.destinations.push(destination.type);
        } catch (error) {
          result.errors.push(`Failed to save to ${destination.type}: ${error}`);
        }
      }

      if (metadata.destinations.length === 0) {
        throw new Error('Failed to save backup to any destination');
      }

      // Clean up old backups
      await this.cleanupOldBackups();

      result.backup = metadata;
      this.lastBackupTime = Date.now();
      
      console.log(`[BackupService] Backup completed successfully: ${metadata.id}`);
    } catch (error) {
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      console.error('[BackupService] Backup failed:', error);
    } finally {
      this.isBackupInProgress = false;
      result.duration = Date.now() - startTime;
    }

    return result;
  }

  private async saveToDestination(
    destination: BackupDestination,
    content: string,
    metadata: BackupMetadata
  ): Promise<void> {
    const filename = `maifarm-backup-${metadata.id}.${metadata.compressed ? 'gz' : 'json'}`;

    switch (destination.type) {
      case 'local':
        await this.saveToLocal(content, filename);
        break;
        
      case 's3':
        await this.saveToS3(content, filename, destination.config);
        break;
        
      case 'azure':
        await this.saveToAzure(content, filename, destination.config);
        break;
        
      case 'gcs':
        await this.saveToGCS(content, filename, destination.config);
        break;
        
      case 'webdav':
        await this.saveToWebDAV(content, filename, destination.config);
        break;
        
      default:
        throw new Error(`Unknown destination type: ${destination.type}`);
    }
  }

  private async saveToLocal(content: string, filename: string): Promise<void> {
    // Create a blob and download link
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    
    URL.revokeObjectURL(url);
  }

  private async saveToS3(content: string, filename: string, config: any): Promise<void> {
    const response = await fetch('/api/backup/s3', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getAuthToken()}`,
      },
      body: JSON.stringify({
        filename,
        content,
        bucket: config.bucket,
        region: config.region,
      }),
    });

    if (!response.ok) {
      throw new Error(`S3 upload failed: ${response.statusText}`);
    }
  }

  private async saveToAzure(content: string, filename: string, config: any): Promise<void> {
    const response = await fetch('/api/backup/azure', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getAuthToken()}`,
      },
      body: JSON.stringify({
        filename,
        content,
        container: config.container,
        accountName: config.accountName,
      }),
    });

    if (!response.ok) {
      throw new Error(`Azure upload failed: ${response.statusText}`);
    }
  }

  private async saveToGCS(content: string, filename: string, config: any): Promise<void> {
    const response = await fetch('/api/backup/gcs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getAuthToken()}`,
      },
      body: JSON.stringify({
        filename,
        content,
        bucket: config.bucket,
        projectId: config.projectId,
      }),
    });

    if (!response.ok) {
      throw new Error(`GCS upload failed: ${response.statusText}`);
    }
  }

  private async saveToWebDAV(content: string, filename: string, config: any): Promise<void> {
    const response = await fetch('/api/backup/webdav', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getAuthToken()}`,
      },
      body: JSON.stringify({
        filename,
        content,
        url: config.url,
        path: config.path,
      }),
    });

    if (!response.ok) {
      throw new Error(`WebDAV upload failed: ${response.statusText}`);
    }
  }

  async listBackups(): Promise<BackupMetadata[]> {
    try {
      const response = await fetch('/api/backup/list', {
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to list backups');
      }

      return response.json();
    } catch (error) {
      console.error('[BackupService] Failed to list backups:', error);
      return [];
    }
  }

  async restore(backupId: string): Promise<RestoreResult> {
    const result: RestoreResult = {
      success: true,
      itemsRestored: 0,
      errors: [],
      warnings: [],
    };

    try {
      console.log(`[BackupService] Starting restore from backup: ${backupId}`);

      // Fetch backup
      const backupContent = await this.fetchBackup(backupId);
      
      // Decrypt if needed
      let content = backupContent;
      if (this.isEncrypted(content)) {
        content = await this.decrypt(content);
      }

      // Decompress if needed
      if (this.isCompressed(content)) {
        content = await this.decompress(content);
      }

      // Parse backup data
      const backupData = JSON.parse(content);
      
      // Verify checksum
      const calculatedChecksum = await this.calculateChecksum(JSON.stringify(backupData.data));
      if (calculatedChecksum !== backupData.checksum) {
        throw new Error('Backup checksum verification failed');
      }

      // Clear existing data with user confirmation
      if (!await this.confirmRestore()) {
        result.warnings.push('Restore cancelled by user');
        return result;
      }

      // Import data
      await offlineStorage.importData(backupData.data);
      
      // Count restored items
      for (const [storeName, items] of Object.entries(backupData.data)) {
        result.itemsRestored += (items as any[]).length;
      }

      console.log(`[BackupService] Restore completed successfully. Items restored: ${result.itemsRestored}`);
    } catch (error) {
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      console.error('[BackupService] Restore failed:', error);
    }

    return result;
  }

  private async fetchBackup(backupId: string): Promise<string> {
    const response = await fetch(`/api/backup/${backupId}`, {
      headers: {
        'Authorization': `Bearer ${this.getAuthToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch backup: ${response.statusText}`);
    }

    return response.text();
  }

  private async cleanupOldBackups(): Promise<void> {
    const cutoffDate = Date.now() - (this.config.retentionDays * 24 * 60 * 60 * 1000);
    
    try {
      const backups = await this.listBackups();
      const oldBackups = backups.filter(b => b.timestamp < cutoffDate);
      
      for (const backup of oldBackups) {
        await this.deleteBackup(backup.id);
      }
      
      if (oldBackups.length > 0) {
        console.log(`[BackupService] Cleaned up ${oldBackups.length} old backups`);
      }
    } catch (error) {
      console.error('[BackupService] Failed to cleanup old backups:', error);
    }
  }

  private async deleteBackup(backupId: string): Promise<void> {
    await fetch(`/api/backup/${backupId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.getAuthToken()}`,
      },
    });
  }

  private async calculateChecksum(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private async compress(data: string): Promise<string> {
    // Use CompressionStream API if available
    if ('CompressionStream' in window) {
      const encoder = new TextEncoder();
      const stream = new Response(encoder.encode(data)).body!
        .pipeThrough(new (window as any).CompressionStream('gzip'));
      
      const compressed = await new Response(stream).arrayBuffer();
      return btoa(String.fromCharCode(...new Uint8Array(compressed)));
    }
    
    // Fallback: no compression
    return data;
  }

  private async decompress(data: string): Promise<string> {
    // Use DecompressionStream API if available
    if ('DecompressionStream' in window) {
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      
      const stream = new Response(bytes).body!
        .pipeThrough(new (window as any).DecompressionStream('gzip'));
      
      const decompressed = await new Response(stream).text();
      return decompressed;
    }
    
    // Fallback: assume not compressed
    return data;
  }

  private async encrypt(data: string): Promise<string> {
    return encryptionService.encrypt(data);
  }

  private async decrypt(data: string): Promise<string> {
    return encryptionService.decrypt(data);
  }

  private isEncrypted(data: string): boolean {
    // Check for encryption header/pattern
    return data.startsWith('ENC:');
  }

  private isCompressed(data: string): boolean {
    // Check for compression header/pattern
    try {
      // Base64 encoded gzip starts with H4sI
      return data.startsWith('H4sI');
    } catch {
      return false;
    }
  }

  private async confirmRestore(): Promise<boolean> {
    // In a real app, this would show a confirmation dialog
    return window.confirm(
      'Restoring from backup will replace all current data. Are you sure you want to continue?'
    );
  }

  async testBackup(): Promise<boolean> {
    try {
      // Perform a test backup
      const result = await this.performBackup(true);
      
      if (!result.success || !result.backup) {
        return false;
      }

      // Try to restore to temporary storage
      const testData = await this.fetchBackup(result.backup.id);
      const parsed = JSON.parse(testData);
      
      // Clean up test backup
      await this.deleteBackup(result.backup.id);
      
      return true;
    } catch (error) {
      console.error('[BackupService] Backup test failed:', error);
      return false;
    }
  }

  updateConfig(config: Partial<BackupConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Reschedule if schedule changed
    if (config.schedule !== undefined) {
      this.scheduleBackups();
    }
  }

  getConfig(): BackupConfig {
    return { ...this.config };
  }

  getLastBackupTime(): number | null {
    return this.lastBackupTime;
  }

  shutdown(): void {
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
      this.backupInterval = null;
    }
  }
}

// Singleton instance
let backupServiceInstance: BackupService | null = null;

export function getBackupService(config?: BackupConfig): BackupService {
  if (!backupServiceInstance && config) {
    backupServiceInstance = new BackupService(config);
  }
  
  if (!backupServiceInstance) {
    throw new Error('BackupService not initialized');
  }
  
  return backupServiceInstance;
}