/**
 * HorizontalScalingCoordinator - Manages farm distribution across multiple instances
 *
 * Provides:
 * - Load balancing across instances
 * - Farm assignment and migration
 * - Instance health monitoring
 * - Auto-scaling decisions
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { logger, LogCategory } from '../../utils/logger';
import { redisPubSubManager, RedisPubSubManager } from './RedisPubSubManager';
import { unifiedFarmService } from '../unified/UnifiedFarmService';
import { monitoringService } from '../unified/MonitoringService';
import { db } from '../../database/connection';

interface InstanceInfo {
  id: string;
  hostname: string;
  startTime: Date;
  lastSeen: Date;
  capabilities: {
    farms: boolean;
    agents: boolean;
    terminals: boolean;
    harvests: boolean;
  };
  load: {
    farms: number;
    agents: number;
    cpu: number;
    memory: number;
  };
  status: 'healthy' | 'unhealthy' | 'draining' | 'offline';
}

interface FarmAssignment {
  farmId: string;
  instanceId: string;
  assignedAt: Date;
  migrationInProgress?: boolean;
}

interface ScalingPolicy {
  minInstances: number;
  maxInstances: number;
  targetCpuUtilization: number;
  targetMemoryUtilization: number;
  scaleUpThreshold: number;
  scaleDownThreshold: number;
  cooldownPeriod: number;
}

export class HorizontalScalingCoordinator extends EventEmitter {
  private static instance: HorizontalScalingCoordinator;
  private instances: Map<string, InstanceInfo> = new Map();
  private farmAssignments: Map<string, FarmAssignment> = new Map();
  private localInstanceId: string;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private rebalanceInterval: NodeJS.Timeout | null = null;
  private lastScalingAction: Date | null = null;
  
  private readonly HEALTH_CHECK_INTERVAL = 10000; // 10 seconds
  private readonly REBALANCE_INTERVAL = 60000; // 1 minute
  private readonly INSTANCE_TIMEOUT = 120000; // 2 minutes
  private readonly MAX_FARMS_PER_INSTANCE = 10;
  private readonly MAX_AGENTS_PER_INSTANCE = 50;
  
  private scalingPolicy: ScalingPolicy = {
    minInstances: 1,
    maxInstances: 10,
    targetCpuUtilization: 70,
    targetMemoryUtilization: 80,
    scaleUpThreshold: 85,
    scaleDownThreshold: 30,
    cooldownPeriod: 300000 // 5 minutes
  };

  private constructor() {
    super();
    this.localInstanceId = process.env.INSTANCE_ID || uuidv4();
    this.initialize();
  }

  static getInstance(): HorizontalScalingCoordinator {
    if (!HorizontalScalingCoordinator.instance) {
      HorizontalScalingCoordinator.instance = new HorizontalScalingCoordinator();
    }
    return HorizontalScalingCoordinator.instance;
  }

  private async initialize(): Promise<void> {
    try {
      // Register local instance
      this.registerLocalInstance();

      // Subscribe to discovery events
      redisPubSubManager.on('instance:discovered', (data) => {
        this.handleInstanceDiscovered(data);
      });

      redisPubSubManager.on('instance:shutdown', (data) => {
        this.handleInstanceShutdown(data);
      });

      // Subscribe to control events
      redisPubSubManager.on('control:scaleUp', (data) => {
        this.handleScaleUpRequest(data);
      });

      redisPubSubManager.on('control:scaleDown', (data) => {
        this.handleScaleDownRequest(data);
      });

      redisPubSubManager.on('control:rebalance', (data) => {
        this.performRebalance();
      });

      // Subscribe to farm events
      await redisPubSubManager.subscribe(
        RedisPubSubManager.CHANNELS.FARM_EVENTS,
        (message) => this.handleFarmEvent(message)
      );

      // Subscribe to metrics events
      await redisPubSubManager.subscribe(
        RedisPubSubManager.CHANNELS.METRICS_EVENTS,
        (message) => this.handleMetricsEvent(message)
      );

      // Start health monitoring
      this.startHealthMonitoring();

      // Start rebalancing
      this.startRebalancing();

      // Load existing assignments from database
      await this.loadAssignments();

      logger.info(LogCategory.DISTRIBUTED, 
        `HorizontalScalingCoordinator initialized for instance ${this.localInstanceId}`);

    } catch (error) {
      logger.error(LogCategory.DISTRIBUTED, 
        'Failed to initialize HorizontalScalingCoordinator:', error);
    }
  }

  /**
   * Register local instance
   */
  private registerLocalInstance(): void {
    const instanceInfo: InstanceInfo = {
      id: this.localInstanceId,
      hostname: process.env.HOSTNAME || 'unknown',
      startTime: new Date(),
      lastSeen: new Date(),
      capabilities: {
        farms: true,
        agents: true,
        terminals: true,
        harvests: true
      },
      load: {
        farms: 0,
        agents: 0,
        cpu: 0,
        memory: 0
      },
      status: 'healthy'
    };

    this.instances.set(this.localInstanceId, instanceInfo);
    this.updateLocalInstanceLoad();
  }

  /**
   * Update local instance load metrics
   */
  private async updateLocalInstanceLoad(): Promise<void> {
    const instance = this.instances.get(this.localInstanceId);
    if (!instance) return;

    const metrics = monitoringService.getMetrics();
    const farms = await unifiedFarmService.listFarms();
    
    instance.load = {
      farms: farms.length,
      agents: farms.reduce((sum, farm) => sum + (farm.agentCount || 0), 0),
      cpu: metrics.system.cpu,
      memory: metrics.system.memory.percentage
    };

    instance.lastSeen = new Date();

    // Broadcast updated metrics
    await redisPubSubManager.publish(
      RedisPubSubManager.CHANNELS.METRICS_EVENTS,
      'instance:metrics',
      {
        instanceId: this.localInstanceId,
        load: instance.load,
        timestamp: new Date()
      }
    );
  }

  /**
   * Handle instance discovered
   */
  private handleInstanceDiscovered(data: any): void {
    const instanceInfo: InstanceInfo = {
      id: data.instanceId,
      hostname: data.hostname,
      startTime: new Date(data.startTime),
      lastSeen: new Date(),
      capabilities: data.capabilities,
      load: {
        farms: 0,
        agents: 0,
        cpu: 0,
        memory: 0
      },
      status: 'healthy'
    };

    this.instances.set(data.instanceId, instanceInfo);
    logger.info(LogCategory.DISTRIBUTED, `Instance discovered: ${data.instanceId}`);

    this.emit('instance:added', instanceInfo);
  }

  /**
   * Handle instance shutdown
   */
  private handleInstanceShutdown(data: any): void {
    const instance = this.instances.get(data.instanceId);
    if (!instance) return;

    instance.status = 'offline';
    logger.info(LogCategory.DISTRIBUTED, `Instance shutdown: ${data.instanceId}`);

    // Reassign farms from shutting down instance
    this.reassignFarmsFromInstance(data.instanceId);

    // Remove instance after reassignment
    setTimeout(() => {
      this.instances.delete(data.instanceId);
    }, 5000);

    this.emit('instance:removed', instance);
  }

  /**
   * Handle farm events
   */
  private handleFarmEvent(message: any): void {
    switch (message.event) {
      case 'farm:created':
        if (message.data.instanceId === this.localInstanceId) {
          this.registerFarmAssignment(message.data.farmId, this.localInstanceId);
        }
        break;
      
      case 'farm:stopped':
        this.unregisterFarmAssignment(message.data.farmId);
        break;

      case 'farm:migration:request':
        this.handleFarmMigrationRequest(message.data);
        break;
    }
  }

  /**
   * Handle metrics events
   */
  private handleMetricsEvent(message: any): void {
    if (message.event === 'instance:metrics') {
      const instance = this.instances.get(message.data.instanceId);
      if (instance) {
        instance.load = message.data.load;
        instance.lastSeen = new Date();
      }
    }
  }

  /**
   * Assign a new farm to the best available instance
   */
  async assignFarm(farmId: string, requirements?: {
    agentCount?: number;
    preferredInstance?: string;
  }): Promise<string> {
    // Find the best instance for this farm
    const targetInstance = this.selectTargetInstance(requirements);
    
    if (!targetInstance) {
      throw new Error('No available instances for farm assignment');
    }

    // Create assignment
    const assignment: FarmAssignment = {
      farmId,
      instanceId: targetInstance.id,
      assignedAt: new Date()
    };

    this.farmAssignments.set(farmId, assignment);

    // If assigned to local instance, nothing else to do
    if (targetInstance.id === this.localInstanceId) {
      logger.info(LogCategory.DISTRIBUTED, 
        `Farm ${farmId} assigned to local instance`);
      return targetInstance.id;
    }

    // Otherwise, request remote instance to launch the farm
    await redisPubSubManager.publish(
      RedisPubSubManager.CHANNELS.FARM_EVENTS,
      'farm:launch:request',
      {
        farmId,
        targetInstanceId: targetInstance.id,
        requirements
      }
    );

    logger.info(LogCategory.DISTRIBUTED, 
      `Farm ${farmId} assigned to instance ${targetInstance.id}`);

    return targetInstance.id;
  }

  /**
   * Select the best target instance for a new farm
   */
  private selectTargetInstance(requirements?: {
    agentCount?: number;
    preferredInstance?: string;
  }): InstanceInfo | null {
    // Check preferred instance first
    if (requirements?.preferredInstance) {
      const preferred = this.instances.get(requirements.preferredInstance);
      if (preferred && this.canAcceptFarm(preferred, requirements.agentCount)) {
        return preferred;
      }
    }

    // Find instance with lowest load
    let bestInstance: InstanceInfo | null = null;
    let lowestScore = Infinity;

    for (const instance of this.instances.values()) {
      if (instance.status !== 'healthy') continue;
      if (!this.canAcceptFarm(instance, requirements?.agentCount)) continue;

      // Calculate load score (lower is better)
      const score = this.calculateLoadScore(instance);
      if (score < lowestScore) {
        lowestScore = score;
        bestInstance = instance;
      }
    }

    return bestInstance;
  }

  /**
   * Check if an instance can accept a new farm
   */
  private canAcceptFarm(instance: InstanceInfo, agentCount: number = 1): boolean {
    if (instance.status !== 'healthy') return false;
    if (instance.load.farms >= this.MAX_FARMS_PER_INSTANCE) return false;
    if (instance.load.agents + agentCount > this.MAX_AGENTS_PER_INSTANCE) return false;
    if (instance.load.cpu > this.scalingPolicy.scaleUpThreshold) return false;
    if (instance.load.memory > this.scalingPolicy.scaleUpThreshold) return false;

    return true;
  }

  /**
   * Calculate load score for an instance
   */
  private calculateLoadScore(instance: InstanceInfo): number {
    const farmScore = instance.load.farms / this.MAX_FARMS_PER_INSTANCE;
    const agentScore = instance.load.agents / this.MAX_AGENTS_PER_INSTANCE;
    const cpuScore = instance.load.cpu / 100;
    const memoryScore = instance.load.memory / 100;

    // Weighted average
    return (farmScore * 0.2) + (agentScore * 0.3) + 
           (cpuScore * 0.25) + (memoryScore * 0.25);
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.checkInstanceHealth();
      await this.updateLocalInstanceLoad();
      await this.evaluateScaling();
    }, this.HEALTH_CHECK_INTERVAL);
  }

  /**
   * Check health of all instances
   */
  private async checkInstanceHealth(): Promise<void> {
    const now = Date.now();

    for (const [id, instance] of this.instances) {
      if (id === this.localInstanceId) continue;

      const lastSeenAge = now - instance.lastSeen.getTime();
      
      if (lastSeenAge > this.INSTANCE_TIMEOUT) {
        // Mark as offline
        if (instance.status !== 'offline') {
          instance.status = 'offline';
          logger.warn(LogCategory.DISTRIBUTED, 
            `Instance ${id} marked as offline (last seen ${lastSeenAge}ms ago)`);
          
          // Trigger farm reassignment
          this.reassignFarmsFromInstance(id);
        }
      } else if (instance.status === 'offline' && lastSeenAge < 30000) {
        // Mark as recovered
        instance.status = 'healthy';
        logger.info(LogCategory.DISTRIBUTED, 
          `Instance ${id} recovered`);
      }
    }
  }

  /**
   * Evaluate if scaling is needed
   */
  private async evaluateScaling(): Promise<void> {
    // Check cooldown
    if (this.lastScalingAction) {
      const timeSinceLastScaling = Date.now() - this.lastScalingAction.getTime();
      if (timeSinceLastScaling < this.scalingPolicy.cooldownPeriod) {
        return;
      }
    }

    const healthyInstances = Array.from(this.instances.values())
      .filter(i => i.status === 'healthy');

    if (healthyInstances.length === 0) return;

    // Calculate average utilization
    const avgCpu = healthyInstances.reduce((sum, i) => sum + i.load.cpu, 0) / healthyInstances.length;
    const avgMemory = healthyInstances.reduce((sum, i) => sum + i.load.memory, 0) / healthyInstances.length;

    // Scale up if needed
    if ((avgCpu > this.scalingPolicy.scaleUpThreshold || 
         avgMemory > this.scalingPolicy.scaleUpThreshold) &&
        healthyInstances.length < this.scalingPolicy.maxInstances) {
      
      await this.requestScaleUp();
      this.lastScalingAction = new Date();
    }
    // Scale down if possible
    else if (avgCpu < this.scalingPolicy.scaleDownThreshold && 
             avgMemory < this.scalingPolicy.scaleDownThreshold &&
             healthyInstances.length > this.scalingPolicy.minInstances) {
      
      await this.requestScaleDown();
      this.lastScalingAction = new Date();
    }
  }

  /**
   * Request scale up
   */
  private async requestScaleUp(): Promise<void> {
    logger.info(LogCategory.DISTRIBUTED, 'Requesting scale up');

    await redisPubSubManager.publish(
      RedisPubSubManager.CHANNELS.CONTROL_PLANE,
      'scale:up:request',
      {
        requesterId: this.localInstanceId,
        currentInstances: this.instances.size,
        reason: 'High utilization detected'
      }
    );

    this.emit('scaling:up');
  }

  /**
   * Request scale down
   */
  private async requestScaleDown(): Promise<void> {
    // Find instance with lowest load to shut down
    let targetInstance: InstanceInfo | null = null;
    let lowestScore = Infinity;

    for (const instance of this.instances.values()) {
      if (instance.id === this.localInstanceId) continue;
      if (instance.status !== 'healthy') continue;

      const score = this.calculateLoadScore(instance);
      if (score < lowestScore) {
        lowestScore = score;
        targetInstance = instance;
      }
    }

    if (!targetInstance) return;

    logger.info(LogCategory.DISTRIBUTED, 
      `Requesting scale down of instance ${targetInstance.id}`);

    // Mark instance as draining
    targetInstance.status = 'draining';

    await redisPubSubManager.publish(
      RedisPubSubManager.CHANNELS.CONTROL_PLANE,
      'scale:down:request',
      {
        requesterId: this.localInstanceId,
        targetInstanceId: targetInstance.id,
        currentInstances: this.instances.size
      }
    );

    this.emit('scaling:down', targetInstance.id);
  }

  /**
   * Handle scale up request
   */
  private async handleScaleUpRequest(data: any): Promise<void> {
    // This would typically trigger container orchestration
    // For now, just log the request
    logger.info(LogCategory.DISTRIBUTED, 
      `Scale up requested by ${data.requesterId}`);

    this.emit('scale:up:requested', data);
  }

  /**
   * Handle scale down request
   */
  private async handleScaleDownRequest(data: any): Promise<void> {
    if (data.targetInstanceId === this.localInstanceId) {
      // This instance should shut down
      logger.info(LogCategory.DISTRIBUTED, 
        'This instance selected for scale down, initiating graceful shutdown');
      
      // Stop accepting new farms
      const instance = this.instances.get(this.localInstanceId);
      if (instance) {
        instance.status = 'draining';
      }

      // Wait for farms to complete
      await this.drainInstance();

      // Shutdown
      process.exit(0);
    }
  }

  /**
   * Drain instance (wait for farms to complete)
   */
  private async drainInstance(): Promise<void> {
    const farms = await unifiedFarmService.listFarms();
    
    if (farms.length === 0) return;

    logger.info(LogCategory.DISTRIBUTED, 
      `Draining ${farms.length} farms from instance`);

    // Wait for all farms to complete
    await Promise.all(
      farms.map(farm => unifiedFarmService.stopFarm(farm.id))
    );
  }

  /**
   * Start rebalancing
   */
  private startRebalancing(): void {
    this.rebalanceInterval = setInterval(() => {
      this.performRebalance();
    }, this.REBALANCE_INTERVAL);
  }

  /**
   * Perform load rebalancing
   */
  private async performRebalance(): Promise<void> {
    const healthyInstances = Array.from(this.instances.values())
      .filter(i => i.status === 'healthy');

    if (healthyInstances.length < 2) return;

    // Find most and least loaded instances
    let mostLoaded: InstanceInfo | null = null;
    let leastLoaded: InstanceInfo | null = null;
    let highestScore = -Infinity;
    let lowestScore = Infinity;

    for (const instance of healthyInstances) {
      const score = this.calculateLoadScore(instance);
      
      if (score > highestScore) {
        highestScore = score;
        mostLoaded = instance;
      }
      
      if (score < lowestScore) {
        lowestScore = score;
        leastLoaded = instance;
      }
    }

    // Check if rebalancing is needed
    const loadDifference = highestScore - lowestScore;
    if (loadDifference < 0.3) return; // Not enough imbalance

    if (mostLoaded && leastLoaded && mostLoaded.id !== leastLoaded.id) {
      // Find a farm to migrate
      const farmToMigrate = await this.selectFarmForMigration(mostLoaded.id);
      
      if (farmToMigrate) {
        logger.info(LogCategory.DISTRIBUTED, 
          `Rebalancing: migrating farm ${farmToMigrate} from ${mostLoaded.id} to ${leastLoaded.id}`);
        
        await this.migrateFarm(farmToMigrate, mostLoaded.id, leastLoaded.id);
      }
    }
  }

  /**
   * Select a farm for migration
   */
  private async selectFarmForMigration(instanceId: string): Promise<string | null> {
    // Find farms assigned to this instance
    const farmsOnInstance = Array.from(this.farmAssignments.entries())
      .filter(([_, assignment]) => assignment.instanceId === instanceId)
      .filter(([_, assignment]) => !assignment.migrationInProgress);

    if (farmsOnInstance.length === 0) return null;

    // Select the smallest farm (by agent count) for easier migration
    // In production, this would query actual farm data
    return farmsOnInstance[0][0];
  }

  /**
   * Migrate a farm between instances
   */
  private async migrateFarm(
    farmId: string, 
    fromInstanceId: string, 
    toInstanceId: string
  ): Promise<void> {
    const assignment = this.farmAssignments.get(farmId);
    if (!assignment) return;

    assignment.migrationInProgress = true;

    try {
      // Publish migration request
      await redisPubSubManager.publish(
        RedisPubSubManager.CHANNELS.FARM_EVENTS,
        'farm:migration:start',
        {
          farmId,
          fromInstanceId,
          toInstanceId,
          timestamp: new Date()
        }
      );

      // Update assignment
      assignment.instanceId = toInstanceId;
      assignment.migrationInProgress = false;

      logger.info(LogCategory.DISTRIBUTED, 
        `Farm ${farmId} migrated from ${fromInstanceId} to ${toInstanceId}`);

    } catch (error) {
      assignment.migrationInProgress = false;
      logger.error(LogCategory.DISTRIBUTED, 
        `Failed to migrate farm ${farmId}:`, error);
      throw error;
    }
  }

  /**
   * Handle farm migration request
   */
  private async handleFarmMigrationRequest(data: any): Promise<void> {
    if (data.toInstanceId === this.localInstanceId) {
      // This instance should accept the migrated farm
      logger.info(LogCategory.DISTRIBUTED, 
        `Accepting migrated farm ${data.farmId}`);
      
      // In production, this would restore farm state
      this.registerFarmAssignment(data.farmId, this.localInstanceId);
    } else if (data.fromInstanceId === this.localInstanceId) {
      // This instance should release the farm
      logger.info(LogCategory.DISTRIBUTED, 
        `Releasing farm ${data.farmId} for migration`);
      
      // Stop the farm locally
      await unifiedFarmService.stopFarm(data.farmId);
    }
  }

  /**
   * Reassign farms from a failed instance
   */
  private async reassignFarmsFromInstance(instanceId: string): Promise<void> {
    const farmsToReassign = Array.from(this.farmAssignments.entries())
      .filter(([_, assignment]) => assignment.instanceId === instanceId);

    if (farmsToReassign.length === 0) return;

    logger.info(LogCategory.DISTRIBUTED, 
      `Reassigning ${farmsToReassign.length} farms from failed instance ${instanceId}`);

    for (const [farmId, _] of farmsToReassign) {
      try {
        // Find new instance
        const newInstance = this.selectTargetInstance();
        
        if (newInstance) {
          await this.assignFarm(farmId, { preferredInstance: newInstance.id });
        } else {
          logger.error(LogCategory.DISTRIBUTED, 
            `No available instance for farm ${farmId}`);
        }
      } catch (error) {
        logger.error(LogCategory.DISTRIBUTED, 
          `Failed to reassign farm ${farmId}:`, error);
      }
    }
  }

  /**
   * Register farm assignment
   */
  private registerFarmAssignment(farmId: string, instanceId: string): void {
    this.farmAssignments.set(farmId, {
      farmId,
      instanceId,
      assignedAt: new Date()
    });

    // Update instance load
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.load.farms++;
    }
  }

  /**
   * Unregister farm assignment
   */
  private unregisterFarmAssignment(farmId: string): void {
    const assignment = this.farmAssignments.get(farmId);
    if (!assignment) return;

    // Update instance load
    const instance = this.instances.get(assignment.instanceId);
    if (instance) {
      instance.load.farms = Math.max(0, instance.load.farms - 1);
    }

    this.farmAssignments.delete(farmId);
  }

  /**
   * Load assignments from database
   */
  private async loadAssignments(): Promise<void> {
    try {
      // In production, this would load from distributed storage
      const result = await db.query(
        `SELECT farm_id, instance_id, assigned_at 
         FROM farm_assignments 
         WHERE instance_id = $1`,
        [this.localInstanceId]
      );

      for (const row of result.rows) {
        this.farmAssignments.set(row.farm_id, {
          farmId: row.farm_id,
          instanceId: row.instance_id,
          assignedAt: new Date(row.assigned_at)
        });
      }
    } catch (error) {
      // Table might not exist yet
      logger.debug(LogCategory.DISTRIBUTED, 
        'Could not load farm assignments from database');
    }
  }

  /**
   * Get instance statistics
   */
  getStatistics(): {
    instances: number;
    healthyInstances: number;
    totalFarms: number;
    totalAgents: number;
    averageCpu: number;
    averageMemory: number;
    assignments: Map<string, FarmAssignment>;
  } {
    const healthyInstances = Array.from(this.instances.values())
      .filter(i => i.status === 'healthy');

    const totalFarms = healthyInstances.reduce((sum, i) => sum + i.load.farms, 0);
    const totalAgents = healthyInstances.reduce((sum, i) => sum + i.load.agents, 0);
    const avgCpu = healthyInstances.length > 0 
      ? healthyInstances.reduce((sum, i) => sum + i.load.cpu, 0) / healthyInstances.length
      : 0;
    const avgMemory = healthyInstances.length > 0
      ? healthyInstances.reduce((sum, i) => sum + i.load.memory, 0) / healthyInstances.length
      : 0;

    return {
      instances: this.instances.size,
      healthyInstances: healthyInstances.length,
      totalFarms,
      totalAgents,
      averageCpu: Math.round(avgCpu),
      averageMemory: Math.round(avgMemory),
      assignments: this.farmAssignments
    };
  }

  /**
   * Get instances list
   */
  getInstances(): InstanceInfo[] {
    return Array.from(this.instances.values());
  }

  /**
   * Shutdown coordinator
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    if (this.rebalanceInterval) {
      clearInterval(this.rebalanceInterval);
    }

    // Announce shutdown
    await redisPubSubManager.publish(
      RedisPubSubManager.CHANNELS.DISCOVERY,
      'coordinator:shutdown',
      {
        instanceId: this.localInstanceId,
        timestamp: new Date()
      }
    );

    logger.info(LogCategory.DISTRIBUTED, 'HorizontalScalingCoordinator shut down');
  }
}

// Export singleton instance
export const horizontalScalingCoordinator = HorizontalScalingCoordinator.getInstance();