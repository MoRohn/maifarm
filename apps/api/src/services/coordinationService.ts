import { promises as fs } from 'fs';
import { EventEmitter } from 'events';
import { stateCoordinator, EntityType } from './unified/stateCoordinator';
import { logger, LogCategory } from '../utils/logger';
import { pathConfig } from '../config/paths';

interface AgentHealthInfo {
  agentId: string;
  status: string;
  lastSeen: Date | null;
  healthy: boolean;
  contextPercentage?: number;
  cycleTime?: number;
  lastHeartbeat?: Date | null;
  errorCount?: number;
}

interface CoordinationAgentRecord {
  id?: string;
  uid?: string;
  agent_id?: number | string;
  agentId?: number | string;
  agent_index?: number;
  pane?: string;
  paneId?: number;
  pane_index?: number;
  farm_id?: string;
  farmId?: string;
  displayName?: string;
  name?: string;
  status?: string;
  [key: string]: unknown;
}

class CoordinationService extends EventEmitter {
  private static instance: CoordinationService;

  private constructor() {
    super();
  }

  static getInstance(): CoordinationService {
    if (!this.instance) {
      this.instance = new CoordinationService();
    }
    return this.instance;
  }

  // Delegate to stateCoordinator for state management
  async updateAgentState(farmId: string, agentId: string | number, updates: any) {
    return stateCoordinator.updateAgentState(farmId, agentId, updates);
  }

  async updateFarmState(farmId: string, updates: any) {
    return stateCoordinator.updateFarmState(farmId, updates);
  }

  async getFarmState(farmId: string) {
    return stateCoordinator.getFarmState(farmId);
  }

  async getAgentState(farmId: string, agentId: string | number) {
    return stateCoordinator.getAgentState(farmId, agentId);
  }

  // Legacy compatibility methods
  async coordinateHarvest(farmId: string) {
    logger.info(LogCategory.HARVEST, `Coordinating harvest for farm ${farmId}`);
    return { success: true, farmId };
  }

  async getCoordinationStatus(farmId: string) {
    const farmState = await this.getFarmState(farmId);
    return {
      farmId,
      status: farmState?.status || 'unknown',
      agents: (farmState?.metadata?.agents as any[]) || []
    };
  }

  /**
   * Get coordination data for all farms
   */
  async getCoordinationData(): Promise<{ farms: any[]; agents: any[]; status: string }> {
    try {
      const farms = stateCoordinator.getEntitiesByType('farm' as EntityType);
      const agents = stateCoordinator.getEntitiesByType('agent' as EntityType);

      return {
        farms: farms.map(f => ({ id: f.id, status: f.status, ...f.metadata })),
        agents: agents.map(a => ({ id: a.id, status: a.status, ...a.metadata })),
        status: 'active'
      };
    } catch (error) {
      logger.error(LogCategory.COORDINATION, 'Error getting coordination data:', error);
      return { farms: [], agents: [], status: 'error' };
    }
  }

  // Add missing getActiveAgents method that multiple APIs are calling
  async getActiveAgents(farmId?: string) {
    try {
      if (farmId) {
        logger.debug(LogCategory.COORDINATION, `Fetching active agents from state for farm ${farmId}`);
        const snapshot = stateCoordinator.getFarmStateSnapshot(farmId);
        if (snapshot.agents.length > 0) {
          return snapshot.agents.map(agent => {
            const metadata = agent.metadata || {};
            const paneIndex = this.extractPaneIndex(metadata);
            return {
              id: agent.id,
              farmId,
              status: agent.status,
              displayName: metadata.displayName || metadata.name,
              name: metadata.name,
              paneIndex,
              paneId: metadata.paneId ?? metadata.pane_id ?? paneIndex,
              agentNumber: metadata.agentNumber ?? metadata.agent_number ?? (typeof paneIndex === 'number' ? paneIndex + 1 : undefined),
              metadata
            } as CoordinationAgentRecord;
          });
        }
      } else {
        logger.debug(LogCategory.COORDINATION, 'Fetching active agents for all farms from state');
        const agents = stateCoordinator.getEntitiesByType(EntityType.AGENT);
        if (agents.length > 0) {
          return agents.map(agent => {
            const metadata = agent.metadata || {};
            const paneIndex = this.extractPaneIndex(metadata);
            return {
              id: agent.id,
              farmId: metadata.farmId || metadata.farm_id,
              status: agent.status,
              displayName: metadata.displayName || metadata.name,
              name: metadata.name,
              paneIndex,
              paneId: metadata.paneId ?? metadata.pane_id ?? paneIndex,
              agentNumber: metadata.agentNumber ?? metadata.agent_number ?? (typeof paneIndex === 'number' ? paneIndex + 1 : undefined),
              metadata
            } as CoordinationAgentRecord;
          });
        }
      }
    } catch (error) {
      logger.error(LogCategory.COORDINATION, 'Error loading agents from state coordinator:', error);
    }

    // Fallback to legacy coordination files if state not populated yet
    try {
      const activeAgentsPath = pathConfig.getPath('ACTIVE_AGENTS_FILE');
      const fileContent = await fs.readFile(activeAgentsPath, 'utf8');
      const parsed = JSON.parse(fileContent);

      if (!Array.isArray(parsed)) {
        return [];
      }

      const filtered = (parsed as CoordinationAgentRecord[]).filter(agent => {
        if (!farmId) return true;
        const agentFarmId = agent.farm_id || agent.farmId;
        return !agentFarmId || agentFarmId === farmId;
      });

      return filtered.map(agent => {
        const paneIndex = this.extractPaneIndex(agent);
        return {
          ...agent,
          paneIndex,
          agentNumber: typeof paneIndex === 'number' ? paneIndex + 1 : undefined,
          name: agent.displayName || agent.name
        };
      });
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        logger.error(LogCategory.COORDINATION, 'Error getting active agents from legacy file:', error);
      }
      return [];
    }
  }

  private extractPaneIndex(agent: CoordinationAgentRecord): number | undefined {
    if (typeof agent.pane_index === 'number') {
      return agent.pane_index;
    }
    if (typeof agent.paneId === 'number') {
      return agent.paneId;
    }
    if (typeof agent.agent_index === 'number') {
      return agent.agent_index;
    }

    const tryParse = (value: unknown): number | undefined => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string') {
        const match = value.match(/(\d+)/g);
        if (match && match.length > 0) {
          const parsed = parseInt(match[match.length - 1], 10);
          if (!Number.isNaN(parsed)) {
            return parsed;
          }
        }
      }
      return undefined;
    };

    return (
      tryParse(agent.pane) ??
      tryParse(agent.id) ??
      tryParse(agent.uid) ??
      tryParse(agent.agent_id) ??
      tryParse(agent.agentId)
    );
  }

  // Add missing collectCompletedWork method that harvest handlers are calling
  async collectCompletedWork() {
    try {
      // Return empty array for now - this prevents the errors
      // In a real implementation, this would return completed work items
      logger.debug(LogCategory.COORDINATION, 'collectCompletedWork called - returning empty array');
      return [];
    } catch (error) {
      logger.error(LogCategory.COORDINATION, 'Error collecting completed work:', error);
      return [];
    }
  }

  /**
   * Get health summary for the entire system
   */
  getHealthSummary(): { totalAgents: number; healthyAgents: number; unhealthyAgents: number; status: string } {
    try {
      const agents = stateCoordinator.getEntitiesByType('agent' as EntityType);
      const healthy = agents.filter(a => a.status === 'active' || a.status === 'running').length;

      return {
        totalAgents: agents.length,
        healthyAgents: healthy,
        unhealthyAgents: agents.length - healthy,
        status: healthy > 0 ? 'healthy' : (agents.length > 0 ? 'degraded' : 'unknown')
      };
    } catch (error) {
      logger.error(LogCategory.COORDINATION, 'Error getting health summary:', error);
      return { totalAgents: 0, healthyAgents: 0, unhealthyAgents: 0, status: 'error' };
    }
  }

  /**
   * Get health status for all agents
   */
  async getAllAgentHealth(): Promise<AgentHealthInfo[]> {
    try {
      const agents = stateCoordinator.getEntitiesByType('agent' as EntityType);

      return agents.map(agent => ({
        agentId: agent.id,
        status: agent.status || 'unknown',
        lastSeen: agent.updatedAt || null,
        healthy: agent.status === 'active' || agent.status === 'running',
        contextPercentage: (agent.metadata as any)?.contextPercentage ?? 0,
        cycleTime: (agent.metadata as any)?.cycleTime ?? 0,
        lastHeartbeat: (agent.metadata as any)?.lastHeartbeat ?? null,
        errorCount: (agent.metadata as any)?.errorCount ?? 0
      }));
    } catch (error) {
      logger.error(LogCategory.COORDINATION, 'Error getting all agent health:', error);
      return [];
    }
  }

  /**
   * Get health status for a specific agent
   */
  getAgentHealth(agentId: string): { status: string; lastSeen: Date | null; healthy: boolean } {
    try {
      // Try to find the agent in the state coordinator
      const entity = stateCoordinator.getEntity(agentId);
      if (entity) {
        return {
          status: entity.status || 'unknown',
          lastSeen: entity.updatedAt || null,
          healthy: entity.status === 'active' || entity.status === 'running'
        };
      }

      // Return default health status if agent not found
      return {
        status: 'unknown',
        lastSeen: null,
        healthy: false
      };
    } catch (error) {
      logger.error(LogCategory.COORDINATION, `Error getting agent health for ${agentId}:`, error);
      return {
        status: 'error',
        lastSeen: null,
        healthy: false
      };
    }
  }
}

export const coordinationService = CoordinationService.getInstance();
export { CoordinationService };
