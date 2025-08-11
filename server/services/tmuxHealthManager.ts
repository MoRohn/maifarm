import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { WebSocketManager } from '../websocket/websocketManager';

export interface TmuxSessionHealth {
  sessionName: string;
  exists: boolean;
  paneCount: number;
  responsivePanes: number;
  zombiePanes: number;
  lastHealthCheck: Date;
  uptime: number; // seconds
  status: 'healthy' | 'degraded' | 'critical' | 'dead';
  issues: string[];
}

export interface AgentHealth {
  agentId: number;
  paneId: string;
  isResponsive: boolean;
  lastResponseTime: number; // milliseconds
  consecutiveFailures: number;
  lastHeartbeat: Date;
  status: 'healthy' | 'slow' | 'unresponsive' | 'dead';
}

/**
 * TmuxHealthManager - Core service for monitoring tmux session and agent health
 * 
 * Responsibilities:
 * - Monitor tmux session existence and health
 * - Track individual agent responsiveness
 * - Detect zombie panes and sessions
 * - Provide recovery recommendations
 */
export class TmuxHealthManager extends EventEmitter {
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private monitoredSessions: Map<string, TmuxSessionHealth> = new Map();
  private agentHealth: Map<string, Map<number, AgentHealth>> = new Map(); // sessionName -> agentId -> health
  private websocketManager?: WebSocketManager;
  
  // Configuration
  private readonly HEALTH_CHECK_INTERVAL = 15000; // 15 seconds
  private readonly AGENT_RESPONSE_TIMEOUT = 5000; // 5 seconds
  private readonly MAX_CONSECUTIVE_FAILURES = 3;
  private readonly HEARTBEAT_COMMAND = 'echo "HEARTBEAT_$(date +%s)"';

  constructor(websocketManager?: WebSocketManager) {
    super();
    this.websocketManager = websocketManager;
    this.startHealthMonitoring();
    
    console.log('[TmuxHealthManager] Health monitoring started');
  }

  /**
   * Start monitoring a tmux session
   */
  async startMonitoring(sessionName: string, expectedAgents?: number): Promise<boolean> {
    console.log(`[TmuxHealthManager] Starting monitoring for session: ${sessionName}`);
    
    try {
      const initialHealth = await this.checkSessionHealth(sessionName);
      this.monitoredSessions.set(sessionName, initialHealth);
      
      // Initialize agent health tracking
      if (!this.agentHealth.has(sessionName)) {
        this.agentHealth.set(sessionName, new Map());
      }
      
      // Initialize health tracking for each agent/pane
      for (let i = 0; i < initialHealth.paneCount; i++) {
        const agentHealth: AgentHealth = {
          agentId: i,
          paneId: `${sessionName}:0.${i}`,
          isResponsive: true,
          lastResponseTime: 0,
          consecutiveFailures: 0,
          lastHeartbeat: new Date(),
          status: 'healthy'
        };
        this.agentHealth.get(sessionName)!.set(i, agentHealth);
      }
      
      console.log(`[TmuxHealthManager] Monitoring ${initialHealth.paneCount} agents in session ${sessionName}`);
      return true;
      
    } catch (error) {
      console.error(`[TmuxHealthManager] Failed to start monitoring session ${sessionName}:`, error);
      return false;
    }
  }

  /**
   * Stop monitoring a session
   */
  stopMonitoring(sessionName: string): void {
    this.monitoredSessions.delete(sessionName);
    this.agentHealth.delete(sessionName);
    console.log(`[TmuxHealthManager] Stopped monitoring session: ${sessionName}`);
  }

  /**
   * Get health status for a session
   */
  getSessionHealth(sessionName: string): TmuxSessionHealth | null {
    return this.monitoredSessions.get(sessionName) || null;
  }

  /**
   * Get health status for all agents in a session
   */
  getAgentHealth(sessionName: string): Map<number, AgentHealth> | null {
    return this.agentHealth.get(sessionName) || null;
  }

  /**
   * Get list of all monitored sessions
   */
  getMonitoredSessions(): string[] {
    return Array.from(this.monitoredSessions.keys());
  }

  /**
   * Check if session exists and get basic info
   */
  private async checkSessionExists(sessionName: string): Promise<{ exists: boolean; paneCount: number }> {
    return new Promise((resolve) => {
      const checkProcess = spawn('tmux', ['has-session', '-t', sessionName]);
      
      checkProcess.on('exit', async (code) => {
        if (code === 0) {
          // Session exists, get pane count
          const paneCount = await this.getPaneCount(sessionName);
          resolve({ exists: true, paneCount });
        } else {
          resolve({ exists: false, paneCount: 0 });
        }
      });
      
      checkProcess.on('error', () => {
        resolve({ exists: false, paneCount: 0 });
      });
    });
  }

  /**
   * Get number of panes in session
   */
  private async getPaneCount(sessionName: string): Promise<number> {
    return new Promise((resolve) => {
      const listProcess = spawn('tmux', ['list-panes', '-t', sessionName]);
      let output = '';
      
      listProcess.stdout?.on('data', (data) => {
        output += data.toString();
      });
      
      listProcess.on('exit', (code) => {
        if (code === 0) {
          const lines = output.trim().split('\n').filter(line => line.trim());
          resolve(lines.length);
        } else {
          resolve(0);
        }
      });
      
      listProcess.on('error', () => {
        resolve(0);
      });
    });
  }

  /**
   * Check comprehensive health of a session
   */
  private async checkSessionHealth(sessionName: string): Promise<TmuxSessionHealth> {
    const startTime = Date.now();
    const sessionInfo = await this.checkSessionExists(sessionName);
    
    let responsivePanes = 0;
    let zombiePanes = 0;
    const issues: string[] = [];

    if (sessionInfo.exists && sessionInfo.paneCount > 0) {
      // Check each pane's responsiveness
      for (let i = 0; i < sessionInfo.paneCount; i++) {
        const isResponsive = await this.checkAgentResponsiveness(sessionName, i);
        if (isResponsive) {
          responsivePanes++;
        } else {
          zombiePanes++;
          issues.push(`Agent ${i} is unresponsive`);
        }
      }
    }

    // Determine overall status
    let status: TmuxSessionHealth['status'];
    if (!sessionInfo.exists) {
      status = 'dead';
      issues.push('Session does not exist');
    } else if (responsivePanes === 0) {
      status = 'critical';
      issues.push('No responsive agents');
    } else if (zombiePanes > 0) {
      status = 'degraded';
      issues.push(`${zombiePanes} unresponsive agents`);
    } else {
      status = 'healthy';
    }

    // Get session uptime (approximate)
    const previousHealth = this.monitoredSessions.get(sessionName);
    const uptime = previousHealth ? 
      Math.floor((Date.now() - previousHealth.lastHealthCheck.getTime()) / 1000) + previousHealth.uptime :
      0;

    return {
      sessionName,
      exists: sessionInfo.exists,
      paneCount: sessionInfo.paneCount,
      responsivePanes,
      zombiePanes,
      lastHealthCheck: new Date(),
      uptime,
      status,
      issues
    };
  }

  /**
   * Check if an individual agent is responsive
   */
  private async checkAgentResponsiveness(sessionName: string, agentId: number): Promise<boolean> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const paneId = `${sessionName}:0.${agentId}`;
      
      // Send heartbeat command
      const sendProcess = spawn('tmux', [
        'send-keys', '-t', paneId, this.HEARTBEAT_COMMAND, 'C-m'
      ]);
      
      sendProcess.on('exit', (code) => {
        if (code !== 0) {
          resolve(false);
          return;
        }
        
        // Wait a moment then capture output to look for response
        setTimeout(async () => {
          try {
            const response = await this.captureAgentResponse(sessionName, agentId, startTime);
            const responseTime = Date.now() - startTime;
            
            // Update agent health
            const agentHealthMap = this.agentHealth.get(sessionName);
            if (agentHealthMap?.has(agentId)) {
              const health = agentHealthMap.get(agentId)!;
              health.isResponsive = response;
              health.lastResponseTime = responseTime;
              health.lastHeartbeat = new Date();
              
              if (response) {
                health.consecutiveFailures = 0;
                health.status = responseTime > 2000 ? 'slow' : 'healthy';
              } else {
                health.consecutiveFailures++;
                if (health.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
                  health.status = 'dead';
                } else {
                  health.status = 'unresponsive';
                }
              }
            }
            
            resolve(response);
          } catch (error) {
            resolve(false);
          }
        }, 1000);
      });
      
      // Timeout after configured time
      setTimeout(() => {
        resolve(false);
      }, this.AGENT_RESPONSE_TIMEOUT);
    });
  }

  /**
   * Capture and analyze agent response
   */
  private async captureAgentResponse(sessionName: string, agentId: number, afterTimestamp: number): Promise<boolean> {
    return new Promise((resolve) => {
      const paneId = `${sessionName}:0.${agentId}`;
      const captureProcess = spawn('tmux', [
        'capture-pane', '-t', paneId, '-p', '-S', '-10'
      ]);
      
      let output = '';
      captureProcess.stdout?.on('data', (data) => {
        output += data.toString();
      });
      
      captureProcess.on('exit', (code) => {
        if (code === 0) {
          // Look for heartbeat response in recent output
          const heartbeatPattern = /HEARTBEAT_(\d+)/g;
          let match;
          let foundRecentHeartbeat = false;
          
          while ((match = heartbeatPattern.exec(output)) !== null) {
            const heartbeatTime = parseInt(match[1]) * 1000; // Convert to milliseconds
            if (heartbeatTime >= afterTimestamp - 2000) { // Allow 2 second buffer
              foundRecentHeartbeat = true;
              break;
            }
          }
          
          resolve(foundRecentHeartbeat);
        } else {
          resolve(false);
        }
      });
      
      captureProcess.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Start periodic health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.runHealthChecks();
    }, this.HEALTH_CHECK_INTERVAL);
  }

  /**
   * Run health checks on all monitored sessions
   */
  private async runHealthChecks(): Promise<void> {
    const sessionNames = Array.from(this.monitoredSessions.keys());
    
    for (const sessionName of sessionNames) {
      try {
        const previousHealth = this.monitoredSessions.get(sessionName);
        const currentHealth = await this.checkSessionHealth(sessionName);
        
        // Update stored health
        this.monitoredSessions.set(sessionName, currentHealth);
        
        // Check for status changes
        if (previousHealth && previousHealth.status !== currentHealth.status) {
          console.log(`[TmuxHealthManager] Session ${sessionName} status changed: ${previousHealth.status} → ${currentHealth.status}`);
          
          this.emit('session:status_changed', {
            sessionName,
            previousStatus: previousHealth.status,
            currentStatus: currentHealth.status,
            health: currentHealth
          });
          
          // Broadcast via WebSocket
          if (this.websocketManager) {
            this.websocketManager.broadcast({
              type: 'tmux:health_change',
              payload: {
                sessionName,
                status: currentHealth.status,
                health: currentHealth
              }
            });
          }
        }
        
        // Emit health update
        this.emit('session:health_update', {
          sessionName,
          health: currentHealth
        });
        
      } catch (error) {
        console.error(`[TmuxHealthManager] Health check failed for session ${sessionName}:`, error);
      }
    }
  }

  /**
   * Get detailed health summary for all sessions
   */
  getHealthSummary(): {
    totalSessions: number;
    healthySessions: number;
    degradedSessions: number;
    criticalSessions: number;
    deadSessions: number;
    totalAgents: number;
    responsiveAgents: number;
    zombieAgents: number;
    sessions: TmuxSessionHealth[];
  } {
    const sessions = Array.from(this.monitoredSessions.values());
    
    return {
      totalSessions: sessions.length,
      healthySessions: sessions.filter(s => s.status === 'healthy').length,
      degradedSessions: sessions.filter(s => s.status === 'degraded').length,
      criticalSessions: sessions.filter(s => s.status === 'critical').length,
      deadSessions: sessions.filter(s => s.status === 'dead').length,
      totalAgents: sessions.reduce((sum, s) => sum + s.paneCount, 0),
      responsiveAgents: sessions.reduce((sum, s) => sum + s.responsivePanes, 0),
      zombieAgents: sessions.reduce((sum, s) => sum + s.zombiePanes, 0),
      sessions
    };
  }

  /**
   * Clean shutdown
   */
  shutdown(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    this.monitoredSessions.clear();
    this.agentHealth.clear();
    
    console.log('[TmuxHealthManager] Shutdown complete');
  }
}

// Export singleton instance
export const tmuxHealthManager = new TmuxHealthManager();