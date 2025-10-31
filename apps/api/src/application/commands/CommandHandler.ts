import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';

export interface Command {
  id: string;
  type: string;
  payload: any;
  metadata: {
    correlationId: string;
    userId?: string;
    timestamp: Date;
    source?: string;
  };
}

export interface CommandResult<T = any> {
  success: boolean;
  data?: T;
  error?: Error;
  events?: DomainEvent[];
}

export interface DomainEvent {
  id: string;
  aggregateId: string;
  type: string;
  payload: any;
  metadata: {
    correlationId: string;
    userId?: string;
    timestamp: Date;
    version?: number;
  };
}

/**
 * Base class for all command handlers
 * Implements the Command part of CQRS pattern
 */
export abstract class CommandHandler<TCommand extends Command, TResult = any> {
  protected eventEmitter: EventEmitter;

  constructor(eventEmitter: EventEmitter) {
    this.eventEmitter = eventEmitter;
  }

  /**
   * Main execution method - wraps handle with error handling and event emission
   */
  async execute(command: TCommand): Promise<CommandResult<TResult>> {
    const startTime = Date.now();
    const correlationId = command.metadata.correlationId || uuidv4();

    logger.info(`[CommandHandler] Executing command ${command.type}`, {
      correlationId,
      commandId: command.id,
      userId: command.metadata.userId
    });

    try {
      // Validate command
      await this.validate(command);

      // Execute business logic
      const result = await this.handle(command);

      // Emit success event
      this.eventEmitter.emit('command:executed', {
        command,
        result,
        duration: Date.now() - startTime,
        correlationId
      });

      logger.info(`[CommandHandler] Command ${command.type} executed successfully`, {
        correlationId,
        duration: Date.now() - startTime
      });

      return {
        success: true,
        data: result.data,
        events: result.events
      };

    } catch (error) {
      logger.error(`[CommandHandler] Command ${command.type} failed`, {
        correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      // Emit failure event
      this.eventEmitter.emit('command:failed', {
        command,
        error,
        duration: Date.now() - startTime,
        correlationId
      });

      return {
        success: false,
        error: error instanceof Error ? error : new Error('Unknown error')
      };
    }
  }

  /**
   * Validate command before execution
   */
  protected abstract validate(command: TCommand): Promise<void>;

  /**
   * Handle the actual command logic
   */
  protected abstract handle(command: TCommand): Promise<CommandResult<TResult>>;

  /**
   * Create a domain event
   */
  protected createEvent(
    aggregateId: string,
    type: string,
    payload: any,
    metadata?: Partial<DomainEvent['metadata']>
  ): DomainEvent {
    return {
      id: uuidv4(),
      aggregateId,
      type,
      payload,
      metadata: {
        correlationId: metadata?.correlationId || uuidv4(),
        userId: metadata?.userId,
        timestamp: new Date(),
        version: metadata?.version
      }
    };
  }

  /**
   * Emit domain events
   */
  protected emitEvents(events: DomainEvent[]): void {
    events.forEach(event => {
      this.eventEmitter.emit('domain:event', event);
      this.eventEmitter.emit(`domain:${event.type}`, event);
    });
  }
}

/**
 * Command Bus for routing commands to handlers
 */
export class CommandBus {
  private handlers: Map<string, CommandHandler<any, any>> = new Map();
  private eventEmitter: EventEmitter;
  private middleware: Array<(command: Command) => Promise<Command>> = [];

  constructor(eventEmitter: EventEmitter) {
    this.eventEmitter = eventEmitter;
  }

  /**
   * Register a command handler
   */
  register<T extends Command>(
    commandType: string,
    handler: CommandHandler<T, any>
  ): void {
    if (this.handlers.has(commandType)) {
      throw new Error(`Handler for command ${commandType} already registered`);
    }
    this.handlers.set(commandType, handler);
    logger.info(`[CommandBus] Registered handler for ${commandType}`);
  }

  /**
   * Add middleware for command processing
   */
  use(middleware: (command: Command) => Promise<Command>): void {
    this.middleware.push(middleware);
  }

  /**
   * Execute a command
   */
  async execute<T = any>(command: Command): Promise<CommandResult<T>> {
    // Apply middleware
    let processedCommand = command;
    for (const mw of this.middleware) {
      processedCommand = await mw(processedCommand);
    }

    // Find handler
    const handler = this.handlers.get(processedCommand.type);
    if (!handler) {
      logger.error(`[CommandBus] No handler registered for command ${processedCommand.type}`);
      return {
        success: false,
        error: new Error(`No handler for command type: ${processedCommand.type}`)
      };
    }

    // Execute command
    return handler.execute(processedCommand);
  }

  /**
   * Create a command
   */
  createCommand(
    type: string,
    payload: any,
    metadata?: Partial<Command['metadata']>
  ): Command {
    return {
      id: uuidv4(),
      type,
      payload,
      metadata: {
        correlationId: metadata?.correlationId || uuidv4(),
        userId: metadata?.userId,
        timestamp: new Date(),
        source: metadata?.source || 'api'
      }
    };
  }

  /**
   * Get registered command types
   */
  getRegisteredCommands(): string[] {
    return Array.from(this.handlers.keys());
  }
}