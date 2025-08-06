import { Router } from 'express';
import { Readable } from 'stream';

const router = Router();

interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'error' | 'warn' | 'info' | 'debug' | 'trace';
  source: string;
  message: string;
  metadata?: Record<string, any>;
  correlationId?: string;
  agentId?: string;
  farmId?: string;
  userId?: string;
}

interface LogQuery {
  start?: Date;
  end?: Date;
  level?: LogEntry['level'] | LogEntry['level'][];
  source?: string | string[];
  search?: string;
  agentId?: string;
  farmId?: string;
  correlationId?: string;
  limit?: number;
  offset?: number;
  sort?: 'asc' | 'desc';
}

// Import database connection
import { db } from '../database/connection';

// Query logs
router.get('/api/logs', async (req, res) => {
  try {
    const query: LogQuery = {
      start: req.query.start ? new Date(req.query.start as string) : new Date(Date.now() - 3600000),
      end: req.query.end ? new Date(req.query.end as string) : new Date(),
      level: req.query.level as LogEntry['level'],
      source: req.query.source as string,
      search: req.query.search as string,
      agentId: req.query.agentId as string,
      farmId: req.query.farmId as string,
      correlationId: req.query.correlationId as string,
      limit: parseInt(req.query.limit as string) || 100,
      offset: parseInt(req.query.offset as string) || 0,
      sort: (req.query.sort as 'asc' | 'desc') || 'desc'
    };

    const logs = await queryLogs(query);

    res.json({
      logs,
      query,
      total: logs.length,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to query logs' });
  }
});

// Stream logs in real-time
router.get('/api/logs/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const { level, source, agentId, farmId } = req.query;

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date() })}\n\n`);

  // Set up log streaming
  const streamInterval = setInterval(() => {
    // In production, this would connect to actual log stream
    const recentLogs = getRecentLogs({
      level: level as LogEntry['level'],
      source: source as string,
      agentId: agentId as string,
      farmId: farmId as string
    });

    if (recentLogs.length > 0) {
      res.write(`data: ${JSON.stringify({ type: 'logs', logs: recentLogs })}\n\n`);
    }
  }, 1000);

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(streamInterval);
  });
});

// Advanced log search
router.post('/api/logs/search', async (req, res) => {
  try {
    const { 
      query,
      filters,
      aggregations,
      timeRange,
      limit = 100,
      offset = 0
    } = req.body;

    const searchResults = await performLogSearch({
      query,
      filters,
      aggregations,
      timeRange,
      limit,
      offset
    });

    res.json({
      results: searchResults.logs,
      aggregations: searchResults.aggregations,
      total: searchResults.total,
      took: searchResults.took,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to perform log search' });
  }
});

// Get log statistics
router.get('/api/logs/stats', async (req, res) => {
  try {
    const { period = '1h', groupBy = 'level' } = req.query;
    
    const stats = await getLogStatistics(period as string, groupBy as string);

    res.json({
      period,
      groupBy,
      statistics: stats,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve log statistics' });
  }
});

// Export logs
router.post('/api/logs/export', async (req, res) => {
  try {
    const { format = 'json', query } = req.body;
    
    const logs = await queryLogs(query);

    switch (format) {
      case 'csv':
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="logs.csv"');
        res.send(convertLogsToCSV(logs));
        break;
      case 'json':
      default:
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="logs.json"');
        res.json(logs);
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to export logs' });
  }
});

// Get log sources
router.get('/api/logs/sources', async (req, res) => {
  try {
    const sources = await getLogSources();
    
    res.json({
      sources,
      total: sources.length,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve log sources' });
  }
});

// Helper functions
async function queryLogs(query: LogQuery): Promise<LogEntry[]> {
  let sqlQuery = `
    SELECT 
      id,
      timestamp,
      level,
      source,
      message,
      metadata,
      correlation_id as "correlationId",
      agent_id as "agentId",
      farm_id as "farmId",
      user_id as "userId"
    FROM logs
    WHERE timestamp >= $1 AND timestamp <= $2
  `;
  
  const params: any[] = [query.start || new Date(0), query.end || new Date()];
  let paramIndex = 3;

  if (query.level) {
    const levels = Array.isArray(query.level) ? query.level : [query.level];
    sqlQuery += ` AND level = ANY($${paramIndex++})`;
    params.push(levels);
  }

  if (query.source) {
    const sources = Array.isArray(query.source) ? query.source : [query.source];
    sqlQuery += ` AND source = ANY($${paramIndex++})`;
    params.push(sources);
  }

  if (query.search) {
    sqlQuery += ` AND (message ILIKE $${paramIndex} OR metadata::text ILIKE $${paramIndex++})`;
    params.push(`%${query.search}%`);
  }

  if (query.agentId) {
    sqlQuery += ` AND agent_id = $${paramIndex++}`;
    params.push(query.agentId);
  }

  if (query.farmId) {
    sqlQuery += ` AND farm_id = $${paramIndex++}`;
    params.push(query.farmId);
  }

  if (query.correlationId) {
    sqlQuery += ` AND correlation_id = $${paramIndex++}`;
    params.push(query.correlationId);
  }

  // Sort
  sqlQuery += ` ORDER BY timestamp ${query.sort === 'asc' ? 'ASC' : 'DESC'}`;

  // Paginate
  sqlQuery += ` LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
  params.push(query.limit || 100, query.offset || 0);

  const result = await db.query(sqlQuery, params);
  
  return result.rows.map(row => ({
    ...row,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
  }));
}

function getRecentLogs(filters: any): LogEntry[] {
  // In production, this would get logs from actual log stream
  return [];
}

async function performLogSearch(params: any): Promise<any> {
  // In production, this would use Elasticsearch or similar
  const logs = await queryLogs(params);
  
  return {
    logs,
    aggregations: {},
    total: logs.length,
    took: 0
  };
}

async function getLogStatistics(period: string, groupBy: string): Promise<any> {
  const periodMs = parsePeriod(period);
  const startTime = new Date(Date.now() - periodMs);
  
  let query: string;
  if (groupBy === 'level') {
    query = `
      SELECT level as key, COUNT(*) as count
      FROM logs
      WHERE timestamp >= $1
      GROUP BY level
    `;
  } else {
    query = `
      SELECT source as key, COUNT(*) as count
      FROM logs
      WHERE timestamp >= $1
      GROUP BY source
    `;
  }
  
  const result = await db.query(query, [startTime]);
  
  const stats: Record<string, number> = {};
  result.rows.forEach(row => {
    stats[row.key] = parseInt(row.count);
  });
  
  return stats;
}

async function getLogSources(): Promise<string[]> {
  const result = await db.query('SELECT DISTINCT source FROM logs ORDER BY source');
  return result.rows.map(row => row.source);
}

function parsePeriod(period: string): number {
  const match = period.match(/^(\d+)([smhd])$/);
  if (!match) return 3600000; // Default to 1 hour

  const [, value, unit] = match;
  const num = parseInt(value);

  switch (unit) {
    case 's': return num * 1000;
    case 'm': return num * 60000;
    case 'h': return num * 3600000;
    case 'd': return num * 86400000;
    default: return 3600000;
  }
}

function convertLogsToCSV(logs: LogEntry[]): string {
  const headers = ['timestamp', 'level', 'source', 'message', 'agentId', 'farmId'];
  const rows = logs.map(log => [
    log.timestamp.toISOString(),
    log.level,
    log.source,
    log.message,
    log.agentId || '',
    log.farmId || ''
  ]);

  return [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');
}

// Function to add logs (used by other parts of the application)
export async function addLog(entry: Omit<LogEntry, 'id'>): Promise<void> {
  try {
    await db.query(
      `INSERT INTO logs (
        timestamp, level, source, message, metadata, 
        correlation_id, agent_id, farm_id, user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        entry.timestamp,
        entry.level,
        entry.source,
        entry.message,
        JSON.stringify(entry.metadata || {}),
        entry.correlationId,
        entry.agentId,
        entry.farmId,
        entry.userId
      ]
    );
  } catch (error) {
    // Fallback to console if database write fails
    console.error('Failed to write log to database:', error);
    console.log(entry);
  }
}

export default router;