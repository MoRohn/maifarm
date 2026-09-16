import {
  YamlGenerationRequest,
  YamlGenerationResponse,
  YamlTemplate
} from '../../types/yaml';
import * as yaml from 'js-yaml';
import { getFarmAgentName, formatFarmAgentName, formatFarmAgentNameNoEmoji, getSimpleAgentName } from '../utils/farmAgentNames';
import { promptEnhancer } from './promptEnhancer';
import { promptEnhancementService } from './promptEnhancementService';
import { barnService as barnCatalogService } from './unified/barnService';
import { thinkingStrategyService } from './thinkingStrategyService';
import { ThinkingLevel, ThinkingConfig } from '../types/thinking';

interface ParsedPrompt {
  agentCount: number;
  taskType: string;
  technologies: string[];
  description: string;
  provider?: 'claude' | 'llama';
  contextWindowSize?: number;
  barnReferences?: string[];
}

type PromptEnhancementResult = {
  enhanced_prompt: string;
  original_prompt: string;
  suggestions: string[];
  improvements: string[];
  confidence?: number;
};

export class YamlGeneratorService {
  private static instance: YamlGeneratorService;
  private templates: Map<string, YamlTemplate>;
  private history: any[] = [];
  private promptEnhancementCache = new Map<string, { result: PromptEnhancementResult; expiresAt: number }>();
  private promptEnhancementInFlight = new Map<string, Promise<PromptEnhancementResult>>();
  private readonly PROMPT_ENHANCEMENT_TTL_MS = 5 * 60 * 1000; // 5 minutes

  private constructor() {
    this.templates = new Map();
    this.initializeTemplates();
  }

  static getInstance(): YamlGeneratorService {
    if (!YamlGeneratorService.instance) {
      YamlGeneratorService.instance = new YamlGeneratorService();
    }
    return YamlGeneratorService.instance;
  }

  /**
   * Process barn references in YAML template
   */
  private async processBarnReferences(yamlContent: string, farmId?: string): Promise<string> {
    const barnReferenceRegex = /@barn:([a-f0-9-]+)/gi;
    const matches = yamlContent.match(barnReferenceRegex);
    
    if (!matches || matches.length === 0) {
      return yamlContent;
    }
    
    let processedYaml = yamlContent;
    
    for (const reference of matches) {
      try {
        const item = await barnCatalogService.resolveReference(reference);
        if (item) {
          // Track usage if farmId provided
          if (farmId) {
            await barnCatalogService.trackItemUsage(item.id, farmId);
          }
          
          // Add barn reference as a comment in YAML
          const comment = `# Barn Reference: ${item.name} (${item.type})`;
          const referenceInfo = `# Description: ${item.description}`;
          const replacement = `${comment}\n${referenceInfo}\n# Original Reference: ${reference}`;
          
          processedYaml = processedYaml.replace(reference, replacement);
        }
      } catch (error) {
        console.error(`[YamlGenerator] Error processing barn reference ${reference}:`, error);
      }
    }
    
    return processedYaml;
  }
  
  /**
   * Extract barn references from text
   */
  private extractBarnReferences(text: string): string[] {
    const barnReferenceRegex = /@barn:([a-f0-9-]+)/gi;
    const matches = text.match(barnReferenceRegex);
    return matches || [];
  }
  
  /**
   * Suggest relevant barn items for a prompt
   */
  async suggestBarnItems(prompt: string, limit: number = 5): Promise<Array<{
    id: string;
    name: string;
    description: string;
    reference: string;
    relevanceScore: number;
  }>> {
    try {
      const searchResults = await barnCatalogService.searchCatalog({
        searchText: prompt.substring(0, 200) // Use first 200 chars of prompt
      });
      
      // Simple relevance scoring based on keyword matches
      const keywordScored = searchResults.map(item => {
        const promptLower = prompt.toLowerCase();
        const itemText = `${item.name} ${item.description} ${item.tags.join(' ')}`.toLowerCase();
        
        let score = 0;
        const words = promptLower.split(/\s+/);
        
        for (const word of words) {
          if (word.length > 3 && itemText.includes(word)) {
            score += 1;
          }
        }
        
        // Boost score for popular items
        score += item.useCount * 0.1;
        
        return {
          id: item.id,
          name: item.name,
          description: item.description,
          reference: item.reference,
          relevanceScore: score
        };
      });
      
      return keywordScored
        .filter(item => item.relevanceScore > 0)
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, limit);
    } catch (error) {
      console.error('[YamlGenerator] Error suggesting barn items:', error);
      return [];
    }
  }

  private initializeTemplates() {
    // Basic templates
    this.templates.set('react-testing', {
      id: 'react-testing',
      name: 'React Testing Farm',
      description: 'Farm for testing React applications',
      category: 'testing',
      content: `name: React Testing Farm
# Barn References: Use @barn:item-id to reference items from the barn
# Example: @barn:abc-123-def for a specific testing configuration
agents:
  - name: Clucky the Chicken
    role: Run unit and integration tests
    capabilities:
      - jest
      - react-testing-library
  - name: Buzz the Bee
    role: Run end-to-end tests
    capabilities:
      - cypress
      - playwright
  - name: Owlbert the Barn Owl
    role: Analyze test coverage
    capabilities:
      - coverage-reports
      - quality-metrics
tasks:
  - type: unit-test
    agent: test-runner
  - type: integration-test
    agent: test-runner
  - type: e2e-test
    agent: e2e-tester
  - type: coverage-report
    agent: coverage-analyzer`
    });

    this.templates.set('code-review', {
      id: 'code-review',
      name: 'Code Review Farm',
      description: 'Farm for automated code review and analysis',
      category: 'development',
      content: `name: Code Review Farm
agents:
  - name: Whiskers the Barn Cat
    role: Check code style and quality
    capabilities:
      - eslint
      - prettier
      - typescript
  - name: Spot the Dog
    role: Scan for security vulnerabilities
    capabilities:
      - security-analysis
      - dependency-scanning
  - name: Neighton the Horse
    role: Analyze performance issues
    capabilities:
      - bundle-analysis
      - runtime-profiling`
    });
  }

  private parsePrompt(prompt: string): ParsedPrompt {
    const lowercasePrompt = prompt.toLowerCase();
    
    // Extract agent count
    const agentMatch = lowercasePrompt.match(/(\d+)\s*agents?/);
    const agentCount = agentMatch ? parseInt(agentMatch[1]) : 3;

    // Detect task type with expanded patterns
    let taskType = 'general';
    if (lowercasePrompt.includes('test')) taskType = 'testing';
    else if (lowercasePrompt.includes('review')) taskType = 'review';
    else if (lowercasePrompt.includes('deploy')) taskType = 'deployment';
    else if (lowercasePrompt.includes('monitor')) taskType = 'monitoring';
    else if (lowercasePrompt.includes('debug') || lowercasePrompt.includes('fix')) taskType = 'debugging';
    else if (lowercasePrompt.includes('analyz') || lowercasePrompt.includes('analysis')) taskType = 'analysis';
    else if (lowercasePrompt.includes('optimi')) taskType = 'optimization';
    else if (lowercasePrompt.includes('visual') || lowercasePrompt.includes('infographic')) taskType = 'visualization';
    else if (lowercasePrompt.includes('build') || lowercasePrompt.includes('create')) taskType = 'development';

    // Detect technologies with expanded list
    const technologies: string[] = [];
    const techKeywords = ['react', 'vue', 'angular', 'node', 'python', 'java', 'typescript', 'javascript', 
                          'express', 'nextjs', 'gatsby', 'webpack', 'docker', 'kubernetes', 'aws', 'gcp', 'azure'];
    techKeywords.forEach(tech => {
      if (lowercasePrompt.includes(tech)) {
        technologies.push(tech);
      }
    });

    // Extract barn references from prompt
    const barnReferences = this.extractBarnReferences(prompt);
    
    return {
      agentCount,
      taskType,
      technologies,
      description: prompt,
      barnReferences
    };
  }

  /**
   * Determine complexity from prompt content
   */
  private determineComplexity(prompt: string): string {
    const complexKeywords = ['comprehensive', 'complex', 'detailed', 'extensive', 'thorough', 'advanced'];
    const simpleKeywords = ['simple', 'basic', 'quick', 'minimal', 'straightforward'];
    
    const promptLower = prompt.toLowerCase();
    
    if (complexKeywords.some(k => promptLower.includes(k))) {
      return 'complex';
    }
    if (simpleKeywords.some(k => promptLower.includes(k))) {
      return 'simple';
    }
    
    // Determine by prompt length and detail
    if (prompt.length > 200 || prompt.split(' ').length > 30) {
      return 'complex';
    }
    
    return 'moderate';
  }

  /**
   * Calculate dynamic timeout based on task complexity, agent count, and task type
   * Returns timeout in seconds
   */
  private calculateDynamicTimeout(parsed: any): number {
    // Base timeout values in seconds
    const BASE_TIMEOUTS = {
      testing: 1800,      // 30 minutes for testing tasks
      review: 1200,       // 20 minutes for code review
      development: 3600,  // 60 minutes for development
      debugging: 2400,    // 40 minutes for debugging
      analysis: 1800,     // 30 minutes for analysis
      optimization: 2400, // 40 minutes for optimization
      research: 2400,     // 40 minutes for research tasks
      general: 1800       // 30 minutes default
    };

    // Start with base timeout for task type
    let timeout = BASE_TIMEOUTS[parsed.taskType] || BASE_TIMEOUTS.general;

    // Adjust for complexity
    const complexity = this.determineComplexity(parsed.prompt || parsed.originalPrompt || '');
    if (complexity === 'complex') {
      timeout *= 2;      // Double for complex tasks
    } else if (complexity === 'simple') {
      timeout *= 0.75;   // Reduce for simple tasks
    }

    // Adjust for agent count (more agents = potentially more time needed for coordination)
    if (parsed.agentCount > 5) {
      timeout *= 1.25;   // 25% more time for large teams
    } else if (parsed.agentCount > 10) {
      timeout *= 1.5;    // 50% more time for very large teams
    }

    // Adjust for specific keywords that indicate longer running tasks
    const longRunningIndicators = [
      'comprehensive', 'thorough', 'complete', 'full',
      'end-to-end', 'e2e', 'extensive', 'detailed',
      'production', 'enterprise', 'large-scale'
    ];
    
    const quickTaskIndicators = [
      'quick', 'fast', 'rapid', 'brief', 'simple',
      'basic', 'minimal', 'prototype', 'demo'
    ];

    const promptLower = (parsed.prompt || parsed.originalPrompt || '').toLowerCase();
    
    if (longRunningIndicators.some(ind => promptLower.includes(ind))) {
      timeout *= 1.5;    // 50% more time for thorough tasks
    } else if (quickTaskIndicators.some(ind => promptLower.includes(ind))) {
      timeout *= 0.5;    // 50% less time for quick tasks
    }

    // Special case for Quick Task mode - fixed 5 minutes
    if (parsed.mode === 'quicktask') {
      timeout = 300;  // 5 minutes fixed for Quick Tasks
    }

    // Cap timeout values
    const MIN_TIMEOUT = 300;    // 5 minutes minimum
    const MAX_TIMEOUT = 14400;   // 4 hours maximum
    
    timeout = Math.max(MIN_TIMEOUT, Math.min(MAX_TIMEOUT, Math.round(timeout)));

    console.log(`[YamlGenerator] Calculated timeout: ${timeout}s for ${parsed.taskType} task with ${parsed.agentCount} agents (complexity: ${complexity})`);
    
    return timeout;
  }

  private generateAgentConfig(parsed: ParsedPrompt): any[] {
    const agents = [];
    const baseRoles = [
      { 
        name: 'coordinator', 
        role: 'Coordinate tasks and manage workflow',
        taskTemplates: [
          'Create project structure and initial setup',
          'Define task priorities and dependencies',
          'Monitor progress and coordinate between agents',
          'Ensure all requirements are met'
        ]
      },
      { 
        name: 'developer', 
        role: 'Implement features and fix bugs',
        taskTemplates: [
          'Implement core functionality',
          'Write clean, maintainable code',
          'Fix bugs and handle edge cases',
          'Optimize performance where needed'
        ]
      },
      { 
        name: 'tester', 
        role: 'Test functionality and ensure quality',
        taskTemplates: [
          'Write unit tests for critical components',
          'Perform integration testing',
          'Validate edge cases and error handling',
          'Ensure code quality standards are met'
        ]
      },
      { 
        name: 'analyzer', 
        role: 'Analyze code and provide insights',
        taskTemplates: [
          'Review code for best practices',
          'Identify potential improvements',
          'Check for security vulnerabilities',
          'Analyze performance bottlenecks'
        ]
      },
      { 
        name: 'documenter', 
        role: 'Create and maintain documentation',
        taskTemplates: [
          'Document API endpoints and functions',
          'Create user guides and tutorials',
          'Maintain README and setup instructions',
          'Document architectural decisions'
        ]
      }
    ];

    // Generate context-aware tasks based on the parsed prompt
    const contextTasks = this.generateContextAwareTasks(parsed);

    for (let i = 0; i < Math.min(parsed.agentCount, baseRoles.length); i++) {
      const role = baseRoles[i];
      // CRITICAL FIX: Use getSimpleAgentName for consistency with UnifiedFarmLaunchOrchestrator
      const agentName = getSimpleAgentName(i);
      const farmAgent = getFarmAgentName(role.name, i); // Keep for personality

      // Select appropriate tasks for this agent based on role and context
      const agentTasks = this.selectTasksForAgent(
        role.name,
        role.taskTemplates,
        contextTasks,
        parsed
      );

      agents.push({
        name: agentName,  // Use simple consistent name
        role: role.role,
        type: 'specialized',  // Use valid database type
        capabilities: this.getCapabilitiesForRole(role.name, parsed.technologies),
        tasks: agentTasks,  // Add specific tasks for each agent
        personality: farmAgent.personality,
        config: {
          roleType: role.name  // Store the actual role in config
        }
      });
    }

    // Add more agents if needed with farm names
    if (parsed.agentCount > baseRoles.length) {
      for (let i = baseRoles.length; i < parsed.agentCount; i++) {
        // CRITICAL FIX: Use getSimpleAgentName for consistency
        const agentName = getSimpleAgentName(i);
        const farmAgent = getFarmAgentName('general', i); // Keep for personality
        const supportTasks = [
          'Assist other agents with their tasks',
          'Handle miscellaneous requirements',
          'Provide feedback and suggestions',
          'Help with testing and validation'
        ];

        agents.push({
          name: agentName,  // Use simple consistent name
          role: 'Support various tasks as needed',
          type: 'secondary',  // Use valid database type for support agents
          capabilities: ['general-support', 'task-assistance'],
          tasks: supportTasks.slice(0, Math.min(3, supportTasks.length)),
          personality: farmAgent.personality,
          config: {
            roleType: 'support'  // Store the actual role in config
          }
        });
      }
    }

    return agents;
  }

  private getCapabilitiesForRole(roleName: string, technologies: string[]): string[] {
    const baseCapabilities: Record<string, string[]> = {
      coordinator: ['task-management', 'workflow-orchestration', 'progress-tracking'],
      developer: ['coding', 'debugging', 'refactoring', ...technologies],
      tester: ['unit-testing', 'integration-testing', 'test-automation'],
      analyzer: ['code-analysis', 'performance-profiling', 'security-scanning'],
      documenter: ['documentation', 'api-docs', 'user-guides']
    };

    return baseCapabilities[roleName] || ['general-tasks'];
  }

  private generateContextAwareTasks(parsed: ParsedPrompt): string[] {
    const tasks: string[] = [];
    
    // Extract key actions from the description
    const actionWords = ['build', 'create', 'implement', 'fix', 'test', 'analyze', 'document', 'refactor', 'optimize', 'deploy'];
    const descLower = parsed.description.toLowerCase();
    
    for (const action of actionWords) {
      if (descLower.includes(action)) {
        tasks.push(`${action.charAt(0).toUpperCase() + action.slice(1)} ${parsed.taskType || 'solution'}`);
      }
    }
    
    // Add technology-specific tasks
    for (const tech of parsed.technologies) {
      if (tech.toLowerCase().includes('react')) {
        tasks.push('Create React components');
        tasks.push('Implement state management');
      } else if (tech.toLowerCase().includes('node')) {
        tasks.push('Set up Express server');
        tasks.push('Implement API endpoints');
      } else if (tech.toLowerCase().includes('python')) {
        tasks.push('Create Python modules');
        tasks.push('Implement data processing');
      }
    }
    
    return tasks;
  }

  private selectTasksForAgent(
    roleName: string, 
    taskTemplates: string[], 
    contextTasks: string[], 
    parsed: ParsedPrompt
  ): string[] {
    const tasks: string[] = [];
    
    // Use context from the prompt to customize tasks
    const promptLower = parsed.description.toLowerCase();
    
    // Add role-specific tasks based on prompt context
    if (roleName === 'coordinator') {
      tasks.push(`Coordinate ${parsed.taskType || 'development'} for: ${parsed.description.substring(0, 100)}`);
      if (parsed.agentCount > 2) {
        tasks.push('Manage task distribution among agents');
      }
    } else if (roleName === 'developer') {
      if (promptLower.includes('api')) {
        tasks.push('Implement API endpoints');
      }
      if (promptLower.includes('database')) {
        tasks.push('Set up database schema and connections');
      }
      if (parsed.technologies.length > 0) {
        tasks.push(`Implement using ${parsed.technologies.join(', ')}`);
      }
    } else if (roleName === 'tester') {
      tasks.push(`Test ${parsed.taskType || 'implementation'}`);
      if (promptLower.includes('api')) {
        tasks.push('Create API integration tests');
      }
    }
    
    // Add template tasks if we need more
    const remainingSlots = Math.max(2, 4 - tasks.length);
    for (let i = 0; i < Math.min(remainingSlots, taskTemplates.length); i++) {
      if (!tasks.includes(taskTemplates[i])) {
        tasks.push(taskTemplates[i]);
      }
    }
    
    return tasks.slice(0, 5); // Limit to 5 tasks per agent
  }

  async generateYaml(request: YamlGenerationRequest): Promise<YamlGenerationResponse> {
    const startTime = Date.now();
    
    try {
      // Determine provider from request or environment
      const provider = request.provider || process.env.AI_PROVIDER || 'claude';
      const isLlama = provider === 'llama';
      
      // Store original prompt for preservation in description
      const originalPrompt = request.prompt;
      
      // Check if prompt enhancement is enabled
      let finalPrompt = request.prompt;
      let enhancementMetadata = null;
      
      if (request.enhancePrompt !== false) {
        try {
          // Enhance the prompt using the selected provider
          const enhancement = await promptEnhancementService.enhancePrompt({
            prompt: request.prompt,
            context: request.constraints?.context || `YAML generation for multi-agent orchestration using ${provider}`,
            targetAgentCount: request.constraints?.maxAgents,
            taskType: request.mode || 'farm',
            additionalInstructions: isLlama 
              ? 'Optimize for Llama\'s large context window (256K tokens) and chain-of-thought reasoning'
              : 'Optimize for clear agent roles and parallel task execution',
            provider: provider
          });
          
          finalPrompt = enhancement.enhancedPrompt;
          enhancementMetadata = enhancement.metadata;
          
          console.log('[YamlGenerator] Prompt enhanced successfully');
        } catch (error) {
          console.warn('[YamlGenerator] Prompt enhancement failed, using original prompt:', error);
          // Continue with original prompt if enhancement fails
        }
      }
      
      const parsed = this.parsePrompt(finalPrompt);
      parsed.provider = provider as 'claude' | 'llama';
      parsed.contextWindowSize = isLlama ? 256000 : 100000; // Llama has larger context
      parsed.originalPrompt = originalPrompt; // Preserve original prompt
      
      // Generate configuration based on parsed prompt - matching Claude Code format
      const agents = this.generateAgentConfig(parsed);
      
      // Generate unique farm ID for workspace isolation
      const farmId = `farm-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const farmWorkspace = `maibarn/workspaces/active/${farmId}`;
      
      // Calculate dynamic timeout based on task complexity
      const dynamicTimeout = this.calculateDynamicTimeout(parsed);
      
      const config = {
        name: `${parsed.technologies.join('-') || 'general'}-${parsed.taskType}-farm`,
        description: originalPrompt, // Use original prompt as description
        agents: agents,
        initial_prompt: this.generateInitialPrompt(parsed, agents, farmId),
        steps: this.generateSteps(parsed),
        config: {
          autoScale: false,
          maxAgents: isLlama ? Math.min(parsed.agentCount * 2, 16) : Math.min(parsed.agentCount * 2, 10),
          timeout: dynamicTimeout,
          coordination: parsed.agentCount > 1 ? 'collaborative' : 'sequential',
          stagger: 5
        },
        metadata: {
          created_at: new Date().toISOString(),
          ai_generated: true,
          purpose: parsed.taskType,
          num_agents: parsed.agentCount,
          complexity: this.determineComplexity(originalPrompt),
          provider: provider,
          contextWindow: parsed.contextWindowSize,
          original_prompt: originalPrompt,
          farm_id: farmId,
          workspace_path: farmWorkspace
        }
      };

      // Convert to YAML
      const yamlContent = yaml.dump(config, {
        indent: 2,
        lineWidth: 80,
        noRefs: true
      });

      // Generate validation result
      const validation = {
        valid: true,
        errors: [],
        warnings: parsed.agentCount > 10 ? ['Large number of agents may impact performance'] : [],
        parsedConfig: config
      };

      // Generate suggestions
      const suggestions = this.generateSuggestions(config, parsed);

      // Store in history
      this.history.push({
        id: Date.now().toString(),
        prompt: request.prompt,
        yaml: yamlContent,
        timestamp: new Date()
      });

      return {
        yaml: yamlContent,
        metadata: {
          generationTime: Date.now() - startTime,
          tokensUsed: 0, // Simplified for now
          model: provider === 'llama' ? 'llama-based' : 'rule-based',
          provider: provider,
          confidence: 0.95,
          promptEnhanced: !!enhancementMetadata,
          enhancementMetadata,
          contextWindowSize: parsed.contextWindowSize,
          farm_id: farmId,
          workspace_path: farmWorkspace
        },
        validation,
        suggestions
      };
    } catch (error) {
      throw new Error(`YAML generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private generateSteps(parsed: ParsedPrompt): string[] {
    const stepTemplates: Record<string, string[]> = {
      testing: [
        'Set up comprehensive testing environment: Install Jest, Cypress, Playwright, and other testing frameworks. Configure test databases, mock servers, and test data fixtures. Set up continuous integration hooks and coverage reporting tools. SAVE all configuration files to your workspace immediately',
        'Create unit test suites with high coverage: Write tests for all utility functions, test React components with Testing Library, properly mock external dependencies, achieve minimum 80% code coverage, and implement snapshot testing where appropriate. SAVE test files to workspace/tests/ as you create them',
        'Execute integration tests across all services: Test REST API endpoints with various payloads, verify database transactions and rollbacks, test authentication and authorization flows, validate error handling and status codes, check rate limiting and pagination',
        'Perform end-to-end tests on critical user workflows: Map out key user journeys, test registration and login flows, verify core business functionality, check cross-browser compatibility, and test responsive design across breakpoints',
        'Run performance and load testing: Set up k6 or similar tools, simulate concurrent user scenarios, test API response times under load, identify performance bottlenecks, and establish performance baselines',
        'Analyze test results and identify failures: Review failed test cases, categorize issues by severity, identify root causes of failures, document edge cases discovered, and track test flakiness patterns',
        'Generate comprehensive test report: Compile coverage reports with gaps analysis, document test execution results, create test case documentation, provide improvement recommendations, and establish continuous monitoring for test health'
      ],
      review: [
        'Initialize comprehensive code review environment: Clone repository with full history, set up development environment with all dependencies, configure analysis tools (ESLint, TypeScript compiler, security scanners, SonarQube), and establish review criteria based on project standards',
        'Analyze codebase architecture and structure: Map project structure and component relationships, identify key modules and their dependencies, document technology stack and design patterns, create dependency graphs, and assess technical debt',
        'Perform deep static code analysis: Run comprehensive linting across all files, check TypeScript type safety and strict mode compliance, analyze code complexity metrics (cyclomatic complexity, cognitive complexity), identify code smells and anti-patterns, verify naming conventions and code organization',
        'Review code quality and design patterns: Evaluate adherence to SOLID principles, check proper implementation of design patterns, assess code reusability and modularity, verify error handling strategies, review async/await usage and promise handling',
        'Security and vulnerability assessment: Scan for OWASP top 10 vulnerabilities, check for exposed secrets or API keys, review authentication and authorization implementation, analyze input validation and sanitization, assess dependency vulnerabilities with npm audit',
        'Performance optimization review: Analyze bundle sizes and code splitting strategies, review database queries for N+1 problems, check for memory leaks and performance bottlenecks, evaluate caching strategies, assess React rendering performance and re-renders',
        'Generate comprehensive review report: Compile findings with severity levels (Critical, High, Medium, Low), provide specific code examples for each issue, suggest concrete improvements with code snippets, create prioritized action items, include metrics and visualizations of code quality'
      ],
      development: [
        'Initialize project with production-ready setup: Create well-organized project structure, configure TypeScript with strict settings, set up ESLint and Prettier with team standards, initialize Git with comprehensive .gitignore, configure environment variables and secrets management. SAVE all files to workspace root immediately after creation',
        'Design and implement core architecture: Define data models and database schema with migrations, create base classes and interfaces for type safety, implement dependency injection patterns, set up state management (Redux/Zustand/Context), establish error boundary strategies and fallbacks. SAVE each module to workspace/src/ as you complete it',
        'Develop authentication and authorization: Implement secure user registration with validation, create JWT-based authentication with refresh tokens, set up role-based access control (RBAC), implement password reset and email verification, add session management and security headers. SAVE auth modules to workspace/src/auth/ immediately',
        'Build primary features and business logic: Implement core domain functionality with clean architecture, create reusable service layers and utilities, develop data processing pipelines, implement business rule engines, add feature flags for gradual rollout. SAVE each feature to workspace/src/features/ as completed',
        'Create responsive and accessible UI: Build component library with Storybook documentation, implement responsive grid layouts with mobile-first approach, ensure WCAG 2.1 AA compliance, add loading states and skeleton screens, implement comprehensive error messaging',
        'Implement data persistence and caching: Set up database connections with connection pooling, implement repository and unit of work patterns, add Redis caching layer with TTL strategies, create database migrations and seeders, implement transaction handling and rollback',
        'Develop RESTful API with documentation: Create Express routes with input validation (Joi/Zod), implement OpenAPI/Swagger documentation, add request/response logging middleware, implement rate limiting and throttling, create API versioning strategy',
        'Add comprehensive error handling: Implement global error handlers and error boundaries, add structured logging with Winston/Pino, integrate Sentry for error tracking, create health check and status endpoints, add APM for performance monitoring',
        'Write tests and documentation: Create unit tests for all services and utilities, implement integration tests for API endpoints, add end-to-end test scenarios, write comprehensive README with setup instructions, document API endpoints and deployment procedures'
      ],
      debugging: [
        'Reproduce and isolate the issue: Set up environment matching production exactly, reproduce issue consistently with minimal steps, create isolated test case, document reproduction steps clearly, identify all affected components and dependencies',
        'Analyze system logs and error traces: Collect and aggregate all relevant log files, parse and filter error messages by timestamp, identify error patterns and frequency, trace execution flow through the stack, correlate errors with system events and user actions',
        'Use debugging tools for deep inspection: Set strategic breakpoints in suspected code paths, inspect variable states and object properties, analyze call stacks and execution context, profile memory usage and garbage collection, monitor network requests and responses',
        'Investigate root causes systematically: Review recent code changes and commits, check dependency updates and version conflicts, analyze configuration and environment changes, investigate data inconsistencies, verify external service status and APIs',
        'Implement and validate the fix: Write targeted fix addressing root cause, add defensive programming and guard clauses, implement proper error handling and recovery, add detailed logging for future debugging, ensure backward compatibility',
        'Test fix across all environments: Verify fix works in local development, test thoroughly in staging environment, check for unintended side effects, validate performance impact, ensure no regression in related features',
        'Document issue and solution: Create detailed bug report with all findings, document root cause analysis process, explain solution approach and alternatives considered, add to troubleshooting knowledge base, update monitoring to catch similar issues'
      ],
      analysis: [
        'Set up data analysis environment: Configure Python/R with necessary libraries (pandas, numpy, scikit-learn), set up Jupyter notebooks for interactive analysis, establish database connections and API access, configure data warehouse connections, implement version control for analysis code',
        'Gather and validate data: Connect to multiple data sources and APIs, implement robust data extraction pipelines, validate data completeness and quality metrics, handle missing or corrupted data gracefully, create comprehensive data audit trails',
        'Perform data cleaning and preprocessing: Remove duplicates and handle outliers, standardize data formats and encodings, implement appropriate missing value strategies, normalize and scale features, document all data transformations',
        'Conduct exploratory data analysis: Generate comprehensive descriptive statistics, create distribution visualizations and histograms, identify correlations and relationships, detect anomalies and patterns, document initial insights and hypotheses',
        'Apply statistical models and machine learning: Select appropriate algorithms for the problem, implement train/test/validation splits, perform hyperparameter tuning, implement cross-validation strategies, assess model performance metrics',
        'Create visualizations and insights: Design informative charts and graphs, build interactive dashboards, implement drill-down capabilities, ensure mobile responsiveness, create export functionality',
        'Generate actionable recommendations: Translate findings to business value, create implementation roadmaps, estimate impact and ROI, identify risks and limitations, suggest follow-up analyses'
      ],
      visualization: [
        'Define visualization requirements: Identify key metrics and KPIs to display, determine data update frequency and real-time needs, establish data sources and API connections, define user interaction requirements, create detailed mockups and wireframes',
        'Set up visualization framework: Choose appropriate libraries (D3.js, Chart.js, Plotly, Three.js), configure responsive canvas/SVG rendering, implement data transformation pipeline, establish theming and styling system, create reusable chart components',
        'Design information architecture: Create clear visual hierarchy, establish consistent color schemes, design responsive layout grid, implement accessibility features, ensure print-ready quality',
        'Implement core visualizations: Build interactive charts with smooth animations, implement real-time data updates, add zoom/pan/filter capabilities, create informative tooltips and legends, implement data comparison features',
        'Optimize performance: Implement efficient data loading and caching, optimize rendering for large datasets, add progressive loading, minimize bundle size, implement web workers for heavy computations',
        'Create comprehensive infographic: Design cohesive visual narrative, balance text and visual elements, ensure cross-device compatibility, implement interactive elements, create export options (PNG, SVG, PDF)',
        'Test and document: Test across all browsers and devices, verify data accuracy and calculations, gather and incorporate user feedback, document usage and integration, create style guide for consistency'
      ],
      optimization: [
        'Analyze current performance: Run Lighthouse and WebPageTest audits, profile JavaScript execution with Chrome DevTools, analyze database query performance with EXPLAIN, measure API response times, document baseline metrics',
        'Optimize frontend performance: Implement code splitting and lazy loading, optimize images with next-gen formats, minimize and compress CSS/JavaScript, implement service workers and PWA features, add resource hints and preloading',
        'Improve backend efficiency: Optimize database queries and add indexes, implement caching at multiple levels, refactor inefficient algorithms, add connection pooling, optimize API response payloads',
        'Enhance build process: Optimize webpack/Vite configuration, implement tree shaking and dead code elimination, set up CDN for static assets, configure Brotli/gzip compression, optimize Docker images',
        'Implement monitoring: Set up performance monitoring (New Relic, DataDog), create custom performance metrics, establish alerting thresholds, implement error tracking, create performance dashboards',
        'Document optimizations: Create performance budget, document optimization techniques used, establish best practices guide, create monitoring runbooks, plan continuous improvement'
      ],
      deployment: [
        'Prepare deployment environment: Set up production servers and infrastructure, configure load balancers and auto-scaling, establish database and cache clusters, set up CDN distribution, configure security groups and firewalls',
        'Build production artifacts: Create optimized production builds, generate source maps for debugging, create Docker containers, prepare database migrations, bundle static assets',
        'Configure CI/CD pipeline: Set up automated build process, implement automated testing gates, configure deployment stages, set up rollback mechanisms, implement blue-green deployment',
        'Execute deployment: Run database migrations safely, deploy application with zero downtime, update configuration and secrets, warm up caches, verify health checks',
        'Validate deployment: Run smoke tests on production, verify all endpoints responding, check performance metrics, validate logging and monitoring, ensure backup systems working',
        'Monitor post-deployment: Track error rates and performance, monitor user activity and feedback, check resource utilization, validate alerting systems, document deployment process'
      ],
      monitoring: [
        'Set up monitoring infrastructure: Deploy Prometheus and Grafana, configure ELK stack for logging, set up APM tools, establish metrics collection, implement distributed tracing',
        'Configure comprehensive metrics: Define business and technical KPIs, set up custom metrics collection, implement request/response logging, track user behavior metrics, monitor resource utilization',
        'Create alerting rules: Define critical alert conditions, set up escalation policies, configure notification channels, implement alert suppression, test alert scenarios',
        'Build dashboards: Create operational dashboards, design business metrics views, implement drill-down capabilities, add real-time updates, ensure mobile accessibility',
        'Implement SLOs and SLIs: Define service level objectives, implement SLI measurements, create error budgets, track compliance metrics, generate SLA reports',
        'Document and train: Create runbooks for incidents, document dashboard usage, train team on tools, establish on-call procedures, create incident response playbooks'
      ],
      general: [
        'Initialize project environment: Set up development environment with all necessary tools, configure version control and branching strategy, establish project structure and conventions, set up continuous integration, create initial documentation. SAVE ALL configuration and setup files to your workspace immediately',
        'Analyze requirements thoroughly: Gather and document all requirements, identify technical constraints and dependencies, create user stories and acceptance criteria, estimate effort and timeline, identify potential risks. SAVE analysis documents to workspace/docs/',
        'Design solution architecture: Create high-level design documents, define component interfaces and APIs, establish data flow and schemas, plan for scalability and performance, document architectural decisions. SAVE architecture files to workspace/architecture/',
        'Implement core functionality: Build main features iteratively, follow coding best practices, implement proper error handling, add comprehensive logging, ensure code maintainability. SAVE each completed module to appropriate workspace subdirectory immediately',
        'Test and validate: Write comprehensive test suites, perform integration testing, validate against requirements, conduct user acceptance testing, ensure performance targets met',
        'Document and deliver: Create user documentation, write technical documentation, prepare deployment guides, conduct knowledge transfer, archive project artifacts'
      ]
    };

    return stepTemplates[parsed.taskType] || stepTemplates.general;
  }

  private generateInitialPrompt(parsed: any, agents: any[], farmId?: string): string {
    const agentNames = agents.map(a => a.name).slice(0, 3).join(', ');
    const fullTeamSize = agents.length;
    const workspacePath = farmId ? `maibarn/workspaces/active/${farmId}` : 'maibarn/workspaces/active';
    
    // Analyze prompt complexity to determine thinking level
    const complexityIndicators = thinkingStrategyService.analyzeComplexity(
      parsed.originalPrompt || parsed.description || ''
    );
    const complexityScore = thinkingStrategyService.calculateComplexityScore(complexityIndicators);
    
    // Recommend thinking level based on task type and complexity
    const thinkingRecommendation = thinkingStrategyService.recommendThinkingLevel(
      parsed.originalPrompt || parsed.description || '',
      parsed.taskType
    );
    
    // Build comprehensive prompt with detailed instructions
    let prompt = `🌾 Welcome to MaiFarm! 🌾\n\n`;
    prompt += `You are joining a collaborative team of ${fullTeamSize} specialized agents for an important task.\n\n`;
    
    // Add thinking strategy instructions if complexity warrants it
    if (thinkingRecommendation.level !== ThinkingLevel.NONE) {
      const thinkingConfig: ThinkingConfig = {
        level: thinkingRecommendation.level,
        taskType: parsed.taskType as any,
        context: `This is a collaborative multi-agent task with ${fullTeamSize} agents. Coordinate effectively and ${thinkingRecommendation.reasoning.toLowerCase()}.`,
        autoEscalate: false // Don't auto-escalate in YAML generation
      };
      
      // Apply thinking enhancement to the mission description
      const missionPrompt = parsed.originalPrompt || parsed.description || '';
      const enhancedMission = thinkingStrategyService.enhancePrompt(missionPrompt, thinkingConfig);
      
      prompt += `🧠 **Thinking Strategy Applied:** ${enhancedMission.appliedLevel}\n`;
      prompt += `📊 **Task Complexity:** ${Math.round(complexityScore)}% (${thinkingRecommendation.reasoning})\n\n`;
    }
    
    // CRITICAL: Add workspace management instructions at the very beginning
    prompt += `📁 **CRITICAL - File Management Protocol:**\n`;
    prompt += `- **ALL generated files MUST be saved to:** ${workspacePath}/\n`;
    prompt += `- **Save files IMMEDIATELY after generation** - do not wait until the end\n`;
    prompt += `- Use absolute paths when saving: /Users/[username]/maifarm/${workspacePath}/\n`;
    prompt += `- Create subdirectories as needed (e.g., ${workspacePath}/src/, ${workspacePath}/tests/)\n`;
    prompt += `- **NEVER save files to the main codebase directory**\n`;
    prompt += `- Check file exists after saving and confirm successful write\n\n`;
    
    prompt += `🔄 **Continuation Instructions:**\n`;
    prompt += `- To resume your work later, use: \`claude --continue\`\n`;
    prompt += `- To pick a specific conversation: \`claude --resume\`\n`;
    prompt += `- For non-interactive continuation: \`claude --continue --print "Continue with [task]"\`\n`;
    prompt += `- Always save your progress before stopping work\n\n`;
    
    // Add original request if available
    if (parsed.originalPrompt) {
      prompt += `📋 **Original Request:**\n${parsed.originalPrompt}\n\n`;
    } else if (parsed.description) {
      prompt += `📋 **Task Description:**\n${parsed.description}\n\n`;
    }
    
    // Add detailed mission based on task type with thinking strategy
    const taskThinkingGuidance: Record<string, string> = {
      testing: thinkingRecommendation.level >= ThinkingLevel.MODERATE 
        ? '\n\n💭 **Think hard** about edge cases, race conditions, and potential failure modes before writing tests.'
        : '',
      review: thinkingRecommendation.level >= ThinkingLevel.MODERATE
        ? '\n\n💭 **Think deeply** about code quality, security implications, and architectural impacts during review.'
        : '',
      development: thinkingRecommendation.level >= ThinkingLevel.BASIC
        ? '\n\n💭 **Think** about the overall architecture and future maintainability before implementing.'
        : '',
      debugging: thinkingRecommendation.level >= ThinkingLevel.DEEP
        ? '\n\n💭 **Think harder** about all possible root causes and system interactions before debugging.'
        : '',
      analysis: thinkingRecommendation.level >= ThinkingLevel.MODERATE
        ? '\n\n💭 **Think hard** about data patterns, correlations, and hidden insights during analysis.'
        : '',
      optimization: thinkingRecommendation.level >= ThinkingLevel.MODERATE
        ? '\n\n💭 **Think hard** about performance bottlenecks and optimization trade-offs.'
        : '',
      general: thinkingRecommendation.level >= ThinkingLevel.BASIC
        ? '\n\n💭 **Think** carefully about the problem and plan your approach systematically.'
        : ''
    };
    
    // Add detailed mission based on task type
    const missionDescriptions: Record<string, string> = {
      testing: `🧪 **Your Mission:** Create and execute a comprehensive testing strategy covering:
- Unit tests with minimum 80% code coverage
- Integration tests for all API endpoints and services
- End-to-end tests for critical user workflows
- Performance and load testing benchmarks
- Security vulnerability testing
- Accessibility compliance testing

**Testing Approach:**
1. Set up testing frameworks (Jest, Cypress, Playwright)
2. Each agent focuses on specific test domains
3. Share test data and mocks via coordination files
4. Track coverage metrics systematically
5. Document all test cases and results`,

      review: `🔍 **Your Mission:** Perform a comprehensive code review focusing on:
- Code quality, patterns, and best practices
- Security vulnerabilities (OWASP Top 10)
- Performance bottlenecks and optimization opportunities
- Test coverage and quality
- Documentation completeness
- Architecture and design decisions

**Review Approach:**
1. Each agent claims specific areas (frontend, backend, etc.)
2. Use static analysis tools and manual inspection
3. Document findings with severity levels
4. Provide concrete improvement suggestions
5. Collaborate on cross-cutting concerns`,

      development: `🚀 **Your Mission:** Build a production-ready application featuring:
- Modern architecture with clean code principles
- Comprehensive feature implementation
- Robust error handling and logging
- Performance optimization
- Security best practices
- Full documentation and deployment setup

**Development Approach:**
1. Initialize with proper project structure
2. Each agent owns specific features/components
3. Define clear interfaces between modules
4. Implement continuous integration
5. Maintain comprehensive documentation`,

      debugging: `🐛 **Your Mission:** Identify and resolve critical issues through:
- Systematic issue reproduction
- Root cause analysis
- Performance profiling
- Memory leak detection
- Comprehensive fix implementation

**Debugging Approach:**
1. Reproduce issues consistently
2. Each agent investigates different causes
3. Share findings via coordination files
4. Implement and thoroughly test fixes
5. Document solutions for future reference`,

      analysis: `📊 **Your Mission:** Perform comprehensive data analysis including:
- Data collection and validation
- Exploratory data analysis
- Statistical modeling and predictions
- Visualization and insights
- Actionable recommendations

**Analysis Approach:**
1. Set up data pipelines
2. Each agent handles specific analysis aspects
3. Validate results collaboratively
4. Create interactive visualizations
5. Generate business recommendations`,

      visualization: `🎨 **Your Mission:** Create compelling data visualizations:
- Interactive infographics and dashboards
- Real-time data visualization
- Responsive and accessible design
- Performance-optimized rendering
- Multiple export formats

**Visualization Approach:**
1. Define data requirements
2. Each agent handles specific components
3. Ensure consistent design language
4. Optimize for performance
5. Test across all devices`,

      optimization: `⚡ **Your Mission:** Optimize application performance:
- Frontend bundle optimization
- Backend response time improvement
- Database query optimization
- Caching strategy implementation
- Build process enhancement

**Optimization Approach:**
1. Establish performance baselines
2. Each agent focuses on specific areas
3. Measure improvements systematically
4. Document techniques used
5. Set up continuous monitoring`,

      deployment: `🚢 **Your Mission:** Execute production deployment:
- Infrastructure preparation
- CI/CD pipeline configuration
- Zero-downtime deployment
- Health checks and monitoring
- Rollback procedures

**Deployment Approach:**
1. Prepare production environment
2. Build and test artifacts
3. Execute staged deployment
4. Validate with smoke tests
5. Monitor post-deployment metrics`,

      monitoring: `📡 **Your Mission:** Implement comprehensive monitoring:
- Metrics collection and aggregation
- Alert rules and notifications
- Dashboard creation
- SLO/SLI implementation
- Incident response procedures

**Monitoring Approach:**
1. Deploy monitoring infrastructure
2. Define key metrics and KPIs
3. Create alerting rules
4. Build operational dashboards
5. Document runbooks`,

      general: `🎯 **Your Mission:** Complete the assigned collaborative task:
- Analyze requirements thoroughly
- Design optimal solution
- Implement with best practices
- Test comprehensively
- Document everything

**General Approach:**
1. Understand the full scope
2. Each agent claims their expertise area
3. Collaborate on integration points
4. Validate results together
5. Deliver complete solution`
    };

    const selectedMission = missionDescriptions[parsed.taskType] || missionDescriptions.general;
    const thinkingGuidance = taskThinkingGuidance[parsed.taskType] || taskThinkingGuidance.general;
    prompt += selectedMission;
    prompt += thinkingGuidance;
    
    // Add team information
    prompt += `\n\n👥 **Your Team:**\n`;
    prompt += `Working with: ${agentNames}${agents.length > 3 ? ' and others' : ''}\n`;
    prompt += `Total team size: ${fullTeamSize} specialized agents\n`;
    
    // Add specific agent capabilities if using special provider
    if (parsed.provider === 'llama') {
      prompt += `\n🔧 **Provider Capabilities (Llama):**\n`;
      prompt += `- 256K token context window for handling large codebases\n`;
      prompt += `- Advanced chain-of-thought reasoning\n`;
      prompt += `- Optimized for complex multi-file operations\n`;
    }
    
    // Add coordination protocol with proper maibarn paths
    prompt += `\n📁 **Coordination Protocol:**\n`;
    prompt += `- Shared coordination directory: maibarn/coordination/\n`;
    prompt += `- Farm-specific workspace: ${workspacePath}/\n`;
    prompt += `- Claim work in maibarn/coordination/active_agents.json before starting\n`;
    prompt += `- Update progress in maibarn/coordination/work_claims.json regularly\n`;
    prompt += `- Check existing claims to avoid duplicate work\n`;
    prompt += `- Communicate via shared status files in coordination directory\n`;
    prompt += `- **Remember: Save all your generated files to ${workspacePath}/ immediately**\n`;
    
    // Add technology stack if detected
    if (parsed.technologies && parsed.technologies.length > 0) {
      prompt += `\n🛠️ **Technology Stack:**\n`;
      parsed.technologies.forEach((tech: string) => {
        prompt += `- ${tech.charAt(0).toUpperCase() + tech.slice(1)}\n`;
      });
    }
    
    // Add success criteria
    prompt += `\n✅ **Success Criteria:**\n`;
    prompt += `- All tasks completed with high quality\n`;
    prompt += `- No duplicate work between agents\n`;
    prompt += `- Clear documentation of all work\n`;
    prompt += `- Successful integration of components\n`;
    prompt += `- Meeting all project requirements\n`;
    
    // Add complexity-based timeline
    const timeEstimates: Record<string, string> = {
      simple: '1-2 hours',
      moderate: '2-4 hours',
      complex: '4-8 hours'
    };
    const complexity = parsed.complexity || 'moderate';
    prompt += `\n⏱️ **Estimated Timeline:** ${timeEstimates[complexity]}\n`;
    
    // Final call to action
    prompt += `\n📝 **Getting Started:**\n`;
    prompt += `1. Create your workspace directory: ${workspacePath}/\n`;
    prompt += `2. Review the detailed task steps below\n`;
    prompt += `3. Claim your work area in coordination files\n`;
    prompt += `4. **SAVE EVERY FILE YOU CREATE IMMEDIATELY to ${workspacePath}/**\n`;
    prompt += `5. Begin with your specialized responsibilities\n`;
    prompt += `6. Coordinate with other agents as needed\n`;
    prompt += `7. Update your progress regularly\n\n`;
    prompt += `⚠️ **REMINDER**: Save ALL generated files to ${workspacePath}/ immediately after creation!\n\n`;
    prompt += `When ready to begin this collaborative effort with your farm colleagues, respond with "Ready to begin" and start claiming your work areas.`;
    
    return prompt;
  }

  private generateTasks(parsed: ParsedPrompt): any[] {
    const taskTemplates: Record<string, any[]> = {
      testing: [
        { type: 'setup-environment', agent: 'coordinator-1' },
        { type: 'run-tests', agent: 'tester-3' },
        { type: 'analyze-results', agent: 'analyzer-4' },
        { type: 'generate-report', agent: 'documenter-5' }
      ],
      development: [
        { type: 'analyze-requirements', agent: 'coordinator-1' },
        { type: 'implement-features', agent: 'developer-2' },
        { type: 'code-review', agent: 'analyzer-4' },
        { type: 'update-docs', agent: 'documenter-5' }
      ],
      general: [
        { type: 'initialize', agent: 'coordinator-1' },
        { type: 'execute-main-task', agent: 'developer-2' },
        { type: 'validate-results', agent: 'tester-3' },
        { type: 'finalize', agent: 'coordinator-1' }
      ]
    };

    return taskTemplates[parsed.taskType] || taskTemplates.general;
  }

  private generateSuggestions(config: any, parsed: ParsedPrompt): string[] {
    const suggestions = [];
    const isLlama = parsed.provider === 'llama';

    if (!parsed.technologies.length) {
      suggestions.push('Consider specifying technologies for more targeted agent capabilities');
    }

    if (isLlama) {
      // Llama-specific suggestions
      if (parsed.agentCount > 8) {
        suggestions.push('While Llama can handle more agents, consider limiting to 8 for optimal coordination');
      }
      suggestions.push('Leverage Llama\'s 256K context window for complex, multi-file tasks');
      suggestions.push('Use chain-of-thought prompting for better reasoning with Llama');
    } else {
      // Claude-specific suggestions
      if (parsed.agentCount > 5) {
        suggestions.push('Consider using fewer agents for better coordination with Claude');
      }
    }

    if (config.steps && !config.steps.find((s: any) => 
      typeof s === 'string' ? s.toLowerCase().includes('test') : s.content?.toLowerCase().includes('test')
    )) {
      suggestions.push('Add testing steps to ensure quality');
    }

    return suggestions;
  }

  async generateFromTemplate(templateId: string, variables: Record<string, any>): Promise<string> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    // Simple variable replacement
    let yamlContent = template.content;
    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      yamlContent = yamlContent.replace(new RegExp(placeholder, 'g'), String(value));
    });

    return yamlContent;
  }

  async getTemplates(): Promise<YamlTemplate[]> {
    return Array.from(this.templates.values());
  }

  async getHistory(userId?: string, options?: { limit: number; offset: number }): Promise<any[]> {
    const { limit = 10, offset = 0 } = options || {};
    return this.history.slice(offset, offset + limit);
  }

  /**
   * Generate YAML with barn integration
   */
  async generateWithBarnIntegration(request: YamlGenerationRequest & {
    farmId?: string;
    includeBarnSuggestions?: boolean;
    barnReferences?: string[];
  }): Promise<YamlGenerationResponse> {
    // First generate the regular YAML
    const baseResponse = await this.generateYaml(request);
    
    let yamlContent = baseResponse.yaml;
    const suggestions = [...(baseResponse.suggestions || [])];
    
    // Process barn references if provided
    if (request.barnReferences && request.barnReferences.length > 0) {
      yamlContent = await this.processBarnReferences(yamlContent, request.farmId);
    }
    
    // Extract barn references from the prompt and add them to YAML
    const extractedRefs = this.extractBarnReferences(request.prompt);
    if (extractedRefs.length > 0) {
      yamlContent = await this.processBarnReferences(yamlContent, request.farmId);
    }
    
    // Add barn suggestions if requested
    if (request.includeBarnSuggestions) {
      const barnSuggestions = await this.suggestBarnItems(request.prompt);
      if (barnSuggestions.length > 0) {
        // Add barn suggestions as comments
        let barnSection = '\n# Suggested Barn Items:\n';
        barnSuggestions.forEach(item => {
          barnSection += `# - ${item.name}: ${item.description} (${item.reference})\n`;
        });
        yamlContent = yamlContent + barnSection;
        
        suggestions.push(
          `Consider using ${barnSuggestions.length} relevant items from the Barn: ` +
          barnSuggestions.map(item => item.name).join(', ')
        );
      }
    }
    
    // Add dynamic timeout to metadata
    const parsedForTimeout = {
      ...this.parsePrompt(request.prompt),
      prompt: request.prompt,
      originalPrompt: request.prompt
    } as any;
    const dynamicTimeout = this.calculateDynamicTimeout(parsedForTimeout);
    
    return {
      ...baseResponse,
      yaml: yamlContent,
      suggestions,
      barnReferences: extractedRefs,
      timeout: dynamicTimeout, // Add timeout at top level for easy access
      metadata: {
        ...baseResponse.metadata,
        barnIntegration: true,
        barnReferencesCount: extractedRefs.length,
        dynamicTimeout: dynamicTimeout // Also in metadata for consistency
      }
    };
  }

  async enhancePrompt(request: { prompt: string; context?: string; purpose?: string }): Promise<PromptEnhancementResult> {
    const normalized = this.normalizeEnhancementRequest(request);
    const cacheKey = JSON.stringify([normalized.prompt, normalized.context || null, normalized.purpose || null]);

    const cached = this.promptEnhancementCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    if (this.promptEnhancementInFlight.has(cacheKey)) {
      return this.promptEnhancementInFlight.get(cacheKey)!;
    }

    const execution = this.executePromptEnhancement(normalized);
    this.promptEnhancementInFlight.set(cacheKey, execution);

    try {
      const result = await execution;
      this.promptEnhancementCache.set(cacheKey, {
        result,
        expiresAt: Date.now() + this.PROMPT_ENHANCEMENT_TTL_MS
      });
      return result;
    } finally {
      this.promptEnhancementInFlight.delete(cacheKey);
    }
  }

  private normalizeEnhancementRequest(request: { prompt: string; context?: string; purpose?: string }) {
    const prompt = (request.prompt || '').trim();
    const context = request.context?.trim();
    const purpose = request.purpose?.trim();

    return {
      prompt,
      context: context && context.length > 0 ? context : undefined,
      purpose: purpose && purpose.length > 0 ? purpose.toLowerCase() : undefined
    };
  }

  private async executePromptEnhancement(request: { prompt: string; context?: string; purpose?: string }): Promise<PromptEnhancementResult> {
    const parsed = this.parsePrompt(request.prompt);
    const heuristic = this.buildHeuristicEnhancement(parsed, request);

    let enhancedPrompt = heuristic.enhancedPrompt;
    const suggestions = new Set<string>(heuristic.suggestions);
    const improvements = new Set<string>(heuristic.improvements);
    let confidence: number | undefined;

    try {
      const claudeEnhancement = await promptEnhancementService.enhancePrompt({
        prompt: request.prompt,
        context: request.context,
        targetAgentCount: parsed.agentCount,
        taskType: (request.purpose as any) || parsed.taskType || 'farm',
        additionalInstructions: 'Return only the improved prompt with clear agent roles, coordination steps, risks, and success criteria.'
      });

      const claudePrompt = claudeEnhancement.enhancedPrompt?.trim();
      if (claudePrompt && this.isMeaningfulEnhancement(request.prompt, claudePrompt)) {
        enhancedPrompt = claudePrompt;
        improvements.add('Applied Claude prompt enhancement service');
        confidence = Math.max(confidence ?? 0, 0.85);
      }
    } catch (error) {
      console.warn('[YamlGenerator] Claude prompt enhancement unavailable:', error);
    }

    try {
      const localEnhancement = await promptEnhancer.enhancePrompt({
        prompt: enhancedPrompt,
        context: request.context,
        purpose: (request.purpose as any) || 'farm',
        style: 'technical'
      });

      const localPrompt = localEnhancement.enhanced_prompt?.trim();
      if (localPrompt && this.isMeaningfulEnhancement(enhancedPrompt, localPrompt)) {
        enhancedPrompt = this.selectPreferredPrompt(enhancedPrompt, localPrompt);
      }

      localEnhancement.suggestions?.forEach((suggestion) => suggestions.add(suggestion));
      this.normalizeImprovementEntries(localEnhancement.improvements).forEach((improvement) => improvements.add(improvement));
      if (typeof (localEnhancement as any).confidence === 'number') {
        confidence = Math.max(confidence ?? 0, (localEnhancement as any).confidence);
      }
    } catch (error) {
      console.warn('[YamlGenerator] Local prompt enhancement failed:', error);
    }

    const finalPrompt = this.ensurePromptContext(enhancedPrompt, request, parsed);

    suggestions.add('Review generated agent roles, steps, and constraints before launching the farm.');
    suggestions.add('Provide explicit acceptance criteria to help agents measure success.');

    return {
      enhanced_prompt: finalPrompt,
      original_prompt: request.prompt,
      suggestions: this.toUniqueArray(suggestions),
      improvements: this.toUniqueArray(improvements),
      confidence
    };
  }

  private buildHeuristicEnhancement(parsed: ParsedPrompt, request: { prompt: string; context?: string; purpose?: string }) {
    const purpose = request.purpose || parsed.taskType || 'general';
    const suggestions = new Set<string>();
    const improvements = new Set<string>();

    const agentCount = Math.max(parsed.agentCount, 1);
    let enhancedPrompt = `Create a MaiFarm configuration for ${agentCount} agents`;

    if (purpose) {
      enhancedPrompt += ` specializing in ${purpose}`;
      improvements.add(`Added specialization focus: ${purpose}`);
    }

    if (parsed.technologies.length > 0) {
      enhancedPrompt += ` using ${parsed.technologies.join(', ')}`;
      improvements.add(`Documented technology stack (${parsed.technologies.join(', ')})`);
    } else {
      suggestions.add('Specify the primary technology stack to tailor agent capabilities.');
    }

    enhancedPrompt += '. Coordinate the following workstreams:';
    const taskList = this.getTaskListForPurpose(purpose, parsed.taskType);
    taskList.forEach((task) => {
      enhancedPrompt += `\n- ${task}`;
    });

    enhancedPrompt += '\nEnsure agents claim work, share updates frequently, and maintain high quality standards.';

    if (request.context) {
      enhancedPrompt += `\nContext: ${request.context}`;
      improvements.add('Incorporated provided context');
    }

    if (agentCount > 4) {
      suggestions.add('Consider defining a lead coordinator to manage large agent teams.');
    }

    if (!parsed.description.toLowerCase().includes('test')) {
      suggestions.add('Include testing or validation steps to maintain quality.');
    }

    if (!parsed.description.toLowerCase().includes('document')) {
      suggestions.add('Add documentation responsibilities for knowledge transfer.');
    }

    return {
      enhancedPrompt: enhancedPrompt.trim(),
      suggestions: Array.from(suggestions),
      improvements: Array.from(improvements)
    };
  }

  private getTaskListForPurpose(purpose: string, fallback: string): string[] {
    const library: Record<string, string[]> = {
      testing: [
        'Set up automated test tooling and environments',
        'Create unit, integration, and end-to-end test suites',
        'Measure coverage and highlight critical gaps',
        'Automate regression testing workflows'
      ],
      review: [
        'Perform architecture and code quality analysis',
        'Identify security and dependency risks',
        'Document improvement recommendations',
        'Summarize key findings for stakeholders'
      ],
      development: [
        'Design solution architecture and project scaffolding',
        'Implement prioritized features with clean abstractions',
        'Add error handling, logging, and observability',
        'Create deployment-ready build artifacts'
      ],
      debugging: [
        'Reproduce and isolate reported issues',
        'Trace logs, stack traces, and telemetry for root causes',
        'Implement fixes with regression safeguards',
        'Document resolutions and preventative measures'
      ],
      analysis: [
        'Gather and validate relevant data sources',
        'Perform exploratory analysis and highlight insights',
        'Evaluate risks, trade-offs, and dependencies',
        'Provide actionable recommendations with rationale'
      ],
      optimization: [
        'Profile current performance to identify bottlenecks',
        'Prioritize optimizations based on impact and effort',
        'Implement improvements across frontend and backend',
        'Validate gains with repeatable benchmarks'
      ],
      visualization: [
        'Define user stories and data storytelling goals',
        'Design accessible, responsive data visualizations',
        'Implement interactive dashboards with filtering',
        'Document integration steps for stakeholders'
      ],
      documentation: [
        'Capture architecture decisions and system context',
        'Write API and integration references with examples',
        'Produce onboarding and operational guides',
        'Maintain change logs and release notes'
      ],
      general: [
        'Clarify objectives, constraints, and success metrics',
        'Break work into collaborative, parallel tasks',
        'Define quality gates and review checkpoints',
        'Plan knowledge transfer and documentation'
      ]
    };

    return library[purpose] || library[fallback] || library.general;
  }

  private ensurePromptContext(prompt: string, request: { context?: string; purpose?: string }, parsed: ParsedPrompt): string {
    let result = (prompt || '').trim();

    if (request.context) {
      const contextLower = request.context.toLowerCase();
      if (!result.toLowerCase().includes(contextLower)) {
        const separator = result.endsWith('.') ? ' ' : '\n';
        result += `${separator}Context: ${request.context}`;
      }
    }

    if (request.purpose) {
      const purposeLower = request.purpose.toLowerCase();
      if (!result.toLowerCase().includes(purposeLower)) {
        result += `\nFocus: ${request.purpose}`;
      }
    }

    if (parsed.agentCount > 1 && !result.toLowerCase().includes('coordinate')) {
      result += '\nInclude coordination checkpoints, shared workspace paths, and conflict resolution steps.';
    }

    return result.trim();
  }

  private isMeaningfulEnhancement(basePrompt: string, candidate: string): boolean {
    const baseNormalized = (basePrompt || '').replace(/\s+/g, ' ').trim();
    const candidateNormalized = (candidate || '').replace(/\s+/g, ' ').trim();

    if (!candidateNormalized) {
      return false;
    }

    if (candidateNormalized.length <= baseNormalized.length) {
      return candidate.split(/\n+/).length > basePrompt.split(/\n+/).length + 1;
    }

    return candidateNormalized.length - baseNormalized.length > 12;
  }

  private selectPreferredPrompt(current: string, candidate: string): string {
    if (!candidate) return current;
    if (!current) return candidate;

    const candidateLines = candidate.split(/\n+/).length;
    const currentLines = current.split(/\n+/).length;

    if (candidateLines > currentLines + 1) {
      return candidate;
    }

    return candidate.length > current.length ? candidate : current;
  }

  private normalizeImprovementEntries(improvements: unknown): string[] {
    if (!improvements) return [];

    if (Array.isArray(improvements)) {
      return improvements
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry.length > 0);
    }

    if (typeof improvements === 'object') {
      return Object.entries(improvements as Record<string, unknown>)
        .map(([key, value]) => {
          if (typeof value === 'string' && value.trim().length > 0) {
            return `${this.capitalize(key)}: ${value.trim()}`;
          }
          return null;
        })
        .filter((entry): entry is string => Boolean(entry));
    }

    if (typeof improvements === 'string') {
      const trimmed = improvements.trim();
      return trimmed.length > 0 ? [trimmed] : [];
    }

    return [];
  }

  private toUniqueArray(values: Iterable<string>): string[] {
    const unique = new Set<string>();
    for (const value of values) {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        unique.add(trimmed);
      }
    }
    return Array.from(unique);
  }

  private capitalize(value: string): string {
    if (!value) return value;
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  /**
   * Generate YAML from harvest data
   */
  async generateFromHarvest(harvest: any, options?: {
    additionalPrompt?: string;
    preserveOriginalConfig?: boolean;
    enhanceWithResults?: boolean;
  }): Promise<string> {
    try {
      // If harvest already has YAML configuration, use it as base
      if (harvest.farmConfig?.yaml && options?.preserveOriginalConfig !== false) {
        let yamlContent = harvest.farmConfig.yaml;
        
        // Add additional prompt if provided
        if (options?.additionalPrompt) {
          yamlContent = this.insertAdditionalPromptInYaml(yamlContent, options.additionalPrompt);
        }
        
        // Enhance with harvest results if requested
        if (options?.enhanceWithResults && harvest.results) {
          yamlContent = this.enhanceYamlWithHarvestResults(yamlContent, harvest);
        }
        
        return yamlContent;
      }

      // Generate new YAML based on harvest information
      const request: YamlGenerationRequest = {
        prompt: this.buildPromptFromHarvest(harvest, options?.additionalPrompt),
        mode: 'farm',
        constraints: {
          maxAgents: harvest.summary?.agents?.length || 3,
          context: `Recreating farm configuration based on harvest: ${harvest.name}`
        }
      };

      const response = await this.generateYaml(request);
      return response.yaml;
    } catch (error) {
      console.error('[YamlGenerator] Error generating YAML from harvest:', error);
      throw new Error(`Failed to generate YAML from harvest: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build a comprehensive prompt from harvest data
   */
  private buildPromptFromHarvest(harvest: any, additionalPrompt?: string): string {
    let prompt = '';
    
    // Start with harvest description
    if (harvest.description) {
      prompt += harvest.description;
    } else if (harvest.name) {
      prompt += `Create a farm configuration for: ${harvest.name}`;
    }
    
    // Add farm context
    if (harvest.farmName) {
      prompt += `\n\nOriginal farm: ${harvest.farmName}`;
    }
    
    // Add agent information if available
    if (harvest.summary?.agents) {
      prompt += `\n\nUse ${harvest.summary.agents.length} agents similar to the original configuration.`;
    }
    
    // Add task types from results
    if (harvest.results && harvest.results.length > 0) {
      const taskTypes = [...new Set(harvest.results.map((r: any) => r.taskType))].filter(Boolean);
      if (taskTypes.length > 0) {
        prompt += `\n\nTasks should include: ${taskTypes.join(', ')}`;
      }
    }
    
    // Add quality insights
    if (harvest.insights && harvest.insights.length > 0) {
      prompt += `\n\nKey insights from previous execution:`;
      harvest.insights.slice(0, 3).forEach((insight: any) => {
        prompt += `\n- ${insight.title || insight.description || insight}`;
      });
    }
    
    // Add technology stack from yield
    if (harvest.yield && harvest.yield.length > 0) {
      const techStack = this.extractTechnologyFromYield(harvest.yield);
      if (techStack.length > 0) {
        prompt += `\n\nTechnology stack: ${techStack.join(', ')}`;
      }
    }
    
    // Add additional prompt if provided
    if (additionalPrompt && additionalPrompt.trim()) {
      prompt += `\n\n📝 Additional Requirements:\n${additionalPrompt}`;
    }
    
    return prompt;
  }

  /**
   * Extract technology information from harvest yield
   */
  private extractTechnologyFromYield(yieldItems: any[]): string[] {
    const technologies = new Set<string>();
    
    yieldItems.forEach(item => {
      // Check file extensions
      if (item.name) {
        const ext = item.name.split('.').pop()?.toLowerCase();
        const techMap: Record<string, string> = {
          'js': 'javascript',
          'ts': 'typescript', 
          'jsx': 'react',
          'tsx': 'react',
          'py': 'python',
          'java': 'java',
          'go': 'golang',
          'rs': 'rust',
          'php': 'php',
          'rb': 'ruby',
          'cpp': 'cpp',
          'cs': 'csharp',
          'sql': 'sql'
        };
        
        if (ext && techMap[ext]) {
          technologies.add(techMap[ext]);
        }
      }
      
      // Check content for framework indicators
      if (item.content || item.description) {
        const content = (item.content || item.description || '').toLowerCase();
        if (content.includes('react')) technologies.add('react');
        if (content.includes('vue')) technologies.add('vue');
        if (content.includes('angular')) technologies.add('angular');
        if (content.includes('express')) technologies.add('express');
        if (content.includes('fastapi')) technologies.add('fastapi');
        if (content.includes('django')) technologies.add('django');
        if (content.includes('flask')) technologies.add('flask');
        if (content.includes('docker')) technologies.add('docker');
        if (content.includes('kubernetes')) technologies.add('kubernetes');
      }
    });
    
    return Array.from(technologies);
  }

  /**
   * Insert additional prompt into existing YAML
   */
  private insertAdditionalPromptInYaml(yamlContent: string, additionalPrompt: string): string {
    try {
      const yamlObj = yaml.load(yamlContent) as any;
      
      if (yamlObj && yamlObj.initial_prompt) {
        yamlObj.initial_prompt = `${yamlObj.initial_prompt}\n\n📝 **Additional Instructions:**\n${additionalPrompt}`;
      } else {
        yamlObj.initial_prompt = `📝 **Additional Instructions:**\n${additionalPrompt}`;
      }

      return yaml.dump(yamlObj, {
        indent: 2,
        lineWidth: 80,
        noRefs: true
      });
    } catch (error) {
      console.warn('[YamlGenerator] Failed to parse YAML for prompt insertion, appending as comment:', error);
      return `${yamlContent}\n\n# Additional Instructions:\n# ${additionalPrompt.split('\n').join('\n# ')}`;
    }
  }

  /**
   * Enhance YAML with insights from harvest results
   */
  private enhanceYamlWithHarvestResults(yamlContent: string, harvest: any): string {
    try {
      const yamlObj = yaml.load(yamlContent) as any;
      
      // Add metadata section with harvest insights
      if (!yamlObj.metadata) {
        yamlObj.metadata = {};
      }
      
      yamlObj.metadata.harvest_derived = true;
      yamlObj.metadata.original_harvest = harvest.id;
      yamlObj.metadata.original_farm = harvest.farmName;
      
      // Add performance insights if available
      if (harvest.quality?.overallScore) {
        yamlObj.metadata.expected_quality_score = harvest.quality.overallScore;
      }
      
      if (harvest.summary?.efficiency) {
        yamlObj.metadata.expected_efficiency = harvest.summary.efficiency;
      }
      
      // Add successful task patterns
      if (harvest.results) {
        const successfulTasks = harvest.results
          .filter((r: any) => r.success)
          .map((r: any) => r.taskType)
          .filter(Boolean);
          
        if (successfulTasks.length > 0) {
          yamlObj.metadata.proven_task_types = [...new Set(successfulTasks)];
        }
      }
      
      // Add insights as comments in the steps
      if (harvest.insights && harvest.insights.length > 0 && yamlObj.steps) {
        const insightComments = harvest.insights
          .slice(0, 3)
          .map((insight: any) => `# Insight: ${insight.title || insight.description || insight}`)
          .join('\n');
          
        if (Array.isArray(yamlObj.steps)) {
          yamlObj.steps = [
            `# Insights from previous execution:\n${insightComments}`,
            ...yamlObj.steps
          ];
        }
      }
      
      return yaml.dump(yamlObj, {
        indent: 2,
        lineWidth: 80,
        noRefs: true
      });
    } catch (error) {
      console.warn('[YamlGenerator] Failed to enhance YAML with harvest results:', error);
      return yamlContent; // Return original if enhancement fails
    }
  }

  /**
   * Generate customized YAML from a farmer template
   */
  async generateYamlFromFarmer(
    farmerTemplate: any,
    userInputs: {
      farmName: string;
      description: string;
      customPrompt?: string;
      maxAgents?: number;
      timeout?: number;
    }
  ): Promise<string> {
    try {
      // Start with the farmer template's YAML content
      let customizedYaml = farmerTemplate.yaml_content || '';

      // If no YAML content, create from farmer template structure
      if (!customizedYaml) {
        // Build agent configurations with full personality and context
        const enhancedAgents = farmerTemplate.agents.map((agent: any, index: number) => ({
          ...agent,
          name: agent.name,
          role: agent.role,
          emoji: agent.emoji,
          personality: agent.personality,
          capabilities: agent.capabilities || [],
          specialties: agent.specialties || [],
          // Add farmer-specific prompt context
          prompt_context: `As ${agent.name} (${agent.emoji}), a ${agent.role} specialist from the ${farmerTemplate.title} team, ${agent.personality}. Focus on: ${(agent.specialties || agent.capabilities || []).join(', ')}`,
          // Include user's custom prompt if provided
          task_prompt: userInputs.customPrompt ? 
            `${agent.role} perspective on: ${userInputs.customPrompt}` : 
            farmerTemplate.initial_prompt
        }));

        const yamlData = {
          name: userInputs.farmName || farmerTemplate.name,
          title: `${farmerTemplate.title} - ${userInputs.farmName}`,
          description: userInputs.description || farmerTemplate.description,
          farmer_template: {
            id: farmerTemplate.id,
            title: farmerTemplate.title,
            category: farmerTemplate.category
          },
          agents: enhancedAgents,
          initial_prompt: userInputs.customPrompt ? 
            `${farmerTemplate.initial_prompt}\n\nUser Request: ${userInputs.customPrompt}` :
            farmerTemplate.initial_prompt,
          steps: farmerTemplate.steps,
          config: {
            ...farmerTemplate.config,
            maxAgents: userInputs.maxAgents || farmerTemplate.config?.maxAgents || 8,
            timeout: userInputs.timeout || farmerTemplate.config?.timeout || 3600,
            coordination: farmerTemplate.config?.coordination || 'collaborative',
            stagger: farmerTemplate.config?.stagger || 10
          },
          metadata: {
            ...farmerTemplate.metadata,
            generated_at: new Date().toISOString(),
            farmer_template_used: farmerTemplate.title,
            generated_from: 'farmer_template'
          }
        };
        
        customizedYaml = yaml.dump(yamlData, { 
          indent: 2,
          lineWidth: -1,
          noRefs: true 
        });
      }

      // Apply customizations
      customizedYaml = customizedYaml
        .replace(/\{\{FARM_NAME\}\}/g, userInputs.farmName)
        .replace(/\{\{FARM_DESCRIPTION\}\}/g, userInputs.description)
        .replace(/\{\{USER_PROMPT\}\}/g, userInputs.customPrompt || 'Please help me with my task.')
        .replace(/\{\{MAX_AGENTS\}\}/g, (userInputs.maxAgents || 8).toString())
        .replace(/\{\{TIMEOUT\}\}/g, (userInputs.timeout || 3600).toString());

      // Update the name and description in the YAML if they exist
      if (customizedYaml.includes('name:')) {
        customizedYaml = customizedYaml.replace(/^name:\s*.*$/m, `name: ${userInputs.farmName.toLowerCase().replace(/\s+/g, '-')}`);
      }
      
      if (customizedYaml.includes('title:')) {
        customizedYaml = customizedYaml.replace(/^title:\s*.*$/m, `title: ${userInputs.farmName}`);
      }

      if (customizedYaml.includes('description:')) {
        customizedYaml = customizedYaml.replace(/^description:\s*.*$/m, `description: ${userInputs.description}`);
      }

      // Update config values
      if (userInputs.maxAgents && customizedYaml.includes('maxAgents:')) {
        customizedYaml = customizedYaml.replace(/maxAgents:\s*\d+/g, `maxAgents: ${userInputs.maxAgents}`);
      }

      if (userInputs.timeout && customizedYaml.includes('timeout:')) {
        customizedYaml = customizedYaml.replace(/timeout:\s*\d+/g, `timeout: ${userInputs.timeout}`);
      }

      return customizedYaml;
    } catch (error) {
      console.error('Error in generateYamlFromFarmer:', error);
      throw new Error('Failed to generate YAML from farmer template');
    }
  }
}

export const yamlGenerator = YamlGeneratorService.getInstance();
