/**
 * Unified Metrics Service
 * Single source of truth for all metrics calculations and real-time updates
 */

import { EventEmitter } from 'events';
import { 
  CoreMetrics, 
  ExtendedMetrics, 
  FarmMetricsUnified,
  AgentMetricsUnified,
  DashboardMetrics,
  MetricUpdateEvent,
  MetricValue,
  MetricName,
  MetricUnit,
  formatMetricValue,
  getMetricUnit
} from '../types/metrics';
import { apiClient } from './apiClient';
import { Farm, Agent } from '../types';

class UnifiedMetricsService extends EventEmitter {
  private static instance: UnifiedMetricsService;
  private metrics: ExtendedMetrics;
  private farmMetrics: Map<string, FarmMetricsUnified>;
  private agentMetrics: Map<string, AgentMetricsUnified>;
  private uniqueAgentIds: Set<string>;
  private updateInterval: NodeJS.Timeout | null = null;
  private websocketConnected: boolean = false;
  private metricsVersion: number = 0;
  private cache: Map<string, { value: any; timestamp: number; ttl: number }> = new Map();
  private readonly CACHE_TTL = 5000; // 5 seconds
  private readonly STALE_THRESHOLD = 60000; // 1 minute

  private constructor() {
    super();
    this.metrics = this.getDefaultMetrics();
    this.farmMetrics = new Map();
    this.agentMetrics = new Map();
    this.uniqueAgentIds = new Set();
  }

  static getInstance(): UnifiedMetricsService {
    if (!UnifiedMetricsService.instance) {
      UnifiedMetricsService.instance = new UnifiedMetricsService();
    }
    return UnifiedMetricsService.instance;
  }

  /**
   * Get default metrics structure
   */
  private getDefaultMetrics(): ExtendedMetrics {
    return {
      // Farm metrics
      totalFarms: 0,
      activeFarms: 0,
      stoppedFarms: 0,
      failedFarms: 0,
      
      // Agent metrics
      totalAgents: 0,
      activeAgents: 0,
      idleAgents: 0,
      uniqueAgents: 0,
      
      // File generation metrics
      totalFiles: 0,
      filesGenerated: 0,
      filesFailed: 0,
      filesPending: 0,
      successRate: 100, // Percentage of successful farms
      
      // File categorization
      filesText: 0,
      filesCode: 0,
      filesImage: 0,
      filesData: 0,
      filesConfig: 0,
      filesOther: 0,
      
      // Legacy task metrics for backward compatibility
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      pendingTasks: 0,
      
      // Resource metrics
      cpuUsage: 0,
      memoryUsage: 0,
      gpuUsage: 0,
      diskUsage: 0,
      networkUsage: 0,
      
      // Performance metrics
      avgResponseTime: 0,
      throughput: 0,
      errorRate: 0,
      uptime: 100,
      
      // Cost metrics
      totalCost: 0,
      apiCost: 0,
      computeCost: 0,
      storageCost: 0,
      
      // Metadata
      timestamp: new Date(),
      version: 0,
      source: 'computed',
      isStale: false
    };
  }

  /**
   * Calculate metrics from farms data with deduplication
   */
  public calculateMetricsFromFarms(farms: Farm[]): CoreMetrics {
    // Reset tracking sets
    this.uniqueAgentIds.clear();
    this.farmMetrics.clear();
    this.agentMetrics.clear();

    // Initialize counters
    let totalFarms = 0;
    let activeFarms = 0;
    let stoppedFarms = 0;
    let failedFarms = 0;
    
    let totalAgents = 0;
    let activeAgents = 0;
    let idleAgents = 0;
    
    let totalFiles = 0;
    let filesGenerated = 0;
    let filesFailed = 0;
    let filesPending = 0;
    
    // File categorization counters
    let filesText = 0;
    let filesCode = 0;
    let filesImage = 0;
    let filesData = 0;
    let filesConfig = 0;
    let filesOther = 0;
    
    // Farm success tracking
    let successfulFarms = 0;
    // failedFarms already declared above
    
    let totalCpuUsage = 0;
    let totalMemoryUsage = 0;
    let farmCount = 0;

    // Process each farm
    farms.forEach(farm => {
      totalFarms++;
      
      // Categorize farm status and track success
      switch (farm.status) {
        case 'running':
        case 'active':
        case 'launching':
        case 'harvesting':
          activeFarms++;
          break;
        case 'stopped':
        case 'completed':
          stoppedFarms++;
          // Completed farms are considered successful
          successfulFarms++;
          break;
        case 'failed':
        case 'error':
          failedFarms++;
          break;
      }

      // Process agents with deduplication
      const farmAgents = farm.agents || [];
      const farmUniqueAgents = new Set<string>();
      
      farmAgents.forEach((agent: Agent) => {
        const agentId = agent.id || `${farm.id}-agent-${agent.name || 'unknown'}`;
        
        // Track unique agents globally
        if (!this.uniqueAgentIds.has(agentId)) {
          this.uniqueAgentIds.add(agentId);
          totalAgents++;
          
          // Count agent status only once
          if (['running', 'active', 'working'].includes(agent.status)) {
            activeAgents++;
          } else if (agent.status === 'idle') {
            idleAgents++;
          }
          
          // Store agent metrics
          this.agentMetrics.set(agentId, {
            agentId,
            agentName: agent.name || 'Unknown',
            farmId: farm.id,
            status: agent.status,
            tasksCompleted: agent.metrics?.tasksCompleted || 0,
            tasksFailed: agent.metrics?.tasksFailed || 0,
            successRate: agent.metrics?.successRate || 100,
            avgResponseTime: agent.metrics?.avgResponseTime || 0,
            cpuUsage: agent.metrics?.cpuUsage || 0,
            memoryUsage: agent.metrics?.memoryUsage || 0,
            lastActivity: new Date()
          });
        }
        
        farmUniqueAgents.add(agentId);
      });

      // Process file generation metrics
      const farmFilesGenerated = farm.metrics?.filesCreated || farm.metrics?.filesGenerated || 0;
      const farmFilesFailed = farm.metrics?.filesFailed || 0;
      const farmFilesPending = farm.metrics?.filesPending || 0;
      const farmTotalFiles = farmFilesGenerated + farmFilesFailed + farmFilesPending;
      
      filesGenerated += farmFilesGenerated;
      filesFailed += farmFilesFailed;
      filesPending += farmFilesPending;
      totalFiles += farmTotalFiles;
      
      // Process file categories if available
      if (farm.metrics?.fileCategories) {
        filesText += farm.metrics.fileCategories.text || 0;
        filesCode += farm.metrics.fileCategories.code || 0;
        filesImage += farm.metrics.fileCategories.image || 0;
        filesData += farm.metrics.fileCategories.data || 0;
        filesConfig += farm.metrics.fileCategories.config || 0;
        filesOther += farm.metrics.fileCategories.other || 0;
      }

      // Process resource usage
      if (farm.metrics?.cpuUsage !== undefined) {
        totalCpuUsage += farm.metrics.cpuUsage;
        farmCount++;
      }
      if (farm.metrics?.memoryUsage !== undefined) {
        totalMemoryUsage += farm.metrics.memoryUsage;
      }

      // Store farm metrics
      this.farmMetrics.set(farm.id, {
        farmId: farm.id,
        farmName: farm.name,
        status: farm.status,
        agents: farmUniqueAgents.size,
        activeAgents: Array.from(farmUniqueAgents).filter(id => {
          const agent = this.agentMetrics.get(id);
          return agent && ['running', 'active', 'working'].includes(agent.status);
        }).length,
        completedTasks: farmFilesGenerated, // Map to files for compatibility
        failedTasks: farmFilesFailed,
        successRate: farmTotalFiles > 0 ? (farmFilesGenerated / farmTotalFiles) * 100 : 100,
        uptime: farm.uptime || 0,
        cpuUsage: farm.metrics?.cpuUsage || 0,
        memoryUsage: farm.metrics?.memoryUsage || 0,
        lastUpdated: new Date()
      });
    });

    // Calculate farm-based success rate
    // Success rate is now percentage of completed farms vs failed farms
    const completedAndFailedFarms = successfulFarms + failedFarms;
    const successRate = completedAndFailedFarms > 0 
      ? (successfulFarms / completedAndFailedFarms) * 100 
      : (activeFarms > 0 ? 50 : 100); // If farms are running, show 50% as neutral
    const avgCpuUsage = farmCount > 0 ? totalCpuUsage / farmCount : 0;
    const avgMemoryUsage = farmCount > 0 ? totalMemoryUsage / farmCount : 0;

    return {
      // Farm metrics
      totalFarms,
      activeFarms,
      stoppedFarms,
      failedFarms,
      
      // Agent metrics (deduplicated)
      totalAgents,
      activeAgents,
      idleAgents,
      uniqueAgents: this.uniqueAgentIds.size,
      
      // File generation metrics
      totalFiles,
      filesGenerated,
      filesFailed,
      filesPending,
      successRate, // Now based on farm success
      
      // File categorization
      filesText,
      filesCode,
      filesImage,
      filesData,
      filesConfig,
      filesOther,
      
      // Legacy task metrics for compatibility
      totalTasks: totalFiles,
      completedTasks: filesGenerated,
      failedTasks: filesFailed,
      pendingTasks: filesPending,
      
      // Resource metrics
      cpuUsage: avgCpuUsage,
      memoryUsage: avgMemoryUsage,
      gpuUsage: 0, // Will be updated from system metrics
      diskUsage: 0, // Will be updated from system metrics
      networkUsage: 0, // Will be updated from system metrics
      
      // Performance metrics
      avgResponseTime: 0, // Will be calculated from agent metrics
      throughput: 0, // Will be calculated from file generation rate
      errorRate: totalFiles > 0 ? (filesFailed / totalFiles) * 100 : 0,
      uptime: 100, // Will be updated from system metrics
      
      // Cost metrics
      totalCost: 0, // Will be calculated from API usage
      apiCost: 0,
      computeCost: 0,
      storageCost: 0
    };
  }

  /**
   * Fetch metrics from API
   */
  public async fetchMetrics(): Promise<ExtendedMetrics> {
    try {
      // Check cache first
      const cached = this.getCached('metrics');
      if (cached) {
        return cached as ExtendedMetrics;
      }

      // Fetch from multiple endpoints
      const [dashboardRes, farmsRes, agentsRes, systemRes] = await Promise.allSettled([
        apiClient.get('/api/metrics/dashboard'),
        apiClient.get('/api/farms'),
        apiClient.get('/api/agents'),
        apiClient.get('/api/metrics/system')
      ]);

      let metrics = this.getDefaultMetrics();

      // Process farms data if available
      if (farmsRes.status === 'fulfilled' && farmsRes.value.data?.data) {
        const farms = farmsRes.value.data.data;
        const calculated = this.calculateMetricsFromFarms(farms);
        metrics = { ...metrics, ...calculated };
      }

      // Override with dashboard metrics if available
      if (dashboardRes.status === 'fulfilled' && dashboardRes.value.data?.data) {
        const dashboard = dashboardRes.value.data.data;
        metrics.activeFarms = dashboard.activeFarms ?? metrics.activeFarms;
        metrics.totalAgents = dashboard.totalAgents ?? metrics.totalAgents;
        metrics.completedTasks = dashboard.tasksCompleted ?? metrics.completedTasks;
        metrics.successRate = dashboard.successRate ?? metrics.successRate;
      }

      // Add system metrics if available
      if (systemRes.status === 'fulfilled' && systemRes.value.data?.data) {
        const system = systemRes.value.data.data;
        metrics.cpuUsage = system.cpu?.usage ?? metrics.cpuUsage;
        metrics.memoryUsage = system.memory?.percentage ?? metrics.memoryUsage;
        metrics.diskUsage = system.storage?.percentage ?? metrics.diskUsage;
      }

      // Update metadata
      metrics.timestamp = new Date();
      metrics.version = ++this.metricsVersion;
      metrics.source = 'api';
      metrics.isStale = false;

      // Cache the result
      this.setCached('metrics', metrics, this.CACHE_TTL);
      
      // Update internal state
      this.metrics = metrics;
      
      // Emit update event
      this.emit('metrics:updated', metrics);

      return metrics;
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
      
      // Mark existing metrics as stale
      this.metrics.isStale = true;
      this.metrics.staleSince = new Date();
      
      return this.metrics;
    }
  }

  /**
   * Handle WebSocket metric updates
   */
  public handleWebSocketUpdate(event: MetricUpdateEvent): void {
    // Validate event object exists
    if (!event || typeof event !== 'object') {
      console.warn('Invalid WebSocket metric event received:', event);
      return;
    }

    // Version check to prevent out-of-order updates
    if (event.version && typeof event.version === 'number' && event.version <= this.metrics.version) {
      console.debug('Ignoring outdated metric update:', event.version);
      return;
    }

    // Validate and normalize timestamp
    const validTimestamp = this.validateTimestamp(event.timestamp);

    // Ensure metrics object exists in event
    const eventMetrics = event.metrics && typeof event.metrics === 'object' ? event.metrics : {};

    // Update metrics based on event type
    if (event.type === 'full') {
      // Full update - replace all metrics
      this.metrics = {
        ...this.getDefaultMetrics(),
        ...eventMetrics,
        timestamp: validTimestamp,
        version: (typeof event.version === 'number' ? event.version : ++this.metricsVersion),
        source: 'websocket',
        isStale: false
      };
    } else if (event.type === 'partial') {
      // Partial update - merge with existing
      this.metrics = {
        ...this.metrics,
        ...eventMetrics,
        timestamp: validTimestamp,
        version: (typeof event.version === 'number' ? event.version : ++this.metricsVersion),
        source: 'websocket',
        isStale: false
      };
    } else if (event.type === 'delta') {
      // Delta update - apply changes
      if (eventMetrics && typeof eventMetrics === 'object') {
        Object.entries(eventMetrics).forEach(([key, value]) => {
          if (typeof value === 'number' && key in this.metrics) {
            (this.metrics as any)[key] += value;
          }
        });
      }
      this.metrics.timestamp = validTimestamp;
      this.metrics.version = (typeof event.version === 'number' ? event.version : ++this.metricsVersion);
    }

    // Clear cache
    this.cache.clear();
    
    // Emit update event
    this.emit('metrics:updated', this.metrics);
  }

  /**
   * Get current metrics
   */
  public getMetrics(): ExtendedMetrics {
    // Check staleness - ensure timestamp exists and is valid
    const now = Date.now();
    const timestamp = this.metrics.timestamp;
    
    if (!timestamp || !(timestamp instanceof Date) || isNaN(timestamp.getTime())) {
      // If timestamp is invalid, create a new one and mark as stale
      this.metrics.timestamp = new Date();
      this.metrics.isStale = true;
      if (!this.metrics.staleSince) {
        this.metrics.staleSince = new Date();
      }
    } else {
      const age = now - timestamp.getTime();
      
      if (age > this.STALE_THRESHOLD) {
        this.metrics.isStale = true;
        if (!this.metrics.staleSince) {
          this.metrics.staleSince = new Date();
        }
      }
    }

    return { ...this.metrics };
  }

  /**
   * Get dashboard metrics
   */
  public getDashboardMetrics(): DashboardMetrics {
    const metrics = this.getMetrics();
    return {
      overview: metrics,
      farms: Array.from(this.farmMetrics.values()),
      agents: Array.from(this.agentMetrics.values()),
      lastUpdated: metrics.timestamp || new Date()
    };
  }

  /**
   * Get farm-specific metrics
   */
  public getFarmMetrics(farmId: string): FarmMetricsUnified | undefined {
    return this.farmMetrics.get(farmId);
  }

  /**
   * Get agent-specific metrics
   */
  public getAgentMetrics(agentId: string): AgentMetricsUnified | undefined {
    return this.agentMetrics.get(agentId);
  }

  /**
   * Format metric value for display
   */
  public formatMetric(metricName: MetricName, value: MetricValue): string {
    const unit = getMetricUnit(metricName);
    return formatMetricValue(value, unit);
  }

  /**
   * Start periodic updates
   */
  public startPeriodicUpdates(interval: number = 30000): void {
    this.stopPeriodicUpdates();
    
    // Initial fetch
    this.fetchMetrics();
    
    // Set up interval
    this.updateInterval = setInterval(() => {
      this.fetchMetrics();
    }, interval);
  }

  /**
   * Stop periodic updates
   */
  public stopPeriodicUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Connect to WebSocket for real-time updates
   */
  public connectWebSocket(socket: any): void {
    if (!socket) return;

    // Subscribe to metrics updates
    socket.on('metrics:update', (data: MetricUpdateEvent) => {
      this.handleWebSocketUpdate(data);
    });

    // Handle connection status
    socket.on('connect', () => {
      this.websocketConnected = true;
      console.log('UnifiedMetricsService connected to WebSocket');
    });

    socket.on('disconnect', () => {
      this.websocketConnected = false;
      console.log('UnifiedMetricsService disconnected from WebSocket');
    });

    this.websocketConnected = true;
  }

  /**
   * Cache management
   */
  private getCached(key: string): any | null {
    const cached = this.cache.get(key);
    if (cached) {
      const now = Date.now();
      if (now - cached.timestamp < cached.ttl) {
        return cached.value;
      }
      this.cache.delete(key);
    }
    return null;
  }

  private setCached(key: string, value: any, ttl: number): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * Validate and normalize timestamp from WebSocket events
   */
  private validateTimestamp(timestamp: any): Date {
    // Handle various timestamp formats
    if (!timestamp) {
      return new Date();
    }
    
    // If it's already a Date object
    if (timestamp instanceof Date) {
      return isNaN(timestamp.getTime()) ? new Date() : timestamp;
    }
    
    // If it's a string or number, try to parse it
    if (typeof timestamp === 'string' || typeof timestamp === 'number') {
      const parsed = new Date(timestamp);
      return isNaN(parsed.getTime()) ? new Date() : parsed;
    }
    
    // Fallback to current time
    return new Date();
  }

  /**
   * Clear all cached data
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Reset all metrics
   */
  public reset(): void {
    this.metrics = this.getDefaultMetrics();
    this.farmMetrics.clear();
    this.agentMetrics.clear();
    this.uniqueAgentIds.clear();
    this.cache.clear();
    this.metricsVersion = 0;
    this.emit('metrics:reset');
  }

  /**
   * Refresh metrics (alias for fetchMetrics for compatibility)
   */
  public async refreshMetrics(): Promise<ExtendedMetrics> {
    return this.fetchMetrics();
  }

  /**
   * Start metrics updates (alias for startPeriodicUpdates for compatibility)
   */
  public startMetricsUpdates(intervalMs: number = 5000): void {
    this.startPeriodicUpdates(intervalMs);
  }

  /**
   * Stop metrics updates (alias for stopPeriodicUpdates for compatibility)
   */
  public stopMetricsUpdates(): void {
    this.stopPeriodicUpdates();
  }

  /**
   * Handle WebSocket metrics (compatibility method)
   */
  public handleWebSocketMetrics(data: any): void {
    if (data && typeof data === 'object') {
      this.handleWebSocketUpdate(data);
    }
  }
}

export const unifiedMetricsService = UnifiedMetricsService.getInstance();