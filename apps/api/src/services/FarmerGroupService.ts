/**
 * FarmerGroupService - Manages farmer groups, statistics, and ratings
 *
 * Provides database-backed farmer organization with real usage tracking,
 * user ratings, and group management capabilities.
 */

import { db } from '../database/connection';
import { logger, LogCategory } from '../utils/logger';
import { farmersService } from './farmersService';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface FarmerGroup {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  displayOrder: number;
  isSystem: boolean;
  isActive: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  farmerCount?: number;
  farmers?: string[];
}

export interface FarmerGroupMember {
  id: string;
  groupId: string;
  farmerId: string;
  displayOrder: number;
  addedAt: Date;
}

export interface FarmerDbStats {
  id: string;
  farmerId: string;
  totalUses: number;
  successfulFarms: number;
  failedFarms: number;
  cancelledFarms: number;
  totalAgentsSpawned: number;
  avgCompletionTimeSeconds: number | null;
  minCompletionTimeSeconds: number | null;
  maxCompletionTimeSeconds: number | null;
  avgRating: number;
  ratingCount: number;
  lastUsedAt: Date | null;
  lastSuccessfulAt: Date | null;
  successRate: number;
}

export interface FarmerRating {
  id: string;
  farmerId: string;
  userId: string;
  farmId: string | null;
  rating: number;
  review: string | null;
  isPublic: boolean;
  helpfulCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserFarmerPreference {
  id: string;
  userId: string;
  farmerId: string;
  isFavorite: boolean;
  useCount: number;
  lastUsedAt: Date | null;
}

export interface CreateGroupDTO {
  name: string;
  slug?: string;
  description?: string;
  icon?: string;
  color?: string;
  displayOrder?: number;
  createdBy?: string;
}

export interface UpdateGroupDTO {
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
  displayOrder?: number;
  isActive?: boolean;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class FarmerGroupService {
  private static instance: FarmerGroupService | null = null;
  private initialized: boolean = false;

  private constructor() {}

  static getInstance(): FarmerGroupService {
    if (!FarmerGroupService.instance) {
      FarmerGroupService.instance = new FarmerGroupService();
    }
    return FarmerGroupService.instance;
  }

  // --------------------------------------------------------------------------
  // GROUP MANAGEMENT
  // --------------------------------------------------------------------------

  /**
   * Get all farmer groups with farmer counts
   */
  async getAllGroups(): Promise<FarmerGroup[]> {
    try {
      const result = await db.query(`
        SELECT
          g.*,
          COUNT(m.farmer_id) as farmer_count,
          ARRAY_AGG(m.farmer_id ORDER BY m.display_order) FILTER (WHERE m.farmer_id IS NOT NULL) as farmers
        FROM farmer_groups g
        LEFT JOIN farmer_group_members m ON g.id = m.group_id
        WHERE g.is_active = true
        GROUP BY g.id
        ORDER BY g.display_order, g.name
      `);

      return result.rows.map(this.mapGroupFromDb);
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Failed to get farmer groups', { error });
      return [];
    }
  }

  /**
   * Get a single group by ID
   */
  async getGroupById(id: string): Promise<FarmerGroup | null> {
    try {
      const result = await db.query(`
        SELECT
          g.*,
          COUNT(m.farmer_id) as farmer_count,
          ARRAY_AGG(m.farmer_id ORDER BY m.display_order) FILTER (WHERE m.farmer_id IS NOT NULL) as farmers
        FROM farmer_groups g
        LEFT JOIN farmer_group_members m ON g.id = m.group_id
        WHERE g.id = $1
        GROUP BY g.id
      `, [id]);

      if (result.rows.length === 0) return null;
      return this.mapGroupFromDb(result.rows[0]);
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Failed to get farmer group', { id, error });
      return null;
    }
  }

  /**
   * Get a group by slug
   */
  async getGroupBySlug(slug: string): Promise<FarmerGroup | null> {
    try {
      const result = await db.query(`
        SELECT
          g.*,
          COUNT(m.farmer_id) as farmer_count,
          ARRAY_AGG(m.farmer_id ORDER BY m.display_order) FILTER (WHERE m.farmer_id IS NOT NULL) as farmers
        FROM farmer_groups g
        LEFT JOIN farmer_group_members m ON g.id = m.group_id
        WHERE g.slug = $1
        GROUP BY g.id
      `, [slug]);

      if (result.rows.length === 0) return null;
      return this.mapGroupFromDb(result.rows[0]);
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Failed to get farmer group by slug', { slug, error });
      return null;
    }
  }

  /**
   * Get all farmers in a specific group with their templates
   */
  async getFarmersInGroup(groupId: string): Promise<any[]> {
    try {
      const result = await db.query(`
        SELECT farmer_id, display_order
        FROM farmer_group_members
        WHERE group_id = $1
        ORDER BY display_order
      `, [groupId]);

      // Get full farmer templates from FarmersService
      const farmerIds = result.rows.map((r: { farmer_id: string }) => r.farmer_id);
      const allFarmers = await farmersService.getAllFarmers();

      return allFarmers.filter(f => farmerIds.includes(f.id));
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Failed to get farmers in group', { groupId, error });
      return [];
    }
  }

  /**
   * Create a new farmer group
   */
  async createGroup(data: CreateGroupDTO): Promise<FarmerGroup | null> {
    try {
      const slug = data.slug || this.generateSlug(data.name);

      const result = await db.query(`
        INSERT INTO farmer_groups (name, slug, description, icon, color, display_order, is_system, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, false, $7)
        RETURNING *
      `, [
        data.name,
        slug,
        data.description || null,
        data.icon || null,
        data.color || null,
        data.displayOrder || 0,
        data.createdBy || null
      ]);

      logger.info(LogCategory.API, 'Created farmer group', { name: data.name, slug });
      return this.mapGroupFromDb(result.rows[0]);
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Failed to create farmer group', { data, error });
      return null;
    }
  }

  /**
   * Update an existing farmer group
   */
  async updateGroup(id: string, data: UpdateGroupDTO): Promise<FarmerGroup | null> {
    try {
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (data.name !== undefined) {
        updates.push(`name = $${paramIndex++}`);
        values.push(data.name);
      }
      if (data.description !== undefined) {
        updates.push(`description = $${paramIndex++}`);
        values.push(data.description);
      }
      if (data.icon !== undefined) {
        updates.push(`icon = $${paramIndex++}`);
        values.push(data.icon);
      }
      if (data.color !== undefined) {
        updates.push(`color = $${paramIndex++}`);
        values.push(data.color);
      }
      if (data.displayOrder !== undefined) {
        updates.push(`display_order = $${paramIndex++}`);
        values.push(data.displayOrder);
      }
      if (data.isActive !== undefined) {
        updates.push(`is_active = $${paramIndex++}`);
        values.push(data.isActive);
      }

      if (updates.length === 0) {
        return this.getGroupById(id);
      }

      values.push(id);
      const result = await db.query(`
        UPDATE farmer_groups
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${paramIndex}
        RETURNING *
      `, values);

      if (result.rows.length === 0) return null;

      logger.info(LogCategory.API, 'Updated farmer group', { id });
      return this.mapGroupFromDb(result.rows[0]);
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Failed to update farmer group', { id, data, error });
      return null;
    }
  }

  /**
   * Delete a farmer group (soft delete by setting is_active = false)
   */
  async deleteGroup(id: string): Promise<boolean> {
    try {
      // Check if it's a system group
      const group = await this.getGroupById(id);
      if (group?.isSystem) {
        logger.warn(LogCategory.API, 'Cannot delete system group', { id });
        return false;
      }

      await db.query(`
        UPDATE farmer_groups SET is_active = false WHERE id = $1
      `, [id]);

      logger.info(LogCategory.API, 'Deleted farmer group', { id });
      return true;
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Failed to delete farmer group', { id, error });
      return false;
    }
  }

  /**
   * Add a farmer to a group
   */
  async addFarmerToGroup(groupId: string, farmerId: string, displayOrder?: number): Promise<boolean> {
    try {
      const order = displayOrder ?? await this.getNextDisplayOrder(groupId);

      await db.query(`
        INSERT INTO farmer_group_members (group_id, farmer_id, display_order)
        VALUES ($1, $2, $3)
        ON CONFLICT (group_id, farmer_id) DO UPDATE SET display_order = $3
      `, [groupId, farmerId, order]);

      logger.info(LogCategory.API, 'Added farmer to group', { groupId, farmerId });
      return true;
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Failed to add farmer to group', { groupId, farmerId, error });
      return false;
    }
  }

  /**
   * Remove a farmer from a group
   */
  async removeFarmerFromGroup(groupId: string, farmerId: string): Promise<boolean> {
    try {
      await db.query(`
        DELETE FROM farmer_group_members WHERE group_id = $1 AND farmer_id = $2
      `, [groupId, farmerId]);

      logger.info(LogCategory.API, 'Removed farmer from group', { groupId, farmerId });
      return true;
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Failed to remove farmer from group', { groupId, farmerId, error });
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // STATISTICS TRACKING
  // --------------------------------------------------------------------------

  /**
   * Get real statistics for a farmer from database
   */
  async getFarmerStats(farmerId: string): Promise<FarmerDbStats | null> {
    try {
      const result = await db.query(`
        SELECT
          *,
          CASE WHEN rating_count > 0 THEN total_rating_sum / rating_count ELSE 0 END as avg_rating,
          CASE WHEN total_uses > 0 THEN (successful_farms::decimal / total_uses * 100) ELSE 0 END as success_rate
        FROM farmer_stats
        WHERE farmer_id = $1
      `, [farmerId]);

      if (result.rows.length === 0) {
        // Initialize stats if not exists
        await this.initializeFarmerStats(farmerId);
        return this.getFarmerStats(farmerId);
      }

      return this.mapStatsFromDb(result.rows[0]);
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Failed to get farmer stats', { farmerId, error });
      return null;
    }
  }

  /**
   * Get stats for all farmers
   */
  async getAllFarmerStats(): Promise<FarmerDbStats[]> {
    try {
      const result = await db.query(`
        SELECT
          *,
          CASE WHEN rating_count > 0 THEN total_rating_sum / rating_count ELSE 0 END as avg_rating,
          CASE WHEN total_uses > 0 THEN (successful_farms::decimal / total_uses * 100) ELSE 0 END as success_rate
        FROM farmer_stats
        ORDER BY total_uses DESC
      `);

      return result.rows.map(this.mapStatsFromDb);
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Failed to get all farmer stats', { error });
      return [];
    }
  }

  /**
   * Increment usage when a farm is created with a farmer template
   */
  async recordFarmerUsage(farmerId: string, agentsCount: number = 1): Promise<void> {
    try {
      await db.query(`SELECT increment_farmer_usage($1, $2)`, [farmerId, agentsCount]);
      logger.info(LogCategory.API, 'Recorded farmer usage', { farmerId, agentsCount });
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Failed to record farmer usage', { farmerId, error });
    }
  }

  /**
   * Record farm completion (success or failure)
   */
  async recordFarmCompletion(farmerId: string, success: boolean, completionTimeSeconds?: number): Promise<void> {
    try {
      await db.query(`SELECT record_farmer_completion($1, $2, $3)`, [
        farmerId,
        success,
        completionTimeSeconds || null
      ]);
      logger.info(LogCategory.API, 'Recorded farm completion', { farmerId, success, completionTimeSeconds });
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Failed to record farm completion', { farmerId, error });
    }
  }

  /**
   * Initialize stats for a farmer (if not exists)
   */
  private async initializeFarmerStats(farmerId: string): Promise<void> {
    try {
      await db.query(`
        INSERT INTO farmer_stats (farmer_id, total_uses, successful_farms, failed_farms)
        VALUES ($1, 0, 0, 0)
        ON CONFLICT (farmer_id) DO NOTHING
      `, [farmerId]);
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Failed to initialize farmer stats', { farmerId, error });
    }
  }

  // --------------------------------------------------------------------------
  // RATINGS & REVIEWS
  // --------------------------------------------------------------------------

  /**
   * Add or update a rating for a farmer
   */
  async addRating(
    farmerId: string,
    userId: string,
    rating: number,
    farmId?: string,
    review?: string
  ): Promise<string | null> {
    try {
      const result = await db.query(
        `SELECT add_farmer_rating($1, $2, $3, $4, $5)`,
        [farmerId, userId, farmId || null, rating, review || null]
      );

      logger.info(LogCategory.API, 'Added farmer rating', { farmerId, userId, rating });
      return result.rows[0]?.add_farmer_rating || null;
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Failed to add farmer rating', { farmerId, userId, error });
      return null;
    }
  }

  /**
   * Get ratings for a farmer
   */
  async getFarmerRatings(farmerId: string, limit: number = 10): Promise<FarmerRating[]> {
    try {
      const result = await db.query(`
        SELECT *
        FROM farmer_ratings
        WHERE farmer_id = $1 AND is_public = true
        ORDER BY created_at DESC
        LIMIT $2
      `, [farmerId, limit]);

      return result.rows.map(this.mapRatingFromDb);
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Failed to get farmer ratings', { farmerId, error });
      return [];
    }
  }

  /**
   * Get a user's rating for a specific farmer
   */
  async getUserRating(userId: string, farmerId: string): Promise<FarmerRating | null> {
    try {
      const result = await db.query(`
        SELECT *
        FROM farmer_ratings
        WHERE user_id = $1 AND farmer_id = $2
        ORDER BY created_at DESC
        LIMIT 1
      `, [userId, farmerId]);

      if (result.rows.length === 0) return null;
      return this.mapRatingFromDb(result.rows[0]);
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Failed to get user rating', { userId, farmerId, error });
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // USER PREFERENCES
  // --------------------------------------------------------------------------

  /**
   * Toggle favorite status for a farmer
   */
  async toggleFavorite(userId: string, farmerId: string): Promise<boolean> {
    try {
      // Upsert with toggle
      const result = await db.query(`
        INSERT INTO user_farmer_preferences (user_id, farmer_id, is_favorite)
        VALUES ($1, $2, true)
        ON CONFLICT (user_id, farmer_id) DO UPDATE
        SET is_favorite = NOT user_farmer_preferences.is_favorite,
            updated_at = NOW()
        RETURNING is_favorite
      `, [userId, farmerId]);

      const isFavorite = result.rows[0]?.is_favorite || false;
      logger.info(LogCategory.API, 'Toggled farmer favorite', { userId, farmerId, isFavorite });
      return isFavorite;
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Failed to toggle favorite', { userId, farmerId, error });
      return false;
    }
  }

  /**
   * Get user's favorite farmers
   */
  async getUserFavorites(userId: string): Promise<string[]> {
    try {
      const result = await db.query(`
        SELECT farmer_id
        FROM user_farmer_preferences
        WHERE user_id = $1 AND is_favorite = true
        ORDER BY updated_at DESC
      `, [userId]);

      return result.rows.map((r: { farmer_id: string }) => r.farmer_id);
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Failed to get user favorites', { userId, error });
      return [];
    }
  }

  /**
   * Get user's recently used farmers
   */
  async getUserRecentFarmers(userId: string, limit: number = 5): Promise<string[]> {
    try {
      const result = await db.query(`
        SELECT farmer_id
        FROM user_farmer_preferences
        WHERE user_id = $1 AND last_used_at IS NOT NULL
        ORDER BY last_used_at DESC
        LIMIT $2
      `, [userId, limit]);

      return result.rows.map((r: { farmer_id: string }) => r.farmer_id);
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Failed to get recent farmers', { userId, error });
      return [];
    }
  }

  /**
   * Record that a user used a farmer (for tracking recents)
   */
  async recordUserUsage(userId: string, farmerId: string): Promise<void> {
    try {
      await db.query(`
        INSERT INTO user_farmer_preferences (user_id, farmer_id, use_count, last_used_at)
        VALUES ($1, $2, 1, NOW())
        ON CONFLICT (user_id, farmer_id) DO UPDATE SET
          use_count = user_farmer_preferences.use_count + 1,
          last_used_at = NOW(),
          updated_at = NOW()
      `, [userId, farmerId]);
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Failed to record user usage', { userId, farmerId, error });
    }
  }

  // --------------------------------------------------------------------------
  // HELPER METHODS
  // --------------------------------------------------------------------------

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private async getNextDisplayOrder(groupId: string): Promise<number> {
    const result = await db.query(`
      SELECT COALESCE(MAX(display_order), 0) + 1 as next_order
      FROM farmer_group_members
      WHERE group_id = $1
    `, [groupId]);
    return result.rows[0]?.next_order || 1;
  }

  private mapGroupFromDb(row: any): FarmerGroup {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      icon: row.icon,
      color: row.color,
      displayOrder: row.display_order,
      isSystem: row.is_system,
      isActive: row.is_active,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      farmerCount: parseInt(row.farmer_count) || 0,
      farmers: row.farmers || []
    };
  }

  private mapStatsFromDb(row: any): FarmerDbStats {
    return {
      id: row.id,
      farmerId: row.farmer_id,
      totalUses: row.total_uses || 0,
      successfulFarms: row.successful_farms || 0,
      failedFarms: row.failed_farms || 0,
      cancelledFarms: row.cancelled_farms || 0,
      totalAgentsSpawned: row.total_agents_spawned || 0,
      avgCompletionTimeSeconds: row.avg_completion_time_seconds,
      minCompletionTimeSeconds: row.min_completion_time_seconds,
      maxCompletionTimeSeconds: row.max_completion_time_seconds,
      avgRating: parseFloat(row.avg_rating) || 0,
      ratingCount: row.rating_count || 0,
      lastUsedAt: row.last_used_at,
      lastSuccessfulAt: row.last_successful_at,
      successRate: parseFloat(row.success_rate) || 0
    };
  }

  private mapRatingFromDb(row: any): FarmerRating {
    return {
      id: row.id,
      farmerId: row.farmer_id,
      userId: row.user_id,
      farmId: row.farm_id,
      rating: row.rating,
      review: row.review,
      isPublic: row.is_public,
      helpfulCount: row.helpful_count || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  // --------------------------------------------------------------------------
  // HEALTH CHECK
  // --------------------------------------------------------------------------

  async getHealthStatus(): Promise<{
    healthy: boolean;
    groupCount: number;
    statsCount: number;
    ratingsCount: number;
  }> {
    try {
      const [groups, stats, ratings] = await Promise.all([
        db.query('SELECT COUNT(*) FROM farmer_groups WHERE is_active = true'),
        db.query('SELECT COUNT(*) FROM farmer_stats'),
        db.query('SELECT COUNT(*) FROM farmer_ratings')
      ]);

      return {
        healthy: true,
        groupCount: parseInt(groups.rows[0]?.count) || 0,
        statsCount: parseInt(stats.rows[0]?.count) || 0,
        ratingsCount: parseInt(ratings.rows[0]?.count) || 0
      };
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Farmer group service health check failed', { error });
      return {
        healthy: false,
        groupCount: 0,
        statsCount: 0,
        ratingsCount: 0
      };
    }
  }
}

// Export singleton instance
export const farmerGroupService = FarmerGroupService.getInstance();
