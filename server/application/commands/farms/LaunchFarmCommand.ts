import { EventEmitter } from 'events';
import { CommandHandler, Command, CommandResult, DomainEvent } from '../CommandHandler';
import { FarmRepository } from '../../../domain/farms/FarmRepository';
import { farmService } from '../../../domain/farms/FarmService';
import { tmuxSessionManager } from '../../../domain/agents/TmuxSessionManager';
import { logger } from '../../../utils/logger';
import { z } from 'zod';
import { getFarmAgentName, formatFarmAgentNameNoEmoji } from '../../../utils/farmAgentNames';

const LaunchFarmPayloadSchema = z.object({
  farmId: z.string().uuid(),
  numberOfAgents: z.number().min(1).max(20).default(3),
  fastLaunch: z.boolean().optional(),
  template: z.string().optional(),
  workspaceConfig: z.object({
    includeBarns: z.boolean().optional(),
    sharedWorkspace: z.boolean().optional()
  }).optional()
});

export interface LaunchFarmCommand extends Command {
  type: 'LAUNCH_FARM';
  payload: z.infer<typeof LaunchFarmPayloadSchema>;
}

/**
 * Command handler for launching a farm with agents
 */
export class LaunchFarmCommandHandler extends CommandHandler<LaunchFarmCommand> {
  private farmRepository: FarmRepository;

  constructor(eventEmitter: EventEmitter, farmRepository: FarmRepository) {
    super(eventEmitter);
    this.farmRepository = farmRepository;
  }

  protected async validate(command: LaunchFarmCommand): Promise<void> {
    try {
      LaunchFarmPayloadSchema.parse(command.payload);
    } catch (error) {
      throw new Error(`Invalid launch farm payload: ${error}`);
    }

    // Check if farm exists
    const farm = await this.farmRepository.findById(command.payload.farmId);
    if (!farm) {
      throw new Error(`Farm ${command.payload.farmId} not found`);
    }

    // Check if farm is in correct state
    if (farm.status !== 'idle' && farm.status !== 'stopped') {
      throw new Error(`Farm is in ${farm.status} state, cannot launch`);
    }

    // Check resource availability
    const activeSessions = await tmuxSessionManager.getActiveSessions();
    if (activeSessions.length >= 10) {
      throw new Error('Maximum number of active sessions reached (10)');
    }
  }

  protected async handle(command: LaunchFarmCommand): Promise<CommandResult> {
    const events: DomainEvent[] = [];
    const startTime = Date.now();

    try {
      // Update farm status to launching
      await this.farmRepository.updateStatus(command.payload.farmId, 'launching');

      // Create launching event
      events.push(
        this.createEvent(
          command.payload.farmId,
          'FARM_LAUNCHING',
          {
            farmId: command.payload.farmId,
            numberOfAgents: command.payload.numberOfAgents,
            fastLaunch: command.payload.fastLaunch,
            startTime
          },
          {
            correlationId: command.metadata.correlationId,
            userId: command.metadata.userId
          }
        )
      );

      // Launch farm via domain service
      await farmService.launchFarm(
        command.payload.farmId,
        command.payload.numberOfAgents
      );

      // Create tmux session
      const sessionName = await tmuxSessionManager.createSession(
        command.payload.farmId,
        command.payload.numberOfAgents
      );

      // Create agent creation events
      for (let i = 0; i < command.payload.numberOfAgents; i++) {
        // Generate farm animal name for the agent
        const farmAgent = getFarmAgentName('general', i);
        const agentName = formatFarmAgentNameNoEmoji(farmAgent);
        
        events.push(
          this.createEvent(
            command.payload.farmId,
            'AGENT_CREATED',
            {
              farmId: command.payload.farmId,
              agentIndex: i,
              agentName: agentName, // Use farm animal name instead of generic "Agent N"
              sessionName,
              paneIndex: i
            },
            {
              correlationId: command.metadata.correlationId,
              userId: command.metadata.userId
            }
          )
        );
      }

      // Update farm status to running
      await this.farmRepository.updateStatus(command.payload.farmId, 'running');

      // Create launched event
      events.push(
        this.createEvent(
          command.payload.farmId,
          'FARM_LAUNCHED',
          {
            farmId: command.payload.farmId,
            numberOfAgents: command.payload.numberOfAgents,
            sessionName,
            launchTime: Date.now() - startTime
          },
          {
            correlationId: command.metadata.correlationId,
            userId: command.metadata.userId
          }
        )
      );

      // Emit all events
      this.emitEvents(events);

      logger.info(`[LaunchFarmCommand] Farm ${command.payload.farmId} launched successfully`, {
        farmId: command.payload.farmId,
        agents: command.payload.numberOfAgents,
        sessionName,
        launchTime: Date.now() - startTime,
        correlationId: command.metadata.correlationId
      });

      return {
        success: true,
        data: {
          farmId: command.payload.farmId,
          sessionName,
          numberOfAgents: command.payload.numberOfAgents,
          launchTime: Date.now() - startTime
        },
        events
      };

    } catch (error) {
      // Update farm status to failed
      await this.farmRepository.updateStatus(command.payload.farmId, 'failed');

      // Emit failure event
      events.push(
        this.createEvent(
          command.payload.farmId,
          'FARM_LAUNCH_FAILED',
          {
            farmId: command.payload.farmId,
            error: error instanceof Error ? error.message : 'Unknown error',
            failureTime: Date.now() - startTime
          },
          {
            correlationId: command.metadata.correlationId,
            userId: command.metadata.userId
          }
        );

      this.emitEvents(events);
      throw error;
    }
  }
}