import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { logger, LogCategory } from '../utils/logger';
import { goWildManagerV2, ExplorationSession, Discovery, ExplorationConfig } from './goWildManagerV2';

// Wrapper around goWildManagerV2 for backward compatibility
class GoWildManager extends EventEmitter {
  private static instance: GoWildManager;
  private sessionsByFarmId = new Map<string, string>(); // farmId -> sessionId mapping

  private constructor() {
    super();
    // Forward events from V2
    goWildManagerV2.on('discovery:high-value', (discovery) => {
      this.emit('discovery:high-value', discovery);
    });
  }

  static getInstance(): GoWildManager {
    if (!this.instance) {
      this.instance = new GoWildManager();
    }
    return this.instance;
  }

  async startExploration(farmId: string, config: ExplorationConfig = {}): Promise<ExplorationSession> {
    logger.info(LogCategory.GOWILD, `Starting GoWild exploration for farm ${farmId}`);
    const session = await goWildManagerV2.startExploration(farmId, config);
    // Track farmId -> sessionId mapping
    this.sessionsByFarmId.set(farmId, session.id);
    return session;
  }

  async stopExploration(sessionId: string): Promise<void> {
    logger.info(LogCategory.GOWILD, `Stopping GoWild exploration ${sessionId}`);
    const session = goWildManagerV2.getSession(sessionId);
    if (session) {
      this.sessionsByFarmId.delete(session.farmId);
    }
    return goWildManagerV2.stopExploration(sessionId);
  }

  getSession(sessionId: string): ExplorationSession | undefined {
    return goWildManagerV2.getSession(sessionId);
  }

  // Get session by farm ID (fixes the route lookup bug)
  getSessionByFarmId(farmId: string): ExplorationSession | undefined {
    const sessionId = this.sessionsByFarmId.get(farmId);
    if (sessionId) {
      return goWildManagerV2.getSession(sessionId);
    }
    // Fallback: search all sessions for matching farmId
    const allSessions = goWildManagerV2.getAllSessions();
    return allSessions.find(s => s.farmId === farmId);
  }

  // Alias for getSessionByFarmId
  getSessionById(id: string): ExplorationSession | undefined {
    // Try as session ID first
    let session = goWildManagerV2.getSession(id);
    if (session) return session;
    // Try as farm ID
    return this.getSessionByFarmId(id);
  }

  getActiveSessions(): ExplorationSession[] {
    return goWildManagerV2.getActiveSessions();
  }

  // Alias for getActiveSessions (backward compatibility)
  listSessions(): ExplorationSession[] {
    return goWildManagerV2.getActiveSessions();
  }

  getAllSessions(): ExplorationSession[] {
    return goWildManagerV2.getAllSessions();
  }

  async stopAll(): Promise<void> {
    this.sessionsByFarmId.clear();
    return goWildManagerV2.stopAll();
  }

  // Alias for stopAll (backward compatibility)
  async emergencyStopAll(): Promise<void> {
    logger.warn(LogCategory.GOWILD, 'Emergency stop all GoWild sessions');
    return this.stopAll();
  }

  async pauseExploration(sessionId: string): Promise<void> {
    logger.info(LogCategory.GOWILD, `Pausing GoWild exploration ${sessionId}`);
    return goWildManagerV2.pauseExploration(sessionId);
  }

  async resumeExploration(sessionId: string): Promise<void> {
    logger.info(LogCategory.GOWILD, `Resuming GoWild exploration ${sessionId}`);
    return goWildManagerV2.resumeExploration(sessionId);
  }

  getDiscoveries(sessionId: string): Discovery[] {
    return goWildManagerV2.getDiscoveries(sessionId);
  }

  getSessionMetrics(sessionId: string) {
    return goWildManagerV2.getSessionMetrics(sessionId);
  }

  // Update session configuration (stub - V2 doesn't support this yet)
  async updateConfig(sessionId: string, config: Partial<ExplorationConfig>): Promise<ExplorationSession | undefined> {
    logger.info(LogCategory.GOWILD, `Updating config for session ${sessionId}`, config);
    // V2 doesn't support config updates, but we return the session anyway
    return goWildManagerV2.getSession(sessionId);
  }

  // Update boundaries (stub - V2 doesn't support this yet)
  async updateBoundaries(sessionId: string, boundaries: any): Promise<ExplorationSession | undefined> {
    logger.info(LogCategory.GOWILD, `Updating boundaries for session ${sessionId}`, boundaries);
    // V2 doesn't support boundary updates, but we return the session anyway
    return goWildManagerV2.getSession(sessionId);
  }

  // Save discovery (stub)
  async saveDiscovery(sessionId: string, discoveryId: string): Promise<Discovery | undefined> {
    logger.info(LogCategory.GOWILD, `Saving discovery ${discoveryId} from session ${sessionId}`);
    const discoveries = goWildManagerV2.getDiscoveries(sessionId);
    return discoveries.find(d => d.id === discoveryId);
  }

  // Rollback to checkpoint (stub)
  async rollbackToCheckpoint(sessionId: string, checkpointId: string): Promise<boolean> {
    logger.info(LogCategory.GOWILD, `Rollback to checkpoint ${checkpointId} for session ${sessionId}`);
    // Checkpoints not implemented in V2 - return false
    return false;
  }
}

export const goWildManager = GoWildManager.getInstance();
export { GoWildManager };