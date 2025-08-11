import { Server, Socket } from 'socket.io';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { pathConfig } from '../config/paths';

interface AnalyticsUpdate {
  cpu: number;
  memory: number;
  gpu?: number;
  activeAgents?: number;
  tasks?: {
    total: number;
    completed: number;
    failed: number;
  };
  timestamp: Date;
}

export class AnalyticsWebSocketHandler {
  private io: Server;
  private metricsInterval: NodeJS.Timeout | null = null;
  private claudeWatcher: fs.FSWatcher | null = null;

  constructor(io: Server) {
    this.io = io;
    this.initialize();
  }

  private initialize() {
    // Start monitoring system metrics
    this.startMetricsMonitoring();
    
    // Watch Claude coordination file for changes
    this.watchClaudeCoordination();
    
    // Handle client connections
    this.io.on('connection', (socket: Socket) => {
      console.log(`Analytics client connected: ${socket.id}`);
      
      // Send initial metrics
      this.sendCurrentMetrics(socket);
      
      // Handle analytics-specific events
      socket.on('analytics:subscribe', () => {
        socket.join('analytics');
        console.log(`Client ${socket.id} subscribed to analytics`);
      });
      
      socket.on('analytics:unsubscribe', () => {
        socket.leave('analytics');
        console.log(`Client ${socket.id} unsubscribed from analytics`);
      });
      
      socket.on('disconnect', () => {
        console.log(`Analytics client disconnected: ${socket.id}`);
      });
    });
  }

  private startMetricsMonitoring() {
    // Send metrics every 5 seconds
    this.metricsInterval = setInterval(() => {
      this.broadcastMetrics();
    }, 5000);
  }

  private async broadcastMetrics() {
    const metrics = await this.collectMetrics();
    
    // Broadcast to all clients in analytics room
    this.io.to('analytics').emit('metrics:update', {
      type: 'metrics:update',
      payload: metrics,
      timestamp: new Date()
    });
  }

  private async sendCurrentMetrics(socket: Socket) {
    const metrics = await this.collectMetrics();
    socket.emit('metrics:update', {
      type: 'metrics:update',
      payload: metrics,
      timestamp: new Date()
    });
  }

  private async collectMetrics(): Promise<AnalyticsUpdate> {
    // Get CPU usage
    const cpus = os.cpus();
    const totalIdle = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
    const totalTick = cpus.reduce((acc, cpu) => 
      acc + cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq, 0
    );
    const cpuUsage = 100 - Math.floor(100 * totalIdle / totalTick);
    
    // Get memory usage
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memoryUsage = Math.round(((totalMem - freeMem) / totalMem) * 100);
    
    // Get Claude metrics if available
    let claudeMetrics: any = null;
    const claudeCoordPath = '/tmp/claude_coordination/active_agents.json';
    
    if (fs.existsSync(claudeCoordPath)) {
      try {
        const data = fs.readFileSync(claudeCoordPath, 'utf-8');
        const agentsObj = JSON.parse(data);
        
        // Convert object to array of values
        const agents = Object.values(agentsObj);
        
        claudeMetrics = {
          activeAgents: agents.length,
          tasks: {
            total: agents.reduce((sum: number, agent: any) => 
              sum + (agent.tasks_total || 0), 0),
            completed: agents.reduce((sum: number, agent: any) => 
              sum + (agent.tasks_completed || 0), 0),
            failed: agents.reduce((sum: number, agent: any) => 
              sum + (agent.tasks_failed || 0), 0)
          }
        };
      } catch (error) {
        console.error('Error reading Claude coordination file:', error);
      }
    }
    
    return {
      cpu: cpuUsage,
      memory: memoryUsage,
      gpu: 0, // Would need GPU monitoring library
      activeAgents: claudeMetrics?.activeAgents,
      tasks: claudeMetrics?.tasks,
      timestamp: new Date()
    };
  }

  private watchClaudeCoordination() {
    const claudeCoordPath = pathConfig.getPath('ACTIVE_AGENTS_FILE');
    const dir = path.dirname(claudeCoordPath);
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Create empty file if it doesn't exist
    if (!fs.existsSync(claudeCoordPath)) {
      fs.writeFileSync(claudeCoordPath, '[]');
    }
    
    // Watch for changes
    this.claudeWatcher = fs.watch(claudeCoordPath, (eventType) => {
      if (eventType === 'change') {
        console.log('Claude coordination file changed, broadcasting update');
        this.broadcastMetrics();
      }
    });
  }

  public sendFarmMetrics(farmId: string, metrics: any) {
    this.io.to('analytics').emit('farm:metrics', {
      type: 'farm:metrics',
      farmId,
      payload: metrics,
      timestamp: new Date()
    });
  }

  public sendAgentMetrics(agentId: string, metrics: any) {
    this.io.to('analytics').emit('agent:metrics', {
      type: 'agent:metrics',
      agentId,
      payload: metrics,
      timestamp: new Date()
    });
  }

  public sendTaskMetrics(taskId: string, metrics: any) {
    this.io.to('analytics').emit('task:metrics', {
      type: 'task:metrics',
      taskId,
      payload: metrics,
      timestamp: new Date()
    });
  }

  public sendHarvestMetrics(harvestId: string, metrics: any) {
    this.io.to('analytics').emit('harvest:metrics', {
      type: 'harvest:metrics',
      harvestId,
      payload: metrics,
      timestamp: new Date()
    });
  }

  public cleanup() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
    
    if (this.claudeWatcher) {
      this.claudeWatcher.close();
      this.claudeWatcher = null;
    }
  }
}

export default AnalyticsWebSocketHandler;