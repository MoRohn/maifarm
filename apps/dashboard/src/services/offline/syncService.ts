import { offlineStorage, STORES } from '@/utils/offlineStorage';
import { Farm, Agent } from '@/types';

export interface SyncConflict {
  id: string;
  entity: string;
  localData: any;
  remoteData: any;
  localTimestamp: number;
  remoteTimestamp: number;
}

export interface SyncResult {
  success: boolean;
  synced: number;
  conflicts: SyncConflict[];
  errors: string[];
}

export type ConflictResolutionStrategy = 'local-first' | 'remote-first' | 'newest-first' | 'manual';

export class SyncService {
  private conflictStrategy: ConflictResolutionStrategy = 'newest-first';
  private syncInProgress = false;
  private abortController: AbortController | null = null;

  setConflictStrategy(strategy: ConflictResolutionStrategy) {
    this.conflictStrategy = strategy;
  }

  async syncEntity(
    entityType: 'farms' | 'agents' | 'analytics',
    options: {
      force?: boolean;
      conflictStrategy?: ConflictResolutionStrategy;
    } = {}
  ): Promise<SyncResult> {
    if (this.syncInProgress && !options.force) {
      throw new Error('Sync already in progress');
    }

    this.syncInProgress = true;
    this.abortController = new AbortController();

    const result: SyncResult = {
      success: true,
      synced: 0,
      conflicts: [],
      errors: [],
    };

    try {
      switch (entityType) {
        case 'farms':
          await this.syncFarms(result, options);
          break;
        case 'agents':
          await this.syncAgents(result, options);
          break;
        case 'analytics':
          await this.syncAnalytics(result, options);
          break;
      }
    } catch (error) {
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      this.syncInProgress = false;
      this.abortController = null;
    }

    return result;
  }

  async syncAll(options: {
    conflictStrategy?: ConflictResolutionStrategy;
  } = {}): Promise<Record<string, SyncResult>> {
    const results: Record<string, SyncResult> = {};

    // Sync in order of importance
    results.farms = await this.syncEntity('farms', options);
    results.agents = await this.syncEntity('agents', options);
    results.analytics = await this.syncEntity('analytics', options);

    return results;
  }

  private async syncFarms(result: SyncResult, options: any) {
    const strategy = options.conflictStrategy || this.conflictStrategy;

    // Get local farms
    const localFarms = await offlineStorage.getAll<Farm>(STORES.FARMS);
    
    // Get remote farms
    const remoteFarms = await this.fetchWithAbort<Farm[]>('/api/farms');

    // Create maps for efficient lookup
    const localMap = new Map(localFarms.map(f => [f.id, f]));
    const remoteMap = new Map(remoteFarms.map(f => [f.id, f]));

    // Process remote farms
    for (const remoteFarm of remoteFarms) {
      const localFarm = localMap.get(remoteFarm.id);

      if (!localFarm) {
        // New farm from remote
        await offlineStorage.put(STORES.FARMS, remoteFarm);
        result.synced++;
      } else if (this.hasConflict(localFarm, remoteFarm)) {
        // Conflict detected
        const conflict: SyncConflict = {
          id: remoteFarm.id,
          entity: 'farm',
          localData: localFarm,
          remoteData: remoteFarm,
          localTimestamp: localFarm.updatedAt || 0,
          remoteTimestamp: remoteFarm.updatedAt || 0,
        };

        const resolved = await this.resolveConflict(conflict, strategy);
        await offlineStorage.put(STORES.FARMS, resolved);
        result.conflicts.push(conflict);
        result.synced++;
      }
    }

    // Process local farms not in remote
    for (const localFarm of localFarms) {
      if (!remoteMap.has(localFarm.id)) {
        // Farm exists locally but not remotely - push to server
        try {
          await this.pushToServer('farms', localFarm);
          result.synced++;
        } catch (error) {
          result.errors.push(`Failed to push farm ${localFarm.id}: ${error}`);
        }
      }
    }
  }

  private async syncAgents(result: SyncResult, options: any) {
    const strategy = options.conflictStrategy || this.conflictStrategy;

    // Get local agents
    const localAgents = await offlineStorage.getAll<Agent>(STORES.AGENTS);
    
    // Get remote agents
    const remoteAgents = await this.fetchWithAbort<Agent[]>('/api/agents');

    // Create maps for efficient lookup
    const localMap = new Map(localAgents.map(a => [a.id, a]));
    const remoteMap = new Map(remoteAgents.map(a => [a.id, a]));

    // Process remote agents
    for (const remoteAgent of remoteAgents) {
      const localAgent = localMap.get(remoteAgent.id);

      if (!localAgent) {
        // New agent from remote
        await offlineStorage.put(STORES.AGENTS, remoteAgent);
        result.synced++;
      } else if (this.hasConflict(localAgent, remoteAgent)) {
        // Conflict detected
        const conflict: SyncConflict = {
          id: remoteAgent.id,
          entity: 'agent',
          localData: localAgent,
          remoteData: remoteAgent,
          localTimestamp: localAgent.updatedAt || 0,
          remoteTimestamp: remoteAgent.updatedAt || 0,
        };

        const resolved = await this.resolveConflict(conflict, strategy);
        await offlineStorage.put(STORES.AGENTS, resolved);
        result.conflicts.push(conflict);
        result.synced++;
      }
    }

    // Process local agents not in remote
    for (const localAgent of localAgents) {
      if (!remoteMap.has(localAgent.id)) {
        // Agent exists locally but not remotely - push to server
        try {
          await this.pushToServer('agents', localAgent);
          result.synced++;
        } catch (error) {
          result.errors.push(`Failed to push agent ${localAgent.id}: ${error}`);
        }
      }
    }
  }

  private async syncAnalytics(result: SyncResult, options: any) {
    // Analytics sync is typically one-way (local to remote)
    const localAnalytics = await offlineStorage.getAll(STORES.ANALYTICS);

    for (const analytics of localAnalytics) {
      try {
        await this.pushToServer('analytics', analytics);
        // Remove from local after successful push
        await offlineStorage.delete(STORES.ANALYTICS, (analytics as any).id);
        result.synced++;
      } catch (error) {
        result.errors.push(`Failed to sync analytics ${(analytics as any).id}: ${error}`);
      }
    }
  }

  private hasConflict(local: any, remote: any): boolean {
    // Simple timestamp-based conflict detection
    if (!local.updatedAt || !remote.updatedAt) {
      return false;
    }

    // If both have been updated, check if they differ
    return local.updatedAt !== remote.updatedAt && 
           JSON.stringify(local) !== JSON.stringify(remote);
  }

  private async resolveConflict(
    conflict: SyncConflict,
    strategy: ConflictResolutionStrategy
  ): Promise<any> {
    switch (strategy) {
      case 'local-first':
        return conflict.localData;
      
      case 'remote-first':
        return conflict.remoteData;
      
      case 'newest-first':
        return conflict.localTimestamp > conflict.remoteTimestamp
          ? conflict.localData
          : conflict.remoteData;
      
      case 'manual':
        // In a real app, this would prompt the user
        // For now, default to newest
        return conflict.localTimestamp > conflict.remoteTimestamp
          ? conflict.localData
          : conflict.remoteData;
      
      default:
        return conflict.remoteData;
    }
  }

  private async fetchWithAbort<T>(url: string): Promise<T> {
    // Safe localStorage access for iOS Safari private browsing
    let authToken: string | null = null;
    try {
      authToken = localStorage.getItem('auth_token');
    } catch (storageError) {
      console.warn('[SyncService] localStorage unavailable for auth token:', storageError);
    }

    const response = await fetch(url, {
      signal: this.abortController?.signal,
      headers: authToken ? {
        'Authorization': `Bearer ${authToken}`,
      } : {},
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }

    return response.json();
  }

  private async pushToServer(entity: string, data: any): Promise<void> {
    const url = `/api/${entity}${data.id ? `/${data.id}` : ''}`;
    const method = data.id ? 'PUT' : 'POST';

    // Safe localStorage access for iOS Safari private browsing
    let authToken: string | null = null;
    try {
      authToken = localStorage.getItem('auth_token');
    } catch (storageError) {
      console.warn('[SyncService] localStorage unavailable for auth token:', storageError);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(data),
      signal: this.abortController?.signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to push to server: ${response.statusText}`);
    }
  }

  abortSync() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
      this.syncInProgress = false;
    }
  }

  // Utility methods for specific sync scenarios

  async forcePushLocal(): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      synced: 0,
      conflicts: [],
      errors: [],
    };

    try {
      // Push all local data to server, overwriting remote
      const farms = await offlineStorage.getAll<Farm>(STORES.FARMS);
      for (const farm of farms) {
        await this.pushToServer('farms', farm);
        result.synced++;
      }

      const agents = await offlineStorage.getAll<Agent>(STORES.AGENTS);
      for (const agent of agents) {
        await this.pushToServer('agents', agent);
        result.synced++;
      }
    } catch (error) {
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    return result;
  }

  async forcePullRemote(): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      synced: 0,
      conflicts: [],
      errors: [],
    };

    try {
      // Clear local data and pull everything from remote
      await offlineStorage.clear(STORES.FARMS);
      await offlineStorage.clear(STORES.AGENTS);

      const farms = await this.fetchWithAbort<Farm[]>('/api/farms');
      await offlineStorage.batchPut(STORES.FARMS, farms);
      result.synced += farms.length;

      const agents = await this.fetchWithAbort<Agent[]>('/api/agents');
      await offlineStorage.batchPut(STORES.AGENTS, agents);
      result.synced += agents.length;
    } catch (error) {
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    return result;
  }

  // Delta sync for efficient updates
  async deltaSync(lastSyncTime: number): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      synced: 0,
      conflicts: [],
      errors: [],
    };

    try {
      // Fetch only changes since last sync
      const changes = await this.fetchWithAbort<{
        farms: Farm[];
        agents: Agent[];
        deleted: { entity: string; ids: string[] }[];
      }>(`/api/sync/delta?since=${lastSyncTime}`);

      // Apply changes
      if (changes.farms.length > 0) {
        await offlineStorage.batchPut(STORES.FARMS, changes.farms);
        result.synced += changes.farms.length;
      }

      if (changes.agents.length > 0) {
        await offlineStorage.batchPut(STORES.AGENTS, changes.agents);
        result.synced += changes.agents.length;
      }

      // Handle deletions
      for (const deletion of changes.deleted) {
        const store = deletion.entity === 'farm' ? STORES.FARMS : STORES.AGENTS;
        for (const id of deletion.ids) {
          await offlineStorage.delete(store, id);
        }
      }
    } catch (error) {
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    return result;
  }
}

// Singleton instance
export const syncService = new SyncService();