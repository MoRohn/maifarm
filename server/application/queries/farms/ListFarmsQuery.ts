import { EventEmitter } from 'events';
import { QueryHandler, Query, QueryResult } from '../QueryHandler';
import { FarmRepository } from '../../../domain/farms/FarmRepository';
import { logger } from '../../../utils/logger';
import { z } from 'zod';

const ListFarmsCriteriaSchema = z.object({
  status: z.enum(['idle', 'launching', 'running', 'active', 'completed', 'failed', 'stopped']).optional(),
  userId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  dateRange: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional()
  }).optional(),
  includeAgents: z.boolean().optional().default(false)
});

export interface ListFarmsQuery extends Query {
  type: 'LIST_FARMS';
  criteria: z.infer<typeof ListFarmsCriteriaSchema>;
}

/**
 * Query handler for listing farms with filters
 */
export class ListFarmsQueryHandler extends QueryHandler<ListFarmsQuery> {
  private farmRepository: FarmRepository;

  constructor(eventEmitter: EventEmitter, farmRepository: FarmRepository) {
    super(eventEmitter, 60000); // 1 minute cache
    this.farmRepository = farmRepository;
  }

  protected async validate(query: ListFarmsQuery): Promise<void> {
    try {
      ListFarmsCriteriaSchema.parse(query.criteria);
    } catch (error) {
      throw new Error(`Invalid query criteria: ${error}`);
    }

    // Validate date range if provided
    if (query.criteria.dateRange) {
      const { startDate, endDate } = query.criteria.dateRange;
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (start > end) {
          throw new Error('Start date must be before end date');
        }
      }
    }
  }

  protected async handle(query: ListFarmsQuery): Promise<QueryResult> {
    try {
      let farms;
      const options = {
        offset: query.options?.pagination?.offset,
        limit: query.options?.pagination?.limit || 50
      };

      // Handle different query scenarios
      if (query.criteria.includeAgents) {
        // Get farms with agents
        farms = await this.farmRepository.findAllWithAgents(
          {
            status: query.criteria.status as any,
            created_by: query.criteria.userId
          },
          options
        );
      } else if (query.criteria.tags && query.criteria.tags.length > 0) {
        // Get farms by tags
        farms = await this.farmRepository.findByTags(query.criteria.tags);
      } else if (query.criteria.dateRange) {
        // Get farms by date range
        const startDate = query.criteria.dateRange.startDate 
          ? new Date(query.criteria.dateRange.startDate)
          : new Date(0);
        const endDate = query.criteria.dateRange.endDate
          ? new Date(query.criteria.dateRange.endDate)
          : new Date();
        farms = await this.farmRepository.findByDateRange(startDate, endDate);
      } else {
        // Standard query with filters
        const criteria: any = {};
        if (query.criteria.status) criteria.status = query.criteria.status;
        if (query.criteria.userId) criteria.created_by = query.criteria.userId;
        
        farms = await this.farmRepository.findAll(criteria, options);
      }

      // Apply sorting if specified
      if (query.options?.sorting) {
        farms = this.sortFarms(farms, query.options.sorting);
      }

      // Apply projection if specified
      if (query.options?.projection) {
        farms = this.projectFields(farms, query.options.projection);
      }

      // Get total count for pagination
      const totalCount = await this.farmRepository.count(
        query.criteria.status || query.criteria.userId
          ? { 
              status: query.criteria.status as any,
              created_by: query.criteria.userId
            }
          : undefined
      );

      logger.debug(`[ListFarmsQuery] Retrieved ${farms.length} farms`, {
        criteria: query.criteria,
        correlationId: query.metadata.correlationId
      });

      return {
        success: true,
        data: farms,
        meta: {
          total: totalCount,
          page: query.options?.pagination 
            ? Math.floor((query.options.pagination.offset || 0) / (query.options.pagination.limit || 50)) + 1
            : 1,
          pageSize: query.options?.pagination?.limit || 50,
          cached: false
        }
      };

    } catch (error) {
      logger.error(`[ListFarmsQuery] Error listing farms`, {
        criteria: query.criteria,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId: query.metadata.correlationId
      });

      throw error;
    }
  }

  protected isCacheable(query: ListFarmsQuery): boolean {
    // Don't cache user-specific queries or real-time status queries
    return !query.criteria.userId && !query.criteria.status;
  }

  private sortFarms(farms: any[], sorting: { field: string; direction: 'ASC' | 'DESC' }): any[] {
    return [...farms].sort((a, b) => {
      const aVal = this.getNestedValue(a, sorting.field);
      const bVal = this.getNestedValue(b, sorting.field);
      
      if (aVal < bVal) return sorting.direction === 'ASC' ? -1 : 1;
      if (aVal > bVal) return sorting.direction === 'ASC' ? 1 : -1;
      return 0;
    });
  }

  private projectFields(farms: any[], fields: string[]): any[] {
    return farms.map(farm => {
      const projected: any = {};
      fields.forEach(field => {
        projected[field] = this.getNestedValue(farm, field);
      });
      return projected;
    });
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((curr, prop) => curr?.[prop], obj);
  }
}