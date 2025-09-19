import { 
  RollbackRequest, 
  RollbackResult, 
  ExplorationSnapshot,
  ExplorationEvent
} from '@/types/safety';
import { snapshotService } from './explorationSnapshot';
import { goWildService } from './goWildService';
import { auditService } from './audit';
import { toast } from 'react-hot-toast';

export class RollbackManager {
  private static instance: RollbackManager;
  private activeRollbacks: Map<string, RollbackResult> = new Map();
  
  private constructor() {}

  static getInstance(): RollbackManager {
    if (!RollbackManager.instance) {
      RollbackManager.instance = new RollbackManager();
    }
    return RollbackManager.instance;
  }

  async initiateRollback(request: RollbackRequest): Promise<RollbackResult> {
    const rollbackId = this.generateRollbackId();
    const startTime = new Date();

    try {
      // Validate snapshot exists
      const snapshot = await snapshotService.restoreSnapshot(request.snapshotId);
      
      // Create rollback result object
      const result: RollbackResult = {
        id: rollbackId,
        snapshotId: request.snapshotId,
        status: 'success',
        startedAt: startTime,
        completedAt: new Date(),
        changes: {
          agents: { added: 0, removed: 0, modified: 0 },
          tasks: { cancelled: 0, restored: 0 },
          resources: { released: 0, allocated: 0 },
          discoveries: { preserved: 0, removed: 0 }
        },
        errors: []
      };

      this.activeRollbacks.set(rollbackId, result);

      // If preview mode, just analyze changes
      if (request.preview) {
        return await this.previewRollback(snapshot, request);
      }

      // Perform actual rollback
      return await this.executeRollback(snapshot, request, result);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      const failedResult: RollbackResult = {
        id: rollbackId,
        snapshotId: request.snapshotId,
        status: 'failed',
        startedAt: startTime,
        completedAt: new Date(),
        changes: {
          agents: { added: 0, removed: 0, modified: 0 },
          tasks: { cancelled: 0, restored: 0 },
          resources: { released: 0, allocated: 0 },
          discoveries: { preserved: 0, removed: 0 }
        },
        errors: [errorMessage]
      };

      this.activeRollbacks.set(rollbackId, failedResult);
      throw error;
    }
  }

  async previewRollback(
    snapshot: ExplorationSnapshot,
    request: RollbackRequest
  ): Promise<RollbackResult> {
    // Get current state to compare
    const currentState = await this.getCurrentState(snapshot.farmId);
    
    // Calculate what would change
    const changes = await this.calculateChanges(snapshot.state, currentState, request);
    
    return {
      id: this.generateRollbackId(),
      snapshotId: request.snapshotId,
      status: 'success',
      startedAt: new Date(),
      completedAt: new Date(),
      changes
    };
  }

  private async executeRollback(
    snapshot: ExplorationSnapshot,
    request: RollbackRequest,
    result: RollbackResult
  ): Promise<RollbackResult> {
    const components = request.components || ['agents', 'tasks', 'resources', 'discoveries'];
    
    try {
      // Pause exploration if active
      await goWildService.pauseExploration(snapshot.sessionId);
      
      // Create safety snapshot before rollback
      await snapshotService.createSnapshot(
        await goWildService.getSession(snapshot.sessionId),
        'checkpoint',
        `Pre-rollback safety snapshot for ${request.reason}`
      );

      // Execute rollback for each component
      for (const component of components) {
        switch (component) {
          case 'agents':
            result.changes.agents = await this.rollbackAgents(snapshot);
            break;
          case 'tasks':
            result.changes.tasks = await this.rollbackTasks(snapshot);
            break;
          case 'resources':
            result.changes.resources = await this.rollbackResources(snapshot);
            break;
          case 'discoveries':
            result.changes.discoveries = await this.rollbackDiscoveries(snapshot);
            break;
        }
      }

      // Log the rollback
      await this.logRollbackEvent(snapshot, request, result);
      
      // Update result
      result.status = 'success';
      result.completedAt = new Date();
      
      // Notify success
      toast.success(`Rollback completed successfully`);
      
    } catch (error) {
      result.status = 'partial';
      result.errors = result.errors || [];
      result.errors.push(error instanceof Error ? error.message : 'Rollback error');
      
      toast.error(`Rollback partially failed: ${result.errors.join(', ')}`);
    }

    return result;
  }

  private async rollbackAgents(snapshot: ExplorationSnapshot): Promise<{
    added: number;
    removed: number;
    modified: number;
  }> {
    // Implementation would interact with actual agent service
    // This is a placeholder showing the structure
    const changes = { added: 0, removed: 0, modified: 0 };
    
    try {
      // Compare current agents with snapshot
      const currentAgents = await this.getCurrentAgents(snapshot.farmId);
      const snapshotAgents = snapshot.state.agents;
      
      // Terminate agents not in snapshot
      for (const agent of currentAgents) {
        if (!snapshotAgents.find(a => a.id === agent.id)) {
          // await agentService.terminate(agent.id);
          changes.removed++;
        }
      }
      
      // Restore agents from snapshot not currently active
      for (const agent of snapshotAgents) {
        if (!currentAgents.find(a => a.id === agent.id)) {
          // await agentService.spawn(agent);
          changes.added++;
        }
      }
      
      // Update modified agents
      for (const agent of snapshotAgents) {
        const current = currentAgents.find(a => a.id === agent.id);
        if (current && this.hasAgentChanged(current, agent)) {
          // await agentService.update(agent);
          changes.modified++;
        }
      }
      
    } catch (error) {
      console.error('Failed to rollback agents:', error);
      throw error;
    }
    
    return changes;
  }

  private async rollbackTasks(snapshot: ExplorationSnapshot): Promise<{
    cancelled: number;
    restored: number;
  }> {
    // Cancel current tasks and restore snapshot tasks
    const changes = { cancelled: 0, restored: 0 };
    
    // Implementation would interact with task service
    // Placeholder for structure
    
    return changes;
  }

  private async rollbackResources(snapshot: ExplorationSnapshot): Promise<{
    released: number;
    allocated: number;
  }> {
    // Release current resources and allocate snapshot resources
    const changes = { released: 0, allocated: 0 };
    
    // Implementation would interact with resource manager
    // Placeholder for structure
    
    return changes;
  }

  private async rollbackDiscoveries(snapshot: ExplorationSnapshot): Promise<{
    preserved: number;
    removed: number;
  }> {
    // Handle discoveries based on rollback policy
    const changes = { preserved: 0, removed: 0 };
    
    // Implementation would determine which discoveries to keep/remove
    // Placeholder for structure
    
    return changes;
  }

  private async getCurrentState(farmId: string): Promise<any> {
    // Get current system state for comparison
    // Would integrate with actual services
    return {
      agents: [],
      tasks: [],
      resources: {},
      discoveries: []
    };
  }

  private async getCurrentAgents(farmId: string): Promise<any[]> {
    // Mock implementation - would get from agent service
    return [];
  }

  private hasAgentChanged(current: any, snapshot: any): boolean {
    // Compare agent states
    return JSON.stringify(current) !== JSON.stringify(snapshot);
  }

  private async calculateChanges(
    snapshotState: any,
    currentState: any,
    request: RollbackRequest
  ): Promise<RollbackResult['changes']> {
    // Calculate what would change in a rollback
    return {
      agents: { added: 0, removed: 0, modified: 0 },
      tasks: { cancelled: 0, restored: 0 },
      resources: { released: 0, allocated: 0 },
      discoveries: { preserved: 0, removed: 0 }
    };
  }

  private async logRollbackEvent(
    snapshot: ExplorationSnapshot,
    request: RollbackRequest,
    result: RollbackResult
  ): Promise<void> {
    const event: ExplorationEvent = {
      id: this.generateEventId(),
      timestamp: new Date(),
      type: 'rollback',
      severity: result.status === 'success' ? 'info' : 'error',
      title: `Rollback to snapshot ${snapshot.id.substring(0, 8)}`,
      description: request.reason,
      metadata: {
        rollbackId: result.id,
        snapshotId: snapshot.id,
        components: request.components,
        changes: result.changes,
        errors: result.errors
      }
    };

    // Log to audit service
    await auditService.log({
      action: 'exploration.rollback',
      userId: 'system',
      farmId: snapshot.farmId,
      metadata: event.metadata,
      timestamp: new Date()
    });
  }

  private generateRollbackId(): string {
    return `rollback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getRollbackStatus(rollbackId: string): RollbackResult | undefined {
    return this.activeRollbacks.get(rollbackId);
  }

  async getRollbackHistory(farmId: string): Promise<RollbackResult[]> {
    // Would retrieve from persistent storage
    return Array.from(this.activeRollbacks.values())
      .filter(r => r.snapshotId.includes(farmId));
  }
}

export const rollbackManager = RollbackManager.getInstance();