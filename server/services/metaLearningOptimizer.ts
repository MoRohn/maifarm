import { EventEmitter } from 'events';
import {
  MetaLearningState,
  HyperparameterSet,
  LearningCurve,
  DomainKnowledge
} from '../types/superintelligence';
import { collectiveIntelligence } from './collectiveIntelligence';
import { neuralSwarmOptimizer } from './neuralSwarmOptimizer';
import { emergentStrategyEngine } from './emergentStrategyEngine';
import { websocketManager } from '../websocket/websocketManager';

/**
 * Meta-Learning Optimizer
 * Learns how to learn better by optimizing learning strategies and transferring knowledge across domains
 */
export class MetaLearningOptimizer extends EventEmitter {
  private state: MetaLearningState;
  private learningHistory: Map<string, TaskLearningHistory>;
  private hyperparameterOptimizer: HyperparameterOptimizer;
  private transferLearningEngine: TransferLearningEngine;
  private learningStrategySelector: LearningStrategySelector;
  private performancePredictor: PerformancePredictor;
  private adaptationScheduler: AdaptationScheduler;

  constructor() {
    super();
    
    this.state = this.initializeState();
    this.learningHistory = new Map();
    this.hyperparameterOptimizer = new HyperparameterOptimizer();
    this.transferLearningEngine = new TransferLearningEngine();
    this.learningStrategySelector = new LearningStrategySelector();
    this.performancePredictor = new PerformancePredictor();
    this.adaptationScheduler = new AdaptationScheduler();
    
    this.startMetaLearning();
  }

  /**
   * Initialize meta-learning state
   */
  private initializeState(): MetaLearningState {
    return {
      learningRate: 0.001,
      adaptationSpeed: 0.5,
      transferEfficiency: 0.3,
      hyperparameters: {
        exploration: 0.3,
        exploitation: 0.7,
        memoryRetention: 0.8,
        generalizationFactor: 0.5,
        noiseLevel: 0.1,
        batchSize: 32,
        updateFrequency: 10
      },
      learningCurves: [],
      domainKnowledge: []
    };
  }

  /**
   * Start meta-learning processes
   */
  private startMetaLearning(): void {
    // Analyze learning curves periodically
    setInterval(() => this.analyzeLearningCurves(), 30000);
    
    // Optimize hyperparameters
    setInterval(() => this.optimizeHyperparameters(), 60000);
    
    // Update transfer learning mappings
    setInterval(() => this.updateTransferMappings(), 45000);
    
    // Predict future performance
    setInterval(() => this.predictPerformance(), 20000);
  }

  /**
   * Learn from a new task
   */
  async learnTask(taskId: string, taskData: any, targetPerformance: number = 0.9): Promise<LearningResult> {
    const startTime = Date.now();
    
    // Select optimal learning strategy
    const strategy = await this.learningStrategySelector.select(taskData, this.state);
    
    // Check for transferable knowledge
    const transferableKnowledge = await this.transferLearningEngine.findTransferableKnowledge(
      taskData,
      this.state.domainKnowledge
    );
    
    // Initialize with transferred knowledge if available
    let currentPerformance = transferableKnowledge ? transferableKnowledge.initialPerformance : 0;
    
    // Create learning curve tracker
    const learningCurve: LearningCurve = {
      taskId,
      dataPoints: [],
      convergenceRate: 0,
      plateauDetected: false
    };
    
    // Learning loop
    let iteration = 0;
    const maxIterations = 1000;
    
    while (iteration < maxIterations && currentPerformance < targetPerformance) {
      // Apply learning strategy
      const improvement = await this.applyLearningStrategy(strategy, taskData, currentPerformance);
      currentPerformance += improvement;
      
      // Record progress
      learningCurve.dataPoints.push({
        iteration,
        performance: currentPerformance,
        timestamp: new Date()
      });
      
      // Check for plateau
      if (this.detectPlateau(learningCurve)) {
        learningCurve.plateauDetected = true;
        
        // Try to escape plateau
        const escapeStrategy = await this.selectPlateauEscapeStrategy(learningCurve);
        await this.applyPlateauEscape(escapeStrategy, taskData);
      }
      
      // Adapt learning rate
      this.adaptLearningRate(learningCurve);
      
      // Update hyperparameters if needed
      if (iteration % this.state.hyperparameters.updateFrequency === 0) {
        await this.updateHyperparameters(learningCurve);
      }
      
      iteration++;
      
      // Emit progress
      if (iteration % 10 === 0) {
        this.emit('learning:progress', {
          taskId,
          iteration,
          performance: currentPerformance,
          learningRate: this.state.learningRate
        });
      }
    }
    
    // Calculate final metrics
    const duration = Date.now() - startTime;
    learningCurve.convergenceRate = this.calculateConvergenceRate(learningCurve);
    
    if (currentPerformance >= targetPerformance) {
      learningCurve.optimalPoint = {
        iteration,
        performance: currentPerformance
      };
    }
    
    // Store learning curve
    this.state.learningCurves.push(learningCurve);
    
    // Update domain knowledge
    await this.updateDomainKnowledge(taskId, taskData, learningCurve);
    
    // Store in history
    this.updateLearningHistory(taskId, learningCurve, strategy);
    
    // Share with collective intelligence
    await this.shareMetaLearning(taskId, learningCurve);
    
    const result: LearningResult = {
      taskId,
      finalPerformance: currentPerformance,
      iterations: iteration,
      duration,
      learningCurve,
      strategy: strategy.name,
      success: currentPerformance >= targetPerformance
    };
    
    this.emit('learning:complete', result);
    
    return result;
  }

  /**
   * Apply learning strategy
   */
  private async applyLearningStrategy(
    strategy: LearningStrategy,
    taskData: any,
    currentPerformance: number
  ): Promise<number> {
    let improvement = 0;
    
    switch (strategy.type) {
      case 'gradient':
        improvement = this.gradientBasedLearning(taskData, currentPerformance);
        break;
        
      case 'evolutionary':
        improvement = await this.evolutionaryLearning(taskData, currentPerformance);
        break;
        
      case 'reinforcement':
        improvement = this.reinforcementLearning(taskData, currentPerformance);
        break;
        
      case 'imitation':
        improvement = this.imitationLearning(taskData, currentPerformance);
        break;
        
      case 'hybrid':
        improvement = await this.hybridLearning(taskData, currentPerformance);
        break;
        
      default:
        improvement = this.defaultLearning(taskData, currentPerformance);
    }
    
    // Apply learning rate
    improvement *= this.state.learningRate;
    
    // Add exploration noise
    improvement += (Math.random() - 0.5) * this.state.hyperparameters.noiseLevel;
    
    return Math.max(0, improvement);
  }

  /**
   * Gradient-based learning
   */
  private gradientBasedLearning(taskData: any, currentPerformance: number): number {
    // Simulate gradient descent
    const gradient = (1 - currentPerformance) * 0.1;
    return gradient * (1 + this.state.hyperparameters.exploitation);
  }

  /**
   * Evolutionary learning
   */
  private async evolutionaryLearning(taskData: any, currentPerformance: number): Promise<number> {
    // Use emergent strategy engine for evolutionary approach
    const strategies = await emergentStrategyEngine.evolve(10, currentPerformance + 0.1);
    
    if (strategies.length > 0) {
      const bestStrategy = strategies[0];
      return (bestStrategy.fitness - currentPerformance) * 0.5;
    }
    
    return 0.01;
  }

  /**
   * Reinforcement learning
   */
  private reinforcementLearning(taskData: any, currentPerformance: number): number {
    // Simulate Q-learning update
    const reward = currentPerformance > 0.5 ? 1 : -1;
    const qValue = currentPerformance + 0.1 * (reward - currentPerformance);
    return (qValue - currentPerformance) * this.state.hyperparameters.exploration;
  }

  /**
   * Imitation learning
   */
  private imitationLearning(taskData: any, currentPerformance: number): number {
    // Learn from best performing examples
    const expertPerformance = 0.95; // Assumed expert level
    const imitation = (expertPerformance - currentPerformance) * 0.05;
    return imitation * this.state.hyperparameters.generalizationFactor;
  }

  /**
   * Hybrid learning combining multiple strategies
   */
  private async hybridLearning(taskData: any, currentPerformance: number): Promise<number> {
    const gradient = this.gradientBasedLearning(taskData, currentPerformance);
    const reinforcement = this.reinforcementLearning(taskData, currentPerformance);
    const imitation = this.imitationLearning(taskData, currentPerformance);
    
    // Weighted combination
    return (gradient * 0.4 + reinforcement * 0.3 + imitation * 0.3);
  }

  /**
   * Default learning strategy
   */
  private defaultLearning(taskData: any, currentPerformance: number): number {
    return (1 - currentPerformance) * 0.05;
  }

  /**
   * Detect learning plateau
   */
  private detectPlateau(curve: LearningCurve): boolean {
    if (curve.dataPoints.length < 20) return false;
    
    const recent = curve.dataPoints.slice(-20);
    const performances = recent.map(p => p.performance);
    const variance = this.calculateVariance(performances);
    
    return variance < 0.0001;
  }

  /**
   * Select plateau escape strategy
   */
  private async selectPlateauEscapeStrategy(curve: LearningCurve): Promise<PlateauEscapeStrategy> {
    const strategies: PlateauEscapeStrategy[] = [
      { name: 'momentum', strength: 0.9 },
      { name: 'random_restart', strength: 0.5 },
      { name: 'increase_exploration', strength: 0.8 },
      { name: 'change_strategy', strength: 0.7 },
      { name: 'add_noise', strength: 0.6 }
    ];
    
    // Select based on plateau characteristics
    const plateauDuration = curve.dataPoints.length - 
      (curve.dataPoints.findIndex(p => p.performance >= curve.dataPoints[curve.dataPoints.length - 1].performance - 0.01) || 0);
    
    if (plateauDuration > 50) {
      return strategies[1]; // Random restart for long plateaus
    } else if (plateauDuration > 30) {
      return strategies[3]; // Change strategy for medium plateaus
    } else {
      return strategies[0]; // Momentum for short plateaus
    }
  }

  /**
   * Apply plateau escape strategy
   */
  private async applyPlateauEscape(strategy: PlateauEscapeStrategy, taskData: any): Promise<void> {
    switch (strategy.name) {
      case 'momentum':
        this.state.learningRate *= 1.5;
        break;
        
      case 'random_restart':
        // Reset some hyperparameters
        this.state.hyperparameters.exploration = Math.random();
        this.state.hyperparameters.exploitation = 1 - this.state.hyperparameters.exploration;
        break;
        
      case 'increase_exploration':
        this.state.hyperparameters.exploration = Math.min(1, this.state.hyperparameters.exploration * 1.5);
        this.state.hyperparameters.exploitation = 1 - this.state.hyperparameters.exploration;
        break;
        
      case 'change_strategy':
        // Will be handled in next iteration
        break;
        
      case 'add_noise':
        this.state.hyperparameters.noiseLevel = Math.min(0.5, this.state.hyperparameters.noiseLevel * 2);
        break;
    }
    
    this.emit('plateau:escape', { strategy: strategy.name, strength: strategy.strength });
  }

  /**
   * Adapt learning rate based on progress
   */
  private adaptLearningRate(curve: LearningCurve): void {
    if (curve.dataPoints.length < 2) return;
    
    const recent = curve.dataPoints.slice(-10);
    const older = curve.dataPoints.slice(-20, -10);
    
    if (older.length === 0) return;
    
    const recentImprovement = recent[recent.length - 1].performance - recent[0].performance;
    const olderImprovement = older[older.length - 1].performance - older[0].performance;
    
    if (recentImprovement > olderImprovement) {
      // Accelerating - increase learning rate
      this.state.learningRate = Math.min(0.1, this.state.learningRate * 1.05);
    } else if (recentImprovement < olderImprovement * 0.5) {
      // Slowing down - decrease learning rate
      this.state.learningRate = Math.max(0.0001, this.state.learningRate * 0.95);
    }
  }

  /**
   * Update hyperparameters during learning
   */
  private async updateHyperparameters(curve: LearningCurve): Promise<void> {
    const optimized = await this.hyperparameterOptimizer.optimize(
      this.state.hyperparameters,
      curve
    );
    
    // Smooth update to avoid instability
    const alpha = 0.3; // Update rate
    
    Object.keys(optimized).forEach(key => {
      const k = key as keyof HyperparameterSet;
      this.state.hyperparameters[k] = 
        this.state.hyperparameters[k] * (1 - alpha) + optimized[k] * alpha;
    });
  }

  /**
   * Calculate convergence rate
   */
  private calculateConvergenceRate(curve: LearningCurve): number {
    if (curve.dataPoints.length < 2) return 0;
    
    const first = curve.dataPoints[0];
    const last = curve.dataPoints[curve.dataPoints.length - 1];
    const iterations = last.iteration - first.iteration;
    
    if (iterations === 0) return 0;
    
    return (last.performance - first.performance) / iterations;
  }

  /**
   * Calculate variance
   */
  private calculateVariance(values: number[]): number {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  }

  /**
   * Update domain knowledge
   */
  private async updateDomainKnowledge(
    taskId: string,
    taskData: any,
    curve: LearningCurve
  ): Promise<void> {
    const domain = this.extractDomain(taskData);
    const concepts = this.extractConcepts(taskData);
    const relationships = this.extractRelationships(concepts);
    
    const knowledge: DomainKnowledge = {
      domain,
      concepts,
      relationships,
      transferability: this.calculateTransferability(curve),
      applications: [taskId]
    };
    
    // Check if domain exists
    const existing = this.state.domainKnowledge.find(k => k.domain === domain);
    
    if (existing) {
      // Merge knowledge
      existing.concepts = [...new Set([...existing.concepts, ...concepts])];
      existing.relationships = [...existing.relationships, ...relationships];
      existing.applications.push(taskId);
      existing.transferability = (existing.transferability + knowledge.transferability) / 2;
    } else {
      this.state.domainKnowledge.push(knowledge);
    }
  }

  /**
   * Extract domain from task data
   */
  private extractDomain(taskData: any): string {
    // Simplified domain extraction
    if (taskData.type) return taskData.type;
    if (taskData.category) return taskData.category;
    return 'general';
  }

  /**
   * Extract concepts from task data
   */
  private extractConcepts(taskData: any): string[] {
    const concepts: string[] = [];
    
    // Extract from various possible fields
    if (taskData.features) concepts.push(...taskData.features);
    if (taskData.objectives) concepts.push(...taskData.objectives);
    if (taskData.constraints) concepts.push(...taskData.constraints);
    
    return concepts;
  }

  /**
   * Extract relationships between concepts
   */
  private extractRelationships(concepts: string[]): string[][] {
    const relationships: string[][] = [];
    
    // Create pairwise relationships for strongly related concepts
    for (let i = 0; i < concepts.length - 1; i++) {
      for (let j = i + 1; j < concepts.length; j++) {
        if (this.areRelated(concepts[i], concepts[j])) {
          relationships.push([concepts[i], concepts[j]]);
        }
      }
    }
    
    return relationships;
  }

  /**
   * Check if two concepts are related
   */
  private areRelated(concept1: string, concept2: string): boolean {
    // Simplified relationship detection
    const commonWords = concept1.split(' ').filter(word => 
      concept2.toLowerCase().includes(word.toLowerCase())
    );
    
    return commonWords.length > 0;
  }

  /**
   * Calculate transferability score
   */
  private calculateTransferability(curve: LearningCurve): number {
    // High convergence rate and low iterations = high transferability
    const convergenceScore = Math.min(1, curve.convergenceRate * 10);
    const efficiencyScore = curve.optimalPoint 
      ? 1 / (1 + curve.optimalPoint.iteration / 100)
      : 0;
    
    return (convergenceScore + efficiencyScore) / 2;
  }

  /**
   * Update learning history
   */
  private updateLearningHistory(
    taskId: string,
    curve: LearningCurve,
    strategy: LearningStrategy
  ): void {
    this.learningHistory.set(taskId, {
      taskId,
      learningCurve: curve,
      strategy: strategy.name,
      hyperparameters: { ...this.state.hyperparameters },
      startTime: curve.dataPoints[0]?.timestamp || new Date(),
      endTime: curve.dataPoints[curve.dataPoints.length - 1]?.timestamp || new Date(),
      success: curve.optimalPoint !== undefined
    });
  }

  /**
   * Analyze learning curves to improve future learning
   */
  private async analyzeLearningCurves(): Promise<void> {
    if (this.state.learningCurves.length < 5) return;
    
    // Analyze recent curves
    const recentCurves = this.state.learningCurves.slice(-10);
    
    // Calculate average convergence characteristics
    const avgConvergence = recentCurves.reduce((sum, c) => sum + c.convergenceRate, 0) / recentCurves.length;
    const plateauRate = recentCurves.filter(c => c.plateauDetected).length / recentCurves.length;
    
    // Adjust adaptation speed based on analysis
    if (avgConvergence < 0.01) {
      // Slow convergence - increase adaptation speed
      this.state.adaptationSpeed = Math.min(1, this.state.adaptationSpeed * 1.1);
    } else if (avgConvergence > 0.1) {
      // Fast convergence - can reduce adaptation speed
      this.state.adaptationSpeed = Math.max(0.1, this.state.adaptationSpeed * 0.95);
    }
    
    // Adjust transfer efficiency based on success rate
    const successRate = recentCurves.filter(c => c.optimalPoint !== undefined).length / recentCurves.length;
    this.state.transferEfficiency = successRate;
    
    this.emit('analysis:complete', {
      avgConvergence,
      plateauRate,
      successRate,
      adaptationSpeed: this.state.adaptationSpeed
    });
  }

  /**
   * Optimize hyperparameters based on historical performance
   */
  private async optimizeHyperparameters(): Promise<void> {
    const optimization = await neuralSwarmOptimizer.optimize();
    
    // Map optimization results to hyperparameters
    if (optimization.position.length >= 7) {
      this.state.hyperparameters = {
        exploration: Math.abs(optimization.position[0]) % 1,
        exploitation: Math.abs(optimization.position[1]) % 1,
        memoryRetention: Math.abs(optimization.position[2]) % 1,
        generalizationFactor: Math.abs(optimization.position[3]) % 1,
        noiseLevel: Math.abs(optimization.position[4]) % 0.5,
        batchSize: Math.floor(Math.abs(optimization.position[5]) * 100) + 1,
        updateFrequency: Math.floor(Math.abs(optimization.position[6]) * 50) + 1
      };
      
      // Normalize exploration/exploitation
      const total = this.state.hyperparameters.exploration + this.state.hyperparameters.exploitation;
      this.state.hyperparameters.exploration /= total;
      this.state.hyperparameters.exploitation /= total;
    }
    
    this.emit('hyperparameters:optimized', this.state.hyperparameters);
  }

  /**
   * Update transfer learning mappings
   */
  private async updateTransferMappings(): Promise<void> {
    await this.transferLearningEngine.updateMappings(this.state.domainKnowledge);
  }

  /**
   * Predict future performance
   */
  private async predictPerformance(): Promise<void> {
    if (this.state.learningCurves.length < 3) return;
    
    const predictions = await this.performancePredictor.predict(
      this.state.learningCurves,
      this.state.hyperparameters
    );
    
    websocketManager.broadcast('metalearning:predictions', predictions);
  }

  /**
   * Share meta-learning insights with collective intelligence
   */
  private async shareMetaLearning(taskId: string, curve: LearningCurve): Promise<void> {
    await collectiveIntelligence.addKnowledge({
      id: `metalearning-${taskId}`,
      content: `Meta-learning completed task ${taskId} with convergence rate ${curve.convergenceRate.toFixed(4)}`,
      type: 'insight',
      source: ['meta-learning-optimizer'],
      confidence: curve.optimalPoint ? 1 : 0.5,
      created: new Date(),
      lastAccessed: new Date(),
      accessCount: 1,
      metadata: {
        convergenceRate: curve.convergenceRate,
        iterations: curve.dataPoints.length,
        plateauDetected: curve.plateauDetected,
        hyperparameters: this.state.hyperparameters
      }
    });
  }

  /**
   * Get current state
   */
  getState(): MetaLearningState {
    return this.state;
  }

  /**
   * Get learning history for a task
   */
  getTaskHistory(taskId: string): TaskLearningHistory | undefined {
    return this.learningHistory.get(taskId);
  }

  /**
   * Get performance statistics
   */
  getStatistics() {
    const totalTasks = this.learningHistory.size;
    const successfulTasks = Array.from(this.learningHistory.values())
      .filter(h => h.success).length;
    
    const avgConvergence = this.state.learningCurves.length > 0
      ? this.state.learningCurves.reduce((sum, c) => sum + c.convergenceRate, 0) / this.state.learningCurves.length
      : 0;
    
    return {
      totalTasks,
      successfulTasks,
      successRate: totalTasks > 0 ? successfulTasks / totalTasks : 0,
      avgConvergence,
      currentHyperparameters: this.state.hyperparameters,
      domainsCovered: this.state.domainKnowledge.length
    };
  }
}

/**
 * Hyperparameter optimizer
 */
class HyperparameterOptimizer {
  async optimize(current: HyperparameterSet, curve: LearningCurve): Promise<HyperparameterSet> {
    // Bayesian optimization simulation
    const optimized = { ...current };
    
    // Adjust based on curve characteristics
    if (curve.plateauDetected) {
      optimized.exploration *= 1.2;
      optimized.noiseLevel *= 1.5;
    }
    
    if (curve.convergenceRate < 0.01) {
      optimized.batchSize = Math.max(1, Math.floor(optimized.batchSize * 0.8));
      optimized.updateFrequency = Math.max(1, Math.floor(optimized.updateFrequency * 0.9));
    }
    
    // Normalize
    Object.keys(optimized).forEach(key => {
      const k = key as keyof HyperparameterSet;
      if (typeof optimized[k] === 'number') {
        if (k !== 'batchSize' && k !== 'updateFrequency') {
          optimized[k] = Math.max(0, Math.min(1, optimized[k] as number)) as any;
        }
      }
    });
    
    return optimized;
  }
}

/**
 * Transfer learning engine
 */
class TransferLearningEngine {
  private knowledgeMap: Map<string, TransferableKnowledge> = new Map();
  
  async findTransferableKnowledge(
    taskData: any,
    domainKnowledge: DomainKnowledge[]
  ): Promise<TransferableKnowledge | null> {
    const taskDomain = taskData.type || 'general';
    
    // Find relevant domain knowledge
    const relevant = domainKnowledge.find(k => k.domain === taskDomain);
    
    if (relevant && relevant.transferability > 0.5) {
      return {
        source: relevant.domain,
        concepts: relevant.concepts,
        initialPerformance: relevant.transferability * 0.3,
        boost: relevant.transferability
      };
    }
    
    return null;
  }
  
  async updateMappings(domainKnowledge: DomainKnowledge[]): Promise<void> {
    // Update knowledge transfer mappings
    domainKnowledge.forEach(knowledge => {
      this.knowledgeMap.set(knowledge.domain, {
        source: knowledge.domain,
        concepts: knowledge.concepts,
        initialPerformance: knowledge.transferability * 0.2,
        boost: knowledge.transferability
      });
    });
  }
}

/**
 * Learning strategy selector
 */
class LearningStrategySelector {
  async select(taskData: any, state: MetaLearningState): Promise<LearningStrategy> {
    const strategies: LearningStrategy[] = [
      { name: 'gradient-descent', type: 'gradient', suitability: 0.7 },
      { name: 'evolution', type: 'evolutionary', suitability: 0.6 },
      { name: 'q-learning', type: 'reinforcement', suitability: 0.65 },
      { name: 'imitation', type: 'imitation', suitability: 0.5 },
      { name: 'hybrid', type: 'hybrid', suitability: 0.8 }
    ];
    
    // Select based on task characteristics and current state
    if (state.hyperparameters.exploration > 0.6) {
      return strategies[1]; // Evolutionary for high exploration
    } else if (state.hyperparameters.exploitation > 0.7) {
      return strategies[0]; // Gradient for high exploitation
    } else {
      return strategies[4]; // Hybrid for balanced approach
    }
  }
}

/**
 * Performance predictor
 */
class PerformancePredictor {
  async predict(
    curves: LearningCurve[],
    hyperparameters: HyperparameterSet
  ): Promise<PerformancePrediction[]> {
    const predictions: PerformancePrediction[] = [];
    
    // Simple trend-based prediction
    curves.slice(-3).forEach(curve => {
      if (curve.dataPoints.length > 10) {
        const recent = curve.dataPoints.slice(-10);
        const trend = this.calculateTrend(recent);
        
        predictions.push({
          taskId: curve.taskId,
          predictedPerformance: Math.min(1, recent[recent.length - 1].performance + trend * 10),
          confidence: 0.7,
          horizon: 10
        });
      }
    });
    
    return predictions;
  }
  
  private calculateTrend(dataPoints: { iteration: number; performance: number }[]): number {
    if (dataPoints.length < 2) return 0;
    
    const n = dataPoints.length;
    const sumX = dataPoints.reduce((sum, p) => sum + p.iteration, 0);
    const sumY = dataPoints.reduce((sum, p) => sum + p.performance, 0);
    const sumXY = dataPoints.reduce((sum, p) => sum + p.iteration * p.performance, 0);
    const sumX2 = dataPoints.reduce((sum, p) => sum + p.iteration * p.iteration, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    
    return isNaN(slope) ? 0 : slope;
  }
}

/**
 * Adaptation scheduler
 */
class AdaptationScheduler {
  scheduleAdaptation(state: MetaLearningState): AdaptationSchedule {
    return {
      nextAdaptation: new Date(Date.now() + 60000),
      adaptationType: state.adaptationSpeed > 0.7 ? 'aggressive' : 'conservative',
      priority: state.learningCurves.some(c => c.plateauDetected) ? 'high' : 'normal'
    };
  }
}

// Type definitions for internal use
interface LearningResult {
  taskId: string;
  finalPerformance: number;
  iterations: number;
  duration: number;
  learningCurve: LearningCurve;
  strategy: string;
  success: boolean;
}

interface LearningStrategy {
  name: string;
  type: 'gradient' | 'evolutionary' | 'reinforcement' | 'imitation' | 'hybrid';
  suitability: number;
}

interface PlateauEscapeStrategy {
  name: string;
  strength: number;
}

interface TaskLearningHistory {
  taskId: string;
  learningCurve: LearningCurve;
  strategy: string;
  hyperparameters: HyperparameterSet;
  startTime: Date;
  endTime: Date;
  success: boolean;
}

interface TransferableKnowledge {
  source: string;
  concepts: string[];
  initialPerformance: number;
  boost: number;
}

interface PerformancePrediction {
  taskId: string;
  predictedPerformance: number;
  confidence: number;
  horizon: number;
}

interface AdaptationSchedule {
  nextAdaptation: Date;
  adaptationType: string;
  priority: string;
}

// Export singleton instance
export const metaLearningOptimizer = new MetaLearningOptimizer();