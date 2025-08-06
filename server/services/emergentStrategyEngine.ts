import { EventEmitter } from 'events';
import {
  EmergentStrategy,
  StrategyPhenotype,
  StrategyAction,
  StrategyCondition
} from '../types/superintelligence';
import { collectiveIntelligence } from './collectiveIntelligence';
import { neuralSwarmOptimizer } from './neuralSwarmOptimizer';
import { websocketManager } from '../websocket/websocketManager';

/**
 * Emergent Strategy Discovery Engine
 * Uses genetic algorithms and evolutionary computation to discover novel problem-solving strategies
 */
export class EmergentStrategyEngine extends EventEmitter {
  private population: Map<string, EmergentStrategy>;
  private generation: number;
  private eliteStrategies: EmergentStrategy[];
  private strategyHistory: Map<string, StrategyPerformance>;
  private mutationRate: number;
  private crossoverRate: number;
  private populationSize: number;
  private tournamentSize: number;
  private elitismRate: number;
  private innovationArchive: InnovationArchive;

  constructor() {
    super();
    
    this.population = new Map();
    this.generation = 0;
    this.eliteStrategies = [];
    this.strategyHistory = new Map();
    this.mutationRate = 0.1;
    this.crossoverRate = 0.7;
    this.populationSize = 50;
    this.tournamentSize = 5;
    this.elitismRate = 0.1;
    this.innovationArchive = new InnovationArchive();
    
    this.initializePopulation();
  }

  /**
   * Initialize strategy population
   */
  private initializePopulation(): void {
    for (let i = 0; i < this.populationSize; i++) {
      const strategy = this.createRandomStrategy();
      this.population.set(strategy.id, strategy);
    }
    
    this.emit('population:initialized', {
      size: this.populationSize,
      generation: this.generation
    });
  }

  /**
   * Create a random strategy
   */
  private createRandomStrategy(): EmergentStrategy {
    const genotype = this.generateRandomGenotype();
    const phenotype = this.expressPhenotype(genotype);
    
    return {
      id: `strategy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: this.generateStrategyName(phenotype),
      description: this.describeStrategy(phenotype),
      genotype,
      phenotype,
      fitness: 0,
      generation: this.generation,
      mutations: 0,
      discovered: new Date()
    };
  }

  /**
   * Generate random genotype
   */
  private generateRandomGenotype(): number[] {
    const length = 50 + Math.floor(Math.random() * 50); // Variable length genomes
    return Array(length).fill(0).map(() => Math.random());
  }

  /**
   * Express genotype as phenotype (strategy)
   */
  private expressPhenotype(genotype: number[]): StrategyPhenotype {
    const actions = this.decodeActions(genotype.slice(0, Math.floor(genotype.length * 0.4)));
    const conditions = this.decodeConditions(genotype.slice(Math.floor(genotype.length * 0.4), Math.floor(genotype.length * 0.7)));
    const objectives = this.decodeObjectives(genotype.slice(Math.floor(genotype.length * 0.7), Math.floor(genotype.length * 0.85)));
    const constraints = this.decodeConstraints(genotype.slice(Math.floor(genotype.length * 0.85)));
    
    return {
      actions,
      conditions,
      objectives,
      constraints,
      expectedOutcome: this.predictOutcome(actions, conditions)
    };
  }

  /**
   * Decode genotype segment into actions
   */
  private decodeActions(genes: number[]): StrategyAction[] {
    const actionTypes = [
      'explore', 'exploit', 'collaborate', 'compete', 'analyze',
      'synthesize', 'abstract', 'specialize', 'generalize', 'innovate'
    ];
    
    const actions: StrategyAction[] = [];
    
    for (let i = 0; i < genes.length; i += 3) {
      if (i + 2 < genes.length) {
        const typeIndex = Math.floor(genes[i] * actionTypes.length);
        const priority = genes[i + 1];
        const intensity = genes[i + 2];
        
        actions.push({
          type: actionTypes[typeIndex],
          parameters: {
            intensity,
            focus: this.decodeFocus(genes[i]),
            method: this.decodeMethod(genes[i + 1])
          },
          priority,
          dependencies: this.decodeDependencies(genes, i)
        });
      }
    }
    
    return actions;
  }

  /**
   * Decode focus area from gene
   */
  private decodeFocus(gene: number): string {
    const focuses = ['efficiency', 'accuracy', 'speed', 'robustness', 'novelty'];
    return focuses[Math.floor(gene * focuses.length)];
  }

  /**
   * Decode method from gene
   */
  private decodeMethod(gene: number): string {
    const methods = ['iterative', 'recursive', 'parallel', 'sequential', 'hybrid'];
    return methods[Math.floor(gene * methods.length)];
  }

  /**
   * Decode action dependencies
   */
  private decodeDependencies(genes: number[], currentIndex: number): string[] {
    const dependencies: string[] = [];
    
    // Look at nearby genes for dependencies
    if (currentIndex > 3 && genes[currentIndex] > 0.7) {
      dependencies.push(`action-${currentIndex - 3}`);
    }
    
    return dependencies;
  }

  /**
   * Decode conditions from genes
   */
  private decodeConditions(genes: number[]): StrategyCondition[] {
    const conditions: StrategyCondition[] = [];
    
    for (let i = 0; i < genes.length; i += 2) {
      if (i + 1 < genes.length) {
        const type = genes[i] < 0.33 ? 'prerequisite' : genes[i] < 0.66 ? 'trigger' : 'termination';
        const threshold = genes[i + 1];
        
        conditions.push({
          type,
          expression: `metric > ${threshold.toFixed(2)}`,
          evaluation: () => Math.random() > threshold // Placeholder evaluation
        });
      }
    }
    
    return conditions;
  }

  /**
   * Decode objectives from genes
   */
  private decodeObjectives(genes: number[]): string[] {
    const allObjectives = [
      'maximize efficiency',
      'minimize errors',
      'increase throughput',
      'reduce complexity',
      'enhance creativity',
      'improve accuracy',
      'accelerate learning',
      'strengthen robustness'
    ];
    
    const selectedObjectives: string[] = [];
    
    genes.forEach((gene, i) => {
      if (gene > 0.5 && i < allObjectives.length) {
        selectedObjectives.push(allObjectives[i]);
      }
    });
    
    return selectedObjectives.length > 0 ? selectedObjectives : ['maximize efficiency'];
  }

  /**
   * Decode constraints from genes
   */
  private decodeConstraints(genes: number[]): string[] {
    const constraints: string[] = [];
    
    genes.forEach((gene, i) => {
      if (gene > 0.7) {
        constraints.push(`constraint_${i}: value < ${gene.toFixed(2)}`);
      }
    });
    
    return constraints;
  }

  /**
   * Predict outcome based on actions and conditions
   */
  private predictOutcome(actions: StrategyAction[], conditions: StrategyCondition[]): string {
    const primaryAction = actions.sort((a, b) => b.priority - a.priority)[0];
    const activeConditions = conditions.filter(c => c.type === 'trigger').length;
    
    return `${primaryAction?.type || 'undefined'} strategy with ${activeConditions} triggers`;
  }

  /**
   * Generate strategy name based on phenotype
   */
  private generateStrategyName(phenotype: StrategyPhenotype): string {
    const primaryAction = phenotype.actions[0]?.type || 'unknown';
    const primaryObjective = phenotype.objectives[0]?.split(' ')[0] || 'general';
    
    return `${primaryObjective}-${primaryAction}-${this.generation}`;
  }

  /**
   * Describe strategy in human-readable form
   */
  private describeStrategy(phenotype: StrategyPhenotype): string {
    const actionList = phenotype.actions.map(a => a.type).join(', ');
    const objectiveList = phenotype.objectives.join('; ');
    
    return `Strategy employing [${actionList}] to achieve [${objectiveList}]`;
  }

  /**
   * Evolve strategies for multiple generations
   */
  async evolve(generations: number = 100, targetFitness: number = 0.95): Promise<EmergentStrategy[]> {
    const startTime = Date.now();
    
    for (let gen = 0; gen < generations; gen++) {
      await this.evolutionStep();
      
      // Check if target fitness reached
      const bestStrategy = this.getBestStrategy();
      if (bestStrategy && bestStrategy.fitness >= targetFitness) {
        this.emit('evolution:targetReached', {
          strategy: bestStrategy,
          generation: this.generation
        });
        break;
      }
      
      // Adaptive mutation
      if (gen % 10 === 0) {
        this.adaptEvolutionParameters();
      }
      
      this.generation++;
    }
    
    const duration = Date.now() - startTime;
    const bestStrategies = this.getEliteStrategies();
    
    this.emit('evolution:complete', {
      generations: this.generation,
      duration,
      bestStrategies,
      innovationsDiscovered: this.innovationArchive.getCount()
    });
    
    // Share discoveries with collective intelligence
    await this.shareDiscoveries(bestStrategies);
    
    return bestStrategies;
  }

  /**
   * Single evolution step
   */
  private async evolutionStep(): Promise<void> {
    // Evaluate fitness
    await this.evaluatePopulation();
    
    // Select elite strategies
    this.selectElite();
    
    // Create new generation
    const newPopulation: Map<string, EmergentStrategy> = new Map();
    
    // Keep elite strategies
    this.eliteStrategies.forEach(strategy => {
      newPopulation.set(strategy.id, { ...strategy });
    });
    
    // Generate offspring
    while (newPopulation.size < this.populationSize) {
      const offspring = await this.createOffspring();
      newPopulation.set(offspring.id, offspring);
    }
    
    this.population = newPopulation;
    
    // Broadcast progress
    if (this.generation % 5 === 0) {
      websocketManager.broadcast('strategy:evolution', {
        generation: this.generation,
        bestFitness: this.getBestStrategy()?.fitness || 0,
        averageFitness: this.getAverageFitness(),
        diversityIndex: this.calculateDiversity()
      });
    }
  }

  /**
   * Evaluate population fitness
   */
  private async evaluatePopulation(): Promise<void> {
    for (const [id, strategy] of this.population) {
      strategy.fitness = await this.evaluateStrategy(strategy);
      
      // Track performance history
      this.updatePerformanceHistory(strategy);
      
      // Check for innovations
      if (this.isInnovative(strategy)) {
        this.innovationArchive.add(strategy);
        this.emit('innovation:discovered', strategy);
      }
    }
  }

  /**
   * Evaluate individual strategy fitness
   */
  private async evaluateStrategy(strategy: EmergentStrategy): Promise<number> {
    // Multi-objective fitness evaluation
    
    // 1. Effectiveness (how well it achieves objectives)
    const effectiveness = this.evaluateEffectiveness(strategy);
    
    // 2. Efficiency (resource usage)
    const efficiency = this.evaluateEfficiency(strategy);
    
    // 3. Novelty (how different from existing strategies)
    const novelty = this.evaluateNovelty(strategy);
    
    // 4. Robustness (performance across different scenarios)
    const robustness = await this.evaluateRobustness(strategy);
    
    // 5. Complexity penalty
    const complexityPenalty = 1 / (1 + strategy.phenotype.actions.length * 0.1);
    
    // Weighted combination
    return (
      effectiveness * 0.3 +
      efficiency * 0.25 +
      novelty * 0.2 +
      robustness * 0.2 +
      complexityPenalty * 0.05
    );
  }

  /**
   * Evaluate strategy effectiveness
   */
  private evaluateEffectiveness(strategy: EmergentStrategy): number {
    // Simulate strategy execution
    let score = 0;
    
    strategy.phenotype.actions.forEach(action => {
      // Score based on action type and parameters
      score += this.scoreAction(action);
    });
    
    // Normalize
    return Math.min(1, score / strategy.phenotype.actions.length);
  }

  /**
   * Score individual action
   */
  private scoreAction(action: StrategyAction): number {
    const scores: Record<string, number> = {
      'explore': 0.7,
      'exploit': 0.8,
      'collaborate': 0.9,
      'compete': 0.6,
      'analyze': 0.75,
      'synthesize': 0.85,
      'abstract': 0.8,
      'specialize': 0.7,
      'generalize': 0.75,
      'innovate': 0.95
    };
    
    const baseScore = scores[action.type] || 0.5;
    const intensityBonus = (action.parameters.intensity as number) * 0.1;
    
    return Math.min(1, baseScore + intensityBonus);
  }

  /**
   * Evaluate strategy efficiency
   */
  private evaluateEfficiency(strategy: EmergentStrategy): number {
    // Fewer actions with higher priority = more efficient
    const actionCount = strategy.phenotype.actions.length;
    const avgPriority = strategy.phenotype.actions
      .reduce((sum, a) => sum + a.priority, 0) / Math.max(1, actionCount);
    
    return (1 / (1 + actionCount * 0.1)) * avgPriority;
  }

  /**
   * Evaluate strategy novelty
   */
  private evaluateNovelty(strategy: EmergentStrategy): number {
    // Compare to existing strategies
    let minDistance = Infinity;
    
    for (const [id, other] of this.population) {
      if (id !== strategy.id) {
        const distance = this.calculateStrategyDistance(strategy, other);
        minDistance = Math.min(minDistance, distance);
      }
    }
    
    // Also compare to elite strategies
    this.eliteStrategies.forEach(elite => {
      if (elite.id !== strategy.id) {
        const distance = this.calculateStrategyDistance(strategy, elite);
        minDistance = Math.min(minDistance, distance);
      }
    });
    
    return Math.min(1, minDistance);
  }

  /**
   * Calculate distance between strategies
   */
  private calculateStrategyDistance(s1: EmergentStrategy, s2: EmergentStrategy): number {
    // Genotype distance
    const minLength = Math.min(s1.genotype.length, s2.genotype.length);
    let distance = 0;
    
    for (let i = 0; i < minLength; i++) {
      distance += Math.abs(s1.genotype[i] - s2.genotype[i]);
    }
    
    // Penalize length difference
    distance += Math.abs(s1.genotype.length - s2.genotype.length) * 0.1;
    
    return distance / Math.max(s1.genotype.length, s2.genotype.length);
  }

  /**
   * Evaluate strategy robustness
   */
  private async evaluateRobustness(strategy: EmergentStrategy): Promise<number> {
    // Test strategy across different scenarios
    const scenarios = 5;
    let totalScore = 0;
    
    for (let i = 0; i < scenarios; i++) {
      // Simulate different conditions
      const noise = Math.random() * 0.2;
      const perturbedStrategy = this.perturbStrategy(strategy, noise);
      const score = this.evaluateEffectiveness(perturbedStrategy);
      totalScore += score;
    }
    
    return totalScore / scenarios;
  }

  /**
   * Perturb strategy for robustness testing
   */
  private perturbStrategy(strategy: EmergentStrategy, noise: number): EmergentStrategy {
    const perturbed = { ...strategy };
    
    perturbed.genotype = strategy.genotype.map(gene => 
      Math.max(0, Math.min(1, gene + (Math.random() - 0.5) * noise))
    );
    
    perturbed.phenotype = this.expressPhenotype(perturbed.genotype);
    
    return perturbed;
  }

  /**
   * Check if strategy is innovative
   */
  private isInnovative(strategy: EmergentStrategy): boolean {
    return strategy.fitness > 0.8 && this.evaluateNovelty(strategy) > 0.5;
  }

  /**
   * Update performance history
   */
  private updatePerformanceHistory(strategy: EmergentStrategy): void {
    if (!this.strategyHistory.has(strategy.id)) {
      this.strategyHistory.set(strategy.id, {
        strategyId: strategy.id,
        fitnessHistory: [],
        bestFitness: 0,
        averageFitness: 0,
        stability: 0
      });
    }
    
    const history = this.strategyHistory.get(strategy.id)!;
    history.fitnessHistory.push(strategy.fitness);
    history.bestFitness = Math.max(history.bestFitness, strategy.fitness);
    history.averageFitness = history.fitnessHistory.reduce((sum, f) => sum + f, 0) / history.fitnessHistory.length;
    
    // Calculate stability (low variance = high stability)
    if (history.fitnessHistory.length > 1) {
      const variance = this.calculateVariance(history.fitnessHistory);
      history.stability = 1 / (1 + variance);
    }
  }

  /**
   * Calculate variance
   */
  private calculateVariance(values: number[]): number {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  }

  /**
   * Select elite strategies
   */
  private selectElite(): void {
    const sorted = Array.from(this.population.values())
      .sort((a, b) => b.fitness - a.fitness);
    
    const eliteCount = Math.floor(this.populationSize * this.elitismRate);
    this.eliteStrategies = sorted.slice(0, eliteCount);
  }

  /**
   * Create offspring through crossover and mutation
   */
  private async createOffspring(): Promise<EmergentStrategy> {
    // Tournament selection
    const parent1 = this.tournamentSelection();
    const parent2 = this.tournamentSelection();
    
    let offspring: EmergentStrategy;
    
    if (Math.random() < this.crossoverRate && parent1.id !== parent2.id) {
      // Crossover
      offspring = this.crossover(parent1, parent2);
    } else {
      // Clone one parent
      offspring = this.cloneStrategy(parent1);
    }
    
    // Mutation
    if (Math.random() < this.mutationRate) {
      offspring = this.mutate(offspring);
    }
    
    offspring.generation = this.generation;
    offspring.parents = [parent1.id, parent2.id];
    
    return offspring;
  }

  /**
   * Tournament selection
   */
  private tournamentSelection(): EmergentStrategy {
    const tournament: EmergentStrategy[] = [];
    const strategies = Array.from(this.population.values());
    
    for (let i = 0; i < this.tournamentSize; i++) {
      const random = strategies[Math.floor(Math.random() * strategies.length)];
      tournament.push(random);
    }
    
    return tournament.sort((a, b) => b.fitness - a.fitness)[0];
  }

  /**
   * Crossover two strategies
   */
  private crossover(parent1: EmergentStrategy, parent2: EmergentStrategy): EmergentStrategy {
    const minLength = Math.min(parent1.genotype.length, parent2.genotype.length);
    const crossoverPoint = Math.floor(Math.random() * minLength);
    
    const genotype = [
      ...parent1.genotype.slice(0, crossoverPoint),
      ...parent2.genotype.slice(crossoverPoint)
    ];
    
    const phenotype = this.expressPhenotype(genotype);
    
    return {
      id: `strategy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: this.generateStrategyName(phenotype),
      description: this.describeStrategy(phenotype),
      genotype,
      phenotype,
      fitness: 0,
      generation: this.generation,
      parents: [parent1.id, parent2.id],
      mutations: 0,
      discovered: new Date()
    };
  }

  /**
   * Clone strategy
   */
  private cloneStrategy(strategy: EmergentStrategy): EmergentStrategy {
    return {
      ...strategy,
      id: `strategy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      genotype: [...strategy.genotype],
      discovered: new Date()
    };
  }

  /**
   * Mutate strategy
   */
  private mutate(strategy: EmergentStrategy): EmergentStrategy {
    const mutated = { ...strategy };
    mutated.mutations = (mutated.mutations || 0) + 1;
    
    // Point mutations
    mutated.genotype = mutated.genotype.map(gene => {
      if (Math.random() < 0.1) { // 10% chance per gene
        return Math.random();
      }
      return gene;
    });
    
    // Structural mutations (add/remove genes)
    if (Math.random() < 0.05) { // 5% chance
      if (Math.random() < 0.5 && mutated.genotype.length > 10) {
        // Remove random gene
        const index = Math.floor(Math.random() * mutated.genotype.length);
        mutated.genotype.splice(index, 1);
      } else if (mutated.genotype.length < 100) {
        // Add random gene
        const index = Math.floor(Math.random() * mutated.genotype.length);
        mutated.genotype.splice(index, 0, Math.random());
      }
    }
    
    // Re-express phenotype
    mutated.phenotype = this.expressPhenotype(mutated.genotype);
    mutated.name = this.generateStrategyName(mutated.phenotype);
    mutated.description = this.describeStrategy(mutated.phenotype);
    
    return mutated;
  }

  /**
   * Adapt evolution parameters
   */
  private adaptEvolutionParameters(): void {
    const diversity = this.calculateDiversity();
    
    if (diversity < 0.2) {
      // Low diversity - increase mutation
      this.mutationRate = Math.min(0.3, this.mutationRate * 1.1);
      this.crossoverRate = Math.max(0.5, this.crossoverRate * 0.95);
    } else if (diversity > 0.8) {
      // High diversity - increase selection pressure
      this.mutationRate = Math.max(0.05, this.mutationRate * 0.95);
      this.crossoverRate = Math.min(0.9, this.crossoverRate * 1.05);
    }
    
    this.emit('parameters:adapted', {
      mutationRate: this.mutationRate,
      crossoverRate: this.crossoverRate,
      diversity
    });
  }

  /**
   * Calculate population diversity
   */
  private calculateDiversity(): number {
    const strategies = Array.from(this.population.values());
    if (strategies.length < 2) return 0;
    
    let totalDistance = 0;
    let comparisons = 0;
    
    for (let i = 0; i < strategies.length - 1; i++) {
      for (let j = i + 1; j < strategies.length; j++) {
        totalDistance += this.calculateStrategyDistance(strategies[i], strategies[j]);
        comparisons++;
      }
    }
    
    return comparisons > 0 ? totalDistance / comparisons : 0;
  }

  /**
   * Get best strategy
   */
  private getBestStrategy(): EmergentStrategy | null {
    let best: EmergentStrategy | null = null;
    let bestFitness = -Infinity;
    
    for (const strategy of this.population.values()) {
      if (strategy.fitness > bestFitness) {
        best = strategy;
        bestFitness = strategy.fitness;
      }
    }
    
    return best;
  }

  /**
   * Get elite strategies
   */
  private getEliteStrategies(): EmergentStrategy[] {
    return [...this.eliteStrategies];
  }

  /**
   * Get average fitness
   */
  private getAverageFitness(): number {
    const strategies = Array.from(this.population.values());
    if (strategies.length === 0) return 0;
    
    const totalFitness = strategies.reduce((sum, s) => sum + s.fitness, 0);
    return totalFitness / strategies.length;
  }

  /**
   * Share discoveries with collective intelligence
   */
  private async shareDiscoveries(strategies: EmergentStrategy[]): Promise<void> {
    for (const strategy of strategies) {
      await collectiveIntelligence.addKnowledge({
        id: `emergent-strategy-${strategy.id}`,
        content: strategy.description,
        type: 'strategy',
        source: [`strategy-engine-${this.generation}`],
        confidence: strategy.fitness,
        created: new Date(),
        lastAccessed: new Date(),
        accessCount: 1,
        metadata: {
          fitness: strategy.fitness,
          generation: strategy.generation,
          actions: strategy.phenotype.actions.map(a => a.type),
          objectives: strategy.phenotype.objectives
        }
      });
    }
  }

  /**
   * Get current state
   */
  getState() {
    return {
      generation: this.generation,
      populationSize: this.population.size,
      bestFitness: this.getBestStrategy()?.fitness || 0,
      averageFitness: this.getAverageFitness(),
      diversity: this.calculateDiversity(),
      eliteStrategies: this.eliteStrategies,
      innovationsDiscovered: this.innovationArchive.getCount(),
      parameters: {
        mutationRate: this.mutationRate,
        crossoverRate: this.crossoverRate,
        elitismRate: this.elitismRate
      }
    };
  }
}

/**
 * Innovation archive for tracking novel strategies
 */
class InnovationArchive {
  private innovations: Map<string, EmergentStrategy>;
  private categories: Map<string, Set<string>>;
  
  constructor() {
    this.innovations = new Map();
    this.categories = new Map();
  }
  
  add(strategy: EmergentStrategy): void {
    this.innovations.set(strategy.id, strategy);
    
    // Categorize by primary objective
    const category = strategy.phenotype.objectives[0] || 'uncategorized';
    if (!this.categories.has(category)) {
      this.categories.set(category, new Set());
    }
    this.categories.get(category)!.add(strategy.id);
  }
  
  getCount(): number {
    return this.innovations.size;
  }
  
  getByCategory(category: string): EmergentStrategy[] {
    const ids = this.categories.get(category);
    if (!ids) return [];
    
    return Array.from(ids)
      .map(id => this.innovations.get(id))
      .filter(s => s !== undefined) as EmergentStrategy[];
  }
  
  getBest(n: number = 10): EmergentStrategy[] {
    return Array.from(this.innovations.values())
      .sort((a, b) => b.fitness - a.fitness)
      .slice(0, n);
  }
}

/**
 * Strategy performance tracking
 */
interface StrategyPerformance {
  strategyId: string;
  fitnessHistory: number[];
  bestFitness: number;
  averageFitness: number;
  stability: number;
}

// Export singleton instance
export const emergentStrategyEngine = new EmergentStrategyEngine();