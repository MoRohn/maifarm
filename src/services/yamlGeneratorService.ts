/**
 * AI-powered YAML Generator Service
 * Generates structured YAML configurations from natural language prompts
 */

import { 
  GenerationRequest, 
  GenerationResponse, 
  YamlConfig, 
  ValidationResult,
  YamlTemplate,
  BuildStep 
} from '../types/yamlGenerator';

class YamlGeneratorService {
  private apiEndpoint: string;

  constructor() {
    this.apiEndpoint = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';
  }

  /**
   * Generate YAML configuration from natural language prompt
   */
  async generateYaml(request: GenerationRequest): Promise<GenerationResponse> {
    try {
      // Parse the natural language prompt
      const parsedIntent = this.parsePromptIntent(request.prompt);
      
      // Generate YAML structure based on parsed intent
      const yamlConfig = await this.createYamlStructure(parsedIntent, request.options);
      
      // Convert to raw YAML string
      const rawYaml = this.toYamlString(yamlConfig);
      
      // Calculate estimated time
      const estimatedTime = this.calculateEstimatedTime(yamlConfig);
      
      return {
        success: true,
        yaml: yamlConfig,
        raw_yaml: rawYaml,
        estimated_total_time: estimatedTime,
        suggestions: this.generateSuggestions(yamlConfig)
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate YAML'
      };
    }
  }

  /**
   * Parse natural language prompt to extract intent
   */
  private parsePromptIntent(prompt: string): any {
    const intent: any = {
      action: 'create',
      target: 'farm',
      agents: 3,
      purpose: 'general'
    };

    // Extract number of agents
    const agentMatch = prompt.match(/(\d+)\s*agents?/i);
    if (agentMatch) {
      intent.agents = parseInt(agentMatch[1]);
    }

    // Extract purpose/type
    const purposePatterns = {
      'code review': 'review',
      'testing': 'testing',
      'development': 'development',
      'analysis': 'analysis',
      'debug': 'debugging',
      'optimize': 'optimization',
      'refactor': 'refactoring',
      'document': 'documentation'
    };

    for (const [pattern, purpose] of Object.entries(purposePatterns)) {
      if (prompt.toLowerCase().includes(pattern)) {
        intent.purpose = purpose;
        break;
      }
    }

    // Extract project name if mentioned
    const projectMatch = prompt.match(/(?:for|called|named)\s+([a-zA-Z0-9-_]+)/i);
    if (projectMatch) {
      intent.projectName = projectMatch[1];
    }

    return intent;
  }

  /**
   * Create YAML structure based on parsed intent
   */
  private async createYamlStructure(intent: any, options?: any): Promise<YamlConfig> {
    const farmName = intent.projectName || `${intent.purpose}-farm-${Date.now()}`;
    
    // Generate appropriate steps based on purpose
    const steps = this.generateSteps(intent.purpose, intent.agents, options);
    
    // Create initial prompt
    const initialPrompt = this.generateInitialPrompt(intent, farmName);
    
    return {
      name: farmName,
      description: `AI-generated farm for ${intent.purpose} with ${intent.agents} agents`,
      initial_prompt: initialPrompt,
      steps: steps,
      metadata: {
        created_at: new Date().toISOString(),
        ai_generated: true,
        purpose: intent.purpose,
        num_agents: intent.agents,
        complexity: options?.complexity || 'moderate'
      }
    };
  }

  /**
   * Generate steps based on farm purpose
   */
  private generateSteps(purpose: string, numAgents: number, options?: any): BuildStep[] {
    const stepTemplates: { [key: string]: string[] } = {
      review: [
        'Initialize code review environment and clone repository',
        'Analyze codebase structure and identify review areas',
        'Perform static code analysis and linting',
        'Review code quality, patterns, and best practices',
        'Check for security vulnerabilities and performance issues',
        'Generate comprehensive review report with recommendations'
      ],
      testing: [
        'Set up testing environment and dependencies',
        'Create unit test suites for core functionality',
        'Implement integration tests for API endpoints',
        'Develop end-to-end tests for user workflows',
        'Run performance and load testing',
        'Generate test coverage report and recommendations'
      ],
      development: [
        'Initialize project with modern framework and tooling',
        'Design and implement core architecture',
        'Develop primary features and functionality',
        'Create responsive UI with accessibility',
        'Implement data persistence and API integration',
        'Add comprehensive error handling and logging',
        'Write documentation and deployment guides'
      ],
      analysis: [
        'Gather and preprocess data from specified sources',
        'Perform exploratory data analysis',
        'Apply statistical models and algorithms',
        'Create visualizations and insights',
        'Generate detailed analysis report',
        'Provide actionable recommendations'
      ],
      debugging: [
        'Reproduce the reported issue consistently',
        'Analyze error logs and stack traces',
        'Use debugging tools to trace execution',
        'Identify root cause of the problem',
        'Implement and test fix',
        'Document the issue and solution'
      ]
    };

    const baseSteps = stepTemplates[purpose] || stepTemplates.development;
    
    // Adjust steps based on number of agents and complexity
    const steps: BuildStep[] = baseSteps.map((content, index) => ({
      number: index + 1,
      content: content,
      description: content.split('.')[0],
      estimated_time: this.estimateStepTime(content, options?.complexity),
      tags: this.generateStepTags(content, purpose)
    }));

    // Add agent coordination step if multiple agents
    if (numAgents > 1) {
      steps.unshift({
        number: 0,
        content: `Coordinate ${numAgents} agents for optimal task distribution`,
        description: 'Agent coordination',
        estimated_time: 5,
        tags: ['coordination', 'setup']
      });
    }

    return steps;
  }

  /**
   * Generate initial prompt based on intent
   */
  private generateInitialPrompt(intent: any, farmName: string): string {
    const templates: { [key: string]: string } = {
      review: `You are an expert code reviewer. You will perform a comprehensive review of the ${farmName} codebase with ${intent.agents} specialized agents focusing on different aspects.`,
      testing: `You are a senior QA engineer. You will create and execute a comprehensive testing strategy for ${farmName} using ${intent.agents} agents to cover different testing domains.`,
      development: `You are an expert full-stack developer. You will build ${farmName} using modern best practices with ${intent.agents} agents working on different components.`,
      analysis: `You are a data analyst expert. You will perform comprehensive analysis for ${farmName} using ${intent.agents} agents to explore different aspects of the data.`,
      debugging: `You are a senior debugging specialist. You will identify and fix issues in ${farmName} using ${intent.agents} agents to investigate different potential causes.`
    };

    const template = templates[intent.purpose] || templates.development;
    return template + '\n\nRespond with "Ready to begin" when you are prepared to start.';
  }

  /**
   * Estimate time for a step based on content and complexity
   */
  private estimateStepTime(content: string, complexity?: string): number {
    const baseTime = 15; // minutes
    const complexityMultiplier = {
      simple: 0.5,
      moderate: 1,
      complex: 2
    };

    const multiplier = complexityMultiplier[complexity as keyof typeof complexityMultiplier] || 1;
    
    // Adjust based on keywords in content
    let timeAdjustment = 1;
    if (content.includes('comprehensive') || content.includes('detailed')) {
      timeAdjustment *= 1.5;
    }
    if (content.includes('test') || content.includes('validate')) {
      timeAdjustment *= 1.3;
    }
    if (content.includes('document')) {
      timeAdjustment *= 1.2;
    }

    return Math.round(baseTime * multiplier * timeAdjustment);
  }

  /**
   * Generate tags for a step
   */
  private generateStepTags(content: string, purpose: string): string[] {
    const tags = [purpose];
    
    const tagKeywords = {
      setup: ['initialize', 'set up', 'configure'],
      analysis: ['analyze', 'review', 'examine'],
      implementation: ['implement', 'develop', 'create', 'build'],
      testing: ['test', 'validate', 'verify'],
      documentation: ['document', 'write', 'describe'],
      deployment: ['deploy', 'release', 'publish']
    };

    for (const [tag, keywords] of Object.entries(tagKeywords)) {
      if (keywords.some(keyword => content.toLowerCase().includes(keyword))) {
        tags.push(tag);
      }
    }

    return tags;
  }

  /**
   * Convert YAML config to string
   */
  private toYamlString(config: YamlConfig): string {
    const yaml = [];
    yaml.push(`name: ${config.name}`);
    
    if (config.description) {
      yaml.push(`description: ${config.description}`);
    }
    
    yaml.push(`initial_prompt: |`);
    yaml.push(...config.initial_prompt.split('\n').map(line => `  ${line}`));
    
    yaml.push(`steps:`);
    for (const step of config.steps) {
      yaml.push(`  - number: ${step.number}`);
      yaml.push(`    content: |`);
      yaml.push(...step.content.split('\n').map(line => `      ${line}`));
      
      if (step.description) {
        yaml.push(`    description: ${step.description}`);
      }
      if (step.estimated_time) {
        yaml.push(`    estimated_time: ${step.estimated_time}`);
      }
      if (step.tags && step.tags.length > 0) {
        yaml.push(`    tags: [${step.tags.join(', ')}]`);
      }
    }
    
    if (config.metadata) {
      yaml.push(`metadata:`);
      for (const [key, value] of Object.entries(config.metadata)) {
        if (typeof value === 'object') {
          yaml.push(`  ${key}: ${JSON.stringify(value)}`);
        } else {
          yaml.push(`  ${key}: ${value}`);
        }
      }
    }
    
    return yaml.join('\n');
  }

  /**
   * Calculate total estimated time
   */
  private calculateEstimatedTime(config: YamlConfig): number {
    return config.steps.reduce((total, step) => total + (step.estimated_time || 15), 0);
  }

  /**
   * Generate suggestions for the YAML config
   */
  private generateSuggestions(config: YamlConfig): string[] {
    const suggestions = [];
    
    if (config.steps.length < 3) {
      suggestions.push('Consider adding more detailed steps for better task breakdown');
    }
    
    if (!config.steps.some(step => step.tags?.includes('testing'))) {
      suggestions.push('Consider adding testing steps to ensure quality');
    }
    
    if (!config.steps.some(step => step.tags?.includes('documentation'))) {
      suggestions.push('Add documentation steps for better maintainability');
    }
    
    const totalTime = this.calculateEstimatedTime(config);
    if (totalTime > 480) { // 8 hours
      suggestions.push('This farm may take over 8 hours. Consider breaking it into smaller farms');
    }
    
    return suggestions;
  }

  /**
   * Validate YAML configuration
   */
  async validateYaml(yaml: string): Promise<ValidationResult> {
    const errors = [];
    const warnings = [];
    const suggestions = [];
    
    try {
      // Parse YAML (in real implementation, use a YAML parser)
      const lines = yaml.split('\n');
      
      // Check for required fields
      if (!yaml.includes('name:')) {
        errors.push({ field: 'name', message: 'Missing required field: name' });
      }
      
      if (!yaml.includes('initial_prompt:')) {
        errors.push({ field: 'initial_prompt', message: 'Missing required field: initial_prompt' });
      }
      
      if (!yaml.includes('steps:')) {
        errors.push({ field: 'steps', message: 'Missing required field: steps' });
      }
      
      // Check for warnings
      if (!yaml.includes('description:')) {
        warnings.push({ 
          field: 'description', 
          message: 'Consider adding a description', 
          severity: 'low' 
        });
      }
      
      // Additional validation logic...
      
      return {
        valid: errors.length === 0,
        errors,
        warnings,
        suggestions
      };
    } catch (error) {
      return {
        valid: false,
        errors: [{ field: 'syntax', message: 'Invalid YAML syntax' }],
        warnings: [],
        suggestions: ['Check YAML syntax and formatting']
      };
    }
  }

  /**
   * Get available templates
   */
  async getTemplates(): Promise<YamlTemplate[]> {
    // In a real implementation, this would fetch from an API
    return [
      {
        id: 'webapp-template',
        name: 'Web Application',
        description: 'Template for building modern web applications',
        category: 'development',
        template: {
          name: 'my-web-app',
          description: 'A modern web application',
          steps: []
        },
        variables: [
          { name: 'framework', description: 'Frontend framework', type: 'string', default: 'React' }
        ]
      },
      {
        id: 'api-template',
        name: 'REST API',
        description: 'Template for building RESTful APIs',
        category: 'development',
        template: {
          name: 'my-api',
          description: 'A RESTful API service',
          steps: []
        }
      }
    ];
  }

  /**
   * Save generated YAML
   */
  async saveYaml(config: YamlConfig, filename: string): Promise<{ success: boolean; path?: string; error?: string }> {
    try {
      const response = await fetch(`${this.apiEndpoint}/yaml/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, filename })
      });
      
      const result = await response.json();
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save YAML'
      };
    }
  }
}

export default new YamlGeneratorService();