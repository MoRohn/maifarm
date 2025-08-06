import { EventEmitter } from 'events';
import { pipelineOrchestrator } from './pipelineOrchestrator.js';
import { sharedStateManager } from './sharedStateManager.js';
import { logger } from '../utils/logger.js';

export class PipelineWebSocketIntegration extends EventEmitter {
  private io: any;

  constructor(io: any) {
    super();
    this.io = io;
    this.setupPipelineEventListeners();
    this.setupSharedStateListeners();
  }

  private setupPipelineEventListeners(): void {
    // Pipeline lifecycle events
    pipelineOrchestrator.on('pipeline:started', (data) => {
      logger.info('Broadcasting pipeline:started', data);
      this.io.emit('pipeline:started', {
        ...data,
        timestamp: new Date().toISOString()
      });
    });

    pipelineOrchestrator.on('pipeline:completed', (data) => {
      logger.info('Broadcasting pipeline:completed', data);
      this.io.emit('pipeline:completed', {
        ...data,
        timestamp: new Date().toISOString()
      });
    });

    pipelineOrchestrator.on('pipeline:failed', (data) => {
      logger.error('Broadcasting pipeline:failed', data);
      this.io.emit('pipeline:failed', {
        ...data,
        timestamp: new Date().toISOString()
      });
    });

    pipelineOrchestrator.on('pipeline:stopped', (data) => {
      logger.info('Broadcasting pipeline:stopped', data);
      this.io.emit('pipeline:stopped', {
        ...data,
        timestamp: new Date().toISOString()
      });
    });

    // Phase events
    pipelineOrchestrator.on('phase:started', (data) => {
      logger.info('Broadcasting phase:started', data);
      this.io.emit('phase:started', {
        ...data,
        timestamp: new Date().toISOString()
      });
    });

    pipelineOrchestrator.on('phase:completed', (data) => {
      logger.info('Broadcasting phase:completed', data);
      this.io.emit('phase:completed', {
        ...data,
        timestamp: new Date().toISOString()
      });
    });

    // Progress events
    pipelineOrchestrator.on('analysis:progress', (data) => {
      this.io.emit('analysis:progress', {
        ...data,
        timestamp: new Date().toISOString()
      });
    });

    // State updates
    pipelineOrchestrator.on('state:updated', (state) => {
      this.io.emit('pipeline:state_updated', {
        state,
        timestamp: new Date().toISOString()
      });
    });

    // Data collection events
    pipelineOrchestrator.on('data_collected', (data) => {
      logger.info('Broadcasting data_collected', data);
      this.io.emit('data_collected', {
        ...data,
        timestamp: new Date().toISOString()
      });
    });

    // Analysis events
    pipelineOrchestrator.on('analysis_complete', (data) => {
      logger.info('Broadcasting analysis_complete', data);
      this.io.emit('analysis_complete', {
        ...data,
        timestamp: new Date().toISOString()
      });
    });

    // Design events
    pipelineOrchestrator.on('design_ready', (data) => {
      logger.info('Broadcasting design_ready', data);
      this.io.emit('design_ready', {
        ...data,
        timestamp: new Date().toISOString()
      });
    });

    // Infographic complete
    pipelineOrchestrator.on('infographic_complete', (data) => {
      logger.info('Broadcasting infographic_complete', data);
      this.io.emit('infographic_complete', {
        ...data,
        timestamp: new Date().toISOString()
      });
    });

    // Rate limit events
    pipelineOrchestrator.on('rate_limit_exceeded', (data) => {
      logger.warn('Broadcasting rate_limit_exceeded', data);
      this.io.emit('rate_limit_exceeded', {
        ...data,
        timestamp: new Date().toISOString()
      });
    });

    // Fetch errors
    pipelineOrchestrator.on('fetch_error', (error) => {
      logger.error('Broadcasting fetch_error', error);
      this.io.emit('fetch_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    });
  }

  private setupSharedStateListeners(): void {
    // Agent events
    sharedStateManager.on('agent:registered', (agent) => {
      this.io.emit('agent:registered', {
        agent,
        timestamp: new Date().toISOString()
      });
    });

    sharedStateManager.on('agent:updated', (data) => {
      this.io.emit('agent:updated', {
        ...data,
        timestamp: new Date().toISOString()
      });
    });

    // Task events
    sharedStateManager.on('task:added', (task) => {
      this.io.emit('task:added', {
        task,
        timestamp: new Date().toISOString()
      });
    });

    sharedStateManager.on('task:updated', (data) => {
      this.io.emit('task:updated', {
        ...data,
        timestamp: new Date().toISOString()
      });
    });

    // Phase events
    sharedStateManager.on('phase:changed', (phase) => {
      this.io.emit('phase:changed', {
        phase,
        timestamp: new Date().toISOString()
      });
    });

    // Stage completion
    sharedStateManager.on('stage:completed', (data) => {
      this.io.emit('stage:completed', {
        ...data,
        timestamp: new Date().toISOString()
      });
    });

    // Resource events
    sharedStateManager.on('resource:locked', (data) => {
      this.io.emit('resource:locked', {
        ...data,
        timestamp: new Date().toISOString()
      });
    });

    sharedStateManager.on('resource:unlocked', (data) => {
      this.io.emit('resource:unlocked', {
        ...data,
        timestamp: new Date().toISOString()
      });
    });

    // External state updates
    sharedStateManager.on('state:external_update', (update) => {
      this.io.emit('state:external_update', {
        ...update,
        timestamp: new Date().toISOString()
      });
    });
  }

  // Method to manually broadcast pipeline status
  broadcastPipelineStatus(): void {
    const pipelineState = pipelineOrchestrator.getState();
    const sharedState = sharedStateManager.getProjectState();
    
    this.io.emit('pipeline:status', {
      pipeline: pipelineState,
      shared: sharedState,
      timestamp: new Date().toISOString()
    });
  }

  // Method to broadcast to specific rooms
  broadcastToAgents(event: string, data: any): void {
    this.io.to('agents').emit(event, {
      ...data,
      timestamp: new Date().toISOString()
    });
  }

  // Method to broadcast to dashboard clients
  broadcastToDashboard(event: string, data: any): void {
    this.io.to('dashboard').emit(event, {
      ...data,
      timestamp: new Date().toISOString()
    });
  }

  // Clean shutdown
  async shutdown(): Promise<void> {
    logger.info('Shutting down pipeline WebSocket integration');
    
    // Remove all listeners
    pipelineOrchestrator.removeAllListeners();
    sharedStateManager.removeAllListeners();
    this.removeAllListeners();
    
    // Notify connected clients
    this.io.emit('server:shutdown', {
      message: 'Server is shutting down',
      timestamp: new Date().toISOString()
    });
  }
}

export default PipelineWebSocketIntegration;