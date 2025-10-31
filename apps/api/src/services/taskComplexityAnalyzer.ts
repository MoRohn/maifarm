import { logger } from '../utils/logger';

interface ComplexityAnalysis {
  score: number; // 0-100
  category: 'simple' | 'moderate' | 'complex' | 'highly-complex';
  recommendedAgents: number;
  recommendedTimeout: number; // in seconds
  factors: {
    promptLength: number;
    technicalTerms: number;
    multiStep: boolean;
    requiresResearch: boolean;
    requiresCoordination: boolean;
    fileOperations: boolean;
    externalAPIs: boolean;
  };
}

/**
 * Analyzes task complexity to automatically determine optimal agent count and timeout
 */
export class TaskComplexityAnalyzer {
  private readonly technicalKeywords = [
    'implement', 'refactor', 'optimize', 'debug', 'architecture', 'api', 'database',
    'algorithm', 'performance', 'security', 'authentication', 'authorization',
    'microservices', 'kubernetes', 'docker', 'ci/cd', 'testing', 'deployment',
    'scale', 'distributed', 'concurrent', 'async', 'websocket', 'graphql', 'rest'
  ];

  private readonly researchKeywords = [
    'research', 'analyze', 'investigate', 'explore', 'discover', 'find', 'search',
    'compare', 'evaluate', 'assess', 'review', 'study', 'examine', 'understand'
  ];

  private readonly multiStepIndicators = [
    'and then', 'after that', 'next', 'finally', 'step', 'phase', 'stage',
    'first', 'second', 'third', 'lastly', 'following', 'subsequently'
  ];

  private readonly fileOperationKeywords = [
    'create file', 'write file', 'read file', 'modify', 'update', 'delete',
    'move', 'copy', 'rename', 'upload', 'download', 'parse', 'generate'
  ];

  /**
   * Analyze a task prompt to determine its complexity
   */
  analyzeTask(prompt: string, description?: string): ComplexityAnalysis {
    const fullText = `${prompt} ${description || ''}`.toLowerCase();
    
    // Calculate various complexity factors
    const factors = {
      promptLength: fullText.length,
      technicalTerms: this.countMatches(fullText, this.technicalKeywords),
      multiStep: this.hasMultipleSteps(fullText),
      requiresResearch: this.requiresResearch(fullText),
      requiresCoordination: this.requiresCoordination(fullText),
      fileOperations: this.hasFileOperations(fullText),
      externalAPIs: this.hasExternalAPIs(fullText)
    };

    // Calculate complexity score (0-100)
    const score = this.calculateComplexityScore(factors);
    
    // Determine category
    const category = this.getComplexityCategory(score);
    
    // Calculate recommendations
    const recommendedAgents = this.calculateRecommendedAgents(score, factors);
    const recommendedTimeout = this.calculateRecommendedTimeout(score, factors);

    logger.info('[TaskComplexityAnalyzer] Analysis complete', {
      score,
      category,
      recommendedAgents,
      recommendedTimeout,
      factors
    });

    return {
      score,
      category,
      recommendedAgents,
      recommendedTimeout,
      factors
    };
  }

  private countMatches(text: string, keywords: string[]): number {
    return keywords.filter(keyword => text.includes(keyword)).length;
  }

  private hasMultipleSteps(text: string): boolean {
    const stepCount = this.countMatches(text, this.multiStepIndicators);
    const numberedSteps = (text.match(/\d+\./g) || []).length;
    const bulletPoints = (text.match(/[-*•]/g) || []).length;
    
    return stepCount > 2 || numberedSteps > 2 || bulletPoints > 3;
  }

  private requiresResearch(text: string): boolean {
    return this.countMatches(text, this.researchKeywords) > 0;
  }

  private requiresCoordination(text: string): boolean {
    const coordinationKeywords = ['coordinate', 'collaborate', 'synchronize', 'together', 'parallel', 'concurrent'];
    return this.countMatches(text, coordinationKeywords) > 0;
  }

  private hasFileOperations(text: string): boolean {
    return this.countMatches(text, this.fileOperationKeywords) > 0;
  }

  private hasExternalAPIs(text: string): boolean {
    const apiKeywords = ['api', 'endpoint', 'webhook', 'integration', 'external service', 'third-party'];
    return this.countMatches(text, apiKeywords) > 0;
  }

  private calculateComplexityScore(factors: ComplexityAnalysis['factors']): number {
    let score = 0;
    
    // Prompt length contribution (0-20 points)
    if (factors.promptLength < 100) score += 5;
    else if (factors.promptLength < 300) score += 10;
    else if (factors.promptLength < 600) score += 15;
    else score += 20;
    
    // Technical complexity (0-20 points)
    score += Math.min(20, factors.technicalTerms * 2);
    
    // Multi-step tasks (0-15 points)
    if (factors.multiStep) score += 15;
    
    // Research requirements (0-15 points)
    if (factors.requiresResearch) score += 15;
    
    // Coordination needs (0-10 points)
    if (factors.requiresCoordination) score += 10;
    
    // File operations (0-10 points)
    if (factors.fileOperations) score += 10;
    
    // External APIs (0-10 points)
    if (factors.externalAPIs) score += 10;
    
    return Math.min(100, score);
  }

  private getComplexityCategory(score: number): ComplexityAnalysis['category'] {
    if (score < 25) return 'simple';
    if (score < 50) return 'moderate';
    if (score < 75) return 'complex';
    return 'highly-complex';
  }

  private calculateRecommendedAgents(score: number, factors: ComplexityAnalysis['factors']): number {
    let agents = 1;
    
    // Base agents from complexity score
    if (score >= 25) agents = 2;
    if (score >= 40) agents = 3;
    if (score >= 55) agents = 4;
    if (score >= 70) agents = 5;
    if (score >= 85) agents = 6;
    
    // Additional agents for specific factors
    if (factors.requiresCoordination) agents += 1;
    if (factors.multiStep && factors.technicalTerms > 5) agents += 1;
    if (factors.requiresResearch && factors.fileOperations) agents += 1;
    
    // Cap at reasonable maximum
    return Math.min(8, Math.max(1, agents));
  }

  private calculateRecommendedTimeout(score: number, factors: ComplexityAnalysis['factors']): number {
    // Base timeout from complexity (in seconds)
    let timeout = 300; // 5 minutes minimum
    
    if (score >= 20) timeout = 600;    // 10 minutes
    if (score >= 35) timeout = 1200;   // 20 minutes
    if (score >= 50) timeout = 1800;   // 30 minutes
    if (score >= 65) timeout = 3600;   // 1 hour
    if (score >= 80) timeout = 7200;   // 2 hours
    
    // Adjust for specific factors
    if (factors.requiresResearch) timeout *= 1.5;
    if (factors.externalAPIs) timeout *= 1.3;
    if (factors.multiStep && factors.technicalTerms > 5) timeout *= 1.2;
    
    // Cap at reasonable maximum (4 hours)
    return Math.min(14400, Math.round(timeout));
  }

  /**
   * Get human-readable recommendation explanation
   */
  getRecommendationExplanation(analysis: ComplexityAnalysis): string {
    const reasons = [];
    
    if (analysis.factors.multiStep) {
      reasons.push('multiple steps detected');
    }
    if (analysis.factors.requiresResearch) {
      reasons.push('research required');
    }
    if (analysis.factors.requiresCoordination) {
      reasons.push('coordination needed');
    }
    if (analysis.factors.technicalTerms > 5) {
      reasons.push('high technical complexity');
    }
    if (analysis.factors.fileOperations) {
      reasons.push('file operations involved');
    }
    if (analysis.factors.externalAPIs) {
      reasons.push('external API integration');
    }
    
    if (reasons.length === 0) {
      reasons.push('straightforward task');
    }
    
    return `Based on: ${reasons.join(', ')}`;
  }
}

// Export singleton instance
export const taskComplexityAnalyzer = new TaskComplexityAnalyzer();