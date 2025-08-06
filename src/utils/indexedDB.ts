import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface MaiFarmDB extends DBSchema {
  farms: {
    key: string;
    value: {
      id: string;
      name: string;
      description: string;
      agents: string[];
      status: 'active' | 'inactive' | 'pending';
      created: number;
      updated: number;
      config: any;
    };
    indexes: { 'by-status': string; 'by-created': number };
  };
  agents: {
    key: string;
    value: {
      id: string;
      name: string;
      type: string;
      farmId: string;
      status: 'idle' | 'working' | 'error' | 'terminated';
      metrics: {
        tasksCompleted: number;
        cpuUsage: number;
        memoryUsage: number;
        uptime: number;
      };
      lastActivity: number;
    };
    indexes: { 'by-farm': string; 'by-status': string };
  };
  tasks: {
    key: string;
    value: {
      id: string;
      farmId: string;
      agentId: string;
      type: string;
      priority: number;
      status: 'pending' | 'running' | 'completed' | 'failed';
      data: any;
      result?: any;
      error?: string;
      created: number;
      started?: number;
      completed?: number;
    };
    indexes: { 'by-farm': string; 'by-agent': string; 'by-status': string };
  };
  metrics: {
    key: string;
    value: {
      id: string;
      timestamp: number;
      farmId?: string;
      agentId?: string;
      type: string;
      value: number;
      metadata?: any;
    };
    indexes: { 'by-timestamp': number; 'by-farm': string; 'by-agent': string };
  };
  settings: {
    key: string;
    value: {
      key: string;
      value: any;
      updated: number;
    };
  };
}

class IndexedDBService {
  private db: IDBPDatabase<MaiFarmDB> | null = null;
  private readonly DB_NAME = 'maifarm-data';
  private readonly DB_VERSION = 1;

  async initialize(): Promise<void> {
    if (this.db) return;

    try {
      this.db = await openDB<MaiFarmDB>(this.DB_NAME, this.DB_VERSION, {
        upgrade(db) {
          // Farms store
          if (!db.objectStoreNames.contains('farms')) {
            const farmStore = db.createObjectStore('farms', { keyPath: 'id' });
            farmStore.createIndex('by-status', 'status');
            farmStore.createIndex('by-created', 'created');
          }

          // Agents store
          if (!db.objectStoreNames.contains('agents')) {
            const agentStore = db.createObjectStore('agents', { keyPath: 'id' });
            agentStore.createIndex('by-farm', 'farmId');
            agentStore.createIndex('by-status', 'status');
          }

          // Tasks store
          if (!db.objectStoreNames.contains('tasks')) {
            const taskStore = db.createObjectStore('tasks', { keyPath: 'id' });
            taskStore.createIndex('by-farm', 'farmId');
            taskStore.createIndex('by-agent', 'agentId');
            taskStore.createIndex('by-status', 'status');
          }

          // Metrics store
          if (!db.objectStoreNames.contains('metrics')) {
            const metricsStore = db.createObjectStore('metrics', { keyPath: 'id' });
            metricsStore.createIndex('by-timestamp', 'timestamp');
            metricsStore.createIndex('by-farm', 'farmId');
            metricsStore.createIndex('by-agent', 'agentId');
          }

          // Settings store
          if (!db.objectStoreNames.contains('settings')) {
            db.createObjectStore('settings', { keyPath: 'key' });
          }
        }
      });

      console.log('IndexedDB initialized successfully');
    } catch (error) {
      console.error('Failed to initialize IndexedDB:', error);
      throw error;
    }
  }

  async saveFarm(farm: MaiFarmDB['farms']['value']): Promise<void> {
    if (!this.db) await this.initialize();
    
    farm.updated = Date.now();
    await this.db!.put('farms', farm);
  }

  async getFarm(id: string): Promise<MaiFarmDB['farms']['value'] | undefined> {
    if (!this.db) await this.initialize();
    return await this.db!.get('farms', id);
  }

  async getAllFarms(): Promise<MaiFarmDB['farms']['value'][]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAll('farms');
  }

  async getFarmsByStatus(status: string): Promise<MaiFarmDB['farms']['value'][]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAllFromIndex('farms', 'by-status', status);
  }

  async deleteFarm(id: string): Promise<void> {
    if (!this.db) await this.initialize();
    
    // Delete associated agents and tasks
    const agents = await this.getAgentsByFarm(id);
    for (const agent of agents) {
      await this.deleteAgent(agent.id);
    }
    
    const tasks = await this.getTasksByFarm(id);
    for (const task of tasks) {
      await this.deleteTask(task.id);
    }
    
    await this.db!.delete('farms', id);
  }

  async saveAgent(agent: MaiFarmDB['agents']['value']): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.put('agents', agent);
  }

  async getAgent(id: string): Promise<MaiFarmDB['agents']['value'] | undefined> {
    if (!this.db) await this.initialize();
    return await this.db!.get('agents', id);
  }

  async getAgentsByFarm(farmId: string): Promise<MaiFarmDB['agents']['value'][]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAllFromIndex('agents', 'by-farm', farmId);
  }

  async getAgentsByStatus(status: string): Promise<MaiFarmDB['agents']['value'][]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAllFromIndex('agents', 'by-status', status);
  }

  async deleteAgent(id: string): Promise<void> {
    if (!this.db) await this.initialize();
    
    // Delete associated tasks
    const tasks = await this.getTasksByAgent(id);
    for (const task of tasks) {
      await this.deleteTask(task.id);
    }
    
    await this.db!.delete('agents', id);
  }

  async saveTask(task: MaiFarmDB['tasks']['value']): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.put('tasks', task);
  }

  async getTask(id: string): Promise<MaiFarmDB['tasks']['value'] | undefined> {
    if (!this.db) await this.initialize();
    return await this.db!.get('tasks', id);
  }

  async getTasksByFarm(farmId: string): Promise<MaiFarmDB['tasks']['value'][]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAllFromIndex('tasks', 'by-farm', farmId);
  }

  async getTasksByAgent(agentId: string): Promise<MaiFarmDB['tasks']['value'][]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAllFromIndex('tasks', 'by-agent', agentId);
  }

  async getTasksByStatus(status: string): Promise<MaiFarmDB['tasks']['value'][]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAllFromIndex('tasks', 'by-status', status);
  }

  async deleteTask(id: string): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.delete('tasks', id);
  }

  async saveMetric(metric: MaiFarmDB['metrics']['value']): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.put('metrics', metric);
  }

  async getMetrics(
    startTime: number,
    endTime: number,
    farmId?: string,
    agentId?: string
  ): Promise<MaiFarmDB['metrics']['value'][]> {
    if (!this.db) await this.initialize();
    
    let metrics = await this.db!.getAllFromIndex(
      'metrics',
      'by-timestamp',
      IDBKeyRange.bound(startTime, endTime)
    );
    
    if (farmId) {
      metrics = metrics.filter(m => m.farmId === farmId);
    }
    
    if (agentId) {
      metrics = metrics.filter(m => m.agentId === agentId);
    }
    
    return metrics;
  }

  async cleanOldMetrics(olderThan: number): Promise<void> {
    if (!this.db) await this.initialize();
    
    const cutoffTime = Date.now() - olderThan;
    const tx = this.db!.transaction('metrics', 'readwrite');
    const index = tx.objectStore('metrics').index('by-timestamp');
    
    const keysToDelete = await index.getAllKeys(IDBKeyRange.upperBound(cutoffTime));
    
    for (const key of keysToDelete) {
      await tx.objectStore('metrics').delete(key);
    }
    
    await tx.done;
  }

  async saveSetting(key: string, value: any): Promise<void> {
    if (!this.db) await this.initialize();
    
    await this.db!.put('settings', {
      key,
      value,
      updated: Date.now()
    });
  }

  async getSetting(key: string): Promise<any> {
    if (!this.db) await this.initialize();
    
    const setting = await this.db!.get('settings', key);
    return setting?.value;
  }

  async getAllSettings(): Promise<Record<string, any>> {
    if (!this.db) await this.initialize();
    
    const settings = await this.db!.getAll('settings');
    const result: Record<string, any> = {};
    
    for (const setting of settings) {
      result[setting.key] = setting.value;
    }
    
    return result;
  }

  async exportData(): Promise<any> {
    if (!this.db) await this.initialize();
    
    return {
      farms: await this.db!.getAll('farms'),
      agents: await this.db!.getAll('agents'),
      tasks: await this.db!.getAll('tasks'),
      metrics: await this.db!.getAll('metrics'),
      settings: await this.db!.getAll('settings'),
      exportedAt: new Date().toISOString()
    };
  }

  async importData(data: any): Promise<void> {
    if (!this.db) await this.initialize();
    
    const tx = this.db!.transaction(
      ['farms', 'agents', 'tasks', 'metrics', 'settings'],
      'readwrite'
    );
    
    // Clear existing data
    await Promise.all([
      tx.objectStore('farms').clear(),
      tx.objectStore('agents').clear(),
      tx.objectStore('tasks').clear(),
      tx.objectStore('metrics').clear(),
      tx.objectStore('settings').clear()
    ]);
    
    // Import new data
    for (const farm of data.farms || []) {
      await tx.objectStore('farms').put(farm);
    }
    
    for (const agent of data.agents || []) {
      await tx.objectStore('agents').put(agent);
    }
    
    for (const task of data.tasks || []) {
      await tx.objectStore('tasks').put(task);
    }
    
    for (const metric of data.metrics || []) {
      await tx.objectStore('metrics').put(metric);
    }
    
    for (const setting of data.settings || []) {
      await tx.objectStore('settings').put(setting);
    }
    
    await tx.done;
  }

  async clearAllData(): Promise<void> {
    if (!this.db) await this.initialize();
    
    const tx = this.db!.transaction(
      ['farms', 'agents', 'tasks', 'metrics', 'settings'],
      'readwrite'
    );
    
    await Promise.all([
      tx.objectStore('farms').clear(),
      tx.objectStore('agents').clear(),
      tx.objectStore('tasks').clear(),
      tx.objectStore('metrics').clear(),
      tx.objectStore('settings').clear()
    ]);
    
    await tx.done;
  }

  async getStorageUsage(): Promise<{
    farms: number;
    agents: number;
    tasks: number;
    metrics: number;
    settings: number;
    total: number;
  }> {
    if (!this.db) await this.initialize();
    
    const counts = {
      farms: await this.db!.count('farms'),
      agents: await this.db!.count('agents'),
      tasks: await this.db!.count('tasks'),
      metrics: await this.db!.count('metrics'),
      settings: await this.db!.count('settings'),
      total: 0
    };
    
    counts.total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    
    return counts;
  }
}

export const indexedDB = new IndexedDBService();