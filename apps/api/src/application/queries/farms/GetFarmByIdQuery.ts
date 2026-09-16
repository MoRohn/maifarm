import { EventEmitter } from 'events';
import { QueryHandler, Query, QueryResult } from '../QueryHandler';
import { FarmRepository } from '../../../domain/farms/FarmRepository';
import { logger } from '../../../utils/logger';
import { z } from 'zod';

const GetFarmByIdCriteriaSchema = z.object({
  farmId: z.string().uuid(),
  includeAgents: z.boolean().optional().default(true),
  includeMetrics: z.boolean().optional().default(true)
});

export interface GetFarmByIdQuery extends Query {
  type: 'GET_FARM_BY_ID';
  criteria: z.infer<typeof GetFarmByIdCriteriaSchema>;
}

/**
 * Query handler for retrieving a single farm by ID
 */
export class GetFarmByIdQueryHandler extends QueryHandler<GetFarmByIdQuery> {
  private farmRepository: FarmRepository;

  constructor(eventEmitter: EventEmitter, farmRepository: FarmRepository) {
    super(eventEmitter, 300000); // 5 minute cache
    this.farmRepository = farmRepository;
  }

  protected async validate(query: GetFarmByIdQuery): Promise<void> {
    try {
      GetFarmByIdCriteriaSchema.parse(query.criteria);
    } catch (error) {
      throw new Error(`Invalid query criteria: ${error}`);
    }
  }

  protected async handle(query: GetFarmByIdQuery): Promise<QueryResult> {
    try {
      let farm;

      if (query.criteria.includeAgents) {
        // Get farm with agents in single query
        farm = await this.farmRepository.findWithAgents(query.criteria.farmId);
      } else {
        // Get farm without agents
        farm = await this.farmRepository.findById(query.criteria.farmId);
      }

      if (!farm) {
        return {
          success: false,
          error: new Error(`Farm ${query.criteria.farmId} not found`)
        };
      }

      // Enrich with additional metrics if requested
      if (query.criteria.includeMetrics && farm) {
        const metrics = await this.getEnrichedMetrics(query.criteria.farmId);
        farm = { ...farm, enrichedMetrics: metrics };
      }

      logger.debug(`[GetFarmByIdQuery] Farm ${query.criteria.farmId} retrieved`, {
        farmId: query.criteria.farmId,
        includeAgents: query.criteria.includeAgents,
        correlationId: query.metadata.correlationId
      });

      return {
        success: true,
        data: farm,
        meta: {
          cached: false
        }
      };

    } catch (error) {
      logger.error(`[GetFarmByIdQuery] Error retrieving farm`, {
        farmId: query.criteria.farmId,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId: query.metadata.correlationId
      });

      throw error;
    }
  }

  protected isCacheable(query: GetFarmByIdQuery): boolean {
    // Cache if not including real-time metrics
    return !query.criteria.includeMetrics;
  }

  protected getCacheKey(query: GetFarmByIdQuery): string {
    return `farm:${query.criteria.farmId}:agents:${query.criteria.includeAgents}`;
  }

  private async getEnrichedMetrics(farmId: string): Promise<any> {
    // Would normally fetch from metrics service
    return {
      cpuUsage: Math.random() * 100,
      memoryUsage: Math.random() * 100,
      activeAgents: Math.floor(Math.random() * 5),
      tasksCompleted: Math.floor(Math.random() * 100),
      uptime: Math.floor(Math.random() * 3600)
    };
  }
}