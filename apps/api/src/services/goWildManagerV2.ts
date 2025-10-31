import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { logger, LogCategory } from '../utils/logger';

interface ExplorationSession {
  id: string;
  farmId: string;
  status: 'active' | 'paused' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  discoveries: Discovery[];
  metrics: SessionMetrics;
}

interface Discovery {
  id: string;
  sessionId: string;
  timestamp: Date;
  type: 'insight' | 'pattern' | 'opportunity';
  value: 'low' | 'medium' | 'high';
  description: string;
  data?: any;
}

interface SessionMetrics {
  explorationDepth: number;
  areasExplored: number;
  discoveryCount: number;
  errorCount: number;
}

interface ExplorationConfig {
  maxDepth?: number;
  timeLimit?: number;
  focusAreas?: string[];
  constraints?: string[];
}

class GoWildManagerV2 extends EventEmitter {
  private static instance: GoWildManagerV2;
  private sessions = new Map<string, ExplorationSession>();
  private activeSessions = new Set<string>();

  private constructor() {
    super();
  }

  static getInstance(): GoWildManagerV2 {
    if (!this.instance) {
      this.instance = new GoWildManagerV2();
    }
    return this.instance;
  }

  async startExploration(farmId: string, config: ExplorationConfig = {}): Promise<ExplorationSession> {
    const session: ExplorationSession = {
      id: uuidv4(),
      farmId,
      status: 'active',
      startTime: new Date(),
      discoveries: [],
      metrics: {
        explorationDepth: 0,
        areasExplored: 0,
        discoveryCount: 0,
        errorCount: 0
      }
    };

    this.sessions.set(session.id, session);
    this.activeSessions.add(session.id);

    logger.info(LogCategory.GOWILD, `Started exploration session ${session.id} for farm ${farmId}`);

    // Simulate exploration progress
    setTimeout(() => {
      if (this.activeSessions.has(session.id)) {
        this.makeDiscovery(session.id, {
          type: 'insight',
          value: 'high',
          description: 'Discovered potential optimization opportunity'
        });
      }
    }, 5000);

    return session;
  }

  async stopExploration(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.status = 'completed';
    session.endTime = new Date();
    this.activeSessions.delete(sessionId);

    logger.info(LogCategory.GOWILD, `Stopped exploration session ${sessionId}`);
  }

  async pauseExploration(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'active') {
      return;
    }

    session.status = 'paused';
    this.activeSessions.delete(sessionId);

    logger.info(LogCategory.GOWILD, `Paused exploration session ${sessionId}`);
  }

  async resumeExploration(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'paused') {
      return;
    }

    session.status = 'active';
    this.activeSessions.add(sessionId);

    logger.info(LogCategory.GOWILD, `Resumed exploration session ${sessionId}`);
  }

  private makeDiscovery(sessionId: string, discoveryData: Partial<Discovery>): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    const discovery: Discovery = {
      id: uuidv4(),
      sessionId,
      timestamp: new Date(),
      type: discoveryData.type || 'insight',
      value: discoveryData.value || 'medium',
      description: discoveryData.description || 'New discovery',
      data: discoveryData.data
    };

    session.discoveries.push(discovery);
    session.metrics.discoveryCount++;

    // Emit events based on discovery value
    if (discovery.value === 'high') {
      this.emit('discovery:high-value', discovery);
    }

    logger.info(LogCategory.GOWILD, `Discovery made in session ${sessionId}: ${discovery.description}`);
  }

  getSession(sessionId: string): ExplorationSession | undefined {
    return this.sessions.get(sessionId);
  }

  getActiveSessions(): ExplorationSession[] {
    return Array.from(this.activeSessions)
      .map(id => this.sessions.get(id))
      .filter((session): session is ExplorationSession => session !== undefined);
  }

  getAllSessions(): ExplorationSession[] {
    return Array.from(this.sessions.values());
  }

  async stopAll(): Promise<void> {
    const activeSessionIds = Array.from(this.activeSessions);

    for (const sessionId of activeSessionIds) {
      await this.stopExploration(sessionId);
    }

    logger.info(LogCategory.GOWILD, 'Stopped all exploration sessions');
  }

  getSessionMetrics(sessionId: string): SessionMetrics | undefined {
    const session = this.sessions.get(sessionId);
    return session?.metrics;
  }

  getDiscoveries(sessionId: string): Discovery[] {
    const session = this.sessions.get(sessionId);
    return session?.discoveries || [];
  }
}

export const goWildManagerV2 = GoWildManagerV2.getInstance();
export { GoWildManagerV2, ExplorationSession, Discovery, SessionMetrics, ExplorationConfig };