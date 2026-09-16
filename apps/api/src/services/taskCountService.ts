import { db } from '../database/connection';
import { logger } from '../utils/logger';

const FARM_CACHE_TTL_MS = Number(process.env.TASK_COUNT_FARM_CACHE_MS || 15000);
const AGENT_CACHE_TTL_MS = Number(process.env.TASK_COUNT_AGENT_CACHE_MS || 15000);
const HARVEST_CACHE_TTL_MS = Number(process.env.TASK_COUNT_HARVEST_CACHE_MS || 30000);
const WATCH_POLL_INTERVAL_MS = Number(process.env.TASK_COUNT_WATCH_INTERVAL_MS || 2000);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

function isUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

async function parseCountResult(result: any): Promise<number> {
  const raw = result?.rows?.[0]?.count ?? 0;
  const parsed = typeof raw === 'number' ? raw : parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export class TaskCountService {
  private static instance: TaskCountService;

  private farmCache = new Map<string, CacheEntry<number>>();
  private agentCache = new Map<string, CacheEntry<number>>();
  private harvestCache = new Map<string, CacheEntry<number>>();

  private constructor() {}

  static getInstance(): TaskCountService {
    if (!TaskCountService.instance) {
      TaskCountService.instance = new TaskCountService();
    }
    return TaskCountService.instance;
  }

  private async withCache<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string,
    ttlMs: number,
    loader: () => Promise<T>
  ): Promise<T> {
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const value = await loader();

    if (ttlMs > 0) {
      cache.set(key, {
        value,
        expiresAt: Date.now() + ttlMs
      });
    }

    return value;
  }

  private clearCacheEntry(cache: Map<string, CacheEntry<number>>, key: string) {
    cache.delete(key);
  }

  async countTasksForFarm(farmId: string): Promise<number> {
    if (!farmId) return 0;

    const cacheKey = `farm:${farmId}`;
    const count = await this.withCache(this.farmCache, cacheKey, FARM_CACHE_TTL_MS, async () => {
      const result = await db.query(
        `SELECT COUNT(*) AS count FROM tasks WHERE farm_id = $1`,
        [farmId]
      );
      return parseCountResult(result);
    });

    logger.debug(`[TaskCountService] Farm ${farmId} has ${count} tasks in database`);
    return count;
  }

  async countTasksForAgent(farmId: string, agentIdentifier: string | number): Promise<number> {
    if (!farmId || agentIdentifier === undefined || agentIdentifier === null) {
      return 0;
    }

    const cacheKey = `agent:${farmId}:${agentIdentifier}`;
    const count = await this.withCache(this.agentCache, cacheKey, AGENT_CACHE_TTL_MS, async () => {
      const agentId = await this.resolveAgentId(farmId, agentIdentifier);
      if (!agentId) {
        return 0;
      }

      const result = await db.query(
        `SELECT COUNT(*) AS count FROM tasks WHERE farm_id = $1 AND agent_id = $2`,
        [farmId, agentId]
      );
      return parseCountResult(result);
    });

    logger.debug(`[TaskCountService] Agent ${agentIdentifier} in farm ${farmId} has ${count} tasks in database`);
    return count;
  }

  async countHarvestedTasks(farmId: string): Promise<number> {
    if (!farmId) return 0;

    const cacheKey = `harvest:${farmId}`;
    const count = await this.withCache(this.harvestCache, cacheKey, HARVEST_CACHE_TTL_MS, async () => {
      const result = await db.query(
        `SELECT COUNT(*) AS count FROM harvest_yield WHERE farm_id = $1`,
        [farmId]
      );
      return parseCountResult(result);
    });

    logger.debug(`[TaskCountService] Farm ${farmId} has ${count} harvested items in database`);
    return count;
  }

  async getTaskStatistics(farmId: string): Promise<{
    totalTasks: number;
    harvestedTasks: number;
    pendingTasks: number;
    tasksByType: Record<string, number>;
  }> {
    if (!farmId) {
      return {
        totalTasks: 0,
        harvestedTasks: 0,
        pendingTasks: 0,
        tasksByType: {}
      };
    }

    try {
      const [aggregateResult, typeResult] = await Promise.all([
        db.query(
          `SELECT 
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'completed') AS completed,
            COUNT(*) FILTER (WHERE status = 'failed') AS failed
           FROM tasks
           WHERE farm_id = $1`,
          [farmId]
        ),
        db.query(
          `SELECT 
             LOWER(NULLIF(
               COALESCE(
                 payload->>'fileExtension',
                 payload->>'extension',
                 result->>'fileExtension',
                 result->>'extension'
               ), ''
             )) AS extension,
             COUNT(*) AS count
           FROM tasks
           WHERE farm_id = $1
           GROUP BY 1`,
          [farmId]
        )
      ]);

      const aggregateRow = aggregateResult.rows?.[0] ?? {};
      const totalTasks = parseInt(aggregateRow.total || '0', 10);
      const completedTasks = parseInt(aggregateRow.completed || '0', 10);
      const harvestedTasks = await this.countHarvestedTasks(farmId);

      const categories: Record<string, number> = {
        code: 0,
        documentation: 0,
        data: 0,
        config: 0,
        other: 0
      };

      for (const row of typeResult.rows ?? []) {
        const extension = typeof row.extension === 'string' ? row.extension.replace(/^\./, '') : '';
        const count = parseInt(row.count || '0', 10);
        const category = this.mapExtensionToCategory(extension);
        categories[category] += count;
      }

      return {
        totalTasks,
        harvestedTasks,
        pendingTasks: Math.max(0, totalTasks - completedTasks),
        tasksByType: categories
      };
    } catch (error) {
      logger.error(`[TaskCountService] Error getting task statistics for farm ${farmId}:`, error);
      return {
        totalTasks: 0,
        harvestedTasks: 0,
        pendingTasks: 0,
        tasksByType: {}
      };
    }
  }

  async watchTaskCompletion(
    farmId: string,
    callback: (newTaskCount: number) => void
  ): Promise<() => void> {
    let cancelled = false;
    let lastCount = await this.countTasksForFarm(farmId);

    callback(lastCount);

    const interval = setInterval(async () => {
      try {
        if (cancelled) return;
        const count = await this.countTasksForFarm(farmId);
        if (count !== lastCount) {
          lastCount = count;
          callback(count);
        }
      } catch (error) {
        logger.warn(`[TaskCountService] Error polling task count for farm ${farmId}:`, error);
      }
    }, WATCH_POLL_INTERVAL_MS);

    interval.unref?.();

    return () => {
      cancelled = true;
      clearInterval(interval);
      this.clearCacheEntry(this.farmCache, `farm:${farmId}`);
    };
  }

  private async resolveAgentId(farmId: string, agentIdentifier: string | number): Promise<string | null> {
    if (typeof agentIdentifier === 'string') {
      if (isUUID(agentIdentifier)) {
        return agentIdentifier;
      }

      const numeric = Number.parseInt(agentIdentifier, 10);
      if (Number.isInteger(numeric)) {
        return this.lookupAgentIdByIndex(farmId, numeric);
      }

      return null;
    }

    if (typeof agentIdentifier === 'number') {
      return this.lookupAgentIdByIndex(farmId, agentIdentifier);
    }

    return null;
  }

  private async lookupAgentIdByIndex(farmId: string, index: number): Promise<string | null> {
    if (!Number.isInteger(index) || index < 0) {
      return null;
    }

    const result = await db.query(
      `SELECT id FROM agents
       WHERE farm_id = $1
       ORDER BY created_at ASC
       OFFSET $2 LIMIT 1`,
      [farmId, index]
    );

    return result.rows?.[0]?.id ?? null;
  }

  private mapExtensionToCategory(extension: string): keyof Record<string, number> {
    if (!extension) {
      return 'other';
    }

    const ext = extension.startsWith('.') ? extension.slice(1) : extension;

    if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'go', 'rs', 'rb', 'php'].includes(ext)) {
      return 'code';
    }

    if (['md', 'markdown', 'txt', 'doc', 'docx', 'pdf', 'rst'].includes(ext)) {
      return 'documentation';
    }

    if (['json', 'csv', 'xml', 'sql', 'db', 'parquet'].includes(ext)) {
      return 'data';
    }

    if (['yaml', 'yml', 'toml', 'ini', 'env', 'config'].includes(ext)) {
      return 'config';
    }

    return 'other';
  }
}

export const taskCountService = TaskCountService.getInstance();
