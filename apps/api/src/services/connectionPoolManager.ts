import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { websocketManager } from '../websocket/websocketManager';
import { AIProvider, AIProviderConfig, aiProviderManager } from '../config/aiProviders';
import { redis } from '../database/connection';
import { db } from '../database/connection';

export interface PooledConnection {
  id: string;
  provider: AIProvider;
  apiKey: string;
  status: 'available' | 'busy' | 'failed' | 'exhausted';
  activeRequests: number;
  totalRequests: number;
  errorCount: number;
  lastUsed: Date;
  createdAt: Date;
  metadata: {
    remainingQuota?: number;
    resetTime?: Date;
    latency?: number;
  };
}

export interface ConnectionRequest {
  id: string;
  provider: AIProvider;
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimatedDuration?: number;
  metadata?: Record<string, any>;
}

export interface LoadBalancingStrategy {
  type: 'round-robin' | 'least-connections' | 'weighted' | 'latency-based';
  weights?: Map<string, number>;
}

/**
 * Connection Pool Manager for efficient AI provider resource management
 * Features:
 * - Multiple API key rotation for load distribution
 * - Intelligent load balancing across connections
 * - Connection health monitoring and auto-recovery
 * - Quota tracking and management
 * - Priority-based connection allocation
 * - Automatic failover to backup connections
 */
export class ConnectionPoolManager extends EventEmitter {
  private static instance: ConnectionPoolManager;
  
  private connectionPools: Map<AIProvider, PooledConnection[]> = new Map();
  private connectionIndex: Map<AIProvider, number> = new Map();
  private waitingRequests: Map<string, ConnectionRequest[]> = new Map();
  private loadBalancingStrategy: LoadBalancingStrategy = { type: 'least-connections' };
  private healthCheckInterval: NodeJS.Timeout | null = null;
  
  // Configuration
  private readonly MAX_CONNECTIONS_PER_PROVIDER = 5;
  private readonly CONNECTION_TIMEOUT = 30000; // 30 seconds
  private readonly HEALTH_CHECK_INTERVAL = 60000; // 1 minute
  private readonly MAX_ERRORS_BEFORE_REMOVAL = 5;
  private readonly CONNECTION_COOLDOWN = 5000; // 5 seconds between heavy use
  
  private constructor() {
    super();
    this.initializeConnectionPools();
    this.startHealthMonitoring();
    this.setupEventListeners();
  }
  
  static getInstance(): ConnectionPoolManager {
    if (!ConnectionPoolManager.instance) {
      ConnectionPoolManager.instance = new ConnectionPoolManager();
    }
    return ConnectionPoolManager.instance;
  }
  
  /**
   * Initialize connection pools for all providers
   */
  private async initializeConnectionPools(): Promise<void> {
    const providers = aiProviderManager.getAllProviders();
    
    for (const providerConfig of providers) {
      if (!providerConfig.enabled) continue;
      
      const connections = await this.createConnectionsForProvider(providerConfig);
      this.connectionPools.set(providerConfig.provider, connections);
      this.connectionIndex.set(providerConfig.provider, 0);
      
      logger.info(`[ConnectionPoolManager] Initialized ${connections.length} connections for ${providerConfig.provider}`);
    }
  }
  
  /**
   * Create multiple connections for a provider (using multiple API keys if available)
   */
  private async createConnectionsForProvider(config: AIProviderConfig): Promise<PooledConnection[]> {
    const connections: PooledConnection[] = [];
    
    // Try to load additional API keys from database
    const additionalKeys = await this.loadAdditionalApiKeys(config.provider);
    const allKeys = [config.apiKey, ...additionalKeys].filter(Boolean);
    
    // Create connections for each API key
    for (let i = 0; i < Math.min(allKeys.length, this.MAX_CONNECTIONS_PER_PROVIDER); i++) {
      const connection: PooledConnection = {
        id: uuidv4(),
        provider: config.provider,
        apiKey: allKeys[i],
        status: 'available',
        activeRequests: 0,
        totalRequests: 0,
        errorCount: 0,
        lastUsed: new Date(),
        createdAt: new Date(),
        metadata: {
          remainingQuota: this.getInitialQuota(config.provider),
          resetTime: this.getQuotaResetTime(config.provider)
        }
      };
      
      connections.push(connection);
    }
    
    // If we don't have enough API keys, create virtual connections that share keys
    while (connections.length < Math.min(3, this.MAX_CONNECTIONS_PER_PROVIDER) && allKeys.length > 0) {
      const connection: PooledConnection = {
        id: uuidv4(),
        provider: config.provider,
        apiKey: allKeys[connections.length % allKeys.length], // Round-robin key sharing
        status: 'available',
        activeRequests: 0,
        totalRequests: 0,
        errorCount: 0,
        lastUsed: new Date(),
        createdAt: new Date(),
        metadata: {
          remainingQuota: this.getInitialQuota(config.provider),
          resetTime: this.getQuotaResetTime(config.provider)
        }
      };
      
      connections.push(connection);
    }
    
    return connections;
  }
  
  /**
   * Load additional API keys from database
   */
  private async loadAdditionalApiKeys(provider: AIProvider): Promise<string[]> {
    try {
      const result = await db.query(
        `SELECT key_encrypted FROM api_keys 
         WHERE service = $1 AND is_active = true 
         ORDER BY created_at DESC`,
        [provider]
      );
      
      const keys: string[] = [];
      const crypto = await import('crypto');
      const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_KEY || 'default-encryption-key-change-in-production';
      
      for (const row of result.rows) {
        try {
          const decipher = crypto.createDecipher('aes-256-cbc', ENCRYPTION_KEY);
          let decrypted = decipher.update(row.key_encrypted, 'hex', 'utf8');
          decrypted += decipher.final('utf8');
          keys.push(decrypted);
        } catch (error) {
          logger.error(`[ConnectionPoolManager] Failed to decrypt API key for ${provider}:`, error);
        }
      }
      
      return keys;
    } catch (error) {
      logger.error(`[ConnectionPoolManager] Failed to load additional API keys for ${provider}:`, error);
      return [];
    }
  }
  
  /**
   * Acquire a connection for a request
   */
  async acquireConnection(request: ConnectionRequest): Promise<PooledConnection> {
    const provider = request.provider;
    const connections = this.connectionPools.get(provider);
    
    if (!connections || connections.length === 0) {
      throw new Error(`No connections available for provider ${provider}`);
    }
    
    // Try to get an available connection
    let connection = this.selectConnection(connections, request);
    
    if (!connection) {
      // No available connection, queue the request
      await this.queueRequest(request);
      
      // Wait for a connection to become available
      connection = await this.waitForConnection(request);
    }
    
    // Mark connection as busy
    connection.status = 'busy';
    connection.activeRequests++;
    connection.totalRequests++;
    connection.lastUsed = new Date();
    
    // Emit connection acquired event
    this.emit('connection:acquired', {
      connectionId: connection.id,
      provider: connection.provider,
      requestId: request.id
    });
    
    // Track metrics
    this.trackConnectionMetrics(connection);
    
    return connection;
  }
  
  /**
   * Release a connection back to the pool
   */
  releaseConnection(connection: PooledConnection, success: boolean = true): void {
    if (!success) {
      connection.errorCount++;
      
      // Check if connection should be marked as failed
      if (connection.errorCount >= this.MAX_ERRORS_BEFORE_REMOVAL) {
        connection.status = 'failed';
        this.handleFailedConnection(connection);
        return;
      }
    } else {
      // Reset error count on success
      connection.errorCount = 0;
    }
    
    // Update connection status
    connection.activeRequests = Math.max(0, connection.activeRequests - 1);
    
    if (connection.activeRequests === 0) {
      connection.status = 'available';
      
      // Check for waiting requests
      this.processWaitingRequests(connection.provider);
    }
    
    // Emit connection released event
    this.emit('connection:released', {
      connectionId: connection.id,
      provider: connection.provider,
      success
    });
    
    // Update metrics
    this.updateConnectionMetrics(connection);
  }
  
  /**
   * Select best connection based on load balancing strategy
   */
  private selectConnection(connections: PooledConnection[], request: ConnectionRequest): PooledConnection | null {
    const availableConnections = connections.filter(c => 
      c.status === 'available' && 
      c.errorCount < this.MAX_ERRORS_BEFORE_REMOVAL
    );
    
    if (availableConnections.length === 0) {
      return null;
    }
    
    switch (this.loadBalancingStrategy.type) {
      case 'round-robin':
        return this.selectRoundRobin(availableConnections, request.provider);
      
      case 'least-connections':
        return this.selectLeastConnections(availableConnections);
      
      case 'weighted':
        return this.selectWeighted(availableConnections);
      
      case 'latency-based':
        return this.selectByLatency(availableConnections);
      
      default:
        return availableConnections[0];
    }
  }
  
  /**
   * Round-robin selection
   */
  private selectRoundRobin(connections: PooledConnection[], provider: AIProvider): PooledConnection {
    const index = this.connectionIndex.get(provider) || 0;
    const connection = connections[index % connections.length];
    this.connectionIndex.set(provider, (index + 1) % connections.length);
    return connection;
  }
  
  /**
   * Select connection with least active requests
   */
  private selectLeastConnections(connections: PooledConnection[]): PooledConnection {
    return connections.reduce((min, conn) => 
      conn.totalRequests < min.totalRequests ? conn : min
    );
  }
  
  /**
   * Select connection based on weights
   */
  private selectWeighted(connections: PooledConnection[]): PooledConnection {
    const weights = this.loadBalancingStrategy.weights;
    if (!weights || weights.size === 0) {
      return connections[0];
    }
    
    // Calculate weighted random selection
    const totalWeight = connections.reduce((sum, conn) => 
      sum + (weights.get(conn.id) || 1), 0
    );
    
    let random = Math.random() * totalWeight;
    
    for (const conn of connections) {
      random -= weights.get(conn.id) || 1;
      if (random <= 0) {
        return conn;
      }
    }
    
    return connections[connections.length - 1];
  }
  
  /**
   * Select connection with lowest latency
   */
  private selectByLatency(connections: PooledConnection[]): PooledConnection {
    return connections.reduce((best, conn) => {
      const bestLatency = best.metadata.latency || Infinity;
      const connLatency = conn.metadata.latency || Infinity;
      return connLatency < bestLatency ? conn : best;
    });
  }
  
  /**
   * Queue a request for later processing
   */
  private async queueRequest(request: ConnectionRequest): Promise<void> {
    const provider = request.provider;
    
    if (!this.waitingRequests.has(provider)) {
      this.waitingRequests.set(provider, []);
    }
    
    const queue = this.waitingRequests.get(provider)!;
    
    // Insert based on priority
    const priorityOrder = { 'critical': 0, 'high': 1, 'medium': 2, 'low': 3 };
    const insertIndex = queue.findIndex(r => 
      priorityOrder[r.priority] > priorityOrder[request.priority]
    );
    
    if (insertIndex === -1) {
      queue.push(request);
    } else {
      queue.splice(insertIndex, 0, request);
    }
    
    // Store in Redis for persistence
    if (redis && redis.isReady) {
      await redis.rpush(
        `connection:queue:${provider}`,
        JSON.stringify(request)
      );
    }
    
    logger.info(`[ConnectionPoolManager] Request ${request.id} queued for ${provider} (priority: ${request.priority})`);
  }
  
  /**
   * Wait for a connection to become available
   */
  private waitForConnection(request: ConnectionRequest): Promise<PooledConnection> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.removeFromQueue(request);
        reject(new Error(`Connection timeout for request ${request.id}`));
      }, this.CONNECTION_TIMEOUT);
      
      const checkConnection = () => {
        const connections = this.connectionPools.get(request.provider);
        if (!connections) {
          clearTimeout(timeout);
          reject(new Error(`Provider ${request.provider} not available`));
          return;
        }
        
        const available = this.selectConnection(connections, request);
        if (available) {
          clearTimeout(timeout);
          this.removeFromQueue(request);
          resolve(available);
        } else {
          // Check again in 100ms
          setTimeout(checkConnection, 100);
        }
      };
      
      checkConnection();
    });
  }
  
  /**
   * Remove request from queue
   */
  private removeFromQueue(request: ConnectionRequest): void {
    const queue = this.waitingRequests.get(request.provider);
    if (!queue) return;
    
    const index = queue.findIndex(r => r.id === request.id);
    if (index !== -1) {
      queue.splice(index, 1);
    }
  }
  
  /**
   * Process waiting requests when connection becomes available
   */
  private async processWaitingRequests(provider: AIProvider): Promise<void> {
    const queue = this.waitingRequests.get(provider);
    if (!queue || queue.length === 0) return;
    
    const connections = this.connectionPools.get(provider);
    if (!connections) return;
    
    while (queue.length > 0) {
      const available = connections.filter(c => c.status === 'available');
      if (available.length === 0) break;
      
      const request = queue.shift()!;
      
      // Emit event that request is being processed
      this.emit('request:processing', {
        requestId: request.id,
        provider: request.provider
      });
    }
  }
  
  /**
   * Handle failed connection
   */
  private async handleFailedConnection(connection: PooledConnection): Promise<void> {
    logger.error(`[ConnectionPoolManager] Connection ${connection.id} for ${connection.provider} marked as failed`);
    
    // Emit failure event
    this.emit('connection:failed', {
      connectionId: connection.id,
      provider: connection.provider,
      errorCount: connection.errorCount
    });
    
    // Try to create a replacement connection
    const config = aiProviderManager.getProvider(connection.provider);
    if (config) {
      const newConnection = await this.createReplacementConnection(config);
      if (newConnection) {
        const pool = this.connectionPools.get(connection.provider);
        if (pool) {
          // Replace failed connection
          const index = pool.findIndex(c => c.id === connection.id);
          if (index !== -1) {
            pool[index] = newConnection;
            logger.info(`[ConnectionPoolManager] Replaced failed connection for ${connection.provider}`);
          }
        }
      }
    }
  }
  
  /**
   * Create replacement connection
   */
  private async createReplacementConnection(config: AIProviderConfig): Promise<PooledConnection | null> {
    try {
      const connection: PooledConnection = {
        id: uuidv4(),
        provider: config.provider,
        apiKey: config.apiKey,
        status: 'available',
        activeRequests: 0,
        totalRequests: 0,
        errorCount: 0,
        lastUsed: new Date(),
        createdAt: new Date(),
        metadata: {
          remainingQuota: this.getInitialQuota(config.provider),
          resetTime: this.getQuotaResetTime(config.provider)
        }
      };
      
      return connection;
    } catch (error) {
      logger.error(`[ConnectionPoolManager] Failed to create replacement connection:`, error);
      return null;
    }
  }
  
  /**
   * Start health monitoring for all connections
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.HEALTH_CHECK_INTERVAL);
    
    logger.info('[ConnectionPoolManager] Started connection health monitoring');
  }
  
  /**
   * Perform health checks on all connections
   */
  private async performHealthChecks(): Promise<void> {
    for (const [provider, connections] of this.connectionPools) {
      for (const connection of connections) {
        // Skip busy connections
        if (connection.status === 'busy') continue;
        
        // Check connection health
        const isHealthy = await this.checkConnectionHealth(connection);
        
        if (!isHealthy) {
          connection.errorCount++;
          if (connection.errorCount >= this.MAX_ERRORS_BEFORE_REMOVAL) {
            connection.status = 'failed';
            this.handleFailedConnection(connection);
          }
        } else {
          connection.errorCount = 0;
          if (connection.status === 'failed') {
            connection.status = 'available';
            logger.info(`[ConnectionPoolManager] Connection ${connection.id} recovered`);
          }
        }
      }
      
      // Broadcast pool health
      this.broadcastPoolHealth(provider, connections);
    }
  }
  
  /**
   * Check individual connection health
   */
  private async checkConnectionHealth(connection: PooledConnection): Promise<boolean> {
    try {
      // Simple validation that API key is still valid
      // In production, this would make a lightweight API call
      return connection.apiKey && connection.apiKey.length > 0;
    } catch (error) {
      logger.error(`[ConnectionPoolManager] Health check failed for connection ${connection.id}:`, error);
      return false;
    }
  }
  
  /**
   * Broadcast pool health status
   */
  private broadcastPoolHealth(provider: AIProvider, connections: PooledConnection[]): void {
    const health = {
      provider,
      totalConnections: connections.length,
      availableConnections: connections.filter(c => c.status === 'available').length,
      busyConnections: connections.filter(c => c.status === 'busy').length,
      failedConnections: connections.filter(c => c.status === 'failed').length,
      queuedRequests: this.waitingRequests.get(provider)?.length || 0,
      timestamp: new Date()
    };
    
    websocketManager.broadcast('connection_pool:health', health);
  }
  
  /**
   * Track connection metrics
   */
  private trackConnectionMetrics(connection: PooledConnection): void {
    const metrics = {
      connectionId: connection.id,
      provider: connection.provider,
      activeRequests: connection.activeRequests,
      totalRequests: connection.totalRequests,
      errorRate: connection.totalRequests > 0 
        ? connection.errorCount / connection.totalRequests 
        : 0,
      timestamp: new Date()
    };
    
    // Store in Redis
    if (redis && redis.isReady) {
      redis.zadd(
        `connection:metrics:${connection.provider}`,
        Date.now(),
        JSON.stringify(metrics)
      ).catch(err => logger.error('[ConnectionPoolManager] Failed to store metrics:', err));
    }
  }
  
  /**
   * Update connection metrics after release
   */
  private updateConnectionMetrics(connection: PooledConnection): void {
    // Calculate latency if available
    const latency = Date.now() - connection.lastUsed.getTime();
    connection.metadata.latency = (connection.metadata.latency || 0) * 0.9 + latency * 0.1;
    
    // Emit metrics update
    this.emit('metrics:updated', {
      connectionId: connection.id,
      provider: connection.provider,
      latency: connection.metadata.latency,
      errorRate: connection.totalRequests > 0 
        ? connection.errorCount / connection.totalRequests 
        : 0
    });
  }
  
  /**
   * Get initial quota for provider
   */
  private getInitialQuota(provider: AIProvider): number {
    const quotas: Record<AIProvider, number> = {
      [AIProvider.CLAUDE]: 100000, // Tokens per minute
      [AIProvider.OPENAI]: 90000,
      [AIProvider.LLAMA]: 120000,
      [AIProvider.GPT_OSS]: Infinity,
      [AIProvider.GROK]: 100000
    };
    return quotas[provider] || 100000;
  }
  
  /**
   * Get quota reset time for provider
   */
  private getQuotaResetTime(provider: AIProvider): Date {
    const now = new Date();
    const resetTime = new Date(now);
    
    // Most providers reset quota every minute
    resetTime.setMinutes(resetTime.getMinutes() + 1);
    resetTime.setSeconds(0);
    resetTime.setMilliseconds(0);
    
    return resetTime;
  }
  
  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Listen for quota updates
    this.on('quota:updated', (data) => {
      const connection = this.findConnection(data.connectionId);
      if (connection) {
        connection.metadata.remainingQuota = data.remainingQuota;
        connection.metadata.resetTime = data.resetTime;
      }
    });
    
    // Listen for strategy changes
    this.on('strategy:changed', (strategy: LoadBalancingStrategy) => {
      this.loadBalancingStrategy = strategy;
      logger.info(`[ConnectionPoolManager] Load balancing strategy changed to ${strategy.type}`);
    });
  }
  
  /**
   * Find connection by ID
   */
  private findConnection(connectionId: string): PooledConnection | null {
    for (const connections of this.connectionPools.values()) {
      const connection = connections.find(c => c.id === connectionId);
      if (connection) return connection;
    }
    return null;
  }
  
  /**
   * Get pool statistics
   */
  getPoolStatistics(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [provider, connections] of this.connectionPools) {
      stats[provider] = {
        total: connections.length,
        available: connections.filter(c => c.status === 'available').length,
        busy: connections.filter(c => c.status === 'busy').length,
        failed: connections.filter(c => c.status === 'failed').length,
        exhausted: connections.filter(c => c.status === 'exhausted').length,
        queueLength: this.waitingRequests.get(provider)?.length || 0,
        totalRequests: connections.reduce((sum, c) => sum + c.totalRequests, 0),
        totalErrors: connections.reduce((sum, c) => sum + c.errorCount, 0),
        averageLatency: connections.reduce((sum, c) => sum + (c.metadata.latency || 0), 0) / connections.length
      };
    }
    
    return stats;
  }
  
  /**
   * Set load balancing strategy
   */
  setLoadBalancingStrategy(strategy: LoadBalancingStrategy): void {
    this.loadBalancingStrategy = strategy;
    this.emit('strategy:changed', strategy);
  }
  
  /**
   * Force refresh all connections
   */
  async refreshConnections(): Promise<void> {
    logger.info('[ConnectionPoolManager] Refreshing all connections...');
    
    await this.initializeConnectionPools();
    
    logger.info('[ConnectionPoolManager] Connections refreshed');
  }
  
  /**
   * Shutdown connection pool manager
   */
  async shutdown(): Promise<void> {
    logger.info('[ConnectionPoolManager] Shutting down...');
    
    // Stop health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    // Clear waiting requests
    this.waitingRequests.clear();
    
    // Clear connection pools
    this.connectionPools.clear();
    
    logger.info('[ConnectionPoolManager] Shutdown complete');
  }
}

// Export singleton instance
export const connectionPoolManager = ConnectionPoolManager.getInstance();
