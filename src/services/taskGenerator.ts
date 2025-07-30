import { GoWildConfig, ExplorationNode } from '../types/goWild';

export interface GeneratedTask {
  id: string;
  title: string;
  description: string;
  prompt: string;
  estimatedComplexity: number; // 1-10
  requiredAgents: number;
  suggestedApproach: string[];
  dependencies: string[];
  expectedOutcomes: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

export interface TaskContext {
  projectType?: string;
  currentState?: Record<string, any>;
  previousTasks?: GeneratedTask[];
  userPreferences?: Record<string, any>;
  explorationNode?: ExplorationNode;
}

export class TaskGeneratorService {
  private taskTemplates: Map<string, any> = new Map();
  private taskHistory: GeneratedTask[] = [];
  
  constructor() {
    this.initializeTemplates();
  }

  /**
   * Generate tasks based on Go Wild configuration and context
   */
  async generateTasks(
    config: GoWildConfig,
    context: TaskContext
  ): Promise<GeneratedTask[]> {
    const tasks: GeneratedTask[] = [];
    
    // Determine task generation strategy based on creativity level
    if (config.creativityLevel > 70) {
      tasks.push(...this.generateCreativeTasks(config, context));
    } else if (config.creativityLevel > 30) {
      tasks.push(...this.generateBalancedTasks(config, context));
    } else {
      tasks.push(...this.generateConservativeTasks(config, context));
    }
    
    // Apply boundaries and constraints
    const filteredTasks = this.applyBoundaries(tasks, config.boundaries);
    
    // Sort by relevance and complexity
    const sortedTasks = this.prioritizeTasks(filteredTasks, config, context);
    
    // Store in history
    this.taskHistory.push(...sortedTasks);
    
    return sortedTasks;
  }

  /**
   * Generate a dynamic task from an exploration node
   */
  async generateFromNode(
    node: ExplorationNode,
    config: GoWildConfig
  ): Promise<GeneratedTask> {
    const complexity = this.assessNodeComplexity(node);
    const approach = this.determineApproach(node, config);
    
    const task: GeneratedTask = {
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: this.generateTaskTitle(node),
      description: this.generateTaskDescription(node, config),
      prompt: this.generatePrompt(node, approach),
      estimatedComplexity: complexity,
      requiredAgents: this.calculateRequiredAgents(complexity),
      suggestedApproach: approach,
      dependencies: this.identifyDependencies(node),
      expectedOutcomes: this.predictOutcomes(node, config),
      riskLevel: this.assessRisk(node, config)
    };
    
    return task;
  }

  /**
   * Generate creative, out-of-the-box tasks
   */
  private generateCreativeTasks(
    config: GoWildConfig,
    context: TaskContext
  ): GeneratedTask[] {
    const tasks: GeneratedTask[] = [];
    
    // Generate unconventional combinations
    tasks.push(this.createTask({
      title: 'Cross-Domain Innovation Explorer',
      description: 'Explore how concepts from unrelated fields could enhance the current implementation',
      prompt: `Analyze the current codebase and suggest innovative improvements inspired by:
        1. Biological systems (e.g., neural networks, swarm intelligence)
        2. Physics principles (e.g., quantum computing concepts, thermodynamics)
        3. Art and design patterns (e.g., generative art, fractals)
        4. Game theory and strategy
        
        Focus on: ${config.focusAreas.join(', ') || 'general improvements'}`,
      complexity: 8,
      approach: [
        'Research cross-domain applications',
        'Identify transferable concepts',
        'Prototype experimental features',
        'Evaluate feasibility and impact'
      ]
    }));
    
    // Generate paradigm-shifting tasks
    tasks.push(this.createTask({
      title: 'Architecture Reimagination',
      description: 'Completely reimagine the system architecture using cutting-edge patterns',
      prompt: `Design an alternative architecture that:
        1. Challenges current assumptions
        2. Leverages emerging technologies
        3. Optimizes for future scalability
        4. Introduces novel interaction patterns`,
      complexity: 9,
      approach: [
        'Question fundamental design decisions',
        'Research bleeding-edge architectures',
        'Create proof-of-concept implementations',
        'Compare with current approach'
      ]
    }));
    
    // AI-augmented development tasks
    tasks.push(this.createTask({
      title: 'Self-Improving Code Generator',
      description: 'Create code that can analyze and improve itself',
      prompt: `Develop a system component that:
        1. Analyzes its own performance
        2. Identifies optimization opportunities
        3. Generates improved versions of itself
        4. Validates improvements automatically`,
      complexity: 10,
      approach: [
        'Implement code analysis tools',
        'Create performance benchmarks',
        'Design self-modification protocols',
        'Build safety constraints'
      ]
    }));
    
    return tasks;
  }

  /**
   * Generate balanced tasks mixing innovation with practicality
   */
  private generateBalancedTasks(
    config: GoWildConfig,
    context: TaskContext
  ): GeneratedTask[] {
    const tasks: GeneratedTask[] = [];
    
    // Optimization with creative twists
    tasks.push(this.createTask({
      title: 'Intelligent Performance Optimizer',
      description: 'Enhance performance using AI-driven optimization techniques',
      prompt: `Analyze current performance bottlenecks and implement smart optimizations:
        1. Use machine learning to predict usage patterns
        2. Implement adaptive caching strategies
        3. Create self-tuning algorithms
        4. Build performance monitoring dashboard`,
      complexity: 6,
      approach: [
        'Profile current performance',
        'Identify optimization targets',
        'Implement ML-based predictions',
        'Measure improvements'
      ]
    }));
    
    // Feature enhancement with innovation
    tasks.push(this.createTask({
      title: 'Enhanced User Experience Designer',
      description: 'Improve UX using behavioral analysis and AI suggestions',
      prompt: `Enhance the user interface with intelligent features:
        1. Predictive UI elements based on user behavior
        2. Context-aware assistance
        3. Personalized workflows
        4. Accessibility improvements`,
      complexity: 5,
      approach: [
        'Analyze user interaction patterns',
        'Design adaptive interfaces',
        'Implement personalization engine',
        'Test with diverse user groups'
      ]
    }));
    
    return tasks;
  }

  /**
   * Generate conservative, low-risk tasks
   */
  private generateConservativeTasks(
    config: GoWildConfig,
    context: TaskContext
  ): GeneratedTask[] {
    const tasks: GeneratedTask[] = [];
    
    // Standard optimization tasks
    tasks.push(this.createTask({
      title: 'Code Quality Enhancer',
      description: 'Improve code quality and maintainability',
      prompt: `Review and enhance code quality:
        1. Refactor complex functions
        2. Improve error handling
        3. Add comprehensive tests
        4. Update documentation`,
      complexity: 3,
      approach: [
        'Run code analysis tools',
        'Identify refactoring opportunities',
        'Implement improvements incrementally',
        'Validate with tests'
      ]
    }));
    
    // Security improvements
    tasks.push(this.createTask({
      title: 'Security Audit and Enhancement',
      description: 'Strengthen security measures across the system',
      prompt: `Conduct security review and implement improvements:
        1. Audit authentication mechanisms
        2. Review data encryption
        3. Check for vulnerabilities
        4. Implement security best practices`,
      complexity: 4,
      approach: [
        'Run security scanning tools',
        'Review security configurations',
        'Patch vulnerabilities',
        'Document security measures'
      ]
    }));
    
    return tasks;
  }

  /**
   * Helper methods
   */
  
  private createTask(partial: Partial<GeneratedTask>): GeneratedTask {
    return {
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: partial.title || 'Generated Task',
      description: partial.description || '',
      prompt: partial.prompt || '',
      estimatedComplexity: partial.complexity || 5,
      requiredAgents: partial.complexity ? Math.ceil(partial.complexity / 3) : 1,
      suggestedApproach: partial.approach || [],
      dependencies: [],
      expectedOutcomes: this.generateExpectedOutcomes(partial),
      riskLevel: this.calculateRiskLevel(partial.complexity || 5)
    };
  }

  private applyBoundaries(
    tasks: GeneratedTask[],
    boundaries: GoWildConfig['boundaries']
  ): GeneratedTask[] {
    return tasks.map(task => {
      // Modify prompts based on boundaries
      if (!boundaries.allowExternalAPIs) {
        task.prompt += '\n\nNote: Do not use external APIs.';
      }
      if (!boundaries.allowFileSystem) {
        task.prompt += '\n\nNote: Avoid file system operations.';
      }
      if (!boundaries.allowNetworkRequests) {
        task.prompt += '\n\nNote: No network requests allowed.';
      }
      if (boundaries.restrictedDomains.length > 0) {
        task.prompt += `\n\nRestricted domains: ${boundaries.restrictedDomains.join(', ')}`;
      }
      
      return task;
    });
  }

  private prioritizeTasks(
    tasks: GeneratedTask[],
    config: GoWildConfig,
    context: TaskContext
  ): GeneratedTask[] {
    return tasks.sort((a, b) => {
      // Prioritize based on creativity alignment
      const creativityDiffA = Math.abs(a.estimatedComplexity * 10 - config.creativityLevel);
      const creativityDiffB = Math.abs(b.estimatedComplexity * 10 - config.creativityLevel);
      
      // Also consider focus areas
      const focusRelevanceA = this.calculateFocusRelevance(a, config.focusAreas);
      const focusRelevanceB = this.calculateFocusRelevance(b, config.focusAreas);
      
      const scoreA = focusRelevanceA * 2 - creativityDiffA;
      const scoreB = focusRelevanceB * 2 - creativityDiffB;
      
      return scoreB - scoreA;
    });
  }

  private calculateFocusRelevance(task: GeneratedTask, focusAreas: string[]): number {
    if (focusAreas.length === 0) return 1;
    
    const taskText = `${task.title} ${task.description} ${task.prompt}`.toLowerCase();
    let relevance = 0;
    
    focusAreas.forEach(area => {
      if (taskText.includes(area.toLowerCase())) {
        relevance += 1;
      }
    });
    
    return relevance / focusAreas.length;
  }

  private assessNodeComplexity(node: ExplorationNode): number {
    let complexity = 5; // Base complexity
    
    // Increase based on node depth
    const depth = this.getNodeDepth(node);
    complexity += Math.min(depth, 3);
    
    // Adjust based on node type
    if (node.type === 'discovery') complexity += 2;
    if (node.type === 'branch') complexity += 1;
    
    // Consider confidence (lower confidence = higher complexity)
    complexity += Math.floor((1 - node.confidence) * 2);
    
    return Math.min(Math.max(complexity, 1), 10);
  }

  private getNodeDepth(node: ExplorationNode): number {
    let depth = 0;
    let current = node;
    
    while (current.parentId) {
      depth++;
      if (depth > 10) break; // Prevent infinite loops
      current = { ...current, parentId: undefined }; // Simple mock
    }
    
    return depth;
  }

  private generateTaskTitle(node: ExplorationNode): string {
    const actionVerbs = ['Explore', 'Implement', 'Optimize', 'Enhance', 'Redesign', 'Innovate'];
    const verb = actionVerbs[Math.floor(Math.random() * actionVerbs.length)];
    
    return `${verb}: ${node.label}`;
  }

  private generateTaskDescription(node: ExplorationNode, config: GoWildConfig): string {
    const creativity = config.creativityLevel;
    
    if (creativity > 70) {
      return `Push the boundaries of what's possible with ${node.label}. 
        Think outside conventional approaches and explore radical alternatives.`;
    } else if (creativity > 30) {
      return `Find innovative yet practical solutions for ${node.label}. 
        Balance creativity with feasibility.`;
    } else {
      return `Implement reliable and tested approaches for ${node.label}. 
        Focus on stability and maintainability.`;
    }
  }

  private generatePrompt(node: ExplorationNode, approach: string[]): string {
    const steps = approach.map((step, i) => `${i + 1}. ${step}`).join('\n');
    
    return `Task: ${node.label}

Approach:
${steps}

Context: ${node.content || 'No additional context'}

Expected deliverables:
- Implementation or proof of concept
- Documentation of approach
- Performance metrics
- Recommendations for production use`;
  }

  private determineApproach(node: ExplorationNode, config: GoWildConfig): string[] {
    const approaches = {
      creative: [
        'Research unconventional solutions',
        'Experiment with novel approaches',
        'Challenge existing assumptions',
        'Prototype multiple alternatives',
        'Synthesize best elements'
      ],
      balanced: [
        'Analyze current implementation',
        'Research best practices',
        'Design improved solution',
        'Implement with tests',
        'Document changes'
      ],
      conservative: [
        'Review existing code',
        'Identify specific improvements',
        'Make incremental changes',
        'Ensure backward compatibility',
        'Update documentation'
      ]
    };
    
    if (config.creativityLevel > 70) return approaches.creative;
    if (config.creativityLevel > 30) return approaches.balanced;
    return approaches.conservative;
  }

  private calculateRequiredAgents(complexity: number): number {
    if (complexity >= 8) return 3;
    if (complexity >= 5) return 2;
    return 1;
  }

  private identifyDependencies(node: ExplorationNode): string[] {
    // In a real implementation, this would analyze the node's relationships
    return node.parentId ? [`parent_${node.parentId}`] : [];
  }

  private predictOutcomes(node: ExplorationNode, config: GoWildConfig): string[] {
    const outcomes = [];
    
    if (node.type === 'discovery') {
      outcomes.push('New insights or approaches discovered');
      outcomes.push('Potential for significant improvements');
    }
    
    if (config.creativityLevel > 70) {
      outcomes.push('Innovative solutions that may require validation');
      outcomes.push('Paradigm shifts in approach');
    } else {
      outcomes.push('Incremental improvements');
      outcomes.push('Enhanced stability and performance');
    }
    
    return outcomes;
  }

  private assessRisk(node: ExplorationNode, config: GoWildConfig): 'low' | 'medium' | 'high' {
    const riskFactors = [
      config.creativityLevel > 80,
      node.confidence < 0.5,
      node.type === 'branch',
      config.boundaries.allowExternalAPIs
    ];
    
    const riskScore = riskFactors.filter(f => f).length;
    
    if (riskScore >= 3) return 'high';
    if (riskScore >= 1) return 'medium';
    return 'low';
  }

  private generateExpectedOutcomes(task: Partial<GeneratedTask>): string[] {
    const outcomes = [];
    
    if (task.complexity && task.complexity > 7) {
      outcomes.push('Breakthrough innovations');
      outcomes.push('New architectural patterns');
    } else if (task.complexity && task.complexity > 4) {
      outcomes.push('Significant improvements');
      outcomes.push('Enhanced functionality');
    } else {
      outcomes.push('Code quality improvements');
      outcomes.push('Better maintainability');
    }
    
    return outcomes;
  }

  private calculateRiskLevel(complexity: number): 'low' | 'medium' | 'high' {
    if (complexity >= 8) return 'high';
    if (complexity >= 5) return 'medium';
    return 'low';
  }

  private initializeTemplates(): void {
    // Initialize task templates for different scenarios
    this.taskTemplates.set('performance', {
      title: 'Performance Optimization',
      approaches: ['Profile', 'Analyze', 'Optimize', 'Measure']
    });
    
    this.taskTemplates.set('security', {
      title: 'Security Enhancement',
      approaches: ['Audit', 'Identify risks', 'Implement fixes', 'Test']
    });
    
    this.taskTemplates.set('ux', {
      title: 'User Experience Improvement',
      approaches: ['Research', 'Design', 'Prototype', 'Test']
    });
  }

  /**
   * Get task generation statistics
   */
  getStatistics(): {
    totalGenerated: number;
    byComplexity: Record<number, number>;
    byRiskLevel: Record<string, number>;
  } {
    const stats = {
      totalGenerated: this.taskHistory.length,
      byComplexity: {} as Record<number, number>,
      byRiskLevel: { low: 0, medium: 0, high: 0 }
    };
    
    this.taskHistory.forEach(task => {
      stats.byComplexity[task.estimatedComplexity] = 
        (stats.byComplexity[task.estimatedComplexity] || 0) + 1;
      stats.byRiskLevel[task.riskLevel]++;
    });
    
    return stats;
  }
}