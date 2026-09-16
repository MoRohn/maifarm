import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { CommandHandler, Command, CommandResult, DomainEvent } from '../CommandHandler';
import { FarmRepository } from '../../../domain/farms/FarmRepository';
import { farmService } from '../../../domain/farms/FarmService';
import { logger } from '../../../utils/logger';
import { z } from 'zod';

const CreateFarmPayloadSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  provider: z.enum(['claude', 'openai', 'llama', 'ollama']),
  seedId: z.string().uuid().optional(),
  config: z.object({
    timeout: z.number().min(60).max(86400).optional(),
    maxAgents: z.number().min(1).max(20).optional(),
    resources: z.object({
      cpu: z.number().optional(),
      memory: z.number().optional(),
      gpu: z.boolean().optional()
    }).optional()
  }).optional(),
  tags: z.array(z.string()).optional(),
  userId: z.string()
});

export interface CreateFarmCommand extends Command {
  type: 'CREATE_FARM';
  payload: z.infer<typeof CreateFarmPayloadSchema>;
}

/**
 * Command handler for creating a new farm
 */
export class CreateFarmCommandHandler extends CommandHandler<CreateFarmCommand> {
  private farmRepository: FarmRepository;

  constructor(eventEmitter: EventEmitter, farmRepository: FarmRepository) {
    super(eventEmitter);
    this.farmRepository = farmRepository;
  }

  protected async validate(command: CreateFarmCommand): Promise<void> {
    try {
      CreateFarmPayloadSchema.parse(command.payload);
    } catch (error) {
      throw new Error(`Invalid farm creation payload: ${error}`);
    }

    // Check if user has permission to create farms
    const activeFarms = await this.farmRepository.findAll(
      { 
        created_by: command.payload.userId,
        status: 'running' as any
      }
    );

    if (activeFarms.length >= 5) {
      throw new Error('User has reached maximum number of active farms (5)');
    }

    // Validate provider availability
    const availableProviders = process.env.AI_PROVIDER?.split(',') || ['claude'];
    if (!availableProviders.includes(command.payload.provider)) {
      throw new Error(`Provider ${command.payload.provider} is not available`);
    }
  }

  protected async handle(command: CreateFarmCommand): Promise<CommandResult> {
    const farmId = uuidv4();
    const events: DomainEvent[] = [];

    try {
      // Create farm via domain service
      const farm = await farmService.createFarm({
        name: command.payload.name,
        description: command.payload.description || '',
        provider: command.payload.provider,
        seedId: command.payload.seedId,
        config: command.payload.config,
        tags: command.payload.tags || [],
        userId: command.payload.userId
      });

      // Create events
      events.push(
        this.createEvent(
          farm.id,
          'FARM_CREATED',
          {
            farmId: farm.id,
            name: farm.name,
            provider: command.payload.provider,
            userId: command.payload.userId,
            config: command.payload.config
          },
          {
            correlationId: command.metadata.correlationId,
            userId: command.metadata.userId
          }
        )
      );

      // If auto-launch is enabled, create launch event
      if (command.payload.config?.autoLaunch) {
        events.push(
          this.createEvent(
            farm.id,
            'FARM_LAUNCH_REQUESTED',
            {
              farmId: farm.id,
              agentCount: command.payload.config.maxAgents || 3
            },
            {
              correlationId: command.metadata.correlationId,
              userId: command.metadata.userId
            }
          )
        );
      }

      // Emit all events
      this.emitEvents(events);

      logger.info(`[CreateFarmCommand] Farm ${farm.id} created successfully`, {
        farmId: farm.id,
        name: farm.name,
        correlationId: command.metadata.correlationId
      });

      return {
        success: true,
        data: farm,
        events
      };

    } catch (error) {
      // Emit failure event
      events.push(
        this.createEvent(
          farmId,
          'FARM_CREATION_FAILED',
          {
            error: error instanceof Error ? error.message : 'Unknown error',
            payload: command.payload
          },
          {
            correlationId: command.metadata.correlationId,
            userId: command.metadata.userId
          }
        )
      );

      this.emitEvents(events);
      throw error;
    }
  }
}