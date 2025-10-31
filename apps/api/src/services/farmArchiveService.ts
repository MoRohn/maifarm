/**
 * Farm Archive Service
 * Handles archiving, restoring, and managing farm archives
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import { db } from '../database/connection';
import { websocketManager } from '../websocket/websocketManager';
import { logger, LogCategory } from '../utils/logger';
import { pathConfig } from '../config/paths';
import { harvestService } from './unified/harvestService';

export interface ArchiveFarmOptions {
  farmId: string;
  userId: string;
  reason?: string;
  notes?: string;
  category?: string;
  tags?: string[];
  isPublic?: boolean;
}

export interface ArchiveFilter {
  userId?: string;
  search?: string;
  category?: string;
  tags?: string[];
  archivedBy?: string;
  dateFrom?: Date;
  dateTo?: Date;
  isPublic?: boolean;
  isPinned?: boolean;
  minQualityScore?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface ArchivedFarmData {
  id: string;
  farmId: string;
  farmName: string;
  farmDescription?: string;
  farmType?: string;
  originalPrompt: string;
  farmConfig: any;
  agentMessages: any[];
  finalOutputs: any;
  artifacts: any[];
  yieldItems: any[];
  metadata: any;
  agentCount: number;
  agentNames: string[];
  archivedAt: Date;
  archivedBy: string;
  archiveReason?: string;
  archiveNotes?: string;
  category?: string;
  tags: string[];
  keywords: string[];
  isPublic: boolean;
  isPinned: boolean;
  qualityScore?: number;
  viewCount: number;
  executionTimeSeconds: number;
  totalCost: number;
  tokenUsage: number;
}

class FarmArchiveService extends EventEmitter {
  private static instance: FarmArchiveService;

  private constructor() {
    super();
  }

  public static getInstance(): FarmArchiveService {
    if (!FarmArchiveService.instance) {
      FarmArchiveService.instance = new FarmArchiveService();
    }
    return FarmArchiveService.instance;
  }

  /**
   * Archive a farm with all its data
   */
  async archiveFarm(options: ArchiveFarmOptions): Promise<string> {
    const { farmId, userId, reason, notes, category, tags = [], isPublic = false } = options;

    try {
      // Start a transaction
      await db.query('BEGIN');

      // Get farm data
      const farmResult = await db.query(
        'SELECT * FROM farms WHERE id = $1',
        [farmId]
      );

      if (farmResult.rows.length === 0) {
        throw new Error('Farm not found');
      }

      const farm = farmResult.rows[0];

      // Check if already archived
      if (farm.archived) {
        throw new Error('Farm is already archived');
      }

      // Get agent data
      const agentsResult = await db.query(
        'SELECT * FROM agents WHERE farm_id = $1 ORDER BY created_at',
        [farmId]
      );

      const agents = agentsResult.rows;
      const agentNames = agents.map(a => a.name || `Agent ${a.id.substring(0, 8)}`);

      // Get harvest data if available
      const harvestResult = await db.query(
        'SELECT * FROM harvests WHERE farm_id = $1',
        [farmId]
      );

      const harvest = harvestResult.rows[0];

      // Get agent messages from terminal logs or harvest
      const agentMessages = await this.collectAgentMessages(farmId, agents);

      // Get final outputs and artifacts
      const { finalOutputs, artifacts, yieldItems } = await this.collectFarmOutputs(farmId, harvest?.id);

      // Calculate execution metrics
      const executionTime = farm.completed_at
        ? Math.floor((new Date(farm.completed_at).getTime() - new Date(farm.created_at).getTime()) / 1000)
        : 0;

      // Get token usage and costs
      const tokenResult = await db.query(
        'SELECT SUM(prompt_tokens + completion_tokens) as total_tokens, SUM(cost) as total_cost FROM token_usage WHERE farm_id = $1',
        [farmId]
      );

      const tokenUsage = parseInt(tokenResult.rows[0]?.total_tokens || '0');
      const totalCost = parseFloat(tokenResult.rows[0]?.total_cost || '0');

      // Extract prompt from config or description
      const originalPrompt = farm.config?.prompt || farm.config?.yaml?.prompt || farm.description || '';

      // Prepare metadata
      const metadata = {
        ...farm.metrics,
        provider: farm.provider,
        orchestratorType: farm.orchestrator_type,
        sessionName: farm.session_name,
        workspacePath: farm.workspace_path,
        resourceUsage: farm.metrics?.resourceUtilization,
        errorCount: farm.metrics?.failedTasks || 0,
        successRate: farm.metrics?.efficiency || 0
      };

      // Generate keywords from prompt and outputs
      const keywords = this.extractKeywords(originalPrompt, farm.name, farm.description);

      // Create archive entry
      const archiveResult = await db.query(`
        INSERT INTO farm_archives (
          farm_id,
          farm_name,
          farm_description,
          farm_type,
          original_prompt,
          farm_config,
          agent_count,
          agent_messages,
          agent_names,
          final_outputs,
          artifacts,
          yield_items,
          metadata,
          token_usage,
          execution_time_seconds,
          total_cost,
          archived_by,
          archive_reason,
          archive_notes,
          category,
          tags,
          keywords,
          farm_created_at,
          farm_completed_at,
          is_public
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
        RETURNING id
      `, [
        farmId,
        farm.name,
        farm.description,
        farm.config?.type || 'standard',
        originalPrompt,
        farm.config,
        agents.length,
        JSON.stringify(agentMessages),
        agentNames,
        JSON.stringify(finalOutputs),
        JSON.stringify(artifacts),
        JSON.stringify(yieldItems),
        JSON.stringify(metadata),
        tokenUsage,
        executionTime,
        totalCost,
        userId,
        reason,
        notes,
        category,
        tags,
        keywords,
        farm.created_at,
        farm.completed_at,
        isPublic
      ]);

      const archiveId = archiveResult.rows[0].id;

      // Mark farm as archived
      await db.query(`
        UPDATE farms
        SET
          archived = TRUE,
          archived_at = CURRENT_TIMESTAMP,
          archived_by = $1,
          archive_reason = $2
        WHERE id = $3
      `, [userId, reason, farmId]);

      // Commit transaction
      await db.query('COMMIT');

      // Emit archive event
      this.emit('farm:archived', {
        archiveId,
        farmId,
        farmName: farm.name,
        archivedBy: userId
      });

      // Send WebSocket notification
      websocketManager.broadcast('farm:archived', {
        archiveId,
        farmId,
        farmName: farm.name,
        archivedAt: new Date()
      });

      logger.info(LogCategory.FARM, `Farm ${farm.name} archived successfully`, { archiveId, farmId });

      return archiveId;
    } catch (error) {
      // Rollback on error
      await db.query('ROLLBACK');
      logger.error(LogCategory.FARM, 'Failed to archive farm:', error);
      throw error;
    }
  }

  /**
   * Get list of archived farms with filtering
   */
  async getArchivedFarms(filter: ArchiveFilter = {}): Promise<{
    archives: ArchivedFarmData[];
    total: number;
  }> {
    try {
      let query = `
        SELECT
          fa.*,
          u.username as archived_by_username,
          f.status as current_farm_status
        FROM farm_archives fa
        LEFT JOIN users u ON fa.archived_by = u.id
        LEFT JOIN farms f ON fa.farm_id = f.id
        WHERE 1=1
      `;

      const params: any[] = [];
      let paramCount = 0;

      // Apply filters
      if (filter.search) {
        paramCount++;
        query += ` AND (
          fa.farm_name ILIKE $${paramCount} OR
          fa.farm_description ILIKE $${paramCount} OR
          fa.original_prompt ILIKE $${paramCount}
        )`;
        params.push(`%${filter.search}%`);
      }

      if (filter.category) {
        paramCount++;
        query += ` AND fa.category = $${paramCount}`;
        params.push(filter.category);
      }

      if (filter.tags && filter.tags.length > 0) {
        paramCount++;
        query += ` AND fa.tags && $${paramCount}`;
        params.push(filter.tags);
      }

      if (filter.archivedBy) {
        paramCount++;
        query += ` AND fa.archived_by = $${paramCount}`;
        params.push(filter.archivedBy);
      }

      if (filter.dateFrom) {
        paramCount++;
        query += ` AND fa.archived_at >= $${paramCount}`;
        params.push(filter.dateFrom);
      }

      if (filter.dateTo) {
        paramCount++;
        query += ` AND fa.archived_at <= $${paramCount}`;
        params.push(filter.dateTo);
      }

      if (filter.isPublic !== undefined) {
        paramCount++;
        query += ` AND fa.is_public = $${paramCount}`;
        params.push(filter.isPublic);
      }

      if (filter.isPinned !== undefined) {
        paramCount++;
        query += ` AND fa.is_pinned = $${paramCount}`;
        params.push(filter.isPinned);
      }

      if (filter.minQualityScore !== undefined) {
        paramCount++;
        query += ` AND fa.quality_score >= $${paramCount}`;
        params.push(filter.minQualityScore);
      }

      // Count total
      const countQuery = `SELECT COUNT(*) FROM (${query}) as subquery`;
      const countResult = await db.query(countQuery, params);
      const total = parseInt(countResult.rows[0].count);

      // Apply sorting
      const sortBy = filter.sortBy || 'archived_at';
      const sortOrder = filter.sortOrder || 'desc';
      query += ` ORDER BY fa.${sortBy} ${sortOrder.toUpperCase()}`;

      // Apply pagination
      if (filter.limit) {
        paramCount++;
        query += ` LIMIT $${paramCount}`;
        params.push(filter.limit);
      }

      if (filter.offset) {
        paramCount++;
        query += ` OFFSET $${paramCount}`;
        params.push(filter.offset);
      }

      const result = await db.query(query, params);

      const archives = result.rows.map(row => this.rowToArchivedFarm(row));

      return { archives, total };
    } catch (error) {
      logger.error(LogCategory.FARM, 'Failed to get archived farms:', error);
      throw error;
    }
  }

  /**
   * Get detailed archive data for a specific farm
   */
  async getArchivedFarm(archiveId: string): Promise<ArchivedFarmData | null> {
    try {
      const result = await db.query(`
        SELECT
          fa.*,
          u.username as archived_by_username,
          f.status as current_farm_status
        FROM farm_archives fa
        LEFT JOIN users u ON fa.archived_by = u.id
        LEFT JOIN farms f ON fa.farm_id = f.id
        WHERE fa.id = $1
      `, [archiveId]);

      if (result.rows.length === 0) {
        return null;
      }

      // Update view count
      await db.query(
        'UPDATE farm_archives SET view_count = view_count + 1 WHERE id = $1',
        [archiveId]
      );

      return this.rowToArchivedFarm(result.rows[0]);
    } catch (error) {
      logger.error(LogCategory.FARM, 'Failed to get archived farm:', error);
      throw error;
    }
  }

  /**
   * Restore an archived farm
   */
  async restoreFarm(farmId: string, userId: string): Promise<boolean> {
    try {
      // Check if farm exists and is archived
      const checkResult = await db.query(
        'SELECT * FROM farms WHERE id = $1 AND archived = TRUE',
        [farmId]
      );

      if (checkResult.rows.length === 0) {
        throw new Error('Archived farm not found');
      }

      // Restore the farm
      await db.query(`
        UPDATE farms
        SET
          archived = FALSE,
          archived_at = NULL,
          archived_by = NULL,
          archive_reason = NULL
        WHERE id = $1
      `, [farmId]);

      // Update archive metadata
      await db.query(`
        UPDATE farm_archives
        SET metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{restored}',
          jsonb_build_object(
            'restored_at', CURRENT_TIMESTAMP,
            'restored_by', $1::text
          )
        )
        WHERE farm_id = $2
      `, [userId, farmId]);

      // Emit restore event
      this.emit('farm:restored', { farmId, restoredBy: userId });

      // Send WebSocket notification
      websocketManager.broadcast('farm:restored', {
        farmId,
        restoredAt: new Date()
      });

      logger.info(LogCategory.FARM, `Farm ${farmId} restored successfully`);

      return true;
    } catch (error) {
      logger.error(LogCategory.FARM, 'Failed to restore farm:', error);
      throw error;
    }
  }

  /**
   * Permanently delete an archived farm
   */
  async deleteArchivedFarm(archiveId: string): Promise<boolean> {
    try {
      // Delete from farm_archives (cascades to farm if needed)
      await db.query('DELETE FROM farm_archives WHERE id = $1', [archiveId]);

      logger.info(LogCategory.FARM, `Archived farm ${archiveId} deleted permanently`);

      return true;
    } catch (error) {
      logger.error(LogCategory.FARM, 'Failed to delete archived farm:', error);
      throw error;
    }
  }

  /**
   * Update archive metadata
   */
  async updateArchive(archiveId: string, updates: Partial<ArchivedFarmData>): Promise<boolean> {
    try {
      const allowedUpdates = ['category', 'tags', 'archive_notes', 'is_public', 'is_pinned', 'quality_score'];
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (allowedUpdates.includes(key)) {
          updateFields.push(`${key} = $${paramCount}`);
          values.push(value);
          paramCount++;
        }
      }

      if (updateFields.length === 0) {
        return false;
      }

      values.push(archiveId);

      await db.query(`
        UPDATE farm_archives
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount}
      `, values);

      return true;
    } catch (error) {
      logger.error(LogCategory.FARM, 'Failed to update archive:', error);
      throw error;
    }
  }

  /**
   * Get archive statistics
   */
  async getArchiveStats(userId?: string): Promise<any> {
    try {
      const userFilter = userId ? 'WHERE archived_by = $1' : '';
      const params = userId ? [userId] : [];

      // Get total counts and averages
      const statsResult = await db.query(`
        SELECT
          COUNT(*) as total_archived,
          AVG(execution_time_seconds) as avg_execution_time,
          AVG(total_cost) as avg_cost,
          SUM(COALESCE(octet_length(final_outputs::text) + octet_length(artifacts::text), 0)) as total_size
        FROM farm_archives
        ${userFilter}
      `, params);

      // Get category counts
      const categoryResult = await db.query(`
        SELECT category, COUNT(*) as count
        FROM farm_archives
        ${userFilter}
        GROUP BY category
      `, params);

      // Get top tags
      const tagsResult = await db.query(`
        SELECT unnest(tags) as tag, COUNT(*) as count
        FROM farm_archives
        ${userFilter}
        GROUP BY tag
        ORDER BY count DESC
        LIMIT 10
      `, params);

      // Get most viewed
      const viewedResult = await db.query(`
        SELECT id, farm_name, view_count, archived_at
        FROM farm_archives
        ${userFilter}
        ORDER BY view_count DESC
        LIMIT 5
      `, params);

      // Get recently archived
      const recentResult = await db.query(`
        SELECT id, farm_name, archived_at
        FROM farm_archives
        ${userFilter}
        ORDER BY archived_at DESC
        LIMIT 5
      `, params);

      // Get pinned archives
      const pinnedResult = await db.query(`
        SELECT id, farm_name, archived_at
        FROM farm_archives
        ${userFilter ? userFilter + ' AND' : 'WHERE'} is_pinned = TRUE
        ORDER BY archived_at DESC
      `, params);

      return {
        totalArchived: parseInt(statsResult.rows[0].total_archived),
        totalSize: parseInt(statsResult.rows[0].total_size || 0),
        averageExecutionTime: parseFloat(statsResult.rows[0].avg_execution_time || 0),
        averageCost: parseFloat(statsResult.rows[0].avg_cost || 0),
        categoryCounts: Object.fromEntries(categoryResult.rows.map(r => [r.category || 'uncategorized', parseInt(r.count)])),
        topTags: tagsResult.rows.map(r => ({ tag: r.tag, count: parseInt(r.count) })),
        mostViewed: viewedResult.rows,
        recentlyArchived: recentResult.rows,
        pinnedArchives: pinnedResult.rows
      };
    } catch (error) {
      logger.error(LogCategory.FARM, 'Failed to get archive stats:', error);
      throw error;
    }
  }

  /**
   * Helper: Collect agent messages from various sources
   */
  private async collectAgentMessages(farmId: string, agents: any[]): Promise<any[]> {
    const messages: any[] = [];

    try {
      // Try to get messages from terminal logs
      const terminalPath = path.join(pathConfig.getPath('TERMINAL_LOGS'), farmId);

      for (const agent of agents) {
        const logFile = path.join(terminalPath, `agent-${agent.pane_index || 0}.log`);

        try {
          const content = await fs.readFile(logFile, 'utf-8');
          const lines = content.split('\n').filter(line => line.trim());

          messages.push({
            id: uuidv4(),
            agentId: agent.id,
            agentName: agent.name || `Agent ${agent.id.substring(0, 8)}`,
            timestamp: new Date(),
            type: 'assistant',
            content: lines.join('\n'),
            metadata: {
              model: agent.model,
              paneIndex: agent.pane_index
            }
          });
        } catch (err) {
          // Log file might not exist
          logger.debug(LogCategory.FARM, `No terminal log for agent ${agent.id}`);
        }
      }
    } catch (error) {
      logger.debug(LogCategory.FARM, 'Could not collect agent messages:', error);
    }

    return messages;
  }

  /**
   * Helper: Collect farm outputs and artifacts
   */
  private async collectFarmOutputs(farmId: string, harvestId?: string): Promise<{
    finalOutputs: any;
    artifacts: any[];
    yieldItems: any[];
  }> {
    const finalOutputs = {};
    const artifacts: any[] = [];
    const yieldItems: any[] = [];

    try {
      if (harvestId) {
        // Get harvest data
        const harvestResult = await db.query(
          'SELECT * FROM harvests WHERE id = $1',
          [harvestId]
        );

        if (harvestResult.rows.length > 0) {
          const harvest = harvestResult.rows[0];
          finalOutputs['summary'] = harvest.summary;
          finalOutputs['insights'] = harvest.insights;
          finalOutputs['quality'] = harvest.quality;

          // Extract yield items
          if (harvest.yield && Array.isArray(harvest.yield)) {
            yieldItems.push(...harvest.yield);
          }
        }

        // Get barn items associated with this harvest
        const barnResult = await db.query(
          'SELECT * FROM barn_items WHERE harvest_id = $1',
          [harvestId]
        );

        for (const item of barnResult.rows) {
          artifacts.push({
            id: item.id,
            name: item.name,
            type: item.type,
            path: item.path,
            size: parseInt(item.size_bytes || 0),
            mimeType: item.mime_type,
            createdAt: item.created_at
          });
        }
      }

      // Try to get workspace files
      const workspacePath = path.join(pathConfig.getPath('WORKSPACES'), farmId);

      try {
        const files = await this.scanDirectory(workspacePath);
        artifacts.push(...files);
      } catch (err) {
        logger.debug(LogCategory.FARM, `No workspace found for farm ${farmId}`);
      }
    } catch (error) {
      logger.debug(LogCategory.FARM, 'Could not collect farm outputs:', error);
    }

    return { finalOutputs, artifacts, yieldItems };
  }

  /**
   * Helper: Scan directory for files
   */
  private async scanDirectory(dirPath: string, basePath: string = ''): Promise<any[]> {
    const files: any[] = [];

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.join(basePath, entry.name);

        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          // Recursively scan subdirectories
          const subFiles = await this.scanDirectory(fullPath, relativePath);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          const stats = await fs.stat(fullPath);
          files.push({
            id: uuidv4(),
            name: entry.name,
            type: 'file',
            path: relativePath,
            size: stats.size,
            createdAt: stats.birthtime
          });
        }
      }
    } catch (error) {
      logger.debug(LogCategory.FARM, `Could not scan directory ${dirPath}:`, error);
    }

    return files;
  }

  /**
   * Helper: Extract keywords from text
   */
  private extractKeywords(prompt: string, name: string, description?: string): string[] {
    const text = `${prompt} ${name} ${description || ''}`.toLowerCase();

    // Simple keyword extraction - split by common delimiters and filter
    const words = text.split(/[\s,;.!?()[\]{}'"]+/)
      .filter(word => word.length > 3)
      .filter(word => !['the', 'and', 'for', 'with', 'from', 'that', 'this', 'what', 'when', 'where', 'which', 'while'].includes(word));

    // Get unique words
    const uniqueWords = [...new Set(words)];

    // Return top 20 keywords
    return uniqueWords.slice(0, 20);
  }

  /**
   * Helper: Convert database row to ArchivedFarmData
   */
  private rowToArchivedFarm(row: any): ArchivedFarmData {
    return {
      id: row.id,
      farmId: row.farm_id,
      farmName: row.farm_name,
      farmDescription: row.farm_description,
      farmType: row.farm_type,
      originalPrompt: row.original_prompt,
      farmConfig: row.farm_config,
      agentMessages: typeof row.agent_messages === 'string' ? JSON.parse(row.agent_messages) : row.agent_messages,
      finalOutputs: typeof row.final_outputs === 'string' ? JSON.parse(row.final_outputs) : row.final_outputs,
      artifacts: typeof row.artifacts === 'string' ? JSON.parse(row.artifacts) : row.artifacts,
      yieldItems: typeof row.yield_items === 'string' ? JSON.parse(row.yield_items) : row.yield_items,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      agentCount: row.agent_count,
      agentNames: row.agent_names,
      archivedAt: row.archived_at,
      archivedBy: row.archived_by,
      archiveReason: row.archive_reason,
      archiveNotes: row.archive_notes,
      category: row.category,
      tags: row.tags || [],
      keywords: row.keywords || [],
      isPublic: row.is_public,
      isPinned: row.is_pinned,
      qualityScore: row.quality_score,
      viewCount: row.view_count,
      executionTimeSeconds: row.execution_time_seconds,
      totalCost: row.total_cost,
      tokenUsage: row.token_usage
    };
  }
}

// Export singleton instance
export const farmArchiveService = FarmArchiveService.getInstance();