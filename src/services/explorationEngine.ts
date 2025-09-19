import { ExplorationBoundaries } from '@/components/GoWild/BoundaryControls';
import { WebSocketService } from './websocket';

export interface ExplorationTask {
  id: string;
  title: string;
  description: string;
  category: 'feature' | 'optimization' | 'refactor' | 'experiment' | 'research';
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimatedComplexity: number; // 1-10
  dependencies: string[]; // Other task IDs
  suggestedApproach: string;
  potentialRisks: string[];
  expectedOutcome: string;
  agentRequirements: {
    count: number;
    skills: string[];
  };
  status: 'pending' | 'approved' | 'in-progress' | 'completed' | 'rejected';
  createdAt: Date;
  parentTaskId?: string;
}

export interface ExplorationPath {
  id: string;
  name: string;
  description: string;
  tasks: ExplorationTask[];
  totalComplexity: number;
  estimatedDuration: number; // minutes
  confidence: number; // 0-100
  innovationScore: number; // 0-100
}

export interface ExplorationContext {
  projectType: string;
  currentObjectives: string[];
  existingCapabilities: string[];
  technicalStack: string[];
  constraints: string[];
  historicalInsights: any[];
}

export class ExplorationEngine {
  private wsService: WebSocketService;
  private activeTasks: Map<string, ExplorationTask> = new Map();
  private explorationPaths: Map<string, ExplorationPath> = new Map();
  private context: ExplorationContext;
  private boundaries: ExplorationBoundaries;
  private explorationHistory: any[] = [];

  constructor(wsService: WebSocketService) {
    this.wsService = wsService;
    this.context = this.initializeContext();
    this.boundaries = this.getDefaultBoundaries();
  }

  private initializeContext(): ExplorationContext {
    return {
      projectType: 'multi-agent-orchestrator',
      currentObjectives: [],
      existingCapabilities: [],
      technicalStack: ['React', 'TypeScript', 'Tailwind', 'WebSocket'],
      constraints: [],
      historicalInsights: []
    };
  }

  private getDefaultBoundaries(): ExplorationBoundaries {
    return {
      creativityLevel: 50,
      riskTolerance: 'moderate',
      explorationDepth: 5,
      timeLimit: 30,
      taskGeneration: {
        maxTasks: 5,
        allowParallel: true,
        requireApproval: true
      },
      constraints: {
        stayOnTopic: true,
        respectArchitecture: true,
        maintainTests: true,
        documentChanges: true
      }
    };
  }

  public setBoundaries(boundaries: ExplorationBoundaries): void {
    this.boundaries = boundaries;
    this.wsService.send({
      type: 'exploration-boundaries-updated',
      data: boundaries
    });
  }

  public setContext(context: Partial<ExplorationContext>): void {
    this.context = { ...this.context, ...context };
  }

  public async generateExplorationPaths(
    seedPrompt: string,
    count: number = 3
  ): Promise<ExplorationPath[]> {
    const paths: ExplorationPath[] = [];
    
    // Analyze seed prompt to extract key concepts
    const concepts = this.extractConcepts(seedPrompt);
    
    // Generate diverse exploration paths based on creativity level
    for (let i = 0; i < count; i++) {
      const path = await this.generatePath(concepts, i);
      paths.push(path);
      this.explorationPaths.set(path.id, path);
    }

    // Sort by innovation score and confidence
    paths.sort((a, b) => {
      const scoreA = a.innovationScore * 0.6 + a.confidence * 0.4;
      const scoreB = b.innovationScore * 0.6 + b.confidence * 0.4;
      return scoreB - scoreA;
    });

    this.wsService.send({
      type: 'exploration-paths-generated',
      data: paths
    });

    return paths;
  }

  private extractConcepts(prompt: string): string[] {
    // Simple concept extraction - in real implementation, use NLP
    const keywords = prompt.toLowerCase().split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !['with', 'from', 'that', 'this', 'have'].includes(word));
    
    return [...new Set(keywords)];
  }

  private async generatePath(
    concepts: string[],
    pathIndex: number
  ): Promise<ExplorationPath> {
    const pathStrategies = [
      'incremental', 'revolutionary', 'experimental'
    ];
    const strategy = pathStrategies[pathIndex % pathStrategies.length];
    
    const tasks = await this.generateTasksForStrategy(concepts, strategy);
    const totalComplexity = tasks.reduce((sum, task) => sum + task.estimatedComplexity, 0);
    
    return {
      id: `path-${Date.now()}-${pathIndex}`,
      name: this.generatePathName(strategy, concepts),
      description: this.generatePathDescription(strategy, concepts),
      tasks,
      totalComplexity,
      estimatedDuration: this.estimateDuration(tasks),
      confidence: this.calculateConfidence(tasks, strategy),
      innovationScore: this.calculateInnovation(tasks, strategy)
    };
  }

  private generatePathName(strategy: string, concepts: string[]): string {
    const names: Record<string, string> = {
      incremental: `Iterative Enhancement: ${concepts[0] || 'System'}`,
      revolutionary: `Paradigm Shift: ${concepts[0] || 'Architecture'}`,
      experimental: `Experimental Exploration: ${concepts[0] || 'Features'}`
    };
    return names[strategy] || 'Custom Path';
  }

  private generatePathDescription(strategy: string, concepts: string[]): string {
    const descriptions: Record<string, string> = {
      incremental: `Gradual improvements focusing on ${concepts.join(', ')}`,
      revolutionary: `Complete reimagining of ${concepts.join(' and ')}`,
      experimental: `Exploratory approach to discover new possibilities in ${concepts.join(', ')}`
    };
    return descriptions[strategy] || 'Custom exploration path';
  }

  private async generateTasksForStrategy(
    concepts: string[],
    strategy: string
  ): Promise<ExplorationTask[]> {
    const taskTemplates = this.getTaskTemplates(strategy);
    const tasks: ExplorationTask[] = [];
    
    // Generate tasks based on boundaries and strategy
    const maxTasks = Math.min(
      this.boundaries.taskGeneration.maxTasks,
      taskTemplates.length
    );
    
    for (let i = 0; i < maxTasks; i++) {
      const template = taskTemplates[i];
      const task = this.createTaskFromTemplate(template, concepts, i);
      tasks.push(task);
      this.activeTasks.set(task.id, task);
    }
    
    // Add dependencies based on complexity
    this.addTaskDependencies(tasks);
    
    return tasks;
  }

  private getTaskTemplates(strategy: string): any[] {
    const templates: Record<string, any[]> = {
      incremental: [
        { category: 'optimization', priority: 'medium', complexity: 3 },
        { category: 'refactor', priority: 'low', complexity: 4 },
        { category: 'feature', priority: 'medium', complexity: 5 }
      ],
      revolutionary: [
        { category: 'experiment', priority: 'high', complexity: 8 },
        { category: 'feature', priority: 'critical', complexity: 9 },
        { category: 'refactor', priority: 'high', complexity: 7 }
      ],
      experimental: [
        { category: 'research', priority: 'medium', complexity: 6 },
        { category: 'experiment', priority: 'high', complexity: 7 },
        { category: 'feature', priority: 'medium', complexity: 5 }
      ]
    };
    
    return templates[strategy] || templates.incremental;
  }

  private createTaskFromTemplate(
    template: any,
    concepts: string[],
    index: number
  ): ExplorationTask {
    const taskId = `task-${Date.now()}-${index}`;
    const concept = concepts[index % concepts.length] || 'system';
    
    return {
      id: taskId,
      title: this.generateTaskTitle(template.category, concept),
      description: this.generateTaskDescription(template.category, concept),
      category: template.category,
      priority: template.priority,
      estimatedComplexity: this.adjustComplexity(template.complexity),
      dependencies: [],
      suggestedApproach: this.generateApproach(template.category, concept),
      potentialRisks: this.identifyRisks(template.category, template.complexity),
      expectedOutcome: this.generateExpectedOutcome(template.category, concept),
      agentRequirements: this.determineAgentRequirements(template),
      status: 'pending',
      createdAt: new Date()
    };
  }

  private generateTaskTitle(category: string, concept: string): string {
    const titles: Record<string, string> = {
      feature: `Implement enhanced ${concept} capabilities`,
      optimization: `Optimize ${concept} performance`,
      refactor: `Refactor ${concept} architecture`,
      experiment: `Experiment with AI-driven ${concept}`,
      research: `Research advanced ${concept} patterns`
    };
    return titles[category] || `Enhance ${concept}`;
  }

  private generateTaskDescription(category: string, concept: string): string {
    const descriptions: Record<string, string> = {
      feature: `Add new capabilities to the ${concept} system with focus on user experience`,
      optimization: `Improve performance and efficiency of ${concept} operations`,
      refactor: `Restructure ${concept} code for better maintainability`,
      experiment: `Try innovative approaches to ${concept} implementation`,
      research: `Investigate cutting-edge techniques for ${concept}`
    };
    return descriptions[category] || `Work on ${concept} improvements`;
  }

  private adjustComplexity(baseComplexity: number): number {
    const creativityFactor = this.boundaries.creativityLevel / 100;
    const adjustment = (Math.random() - 0.5) * creativityFactor * 4;
    return Math.max(1, Math.min(10, Math.round(baseComplexity + adjustment)));
  }

  private generateApproach(category: string, concept: string): string {
    const approaches: Record<string, string> = {
      feature: `1. Analyze user needs\n2. Design interface\n3. Implement core logic\n4. Add tests`,
      optimization: `1. Profile current performance\n2. Identify bottlenecks\n3. Implement optimizations\n4. Measure improvements`,
      refactor: `1. Analyze current structure\n2. Design new architecture\n3. Incremental refactoring\n4. Update tests`,
      experiment: `1. Research possibilities\n2. Create prototype\n3. Test viability\n4. Document findings`,
      research: `1. Literature review\n2. Analyze patterns\n3. Create proof of concept\n4. Evaluate results`
    };
    return approaches[category] || 'Standard development approach';
  }

  private identifyRisks(category: string, complexity: number): string[] {
    const baseRisks: Record<string, string[]> = {
      feature: ['Scope creep', 'User adoption'],
      optimization: ['Breaking changes', 'Marginal gains'],
      refactor: ['Regression bugs', 'Time investment'],
      experiment: ['Uncertain outcomes', 'Resource usage'],
      research: ['Theoretical limitations', 'Practical application']
    };
    
    const risks = baseRisks[category] || ['Unknown risks'];
    
    if (complexity > 7) {
      risks.push('High complexity may require extended timeline');
    }
    
    if (this.boundaries.riskTolerance === 'conservative') {
      risks.push('May conflict with conservative boundaries');
    }
    
    return risks;
  }

  private generateExpectedOutcome(category: string, concept: string): string {
    const outcomes: Record<string, string> = {
      feature: `Enhanced ${concept} with new capabilities improving user productivity`,
      optimization: `30-50% performance improvement in ${concept} operations`,
      refactor: `Cleaner, more maintainable ${concept} codebase`,
      experiment: `New insights into ${concept} possibilities`,
      research: `Documented patterns and best practices for ${concept}`
    };
    return outcomes[category] || `Improved ${concept} implementation`;
  }

  private determineAgentRequirements(template: any): ExplorationTask['agentRequirements'] {
    const baseCount = Math.ceil(template.complexity / 3);
    const skills = this.determineRequiredSkills(template.category);
    
    return {
      count: Math.min(baseCount, 5),
      skills
    };
  }

  private determineRequiredSkills(category: string): string[] {
    const skillMap: Record<string, string[]> = {
      feature: ['React', 'TypeScript', 'UI/UX', 'Testing'],
      optimization: ['Performance', 'Profiling', 'Algorithms', 'Caching'],
      refactor: ['Architecture', 'Design Patterns', 'Clean Code', 'Testing'],
      experiment: ['Innovation', 'Prototyping', 'Research', 'Analysis'],
      research: ['Analysis', 'Documentation', 'Patterns', 'Best Practices']
    };
    
    return skillMap[category] || ['General Development'];
  }

  private addTaskDependencies(tasks: ExplorationTask[]): void {
    // Add logical dependencies based on complexity and category
    for (let i = 1; i < tasks.length; i++) {
      const currentTask = tasks[i];
      const previousTask = tasks[i - 1];
      
      // Research/experiment tasks often depend on previous analysis
      if (currentTask.category === 'research' || currentTask.category === 'experiment') {
        if (previousTask.category === 'optimization' || previousTask.category === 'refactor') {
          currentTask.dependencies.push(previousTask.id);
        }
      }
      
      // High complexity tasks may depend on lower complexity groundwork
      if (currentTask.estimatedComplexity > 7 && previousTask.estimatedComplexity < 6) {
        currentTask.dependencies.push(previousTask.id);
      }
    }
  }

  private estimateDuration(tasks: ExplorationTask[]): number {
    const baseMinutesPerComplexityPoint = 10;
    const parallelFactor = this.boundaries.taskGeneration.allowParallel ? 0.7 : 1;
    
    const totalMinutes = tasks.reduce((sum, task) => {
      return sum + (task.estimatedComplexity * baseMinutesPerComplexityPoint);
    }, 0);
    
    return Math.round(totalMinutes * parallelFactor);
  }

  private calculateConfidence(tasks: ExplorationTask[], strategy: string): number {
    let confidence = 70; // Base confidence
    
    // Adjust based on strategy alignment with boundaries
    if (strategy === 'incremental' && this.boundaries.riskTolerance === 'conservative') {
      confidence += 20;
    } else if (strategy === 'revolutionary' && this.boundaries.riskTolerance === 'wild') {
      confidence += 15;
    }
    
    // Adjust based on complexity
    const avgComplexity = tasks.reduce((sum, t) => sum + t.estimatedComplexity, 0) / tasks.length;
    confidence -= (avgComplexity - 5) * 5;
    
    // Ensure boundaries respect affects confidence
    if (this.boundaries.constraints.respectArchitecture) {
      confidence += 5;
    }
    if (this.boundaries.constraints.maintainTests) {
      confidence += 5;
    }
    
    return Math.max(0, Math.min(100, Math.round(confidence)));
  }

  private calculateInnovation(tasks: ExplorationTask[], strategy: string): number {
    let innovation = 50; // Base innovation
    
    // Strategy bonus
    const strategyBonus: Record<string, number> = {
      incremental: 10,
      revolutionary: 40,
      experimental: 30
    };
    innovation += strategyBonus[strategy] || 0;
    
    // Creativity level bonus
    innovation += this.boundaries.creativityLevel * 0.3;
    
    // Task category bonus
    const experimentalTasks = tasks.filter(t => 
      t.category === 'experiment' || t.category === 'research'
    ).length;
    innovation += experimentalTasks * 10;
    
    // Risk tolerance bonus
    const riskBonus: Record<string, number> = {
      conservative: -10,
      moderate: 0,
      aggressive: 15,
      wild: 30
    };
    innovation += riskBonus[this.boundaries.riskTolerance] || 0;
    
    return Math.max(0, Math.min(100, Math.round(innovation)));
  }

  public async executeTask(taskId: string): Promise<void> {
    const task = this.activeTasks.get(taskId);
    if (!task || task.status !== 'approved') {
      throw new Error('Task not found or not approved');
    }
    
    task.status = 'in-progress';
    
    this.wsService.send({
      type: 'exploration-task-started',
      data: task
    });
    
    // Simulate task execution
    // In real implementation, this would coordinate with Builder
    setTimeout(() => {
      task.status = 'completed';
      this.wsService.send({
        type: 'exploration-task-completed',
        data: task
      });
    }, task.estimatedComplexity * 1000);
  }

  public approveTask(taskId: string): void {
    const task = this.activeTasks.get(taskId);
    if (task) {
      task.status = 'approved';
      this.wsService.send({
        type: 'exploration-task-approved',
        data: task
      });
    }
  }

  public rejectTask(taskId: string): void {
    const task = this.activeTasks.get(taskId);
    if (task) {
      task.status = 'rejected';
      this.wsService.send({
        type: 'exploration-task-rejected',
        data: task
      });
    }
  }

  public getActiveExplorations(): ExplorationPath[] {
    return Array.from(this.explorationPaths.values());
  }

  public getTasksByStatus(status: ExplorationTask['status']): ExplorationTask[] {
    return Array.from(this.activeTasks.values())
      .filter(task => task.status === status);
  }

  public async generateChildTasks(parentTaskId: string): Promise<ExplorationTask[]> {
    const parentTask = this.activeTasks.get(parentTaskId);
    if (!parentTask) {
      throw new Error('Parent task not found');
    }
    
    // Generate 2-3 sub-tasks based on parent
    const childCount = Math.min(3, this.boundaries.taskGeneration.maxTasks);
    const childTasks: ExplorationTask[] = [];
    
    for (let i = 0; i < childCount; i++) {
      const childTask = this.createChildTask(parentTask, i);
      childTasks.push(childTask);
      this.activeTasks.set(childTask.id, childTask);
    }
    
    return childTasks;
  }

  private createChildTask(
    parentTask: ExplorationTask,
    index: number
  ): ExplorationTask {
    const childComplexity = Math.max(1, parentTask.estimatedComplexity - 2);
    
    return {
      id: `${parentTask.id}-child-${index}`,
      title: `Sub-task ${index + 1}: ${parentTask.title}`,
      description: `Detailed implementation of ${parentTask.title} - Part ${index + 1}`,
      category: parentTask.category,
      priority: parentTask.priority,
      estimatedComplexity: childComplexity,
      dependencies: [parentTask.id],
      suggestedApproach: `Focused approach for sub-component ${index + 1}`,
      potentialRisks: ['Dependency on parent task completion'],
      expectedOutcome: `Partial completion of ${parentTask.title}`,
      agentRequirements: {
        count: Math.max(1, parentTask.agentRequirements.count - 1),
        skills: parentTask.agentRequirements.skills
      },
      status: 'pending',
      createdAt: new Date(),
      parentTaskId: parentTask.id
    };
  }
}