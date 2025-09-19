import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { logger, LogCategory } from '../utils/logger';
import { goWildManagerV2 } from './goWildManagerV2';

// Wrapper around goWildManagerV2 for backward compatibility
class GoWildManager extends EventEmitter {
  private static instance: GoWildManager;

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

  async startExploration(farmId: string, config: any = {}) {
    logger.info(LogCategory.GOWILD, `Starting GoWild exploration for farm ${farmId}`);
    return goWildManagerV2.startExploration(farmId, config);
  }

  async stopExploration(sessionId: string) {
    logger.info(LogCategory.GOWILD, `Stopping GoWild exploration ${sessionId}`);
    return goWildManagerV2.stopExploration(sessionId);
  }

  getSession(sessionId: string) {
    return goWildManagerV2.getSession(sessionId);
  }

  getActiveSessions() {
    return goWildManagerV2.getActiveSessions();
  }

  async stopAll() {
    return goWildManagerV2.stopAll();
  }
}

export const goWildManager = GoWildManager.getInstance();
export { GoWildManager };