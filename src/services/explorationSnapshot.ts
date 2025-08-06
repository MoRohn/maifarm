import CryptoJS from 'crypto-js';
import { 
  ExplorationSnapshot, 
  AgentSnapshot, 
  TaskSnapshot, 
  ResourceSnapshot,
  MetricsSnapshot
} from '../types/safety';
import { GoWildSession } from '../types/goWild';
import { Agent } from '../types';
import { indexedDB } from '../utils/indexedDB';

export class ExplorationSnapshotService {
  private static instance: ExplorationSnapshotService;
  private snapshotInterval: ReturnType<typeof setInterval> | null = null;
  private maxSnapshots = 50;

  private constructor() {}

  static getInstance(): ExplorationSnapshotService {
    if (!ExplorationSnapshotService.instance) {
      ExplorationSnapshotService.instance = new ExplorationSnapshotService();
    }
    return ExplorationSnapshotService.instance;
  }

  async createSnapshot(
    session: GoWildSession,
    type: 'automatic' | 'manual' | 'checkpoint',
    reason: string
  ): Promise<ExplorationSnapshot> {
    const state = await this.captureCurrentState(session);
    const serializedState = JSON.stringify(state);
    const compressedState = this.compress(serializedState);
    const checksum = this.generateChecksum(serializedState);

    const snapshot: ExplorationSnapshot = {
      id: `snap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId: session.id,
      farmId: session.farmId,
      timestamp: new Date(),
      type,
      state,
      metadata: {
        reason,
        size: compressedState.length,
        compressed: true,
        checksum
      }
    };

    // Store in IndexedDB for persistence
    await indexedDB.saveFarm({
      ...snapshot,
      compressedData: compressedState
    });

    // Clean up old snapshots if needed
    await this.cleanupOldSnapshots(session.farmId);

    return snapshot;
  }

  async restoreSnapshot(snapshotId: string): Promise<ExplorationSnapshot> {
    const storedSnapshot = await indexedDB.getFarm(snapshotId);
    if (!storedSnapshot) {
      throw new Error(`Snapshot ${snapshotId} not found`);
    }

    // Decompress and verify integrity
    const decompressedData = this.decompress(storedSnapshot.compressedData);
    const checksum = this.generateChecksum(decompressedData);
    
    if (checksum !== storedSnapshot.metadata.checksum) {
      throw new Error('Snapshot integrity check failed');
    }

    return {
      ...storedSnapshot,
      state: JSON.parse(decompressedData)
    };
  }

  async listSnapshots(farmId: string): Promise<ExplorationSnapshot[]> {
    const snapshots = await indexedDB.snapshots
      .where('farmId')
      .equals(farmId)
      .reverse()
      .sortBy('timestamp');

    return snapshots.map((s: any) => ({
      ...s,
      state: s.state // Don't include compressed data in list
    }));
  }

  async deleteSnapshot(snapshotId: string): Promise<void> {
    await indexedDB.deleteFarm(snapshotId);
  }

  startAutoSnapshot(session: GoWildSession, intervalMinutes: number = 5): void {
    this.stopAutoSnapshot();
    
    this.snapshotInterval = setInterval(async () => {
      try {
        await this.createSnapshot(session, 'automatic', 'Scheduled auto-snapshot');
      } catch (error) {
        console.error('Auto-snapshot failed:', error);
      }
    }, intervalMinutes * 60 * 1000);
  }

  stopAutoSnapshot(): void {
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
    }
  }

  async compareSnapshots(
    snapshotId1: string, 
    snapshotId2: string
  ): Promise<{
    added: any[];
    removed: any[];
    modified: any[];
  }> {
    const snapshot1 = await this.restoreSnapshot(snapshotId1);
    const snapshot2 = await this.restoreSnapshot(snapshotId2);

    return {
      added: this.findAddedItems(snapshot1.state, snapshot2.state),
      removed: this.findRemovedItems(snapshot1.state, snapshot2.state),
      modified: this.findModifiedItems(snapshot1.state, snapshot2.state)
    };
  }

  private async captureCurrentState(session: GoWildSession): Promise<{
    agents: AgentSnapshot[];
    tasks: TaskSnapshot[];
    resources: ResourceSnapshot;
    discoveries: string[];
    metrics: MetricsSnapshot;
  }> {
    // This would integrate with the actual farm/agent management system
    // For now, creating a mock implementation
    const agents = await this.captureAgentStates(session.farmId);
    const tasks = await this.captureTaskStates(session.id);
    const resources = await this.captureResourceUsage();
    const discoveries = session.discoveries?.map(d => d.id) ?? [];
    const metrics = this.captureMetrics(session);

    return {
      agents,
      tasks,
      resources,
      discoveries,
      metrics
    };
  }

  private async captureAgentStates(farmId: string): Promise<AgentSnapshot[]> {
    // Mock implementation - would connect to actual agent service
    return [];
  }

  private async captureTaskStates(sessionId: string): Promise<TaskSnapshot[]> {
    // Mock implementation - would connect to actual task service
    return [];
  }

  private async captureResourceUsage(): Promise<ResourceSnapshot> {
    // Mock implementation - would get actual system metrics
    return {
      cpu: 0,
      memory: 0,
      disk: 0,
      network: 0
    };
  }

  private captureMetrics(session: GoWildSession): MetricsSnapshot {
    return {
      totalTasks: session.totalTasks ?? 0,
      completedTasks: session.completedTasks ?? 0,
      failedTasks: 0,
      discoveryCount: session.discoveries?.length ?? 0,
      explorationDepth: session.config?.explorationDepth ?? 1
    };
  }

  private generateChecksum(data: string): string {
    return CryptoJS.SHA256(data).toString();
  }

  private compress(data: string): string {
    // Simple compression using base64 encoding
    // In production, could use a proper compression library
    return btoa(encodeURIComponent(data));
  }

  private decompress(data: string): string {
    // Decompress from base64
    return decodeURIComponent(atob(data));
  }

  private async cleanupOldSnapshots(farmId: string): Promise<void> {
    const snapshots = await this.listSnapshots(farmId);
    
    if (snapshots.length > this.maxSnapshots) {
      // Keep manual snapshots and delete oldest automatic ones
      const automaticSnapshots = snapshots
        .filter(s => s.type === 'automatic')
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      
      const toDelete = automaticSnapshots.slice(0, snapshots.length - this.maxSnapshots);
      
      for (const snapshot of toDelete) {
        await this.deleteSnapshot(snapshot.id);
      }
    }
  }

  private findAddedItems(oldState: any, newState: any): any[] {
    // Implementation for finding added items between states
    return [];
  }

  private findRemovedItems(oldState: any, newState: any): any[] {
    // Implementation for finding removed items between states
    return [];
  }

  private findModifiedItems(oldState: any, newState: any): any[] {
    // Implementation for finding modified items between states
    return [];
  }
}

export const snapshotService = ExplorationSnapshotService.getInstance();