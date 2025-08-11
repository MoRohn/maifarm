/**
 * Neural Swarm Optimizer
 * Implements swarm intelligence with neural network-inspired coordination
 */

import { EventEmitter } from 'events';
import { 
  NeuralSwarmConfig, 
  SwarmPattern, 
  ConvergenceCriteria,
  CommunicationProtocol,
  MessageType 
} from '../types/superintelligence';
import { Agent, AgentStatus } from '../types/farm';
import { logger } from '../utils/logger';
import { redisClient } from '../database/redis';

interface SwarmParticle {
  agentId: string;
  position: number[]; // Current solution position in n-dimensional space
  velocity: number[]; // Movement vector
  personalBest: number[]; // Best position found by this particle
  personalBestFitness: number;
  fitness: number;
  neighbors: Set<string>; // Connected agents based on topology
}

interface SwarmMessage {
  type: string;
  from: string;
  to: string | string[];
  data: any;
  priority: number;
  timestamp: Date;
  ttl: number;
}

export class NeuralSwarmOptimizer extends EventEmitter {
  private config: NeuralSwarmConfig;
  private particles: Map<string, SwarmParticle> = new Map();
  private globalBest: number[] = [];
  private globalBestFitness: number = -Infinity;
  private iteration: number = 0;
  private converged: boolean = false;
  private messageQueue: SwarmMessage[] = [];
  private updateInterval: NodeJS.Timer | null = null;
  private communicationInterval: NodeJS.Timer | null = null;
  
  constructor(config: NeuralSwarmConfig) {
    super();
    this.config = config;
    this.initialize();
  }
  
  private initialize() {
    logger.info('[NeuralSwarmOptimizer] Initializing with config:', this.config);
    
    // Start update loop
    this.updateInterval = setInterval(() => this.update(), 100);
    
    // Start communication protocol
    if (this.config.communicationProtocol.broadcastInterval > 0) {
      this.communicationInterval = setInterval(
        () => this.processCommunication(),
        this.config.communicationProtocol.broadcastInterval
      );
    }
  }
  
  /**
   * Add an agent to the swarm
   */
  async addAgent(agent: Agent, initialPosition?: number[]) {
    const dimensions = initialPosition?.length || 10; // Default 10D problem space
    
    const particle: SwarmParticle = {
      agentId: agent.id,
      position: initialPosition || this.randomPosition(dimensions),
      velocity: this.randomVelocity(dimensions),
      personalBest: initialPosition || this.randomPosition(dimensions),
      personalBestFitness: -Infinity,
      fitness: -Infinity,
      neighbors: new Set()
    };
    
    // Set up topology connections
    this.setupTopology(particle);
    
    this.particles.set(agent.id, particle);
    
    // Store in Redis for persistence
    await this.persistParticle(particle);
    
    this.emit('particle:added', { agentId: agent.id, particle });
    
    logger.info(`[NeuralSwarmOptimizer] Added agent ${agent.id} to swarm`);
  }
  
  /**
   * Remove an agent from the swarm
   */
  async removeAgent(agentId: string) {
    const particle = this.particles.get(agentId);
    if (!particle) return;
    
    // Remove from neighbors' connections
    this.particles.forEach(p => {
      p.neighbors.delete(agentId);
    });
    
    this.particles.delete(agentId);
    
    // Remove from Redis
    await redisClient.del(`swarm:particle:${agentId}`);
    
    this.emit('particle:removed', { agentId });
    
    logger.info(`[NeuralSwarmOptimizer] Removed agent ${agentId} from swarm`);
  }
  
  /**
   * Update particle fitness based on agent performance
   */
  async updateFitness(agentId: string, fitness: number) {
    const particle = this.particles.get(agentId);
    if (!particle) return;
    
    particle.fitness = fitness;
    
    // Update personal best
    if (fitness > particle.personalBestFitness) {
      particle.personalBest = [...particle.position];
      particle.personalBestFitness = fitness;
      
      this.emit('particle:personalBest', { 
        agentId, 
        fitness, 
        position: particle.position 
      });
    }
    
    // Update global best
    if (fitness > this.globalBestFitness) {
      this.globalBest = [...particle.position];
      this.globalBestFitness = fitness;
      
      this.emit('swarm:globalBest', { 
        fitness, 
        position: this.globalBest,
        foundBy: agentId 
      });
      
      // Broadcast to all particles
      this.broadcastGlobalBest();
    }
    
    await this.persistParticle(particle);
  }
  
  /**
   * Main update loop for swarm optimization
   */
  private async update() {
    if (this.converged || this.particles.size === 0) return;
    
    this.iteration++;
    
    // Update each particle
    for (const [agentId, particle] of this.particles) {
      await this.updateParticle(particle);
    }
    
    // Check convergence
    if (this.checkConvergence()) {
      this.converged = true;
      this.emit('swarm:converged', { 
        solution: this.globalBest,
        fitness: this.globalBestFitness,
        iterations: this.iteration 
      });
      
      logger.info('[NeuralSwarmOptimizer] Swarm converged!', {
        solution: this.globalBest,
        fitness: this.globalBestFitness,
        iterations: this.iteration
      });
      
      this.cleanup();
    }
    
    // Emit progress
    if (this.iteration % 10 === 0) {
      this.emit('swarm:progress', {
        iteration: this.iteration,
        globalBestFitness: this.globalBestFitness,
        averageFitness: this.calculateAverageFitness()
      });
    }
  }
  
  /**
   * Update a single particle's position and velocity
   */
  private async updateParticle(particle: SwarmParticle) {
    const config = this.config;
    const dimensions = particle.position.length;
    
    // Get neighborhood best
    const neighborhoodBest = this.getNeighborhoodBest(particle);
    
    for (let d = 0; d < dimensions; d++) {
      // Cognitive component (personal best)
      const cognitive = Math.random() * 2 * config.learningRate * 
                       (particle.personalBest[d] - particle.position[d]);
      
      // Social component (neighborhood/global best)
      const social = Math.random() * 2 * config.learningRate * 
                    (neighborhoodBest[d] - particle.position[d]);
      
      // Exploration component
      const exploration = (Math.random() - 0.5) * config.explorationRate;
      
      // Update velocity with momentum
      particle.velocity[d] = config.momentumFactor * particle.velocity[d] + 
                            cognitive + social + exploration;
      
      // Limit velocity
      particle.velocity[d] = Math.max(-1, Math.min(1, particle.velocity[d]));
      
      // Update position
      particle.position[d] += particle.velocity[d];
      
      // Boundary handling (reflection)
      if (particle.position[d] < 0) {
        particle.position[d] = Math.abs(particle.position[d]);
        particle.velocity[d] *= -0.5;
      } else if (particle.position[d] > 1) {
        particle.position[d] = 2 - particle.position[d];
        particle.velocity[d] *= -0.5;
      }
    }
    
    // Request fitness evaluation from agent
    this.emit('particle:evaluate', {
      agentId: particle.agentId,
      position: particle.position
    });
  }
  
  /**
   * Get best position from particle's neighborhood
   */
  private getNeighborhoodBest(particle: SwarmParticle): number[] {
    let bestPosition = particle.personalBest;
    let bestFitness = particle.personalBestFitness;
    
    // Check neighbors based on topology
    for (const neighborId of particle.neighbors) {
      const neighbor = this.particles.get(neighborId);
      if (neighbor && neighbor.personalBestFitness > bestFitness) {
        bestPosition = neighbor.personalBest;
        bestFitness = neighbor.personalBestFitness;
      }
    }
    
    // In some topologies, also consider global best
    if (this.config.topology.topology === 'star' || 
        this.config.topology.topology === 'mesh') {
      if (this.globalBestFitness > bestFitness) {
        bestPosition = this.globalBest;
      }
    }
    
    return bestPosition;
  }
  
  /**
   * Setup topology connections for a particle
   */
  private setupTopology(particle: SwarmParticle) {
    const topology = this.config.topology.topology;
    const allParticles = Array.from(this.particles.keys());
    
    switch (topology) {
      case 'mesh':
        // Fully connected - all particles are neighbors
        particle.neighbors = new Set(allParticles);
        break;
        
      case 'star':
        // Connected to a central hub (first particle)
        if (allParticles.length > 0) {
          particle.neighbors.add(allParticles[0]);
          const hub = this.particles.get(allParticles[0]);
          if (hub) hub.neighbors.add(particle.agentId);
        }
        break;
        
      case 'ring':
        // Connected to adjacent particles in a ring
        const index = allParticles.length;
        if (index > 0) {
          const prevIndex = (index - 1) % allParticles.length;
          const nextIndex = (index + 1) % allParticles.length;
          particle.neighbors.add(allParticles[prevIndex]);
          if (allParticles[nextIndex]) {
            particle.neighbors.add(allParticles[nextIndex]);
          }
        }
        break;
        
      case 'hierarchical':
        // Tree-like structure
        const parentIndex = Math.floor((allParticles.length - 1) / 2);
        if (parentIndex >= 0 && allParticles[parentIndex]) {
          particle.neighbors.add(allParticles[parentIndex]);
          const parent = this.particles.get(allParticles[parentIndex]);
          if (parent) parent.neighbors.add(particle.agentId);
        }
        break;
        
      case 'dynamic':
        // Dynamically adjust based on performance
        this.updateDynamicTopology(particle);
        break;
    }
  }
  
  /**
   * Update dynamic topology based on performance
   */
  private updateDynamicTopology(particle: SwarmParticle) {
    const connectionStrength = this.config.topology.connectionStrength;
    const maxConnections = Math.floor(this.particles.size * connectionStrength);
    
    // Sort particles by fitness
    const sortedParticles = Array.from(this.particles.entries())
      .sort((a, b) => b[1].fitness - a[1].fitness)
      .slice(0, maxConnections)
      .map(([id]) => id);
    
    particle.neighbors = new Set(sortedParticles);
  }
  
  /**
   * Process inter-particle communication
   */
  private async processCommunication() {
    // Process message queue
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (!message) continue;
      
      // Check TTL
      if (Date.now() - message.timestamp.getTime() > message.ttl) {
        continue; // Message expired
      }
      
      // Route message
      if (Array.isArray(message.to)) {
        // Broadcast
        for (const target of message.to) {
          await this.deliverMessage(target, message);
        }
      } else {
        // Unicast
        await this.deliverMessage(message.to, message);
      }
    }
  }
  
  /**
   * Deliver message to target particle
   */
  private async deliverMessage(targetId: string, message: SwarmMessage) {
    const particle = this.particles.get(targetId);
    if (!particle) return;
    
    // Emit message event for agent to process
    this.emit('particle:message', {
      agentId: targetId,
      message: message.data,
      from: message.from,
      type: message.type
    });
    
    // Store in Redis for persistence
    await redisClient.lpush(
      `swarm:messages:${targetId}`,
      JSON.stringify(message)
    );
    
    // Trim to keep only recent messages
    await redisClient.ltrim(`swarm:messages:${targetId}`, 0, 99);
  }
  
  /**
   * Send message between particles
   */
  async sendMessage(from: string, to: string | string[], type: string, data: any) {
    const messageType = this.config.communicationProtocol.messageTypes
      .find(mt => mt.name === type);
    
    if (!messageType) {
      logger.warn(`[NeuralSwarmOptimizer] Unknown message type: ${type}`);
      return;
    }
    
    const message: SwarmMessage = {
      type,
      from,
      to,
      data,
      priority: messageType.priority,
      timestamp: new Date(),
      ttl: messageType.ttl
    };
    
    // Add to queue sorted by priority
    this.messageQueue.push(message);
    this.messageQueue.sort((a, b) => b.priority - a.priority);
  }
  
  /**
   * Broadcast global best to all particles
   */
  private broadcastGlobalBest() {
    const allAgents = Array.from(this.particles.keys());
    this.sendMessage(
      'system',
      allAgents,
      'globalBest',
      {
        position: this.globalBest,
        fitness: this.globalBestFitness
      }
    );
  }
  
  /**
   * Check if swarm has converged
   */
  private checkConvergence(): boolean {
    const criteria = this.config.convergenceCriteria;
    
    // Max iterations reached
    if (this.iteration >= criteria.maxIterations) {
      return true;
    }
    
    // Target fitness achieved
    if (this.globalBestFitness >= criteria.targetFitness) {
      return true;
    }
    
    // Check stagnation
    // (Implementation would track fitness history)
    
    // Check consensus
    if (criteria.consensusRequired > 0) {
      const consensus = this.calculateConsensus();
      if (consensus >= criteria.consensusRequired) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Calculate consensus level among particles
   */
  private calculateConsensus(): number {
    if (this.particles.size === 0) return 0;
    
    const positions = Array.from(this.particles.values())
      .map(p => p.position);
    
    if (positions.length === 0) return 0;
    
    const dimensions = positions[0].length;
    let totalVariance = 0;
    
    for (let d = 0; d < dimensions; d++) {
      const values = positions.map(p => p[d]);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
      totalVariance += variance;
    }
    
    // Convert variance to consensus (0 variance = 1 consensus)
    const avgVariance = totalVariance / dimensions;
    return Math.exp(-avgVariance * 10); // Exponential decay
  }
  
  /**
   * Calculate average fitness of swarm
   */
  private calculateAverageFitness(): number {
    if (this.particles.size === 0) return 0;
    
    const totalFitness = Array.from(this.particles.values())
      .reduce((sum, p) => sum + p.fitness, 0);
    
    return totalFitness / this.particles.size;
  }
  
  /**
   * Generate random position in n-dimensional space
   */
  private randomPosition(dimensions: number): number[] {
    return Array.from({ length: dimensions }, () => Math.random());
  }
  
  /**
   * Generate random velocity in n-dimensional space
   */
  private randomVelocity(dimensions: number): number[] {
    return Array.from({ length: dimensions }, () => (Math.random() - 0.5) * 0.2);
  }
  
  /**
   * Persist particle state to Redis
   */
  private async persistParticle(particle: SwarmParticle) {
    await redisClient.set(
      `swarm:particle:${particle.agentId}`,
      JSON.stringify({
        ...particle,
        neighbors: Array.from(particle.neighbors)
      }),
      'EX',
      3600 // 1 hour TTL
    );
  }
  
  /**
   * Load particle state from Redis
   */
  async loadParticle(agentId: string): Promise<SwarmParticle | null> {
    const data = await redisClient.get(`swarm:particle:${agentId}`);
    if (!data) return null;
    
    const parsed = JSON.parse(data);
    return {
      ...parsed,
      neighbors: new Set(parsed.neighbors)
    };
  }
  
  /**
   * Get current swarm state
   */
  getState() {
    return {
      iteration: this.iteration,
      converged: this.converged,
      particleCount: this.particles.size,
      globalBest: this.globalBest,
      globalBestFitness: this.globalBestFitness,
      averageFitness: this.calculateAverageFitness(),
      consensus: this.calculateConsensus()
    };
  }
  
  /**
   * Reset the swarm
   */
  reset() {
    this.particles.clear();
    this.globalBest = [];
    this.globalBestFitness = -Infinity;
    this.iteration = 0;
    this.converged = false;
    this.messageQueue = [];
    
    logger.info('[NeuralSwarmOptimizer] Swarm reset');
  }
  
  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    if (this.communicationInterval) {
      clearInterval(this.communicationInterval);
      this.communicationInterval = null;
    }
    
    logger.info('[NeuralSwarmOptimizer] Cleanup completed');
  }
}

// Export singleton instance
export const neuralSwarmOptimizer = new NeuralSwarmOptimizer({
  swarmSize: 10,
  topology: {
    id: 'default',
    name: 'Dynamic Mesh',
    topology: 'dynamic',
    connectionStrength: 0.5,
    propagationSpeed: 0.8,
    consensusThreshold: 0.7,
    adaptiveWeights: new Map()
  },
  learningRate: 0.5,
  momentumFactor: 0.9,
  explorationRate: 0.1,
  convergenceCriteria: {
    maxIterations: 1000,
    targetFitness: 0.95,
    stagnationThreshold: 50,
    consensusRequired: 0.8
  },
  communicationProtocol: {
    broadcastInterval: 1000,
    messageTypes: [
      { name: 'globalBest', priority: 10, ttl: 5000, broadcast: true },
      { name: 'localBest', priority: 5, ttl: 3000, broadcast: false },
      { name: 'exploration', priority: 3, ttl: 2000, broadcast: false },
      { name: 'coordination', priority: 7, ttl: 4000, broadcast: true }
    ],
    priorityLevels: 10,
    encryptionEnabled: false,
    compressionEnabled: true
  }
});