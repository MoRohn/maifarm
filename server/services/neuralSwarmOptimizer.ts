import { EventEmitter } from 'events';
import {
  SwarmOptimizationConfig,
  NeuralParticle,
  FitnessEvaluation,
  Vector3D
} from '../types/superintelligence';
import { collectiveIntelligence } from './collectiveIntelligence';
import { websocketManager } from '../websocket/websocketManager';

/**
 * Neural Swarm Optimizer
 * Implements Particle Swarm Optimization with neural network particles
 * for distributed problem solving and optimization
 */
export class NeuralSwarmOptimizer extends EventEmitter {
  private config: SwarmOptimizationConfig;
  private particles: Map<string, NeuralParticle>;
  private globalBest: { position: number[]; fitness: number };
  private iteration: number;
  private convergenceHistory: number[];
  private problemSpace: ProblemSpace;
  private neuralNetwork: SimpleNeuralNetwork;

  constructor(config?: Partial<SwarmOptimizationConfig>) {
    super();
    
    this.config = {
      particles: config?.particles || 30,
      dimensions: config?.dimensions || 10,
      inertiaWeight: config?.inertiaWeight || 0.729,
      cognitiveCoefficient: config?.cognitiveCoefficient || 1.49445,
      socialCoefficient: config?.socialCoefficient || 1.49445,
      maxIterations: config?.maxIterations || 1000,
      convergenceThreshold: config?.convergenceThreshold || 0.0001,
      topology: config?.topology || 'global'
    };
    
    this.particles = new Map();
    this.globalBest = { position: [], fitness: -Infinity };
    this.iteration = 0;
    this.convergenceHistory = [];
    this.problemSpace = new ProblemSpace(this.config.dimensions);
    this.neuralNetwork = new SimpleNeuralNetwork(this.config.dimensions);
    
    this.initializeSwarm();
  }

  /**
   * Initialize particle swarm
   */
  private initializeSwarm(): void {
    for (let i = 0; i < this.config.particles; i++) {
      const particle = this.createParticle(i);
      this.particles.set(particle.id, particle);
      
      // Update global best if needed
      if (particle.currentFitness > this.globalBest.fitness) {
        this.globalBest = {
          position: [...particle.position],
          fitness: particle.currentFitness
        };
      }
    }
    
    this.emit('swarm:initialized', {
      particles: this.config.particles,
      dimensions: this.config.dimensions,
      globalBest: this.globalBest
    });
  }

  /**
   * Create a neural particle
   */
  private createParticle(index: number): NeuralParticle {
    const position = this.problemSpace.randomPosition();
    const velocity = this.problemSpace.randomVelocity();
    const neuralWeights = this.neuralNetwork.randomWeights();
    const fitness = this.evaluateFitness(position, neuralWeights);
    
    return {
      id: `particle-${index}`,
      position,
      velocity,
      personalBest: [...position],
      personalBestFitness: fitness,
      currentFitness: fitness,
      neuralWeights,
      activationFunction: this.selectActivationFunction()
    };
  }

  /**
   * Select activation function for particle
   */
  private selectActivationFunction(): 'relu' | 'sigmoid' | 'tanh' | 'swish' {
    const functions: ('relu' | 'sigmoid' | 'tanh' | 'swish')[] = ['relu', 'sigmoid', 'tanh', 'swish'];
    return functions[Math.floor(Math.random() * functions.length)];
  }

  /**
   * Optimize the swarm
   */
  async optimize(targetFitness?: number): Promise<{ position: number[]; fitness: number }> {
    const startTime = Date.now();
    
    while (this.iteration < this.config.maxIterations) {
      await this.optimizationStep();
      
      // Check convergence
      if (this.hasConverged() || (targetFitness && this.globalBest.fitness >= targetFitness)) {
        break;
      }
      
      // Adaptive parameters
      if (this.iteration % 100 === 0) {
        this.adaptParameters();
      }
      
      this.iteration++;
    }
    
    const duration = Date.now() - startTime;
    
    this.emit('optimization:complete', {
      globalBest: this.globalBest,
      iterations: this.iteration,
      duration,
      convergenceHistory: this.convergenceHistory
    });
    
    // Share results with collective intelligence
    await this.shareWithCollective();
    
    return this.globalBest;
  }

  /**
   * Single optimization step
   */
  private async optimizationStep(): Promise<void> {
    const updates: FitnessEvaluation[] = [];
    
    for (const [id, particle] of this.particles) {
      // Update velocity and position
      this.updateParticle(particle);
      
      // Evaluate new fitness
      particle.currentFitness = this.evaluateFitness(particle.position, particle.neuralWeights);
      
      // Update personal best
      if (particle.currentFitness > particle.personalBestFitness) {
        particle.personalBest = [...particle.position];
        particle.personalBestFitness = particle.currentFitness;
        
        // Update neural weights based on success
        this.evolveNeuralWeights(particle);
      }
      
      // Update global best
      if (particle.currentFitness > this.globalBest.fitness) {
        this.globalBest = {
          position: [...particle.position],
          fitness: particle.currentFitness
        };
        
        this.emit('swarm:newGlobalBest', this.globalBest);
      }
      
      updates.push({
        particleId: particle.id,
        fitness: particle.currentFitness,
        components: this.decomposeupdate the velocity based on position and  fitness fitness(particle.currentFitness),
        timestamp: new Date()
      });
    }
    
    this.convergenceHistory.push(this.globalBest.fitness);
    
    // Broadcast progress
    if (this.iteration % 10 === 0) {
      websocketManager.broadcast('swarm:progress', {
        iteration: this.iteration,
        globalBest: this.globalBest,
        averageFitness: this.calculateAverageFitness(),
        convergenceRate: this.calculateConvergenceRate()
      });
    }
  }

  /**
   * Update particle velocity and position
   */
  private updateParticle(particle: NeuralParticle): void {
    const r1 = Math.random();
    const r2 = Math.random();
    
    for (let d = 0; d < this.config.dimensions; d++) {
      // Velocity update equation
      const cognitive = this.config.cognitiveCoefficient * r1 * (particle.personalBest[d] - particle.position[d]);
      const social = this.config.socialCoefficient * r2 * (this.globalBest.position[d] - particle.position[d]);
      
      particle.velocity[d] = this.config.inertiaWeight * particle.velocity[d] + cognitive + social;
      
      // Apply velocity clamping
      particle.velocity[d] = Math.max(-1, Math.min(1, particle.velocity[d]));
      
      // Position update
      particle.position[d] += particle.velocity[d];
      
      // Apply position bounds
      particle.position[d] = this.problemSpace.clamp(particle.position[d], d);
    }
    
    // Update neural weights based on new position
    this.updateNeuralWeights(particle);
  }

  /**
   * Update neural weights based on particle position
   */
  private updateNeuralWeights(particle: NeuralParticle): void {
    // Map position to neural weights
    const flatWeights = particle.position.map(p => this.activation(p, particle.activationFunction));
    particle.neuralWeights = this.neuralNetwork.unflattenWeights(flatWeights);
  }

  /**
   * Evolve neural weights for successful particles
   */
  private evolveNeuralWeights(particle: NeuralParticle): void {
    // Apply small mutations to successful weights
    const mutationRate = 0.01;
    
    particle.neuralWeights = particle.neuralWeights.map(layer =>
      layer.map(weight => 
        Math.random() < mutationRate 
          ? weight + (Math.random() - 0.5) * 0.1 
          : weight
      )
    );
  }

  /**
   * Activation function
   */
  private activation(x: number, func: 'relu' | 'sigmoid' | 'tanh' | 'swish'): number {
    switch (func) {
      case 'relu':
        return Math.max(0, x);
      case 'sigmoid':
        return 1 / (1 + Math.exp(-x));
      case 'tanh':
        return Math.tanh(x);
      case 'swish':
        return x / (1 + Math.exp(-x));
      default:
        return x;
    }
  }

  /**
   * Evaluate fitness of a position
   */
  private evaluateFitness(position: number[], weights: number[][]): number {
    // Complex fitness function combining multiple objectives
    
    // 1. Neural network prediction accuracy
    const neuralOutput = this.neuralNetwork.forward(position, weights);
    const predictionAccuracy = this.evaluatePrediction(neuralOutput);
    
    // 2. Solution quality (problem-specific)
    const solutionQuality = this.problemSpace.evaluate(position);
    
    // 3. Diversity bonus (encourage exploration)
    const diversityBonus = this.calculateDiversityBonus(position);
    
    // 4. Efficiency (prefer simpler solutions)
    const efficiency = 1 / (1 + this.calculateComplexity(position));
    
    // Weighted combination
    return (
      predictionAccuracy * 0.3 +
      solutionQuality * 0.4 +
      diversityBonus * 0.2 +
      efficiency * 0.1
    );
  }

  /**
   * Evaluate neural network prediction
   */
  private evaluatePrediction(output: number[]): number {
    // Placeholder - would evaluate against actual targets
    return output.reduce((sum, val) => sum + Math.abs(val), 0) / output.length;
  }

  /**
   * Calculate diversity bonus
   */
  private calculateDiversityBonus(position: number[]): number {
    let minDistance = Infinity;
    
    for (const particle of this.particles.values()) {
      const distance = this.euclideanDistance(position, particle.position);
      minDistance = Math.min(minDistance, distance);
    }
    
    return Math.min(1, minDistance / Math.sqrt(this.config.dimensions));
  }

  /**
   * Calculate solution complexity
   */
  private calculateComplexity(position: number[]): number {
    // Measure complexity as variance in position values
    const mean = position.reduce((sum, val) => sum + val, 0) / position.length;
    const variance = position.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / position.length;
    return Math.sqrt(variance);
  }

  /**
   * Euclidean distance between positions
   */
  private euclideanDistance(p1: number[], p2: number[]): number {
    return Math.sqrt(
      p1.reduce((sum, val, i) => sum + Math.pow(val - p2[i], 2), 0)
    );
  }

  /**
   * Decompose fitness into components
   */
  private decomposeFitness(fitness: number): { accuracy: number; speed: number; novelty: number; robustness: number } {
    // Simplified decomposition
    return {
      accuracy: fitness * 0.4,
      speed: fitness * 0.3,
      novelty: fitness * 0.2,
      robustness: fitness * 0.1
    };
  }

  /**
   * Check if swarm has converged
   */
  private hasConverged(): boolean {
    if (this.convergenceHistory.length < 10) return false;
    
    const recent = this.convergenceHistory.slice(-10);
    const variance = this.calculateVariance(recent);
    
    return variance < this.config.convergenceThreshold;
  }

  /**
   * Calculate variance of values
   */
  private calculateVariance(values: number[]): number {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  }

  /**
   * Adapt parameters during optimization
   */
  private adaptParameters(): void {
    // Reduce inertia weight over time (exploration -> exploitation)
    this.config.inertiaWeight *= 0.99;
    this.config.inertiaWeight = Math.max(0.4, this.config.inertiaWeight);
    
    // Adapt coefficients based on convergence rate
    const convergenceRate = this.calculateConvergenceRate();
    
    if (convergenceRate < 0.01) {
      // Increase exploration
      this.config.socialCoefficient *= 1.05;
      this.config.cognitiveCoefficient *= 0.95;
    } else if (convergenceRate > 0.1) {
      // Increase exploitation
      this.config.socialCoefficient *= 0.95;
      this.config.cognitiveCoefficient *= 1.05;
    }
    
    this.emit('parameters:adapted', {
      inertiaWeight: this.config.inertiaWeight,
      cognitive: this.config.cognitiveCoefficient,
      social: this.config.socialCoefficient
    });
  }

  /**
   * Calculate convergence rate
   */
  private calculateConvergenceRate(): number {
    if (this.convergenceHistory.length < 2) return 0;
    
    const recent = this.convergenceHistory.slice(-10);
    const older = this.convergenceHistory.slice(-20, -10);
    
    if (older.length === 0) return 0;
    
    const recentAvg = recent.reduce((sum, val) => sum + val, 0) / recent.length;
    const olderAvg = older.reduce((sum, val) => sum + val, 0) / older.length;
    
    return Math.abs(recentAvg - olderAvg) / Math.max(Math.abs(olderAvg), 1);
  }

  /**
   * Calculate average fitness
   */
  private calculateAverageFitness(): number {
    let sum = 0;
    let count = 0;
    
    for (const particle of this.particles.values()) {
      sum += particle.currentFitness;
      count++;
    }
    
    return count > 0 ? sum / count : 0;
  }

  /**
   * Share optimization results with collective intelligence
   */
  private async shareWithCollective(): Promise<void> {
    await collectiveIntelligence.addKnowledge({
      id: `swarm-optimization-${Date.now()}`,
      content: `Swarm optimization found solution with fitness ${this.globalBest.fitness.toFixed(4)}`,
      type: 'strategy',
      source: Array.from(this.particles.keys()),
      confidence: Math.min(1, this.globalBest.fitness),
      created: new Date(),
      lastAccessed: new Date(),
      accessCount: 1,
      metadata: {
        iterations: this.iteration,
        convergenceRate: this.calculateConvergenceRate(),
        position: this.globalBest.position
      }
    });
  }

  /**
   * Get swarm state
   */
  getSwarmState() {
    return {
      particles: Array.from(this.particles.values()),
      globalBest: this.globalBest,
      iteration: this.iteration,
      config: this.config,
      averageFitness: this.calculateAverageFitness(),
      convergenceRate: this.calculateConvergenceRate()
    };
  }

  /**
   * Reset swarm for new optimization
   */
  reset(config?: Partial<SwarmOptimizationConfig>): void {
    if (config) {
      this.config = { ...this.config, ...config };
    }
    
    this.particles.clear();
    this.globalBest = { position: [], fitness: -Infinity };
    this.iteration = 0;
    this.convergenceHistory = [];
    
    this.initializeSwarm();
  }
}

/**
 * Problem space definition
 */
class ProblemSpace {
  constructor(private dimensions: number) {}
  
  randomPosition(): number[] {
    return Array(this.dimensions).fill(0).map(() => Math.random() * 2 - 1);
  }
  
  randomVelocity(): number[] {
    return Array(this.dimensions).fill(0).map(() => (Math.random() - 0.5) * 0.2);
  }
  
  clamp(value: number, dimension: number): number {
    return Math.max(-1, Math.min(1, value));
  }
  
  evaluate(position: number[]): number {
    // Rastrigin function (multimodal test function)
    const A = 10;
    const n = position.length;
    
    let sum = A * n;
    for (let i = 0; i < n; i++) {
      sum += position[i] * position[i] - A * Math.cos(2 * Math.PI * position[i]);
    }
    
    // Normalize to [0, 1]
    return 1 / (1 + sum);
  }
}

/**
 * Simple neural network for particle intelligence
 */
class SimpleNeuralNetwork {
  private layers: number[];
  
  constructor(inputDim: number) {
    this.layers = [inputDim, Math.ceil(inputDim * 1.5), Math.ceil(inputDim * 0.5), 1];
  }
  
  randomWeights(): number[][] {
    const weights: number[][] = [];
    
    for (let i = 0; i < this.layers.length - 1; i++) {
      const layerWeights: number[] = [];
      const numWeights = this.layers[i] * this.layers[i + 1];
      
      for (let j = 0; j < numWeights; j++) {
        layerWeights.push((Math.random() - 0.5) * 2);
      }
      
      weights.push(layerWeights);
    }
    
    return weights;
  }
  
  unflattenWeights(flat: number[]): number[][] {
    const weights: number[][] = [];
    let offset = 0;
    
    for (let i = 0; i < this.layers.length - 1; i++) {
      const numWeights = this.layers[i] * this.layers[i + 1];
      weights.push(flat.slice(offset, offset + numWeights));
      offset += numWeights;
    }
    
    return weights;
  }
  
  forward(input: number[], weights: number[][]): number[] {
    let activation = [...input];
    
    for (let layer = 0; layer < weights.length; layer++) {
      const layerWeights = weights[layer];
      const inputSize = this.layers[layer];
      const outputSize = this.layers[layer + 1];
      const newActivation: number[] = [];
      
      for (let o = 0; o < outputSize; o++) {
        let sum = 0;
        for (let i = 0; i < inputSize; i++) {
          const weightIndex = i * outputSize + o;
          sum += activation[i] * (layerWeights[weightIndex] || 0);
        }
        newActivation.push(Math.tanh(sum)); // Use tanh activation
      }
      
      activation = newActivation;
    }
    
    return activation;
  }
}

// Export for use in other modules
export const neuralSwarmOptimizer = new NeuralSwarmOptimizer();