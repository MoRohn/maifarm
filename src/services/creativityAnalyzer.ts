import { ExplorationBoundaries } from '../components/GoWild/BoundaryControls';

export interface CreativityMetrics {
  noveltyScore: number; // 0-100
  divergenceFromBaseline: number; // 0-100
  riskLevel: number; // 0-100
  innovationPotential: number; // 0-100
  feasibilityScore: number; // 0-100
  overallCreativityIndex: number; // 0-100
}

export interface CreativityPattern {
  id: string;
  name: string;
  description: string;
  triggerConditions: string[];
  suggestedActions: string[];
  historicalSuccess: number; // 0-100
}

export interface CreativityInsight {
  id: string;
  timestamp: Date;
  type: 'opportunity' | 'risk' | 'pattern' | 'breakthrough';
  title: string;
  description: string;
  actionable: boolean;
  confidence: number; // 0-100
  relatedPatterns: string[];
}

export class CreativityAnalyzer {
  private historicalData: any[] = [];
  private patterns: Map<string, CreativityPattern> = new Map();
  private insights: CreativityInsight[] = [];
  private baselineMetrics: CreativityMetrics;

  constructor() {
    this.initializePatterns();
    this.baselineMetrics = this.getBaselineMetrics();
  }

  private initializePatterns(): void {
    const patterns: CreativityPattern[] = [
      {
        id: 'lateral-thinking',
        name: 'Lateral Thinking Pattern',
        description: 'Approaching problems from unexpected angles',
        triggerConditions: ['High complexity', 'Traditional approach failed'],
        suggestedActions: ['Reverse problem statement', 'Apply cross-domain solutions'],
        historicalSuccess: 75
      },
      {
        id: 'combinatorial-innovation',
        name: 'Combinatorial Innovation',
        description: 'Combining existing solutions in novel ways',
        triggerConditions: ['Multiple partial solutions exist', 'Integration opportunity'],
        suggestedActions: ['Identify synergies', 'Create hybrid approaches'],
        historicalSuccess: 82
      },
      {
        id: 'constraint-removal',
        name: 'Constraint Removal',
        description: 'Questioning and removing assumed limitations',
        triggerConditions: ['Hitting boundaries', 'Slow progress'],
        suggestedActions: ['Challenge assumptions', 'Redefine problem space'],
        historicalSuccess: 68
      },
      {
        id: 'emergent-behavior',
        name: 'Emergent Behavior',
        description: 'Allowing complex behaviors to emerge from simple rules',
        triggerConditions: ['Complex system', 'Multiple agents'],
        suggestedActions: ['Define simple rules', 'Observe interactions'],
        historicalSuccess: 71
      },
      {
        id: 'paradigm-shift',
        name: 'Paradigm Shift',
        description: 'Fundamental change in approach or perspective',
        triggerConditions: ['Incremental improvements plateau', 'Major breakthrough needed'],
        suggestedActions: ['Question core assumptions', 'Explore radical alternatives'],
        historicalSuccess: 45
      }
    ];

    patterns.forEach(pattern => {
      this.patterns.set(pattern.id, pattern);
    });
  }

  private getBaselineMetrics(): CreativityMetrics {
    return {
      noveltyScore: 50,
      divergenceFromBaseline: 0,
      riskLevel: 30,
      innovationPotential: 50,
      feasibilityScore: 70,
      overallCreativityIndex: 50
    };
  }

  public analyzeProposal(
    proposal: any,
    boundaries: ExplorationBoundaries
  ): CreativityMetrics {
    const metrics: CreativityMetrics = {
      noveltyScore: this.calculateNovelty(proposal),
      divergenceFromBaseline: this.calculateDivergence(proposal),
      riskLevel: this.calculateRisk(proposal, boundaries),
      innovationPotential: this.calculateInnovationPotential(proposal),
      feasibilityScore: this.calculateFeasibility(proposal, boundaries),
      overallCreativityIndex: 0
    };

    // Calculate overall creativity index
    metrics.overallCreativityIndex = this.calculateOverallIndex(metrics, boundaries);

    // Generate insights based on analysis
    this.generateInsights(proposal, metrics, boundaries);

    return metrics;
  }

  private calculateNovelty(proposal: any): number {
    let novelty = 50; // Base novelty

    // Check for unique elements
    if (proposal.approach && proposal.approach.includes('AI-driven')) {
      novelty += 15;
    }
    if (proposal.approach && proposal.approach.includes('experimental')) {
      novelty += 20;
    }
    if (proposal.category === 'experiment' || proposal.category === 'research') {
      novelty += 10;
    }

    // Check against historical data
    const similarProposals = this.findSimilarProposals(proposal);
    novelty -= similarProposals.length * 5;

    return Math.max(0, Math.min(100, novelty));
  }

  private calculateDivergence(proposal: any): number {
    let divergence = 0;

    // Compare with baseline approach
    if (proposal.category !== 'feature') {
      divergence += 20;
    }
    if (proposal.estimatedComplexity > 7) {
      divergence += 15;
    }
    if (proposal.approach && proposal.approach.includes('unconventional')) {
      divergence += 25;
    }

    // Risk factors increase divergence
    if (proposal.potentialRisks && proposal.potentialRisks.length > 3) {
      divergence += 10;
    }

    return Math.max(0, Math.min(100, divergence));
  }

  private calculateRisk(proposal: any, boundaries: ExplorationBoundaries): number {
    let risk = 20; // Base risk

    // Complexity increases risk
    risk += proposal.estimatedComplexity * 5;

    // Category-based risk
    const categoryRisk = {
      feature: 10,
      optimization: 15,
      refactor: 25,
      experiment: 40,
      research: 30
    };
    risk += categoryRisk[proposal.category as keyof typeof object] || 20;

    // Boundary violations increase risk
    if (boundaries.constraints.respectArchitecture && proposal.category === 'refactor') {
      risk -= 10; // Following constraints reduces risk
    }
    if (!boundaries.constraints.maintainTests) {
      risk += 15; // Not maintaining tests increases risk
    }

    // Risk tolerance adjustment
    const toleranceMultiplier = {
      conservative: 1.5,
      moderate: 1.0,
      aggressive: 0.7,
      wild: 0.4
    };
    risk *= toleranceMultiplier[boundaries.riskTolerance] || 1.0;

    return Math.max(0, Math.min(100, risk));
  }

  private calculateInnovationPotential(proposal: any): number {
    let potential = 30; // Base potential

    // High complexity can lead to innovation
    if (proposal.estimatedComplexity > 6) {
      potential += 20;
    }

    // Experimental approaches have high potential
    if (proposal.category === 'experiment' || proposal.category === 'research') {
      potential += 25;
    }

    // Novel combinations increase potential
    if (proposal.dependencies && proposal.dependencies.length > 2) {
      potential += 15;
    }

    // Expected outcome analysis
    if (proposal.expectedOutcome && proposal.expectedOutcome.includes('breakthrough')) {
      potential += 20;
    }

    return Math.max(0, Math.min(100, potential));
  }

  private calculateFeasibility(proposal: any, boundaries: ExplorationBoundaries): number {
    let feasibility = 80; // Start optimistic

    // Complexity reduces feasibility
    feasibility -= proposal.estimatedComplexity * 5;

    // Resource requirements
    if (proposal.agentRequirements && proposal.agentRequirements.count > 3) {
      feasibility -= 15;
    }

    // Time constraints
    const estimatedTime = proposal.estimatedComplexity * 10; // minutes
    if (estimatedTime > boundaries.timeLimit) {
      feasibility -= 20;
    }

    // Dependencies reduce feasibility
    feasibility -= (proposal.dependencies?.length || 0) * 5;

    // Boundary alignment increases feasibility
    if (boundaries.constraints.respectArchitecture) {
      feasibility += 10;
    }

    return Math.max(0, Math.min(100, feasibility));
  }

  private calculateOverallIndex(
    metrics: CreativityMetrics,
    boundaries: ExplorationBoundaries
  ): number {
    // Weight factors based on creativity level
    const creativityFactor = boundaries.creativityLevel / 100;
    
    const weights = {
      novelty: 0.2 + (creativityFactor * 0.2),
      divergence: 0.15 + (creativityFactor * 0.15),
      risk: -0.1 * (1 - creativityFactor), // Less negative when more creative
      innovation: 0.3 + (creativityFactor * 0.1),
      feasibility: 0.25 * (1 - creativityFactor * 0.5) // Less important when creative
    };

    const index = 
      metrics.noveltyScore * weights.novelty +
      metrics.divergenceFromBaseline * weights.divergence +
      metrics.riskLevel * weights.risk +
      metrics.innovationPotential * weights.innovation +
      metrics.feasibilityScore * weights.feasibility;

    return Math.max(0, Math.min(100, Math.round(index)));
  }

  private findSimilarProposals(proposal: any): any[] {
    return this.historicalData.filter(historical => {
      return historical.category === proposal.category &&
             Math.abs(historical.estimatedComplexity - proposal.estimatedComplexity) < 2;
    });
  }

  private generateInsights(
    proposal: any,
    metrics: CreativityMetrics,
    boundaries: ExplorationBoundaries
  ): void {
    // Check for breakthrough potential
    if (metrics.innovationPotential > 80 && metrics.noveltyScore > 70) {
      this.insights.push({
        id: `insight-${Date.now()}-breakthrough`,
        timestamp: new Date(),
        type: 'breakthrough',
        title: 'High Breakthrough Potential Detected',
        description: `This proposal shows exceptional innovation potential (${metrics.innovationPotential}%) with high novelty`,
        actionable: true,
        confidence: 85,
        relatedPatterns: ['paradigm-shift']
      });
    }

    // Risk warnings
    if (metrics.riskLevel > 70 && boundaries.riskTolerance !== 'wild') {
      this.insights.push({
        id: `insight-${Date.now()}-risk`,
        timestamp: new Date(),
        type: 'risk',
        title: 'High Risk Level Detected',
        description: `Risk level (${metrics.riskLevel}%) exceeds typical threshold for ${boundaries.riskTolerance} tolerance`,
        actionable: true,
        confidence: 90,
        relatedPatterns: ['constraint-removal']
      });
    }

    // Pattern recognition
    this.detectPatterns(proposal, metrics);
  }

  private detectPatterns(proposal: any, metrics: CreativityMetrics): void {
    // Check each pattern for matches
    this.patterns.forEach((pattern, patternId) => {
      const conditionsMet = this.checkPatternConditions(pattern, proposal, metrics);
      
      if (conditionsMet > 0.7) {
        this.insights.push({
          id: `insight-${Date.now()}-pattern-${patternId}`,
          timestamp: new Date(),
          type: 'pattern',
          title: `${pattern.name} Detected`,
          description: pattern.description,
          actionable: true,
          confidence: conditionsMet * 100,
          relatedPatterns: [patternId]
        });
      }
    });
  }

  private checkPatternConditions(
    pattern: CreativityPattern,
    proposal: any,
    metrics: CreativityMetrics
  ): number {
    let matchScore = 0;
    let totalConditions = pattern.triggerConditions.length;

    pattern.triggerConditions.forEach(condition => {
      switch (condition) {
        case 'High complexity':
          if (proposal.estimatedComplexity > 7) matchScore += 1;
          break;
        case 'Traditional approach failed':
          if (metrics.divergenceFromBaseline > 60) matchScore += 1;
          break;
        case 'Multiple partial solutions exist':
          if (proposal.dependencies && proposal.dependencies.length > 1) matchScore += 1;
          break;
        case 'Integration opportunity':
          if (proposal.category === 'feature' || proposal.category === 'refactor') matchScore += 1;
          break;
        case 'Hitting boundaries':
          if (metrics.feasibilityScore < 40) matchScore += 1;
          break;
        case 'Complex system':
          if (proposal.agentRequirements && proposal.agentRequirements.count > 3) matchScore += 1;
          break;
        case 'Incremental improvements plateau':
          if (metrics.innovationPotential < 30 && metrics.noveltyScore < 40) matchScore += 1;
          break;
      }
    });

    return matchScore / totalConditions;
  }

  public suggestCreativeDirections(
    currentMetrics: CreativityMetrics,
    targetCreativity: number
  ): string[] {
    const suggestions: string[] = [];
    const creativityGap = targetCreativity - currentMetrics.overallCreativityIndex;

    if (creativityGap > 20) {
      // Need significant creativity boost
      suggestions.push('Consider removing one or more constraints');
      suggestions.push('Explore solutions from unrelated domains');
      suggestions.push('Question fundamental assumptions about the problem');
      
      if (currentMetrics.riskLevel < 50) {
        suggestions.push('Increase risk tolerance to enable more creative solutions');
      }
    } else if (creativityGap > 0) {
      // Need moderate creativity boost
      suggestions.push('Try combining existing solutions in new ways');
      suggestions.push('Add experimental elements to the approach');
      
      if (currentMetrics.noveltyScore < 60) {
        suggestions.push('Look for inspiration in cutting-edge research');
      }
    } else if (creativityGap < -20) {
      // Too creative, need more feasibility
      suggestions.push('Add constraints to focus creative energy');
      suggestions.push('Break down complex ideas into manageable components');
      suggestions.push('Validate assumptions with small experiments');
    }

    return suggestions;
  }

  public getRecentInsights(limit: number = 10): CreativityInsight[] {
    return this.insights
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  public getPatternRecommendations(
    context: any
  ): { pattern: CreativityPattern; relevance: number }[] {
    const recommendations: { pattern: CreativityPattern; relevance: number }[] = [];

    this.patterns.forEach(pattern => {
      const relevance = this.calculatePatternRelevance(pattern, context);
      if (relevance > 0.5) {
        recommendations.push({ pattern, relevance });
      }
    });

    return recommendations.sort((a, b) => b.relevance - a.relevance);
  }

  private calculatePatternRelevance(pattern: CreativityPattern, context: any): number {
    // Simple relevance calculation based on context
    let relevance = 0.5; // Base relevance

    // Adjust based on historical success
    relevance += (pattern.historicalSuccess / 100) * 0.3;

    // Context-specific adjustments
    if (context.needsBreakthrough && pattern.id === 'paradigm-shift') {
      relevance += 0.3;
    }
    if (context.hasMultipleAgents && pattern.id === 'emergent-behavior') {
      relevance += 0.2;
    }

    return Math.min(1, relevance);
  }

  public recordOutcome(proposal: any, outcome: any): void {
    // Store for future learning
    this.historicalData.push({
      ...proposal,
      outcome,
      timestamp: new Date()
    });

    // Update pattern success rates based on outcome
    if (outcome.success) {
      const usedPatterns = this.insights
        .filter(i => i.relatedPatterns.length > 0)
        .flatMap(i => i.relatedPatterns);
      
      usedPatterns.forEach(patternId => {
        const pattern = this.patterns.get(patternId);
        if (pattern) {
          // Simple success rate update
          pattern.historicalSuccess = Math.min(100, pattern.historicalSuccess + 1);
        }
      });
    }
  }
}