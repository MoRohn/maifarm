import { Server, Socket } from 'socket.io';
import { analyticsService } from '../services/unified/stateCoordinator.js';
import { farmService } from '../services/farmService.js';
import { agentService } from '../services/agentService.js';
import { logger } from '../utils/logger.js';

// FIX: Track interval ID for cleanup during server shutdown
let analyticsIntervalId: ReturnType<typeof setInterval> | null = null;

interface AnalyticsMetrics {
  farmCreationMetrics: {
    totalCreated: number;
    averageCreationTime: number;
    successRate: number;
    failureReasons: Record<string, number>;
  };
  goWildMetrics: {
    sessionsStarted: number;
    averageSessionDuration: number;
    tasksGenerated: number;
    creativityScore: number;
  };
  quickTaskMetrics: {
    tasksCompleted: number;
    averageCompletionTime: number;
    popularTaskTypes: Record<string, number>;
  };
  resourceMetrics: {
    cpuUsage: number;
    gpuUsage: number;
    memoryUsage: number;
    networkBandwidth: number;
  };
  costMetrics: {
    hourly: number;
    daily: number;
    monthly: number;
    perAgent: number;
  };
}

export const setupAnalyticsHandlers = (io: Server) => {
  const analyticsNamespace = io.of('/analytics');
  
  // Track connected analytics clients
  const analyticsClients = new Set<string>();
  
  analyticsNamespace.on('connection', (socket: Socket) => {
    logger.info(`Analytics client connected: ${socket.id}`);
    analyticsClients.add(socket.id);
    
    // Send initial analytics data on connection
    socket.emit('analytics:initial', {
      timestamp: new Date(),
      metrics: collectCurrentMetrics()
    });
    
    // Handle analytics subscription
    socket.on('analytics:subscribe', async (data: { 
      modes?: ('farmCreation' | 'goWild' | 'quickTask')[];
      interval?: number;
    }) => {
      const { modes = ['farmCreation', 'goWild', 'quickTask'], interval = 5000 } = data;
      
      logger.info(`Client ${socket.id} subscribed to analytics: ${modes.join(', ')}`);
      
      // Set up periodic updates
      const intervalId = setInterval(async () => {
        try {
          const metrics = await collectMetricsForModes(modes);
          socket.emit('analytics:update', {
            timestamp: new Date(),
            modes,
            metrics
          });
        } catch (error) {
          logger.error('Error collecting analytics metrics:', error);
        }
      }, interval);
      
      // Clean up on disconnect
      socket.on('disconnect', () => {
        clearInterval(intervalId);
        analyticsClients.delete(socket.id);
        logger.info(`Analytics client disconnected: ${socket.id}`);
      });
    });
    
    // Handle specific metric requests
    socket.on('analytics:request', async (data: {
      type: 'farmCreation' | 'goWild' | 'quickTask' | 'resource' | 'cost';
      timeRange?: { start: Date; end: Date };
    }) => {
      try {
        const metrics = await getSpecificMetrics(data.type, data.timeRange);
        socket.emit('analytics:response', {
          type: data.type,
          metrics,
          timestamp: new Date()
        });
      } catch (error) {
        socket.emit('analytics:error', {
          message: 'Failed to fetch metrics',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
    
    // Handle real-time event tracking
    socket.on('analytics:track', async (event: {
      type: string;
      category: 'farmCreation' | 'goWild' | 'quickTask';
      data: any;
    }) => {
      try {
        await analyticsService.trackEvent(event);
        
        // Broadcast update to all connected analytics clients
        analyticsNamespace.emit('analytics:event', {
          ...event,
          timestamp: new Date()
        });
      } catch (error) {
        logger.error('Error tracking analytics event:', error);
      }
    });
  });
  
  // Broadcast metrics to all analytics clients
  const broadcastMetrics = async () => {
    if (analyticsClients.size > 0) {
      try {
        const metrics = await collectCurrentMetrics();
        analyticsNamespace.emit('metrics:update', {
          timestamp: new Date(),
          metrics
        });
      } catch (error) {
        logger.error('Error broadcasting metrics:', error);
      }
    }
  };
  
  // FIX: Set up periodic broadcasts with stored interval ID for cleanup
  analyticsIntervalId = setInterval(broadcastMetrics, 5000);
};

/**
 * FIX: Cleanup function to stop analytics interval during server shutdown
 */
export const stopAnalyticsInterval = (): void => {
  if (analyticsIntervalId) {
    clearInterval(analyticsIntervalId);
    analyticsIntervalId = null;
    logger.info('Analytics interval stopped');
  }
};

// Collect current metrics from all sources
async function collectCurrentMetrics(): Promise<AnalyticsMetrics> {
  const farms = await farmService.getAllFarms();
  const agents = await agentService.getAllAgents();
  
  // Calculate farm creation metrics
  const farmCreationMetrics = {
    totalCreated: farms.length,
    averageCreationTime: calculateAverageCreationTime(farms),
    successRate: calculateSuccessRate(farms),
    failureReasons: analyzeFailureReasons(farms)
  };
  
  // Calculate Go Wild metrics (mock for now)
  const goWildMetrics = {
    sessionsStarted: Math.floor(Math.random() * 50) + 10,
    averageSessionDuration: Math.floor(Math.random() * 3600) + 600,
    tasksGenerated: Math.floor(Math.random() * 200) + 50,
    creativityScore: Math.random() * 10
  };
  
  // Calculate Quick Task metrics
  const quickTaskMetrics = {
    tasksCompleted: agents.filter(a => a.status === 'completed').length,
    averageCompletionTime: Math.floor(Math.random() * 300) + 60,
    popularTaskTypes: {
      'Code Generation': Math.floor(Math.random() * 100),
      'Bug Fixing': Math.floor(Math.random() * 80),
      'Documentation': Math.floor(Math.random() * 60),
      'Testing': Math.floor(Math.random() * 40)
    }
  };
  
  // Resource metrics (mock for now, should come from system monitoring)
  const resourceMetrics = {
    cpuUsage: Math.random() * 60 + 20,
    gpuUsage: Math.random() * 80 + 10,
    memoryUsage: Math.random() * 50 + 30,
    networkBandwidth: Math.random() * 100
  };
  
  // Cost metrics
  const activeAgents = agents.filter(a => a.status === 'running').length;
  const costMetrics = {
    hourly: activeAgents * 0.05,
    daily: activeAgents * 0.05 * 24,
    monthly: activeAgents * 0.05 * 24 * 30,
    perAgent: 0.05
  };
  
  return {
    farmCreationMetrics,
    goWildMetrics,
    quickTaskMetrics,
    resourceMetrics,
    costMetrics
  };
}

// Collect metrics for specific modes
async function collectMetricsForModes(modes: string[]) {
  const allMetrics = await collectCurrentMetrics();
  const result: Partial<AnalyticsMetrics> = {};
  
  if (modes.includes('farmCreation')) {
    result.farmCreationMetrics = allMetrics.farmCreationMetrics;
  }
  if (modes.includes('goWild')) {
    result.goWildMetrics = allMetrics.goWildMetrics;
  }
  if (modes.includes('quickTask')) {
    result.quickTaskMetrics = allMetrics.quickTaskMetrics;
  }
  
  // Always include resource and cost metrics
  result.resourceMetrics = allMetrics.resourceMetrics;
  result.costMetrics = allMetrics.costMetrics;
  
  return result;
}

// Get specific metrics
async function getSpecificMetrics(type: string, timeRange?: { start: Date; end: Date }) {
  const metrics = await collectCurrentMetrics();
  
  switch (type) {
    case 'farmCreation':
      return metrics.farmCreationMetrics;
    case 'goWild':
      return metrics.goWildMetrics;
    case 'quickTask':
      return metrics.quickTaskMetrics;
    case 'resource':
      return metrics.resourceMetrics;
    case 'cost':
      return metrics.costMetrics;
    default:
      return metrics;
  }
}

// Helper functions
function calculateAverageCreationTime(farms: any[]): number {
  if (farms.length === 0) return 0;
  const times = farms.map(f => {
    if (f.createdAt && f.startedAt) {
      return new Date(f.startedAt).getTime() - new Date(f.createdAt).getTime();
    }
    return 0;
  }).filter(t => t > 0);
  
  return times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length / 1000 : 0;
}

function calculateSuccessRate(farms: any[]): number {
  if (farms.length === 0) return 100;
  const successful = farms.filter(f => f.status === 'completed' || f.status === 'active').length;
  return (successful / farms.length) * 100;
}

function analyzeFailureReasons(farms: any[]): Record<string, number> {
  const reasons: Record<string, number> = {};
  farms.filter(f => f.status === 'failed').forEach(farm => {
    const reason = farm.error || 'Unknown';
    reasons[reason] = (reasons[reason] || 0) + 1;
  });
  return reasons;
}

export default setupAnalyticsHandlers;