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
  BuildStep,
  AgentDefinition,
  PromptEnhancementRequest,
  PromptEnhancementResponse
} from '../types/yamlGenerator';
import { getFarmAgentNames, formatFarmAgentName, formatFarmAgentNameNoEmoji, generateFarmTeamName } from '../utils/farmAgentNames';
import { yamlSanitizer } from './yamlSanitizer';

class YamlGeneratorService {
  private apiEndpoint: string;

  constructor() {
    this.apiEndpoint = import.meta.env.VITE_API_URL || 'http://localhost:4567';
  }

  /**
   * Enhance a user prompt using AI before generating YAML
   */
  async enhancePrompt(request: PromptEnhancementRequest): Promise<PromptEnhancementResponse> {
    try {
      const response = await fetch(`${this.apiEndpoint}/api/yaml/enhance-prompt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to enhance prompt');
      }

      const result = await response.json();
      
      if (result.success && result.data) {
        return {
          success: true,
          enhanced_prompt: result.data.enhanced_prompt,
          original_prompt: result.data.original_prompt,
          suggestions: result.data.suggestions || [],
          improvements: result.data.improvements || []
        };
      } else {
        throw new Error(result.error?.message || 'Invalid response from server');
      }
    } catch (error) {
      console.error('Prompt enhancement error:', error);
      
      // Fallback to local enhancement if backend fails
      return this.localEnhancePrompt(request);
    }
  }

  /**
   * Local fallback for prompt enhancement
   */
  private localEnhancePrompt(request: PromptEnhancementRequest): PromptEnhancementResponse {
    const { prompt, context, purpose } = request;
    const improvements: string[] = [];
    const suggestions: string[] = [];
    
    let enhancedPrompt = prompt;
    
    // Add basic enhancements
    if (!prompt.match(/\d+\s*agents?/i)) {
      enhancedPrompt = `Create a farm with 3 agents for ${prompt}`;
      improvements.push('Added default agent count');
    }
    
    if (purpose) {
      enhancedPrompt += `. Focus on ${purpose}`;
      improvements.push(`Added focus area: ${purpose}`);
    }
    
    if (context) {
      enhancedPrompt += `. Context: ${context}`;
      improvements.push('Incorporated context');
    }
    
    // Add suggestions
    suggestions.push('Consider specifying the number of agents');
    suggestions.push('Add technology stack for better configuration');
    suggestions.push('Include testing requirements');
    
    return {
      success: true,
      enhanced_prompt: enhancedPrompt,
      original_prompt: prompt,
      suggestions,
      improvements
    };
  }

  /**
   * Generate YAML configuration from natural language prompt
   */
  async generateYaml(request: GenerationRequest): Promise<GenerationResponse> {
    try {
      // If backend is available, use it
      const response = await fetch(`${this.apiEndpoint}/api/yaml/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: request.prompt,
          mode: request.mode || 'freestyle',
          options: request.options,
          provider: request.options?.provider || 'claude'
        })
      });

      if (!response.ok) {
        // If backend fails, generate locally
        throw new Error('Backend unavailable, generating locally');
      }

      const result = await response.json();
      
      if (result.success && result.data) {
        // Sanitize the YAML before parsing
        const sanitizationResult = yamlSanitizer.sanitizeYaml(result.data.yaml);
        
        if (!sanitizationResult.success) {
          console.warn('YAML sanitization issues:', sanitizationResult.errors);
        }
        
        // Parse the sanitized YAML string to get the config object
        const yamlConfig = this.parseYamlString(sanitizationResult.sanitized);
        
        // Validate the config
        const configIssues = yamlSanitizer.validateConfig(yamlConfig);
        const suggestions = [...(result.data.suggestions || [])];
        
        if (configIssues.length > 0) {
          configIssues.forEach(issue => {
            if (issue.suggestion) {
              suggestions.push(issue.suggestion);
            }
          });
        }
        
        // Add sanitization warnings as suggestions
        if (sanitizationResult.warnings.length > 0) {
          suggestions.push(...sanitizationResult.warnings);
        }
        
        return {
          success: true,
          yaml: yamlConfig,
          raw_yaml: sanitizationResult.sanitized,
          estimated_total_time: this.calculateEstimatedTime(yamlConfig),
          suggestions
        };
      } else {
        throw new Error(result.error?.message || 'Invalid response from server');
      }
    } catch (error) {
      // Fallback to local generation
      console.log('Using local YAML generation:', error);
      
      try {
        // Parse the prompt to extract intent
        const intent = this.parsePromptIntent(request.prompt);
        
        // Create YAML structure locally
        const yamlConfig = await this.createYamlStructure(intent, request.options);
        
        // Convert to YAML string
        const rawYaml = this.toYamlString(yamlConfig);
        
        return {
          success: true,
          yaml: yamlConfig,
          raw_yaml: rawYaml,
          estimated_total_time: this.calculateEstimatedTime(yamlConfig),
          suggestions: this.generateSuggestions(yamlConfig)
        };
      } catch (localError) {
        console.error('Local YAML generation error:', localError);
        return {
          success: false,
          error: localError instanceof Error ? localError.message : 'Failed to generate YAML'
        };
      }
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
      purpose: 'general',
      originalPrompt: prompt  // Preserve the original prompt
    };

    // Extract number of agents
    const agentMatch = prompt.match(/(\d+)\s*agents?/i);
    if (agentMatch) {
      intent.agents = parseInt(agentMatch[1]);
    }

    // Extract purpose/type with expanded patterns
    const purposePatterns = {
      'code review': 'review',
      'testing': 'testing',
      'development': 'development',
      'analysis': 'analysis',
      'debug': 'debugging',
      'optimize': 'optimization',
      'refactor': 'refactoring',
      'document': 'documentation',
      'infographic': 'visualization',
      'sci-fi': 'creative',
      'economy': 'analysis',
      'build': 'development',
      'create': 'development',
      'fix': 'debugging',
      'improve': 'optimization'
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

    // Extract additional context and requirements
    intent.hasVisualization = prompt.toLowerCase().includes('infographic') || prompt.toLowerCase().includes('visualiz');
    intent.hasTesting = prompt.toLowerCase().includes('test');
    intent.hasDocumentation = prompt.toLowerCase().includes('document');
    intent.complexity = this.determineComplexity(prompt);

    return intent;
  }

  /**
   * Determine task complexity from prompt
   */
  private determineComplexity(prompt: string): string {
    const complexKeywords = ['comprehensive', 'complex', 'detailed', 'extensive', 'thorough'];
    const simpleKeywords = ['simple', 'basic', 'quick', 'minimal'];
    
    const promptLower = prompt.toLowerCase();
    
    if (complexKeywords.some(k => promptLower.includes(k))) {
      return 'complex';
    }
    if (simpleKeywords.some(k => promptLower.includes(k))) {
      return 'simple';
    }
    
    // Determine by length and detail
    if (prompt.length > 200 || prompt.split(' ').length > 30) {
      return 'complex';
    }
    
    return 'moderate';
  }

  /**
   * Create YAML structure based on parsed intent
   */
  private async createYamlStructure(intent: any, options?: any): Promise<YamlConfig> {
    const farmName = intent.projectName || `${intent.purpose}-farm-${Date.now()}`;
    
    // Generate appropriate steps based on purpose with enhanced detail
    const steps = this.generateSteps(intent.purpose, intent.agents, options);
    
    // Generate agents based on purpose and number
    const agents = this.generateAgents(intent.purpose, intent.agents, options);
    
    // Get farm agents for team name generation
    const agentTypes = this.getAgentTypesForPurpose(intent.purpose, intent.agents);
    const farmAgents = getFarmAgentNames(intent.agents, agentTypes);
    
    // Create comprehensive initial prompt with farm team
    const initialPrompt = this.generateInitialPrompt(intent, farmName, farmAgents);
    
    // Preserve the original prompt as the main description
    const description = intent.originalPrompt || `AI-generated farm for ${intent.purpose} with ${intent.agents} agents`;
    
    return {
      name: farmName,
      description: description,
      initial_prompt: initialPrompt,
      agents: agents,
      steps: steps,
      config: {
        autoScale: options?.autoScale || false,
        maxAgents: Math.max(intent.agents * 2, 10),
        timeout: options?.timeout || 3600,
        coordination: options?.coordination || (intent.agents > 1 ? 'collaborative' : 'sequential'),
        stagger: 5,
        bundle_steps: options?.bundle_steps
      },
      metadata: {
        created_at: new Date().toISOString(),
        ai_generated: true,
        purpose: intent.purpose,
        num_agents: intent.agents,
        complexity: options?.complexity || 'moderate',
        original_prompt: intent.originalPrompt
      }
    };
  }

  /**
   * Generate steps based on farm purpose with enhanced detail
   */
  private generateSteps(purpose: string, numAgents: number, options?: any): BuildStep[] {
    const stepTemplates: { [key: string]: string[] } = {
      review: [
        'Initialize comprehensive code review environment: Clone repository, set up development environment with all dependencies, configure code analysis tools (ESLint, TypeScript compiler, security scanners), and establish review criteria based on project standards',
        'Analyze codebase architecture and structure: Map out the entire project structure, identify key modules and their dependencies, document the technology stack, and create a visual representation of component relationships',
        'Perform deep static code analysis: Run comprehensive linting across all files, check TypeScript type safety, analyze code complexity metrics, identify code smells and anti-patterns, and verify naming conventions',
        'Review code quality and design patterns: Evaluate adherence to SOLID principles, check implementation of design patterns, assess code reusability and modularity, verify proper error handling, and review async/await usage',
        'Security and vulnerability assessment: Scan for OWASP top 10 vulnerabilities, check for exposed secrets or API keys, review authentication and authorization logic, analyze data validation and sanitization, and assess dependency vulnerabilities',
        'Performance optimization review: Analyze bundle sizes and code splitting, review database queries and API calls, check for memory leaks and performance bottlenecks, evaluate caching strategies, and assess rendering performance',
        'Testing coverage analysis: Review existing test suites, identify untested code paths, assess test quality and assertions, recommend additional test scenarios, and verify edge case handling',
        'Documentation and maintainability review: Check code comments and inline documentation, review README and setup guides, assess API documentation completeness, verify configuration documentation, and evaluate onboarding materials',
        'Generate comprehensive review report: Compile all findings with severity levels, provide specific code examples for issues, suggest concrete improvements with code snippets, create prioritized action items, and include metrics and visualizations'
      ],
      testing: [
        'Set up comprehensive testing environment: Install all testing frameworks (Jest, Cypress, Playwright), configure test databases and mock servers, set up continuous integration hooks, establish test data fixtures, and configure coverage reporting tools',
        'Create unit test suites for core functionality: Write tests for all utility functions, test React components with Testing Library, mock external dependencies properly, achieve minimum 80% code coverage, and implement snapshot testing where appropriate',
        'Implement integration tests for API endpoints: Test all REST endpoints with various payloads, verify database transactions and rollbacks, test authentication and authorization flows, validate error handling and status codes, and check rate limiting and pagination',
        'Develop end-to-end tests for critical user workflows: Map out key user journeys, implement tests for registration and login flows, test core business functionality, verify cross-browser compatibility, and test responsive design breakpoints',
        'Performance and load testing: Set up k6 or similar load testing tools, simulate concurrent user scenarios, test API response times under load, identify performance bottlenecks, and establish performance baselines',
        'Security testing implementation: Test for SQL injection vulnerabilities, check XSS protection, verify CSRF token implementation, test file upload security, and validate input sanitization',
        'Accessibility testing: Run automated accessibility scans, test keyboard navigation, verify screen reader compatibility, check color contrast ratios, and validate ARIA attributes',
        'Generate test reports and metrics: Compile coverage reports with detailed gaps, document test execution results, create test case documentation, provide testing recommendations, and establish monitoring for test health'
      ],
      development: [
        'Initialize project with production-ready setup: Create project structure with proper folder organization, configure TypeScript with strict settings, set up ESLint and Prettier with team standards, initialize Git with proper .gitignore, and configure environment variables management',
        'Design and implement core architecture: Define data models and database schema, create base classes and interfaces, implement dependency injection where needed, set up state management (Redux/Zustand), and establish error boundary strategies',
        'Develop authentication and authorization system: Implement secure user registration with validation, create JWT-based authentication flow, set up role-based access control, implement password reset functionality, and add session management',
        'Build primary features and business logic: Implement core domain functionality, create reusable service layers, develop data processing pipelines, implement business rule engines, and add feature flags for gradual rollout',
        'Create responsive and accessible UI: Build component library with Storybook, implement responsive grid layouts, ensure WCAG 2.1 AA compliance, add loading states and skeletons, and implement proper error messaging',
        'Implement data persistence and caching: Set up database connections with pooling, implement repository patterns, add Redis caching layer, create database migrations, and implement transaction handling',
        'Develop RESTful API with documentation: Create Express routes with validation, implement OpenAPI/Swagger documentation, add request/response logging, implement rate limiting, and create API versioning strategy',
        'Add comprehensive error handling and monitoring: Implement global error handlers, add structured logging with Winston, integrate Sentry for error tracking, create health check endpoints, and add performance monitoring',
        'Implement testing and quality assurance: Write unit tests for all services, create integration test suites, add end-to-end test scenarios, implement continuous integration, and set up code quality gates',
        'Create deployment and documentation: Write comprehensive README, create API documentation, document deployment procedures, set up Docker containers, and create CI/CD pipelines'
      ],
      analysis: [
        'Set up data analysis environment: Configure Python/R environment with necessary libraries, set up Jupyter notebooks or analysis scripts, establish database connections, configure data warehouses access, and set up version control for analysis code',
        'Gather and validate data from multiple sources: Connect to APIs and databases, implement data extraction pipelines, validate data completeness and quality, handle missing or corrupted data, and create data audit trails',
        'Perform comprehensive data cleaning: Remove duplicates and outliers, standardize data formats, handle missing values appropriately, normalize and scale features, and document data transformations',
        'Conduct exploratory data analysis (EDA): Generate descriptive statistics, create distribution visualizations, identify correlations and patterns, detect anomalies and outliers, and document initial insights',
        'Apply statistical models and machine learning: Select appropriate algorithms, train and validate models, perform hyperparameter tuning, implement cross-validation, and assess model performance',
        'Create interactive visualizations and dashboards: Design informative charts and graphs, build interactive dashboards, implement drill-down capabilities, create real-time updates, and ensure mobile responsiveness',
        'Generate insights and predictions: Interpret model results, identify key findings, create confidence intervals, perform sensitivity analysis, and validate conclusions',
        'Provide actionable recommendations: Translate findings to business value, create implementation roadmaps, estimate impact and ROI, identify risks and limitations, and suggest follow-up analyses'
      ],
      debugging: [
        'Reproduce and isolate the issue: Set up exact environment matching production, reproduce issue consistently, create minimal reproduction case, document steps to reproduce, and identify affected components',
        'Analyze system logs and error traces: Collect all relevant log files, parse and filter error messages, identify error patterns, trace execution flow, and correlate with system events',
        'Use debugging tools for deep inspection: Set strategic breakpoints, inspect variable states, analyze call stacks, profile memory usage, and monitor network requests',
        'Investigate potential root causes: Check recent code changes, review dependency updates, analyze configuration changes, investigate data inconsistencies, and check external service status',
        'Implement and validate the fix: Write targeted fix for root cause, add defensive programming measures, implement proper error handling, add logging for future debugging, and ensure backward compatibility',
        'Test fix across environments: Verify fix in development, test in staging environment, check for side effects, validate performance impact, and ensure no regression',
        'Document issue and solution: Create detailed bug report, document root cause analysis, explain solution approach, add troubleshooting guide, and update knowledge base'
      ],
      visualization: [
        'Define visualization requirements and data sources: Identify key metrics and KPIs to visualize, determine data update frequency, establish data sources and APIs, define user interaction requirements, and create mockups or wireframes',
        'Set up visualization framework and tools: Choose appropriate visualization library (D3.js, Chart.js, Plotly), configure responsive canvas/SVG rendering, set up data transformation pipeline, implement theme and styling system, and create reusable chart components',
        'Design information architecture: Create visual hierarchy, establish color schemes and typography, design layout grid system, implement responsive breakpoints, and ensure accessibility standards',
        'Implement core data visualizations: Build interactive charts and graphs, create real-time data updates, implement zoom and pan features, add tooltips and annotations, and create smooth animations',
        'Add advanced visualization features: Implement data filtering and search, create drill-down capabilities, add export functionality (PNG, SVG, PDF), implement data comparison tools, and create customization options',
        'Optimize performance and loading: Implement data pagination and lazy loading, optimize rendering performance, add loading states and placeholders, implement caching strategies, and minimize bundle size',
        'Create comprehensive infographic layout: Design cohesive visual narrative, balance text and visual elements, ensure print-ready quality, implement interactive elements, and create mobile-responsive version',
        'Test and refine visualizations: Test across browsers and devices, verify data accuracy, gather user feedback, optimize for performance, and document usage guidelines'
      ],
      optimization: [
        'Analyze current performance baseline: Run comprehensive performance audits, measure page load times, profile JavaScript execution, analyze database query performance, and document current metrics',
        'Optimize frontend performance: Implement code splitting and lazy loading, optimize images and assets, minimize CSS and JavaScript, implement service workers, and add resource hints',
        'Improve backend efficiency: Optimize database queries and indexes, implement caching strategies, refactor inefficient algorithms, add connection pooling, and optimize API responses',
        'Enhance build and deployment process: Optimize webpack configuration, implement tree shaking, set up CDN distribution, configure compression, and optimize Docker images',
        'Implement monitoring and alerting: Set up performance monitoring, create custom metrics, establish alerting thresholds, implement error tracking, and create performance dashboards'
      ]
    };

    const baseSteps = stepTemplates[purpose] || stepTemplates.development;
    
    // Adjust steps based on number of agents and complexity
    const steps: BuildStep[] = baseSteps.map((content, index) => ({
      number: index + 1,
      content: content,
      description: content.split(':')[0],
      estimated_time: this.estimateStepTime(content, options?.complexity),
      tags: this.generateStepTags(content, purpose),
      details: content.split(':')[1]?.trim() || ''
    }));

    // Add comprehensive agent coordination step if multiple agents
    if (numAgents > 1) {
      steps.unshift({
        number: 0,
        content: `Set up multi-agent coordination system: Initialize shared workspace at /tmp/claude_coordination/, establish work claim protocols to prevent duplicate efforts, set up inter-agent communication channels, define clear task boundaries and interfaces, implement progress tracking and status updates, and establish conflict resolution procedures`,
        description: 'Multi-agent coordination and setup',
        estimated_time: 10,
        tags: ['coordination', 'setup', 'initialization'],
        details: 'Critical first step to ensure all agents work together effectively without conflicts or duplicated work'
      });
    }

    return steps;
  }

  /**
   * Generate comprehensive initial prompt based on intent
   */
  private generateInitialPrompt(intent: any, farmName: string, farmAgents?: any[]): string {
    // Generate a team name if we have farm agents
    const teamName = farmAgents ? generateFarmTeamName(farmAgents) : `${intent.agents} agents`;
    const agentList = farmAgents ? farmAgents.slice(0, Math.min(3, farmAgents.length))
      .map(a => `${a.name} the ${a.animal} (${a.personality})`).join(', ') : '';
    
    // Base introduction
    let prompt = `🌾 Welcome to MaiFarm! 🌾\n\n`;
    prompt += `You are joining ${teamName} for an important collaborative task.\n\n`;
    
    // Add original user request if available
    if (intent.originalPrompt) {
      prompt += `📋 **Original Request:**\n${intent.originalPrompt}\n\n`;
    }
    
    // Purpose-specific detailed instructions
    const purposeInstructions: { [key: string]: string } = {
      review: `🔍 **Your Mission:** Perform a comprehensive code review with focus on:
- Code quality, patterns, and best practices
- Security vulnerabilities and performance bottlenecks
- Test coverage and documentation completeness
- Architecture decisions and technical debt

**Review Approach:**
1. Each agent will claim specific areas to review (frontend, backend, infrastructure, etc.)
2. Use static analysis tools and manual inspection
3. Document findings with severity levels (Critical, High, Medium, Low)
4. Provide specific code examples and improvement suggestions
5. Collaborate on cross-cutting concerns`,

      testing: `🧪 **Your Mission:** Create and execute a comprehensive testing strategy covering:
- Unit tests for all functions and components (80% minimum coverage)
- Integration tests for API endpoints and services
- End-to-end tests for critical user workflows
- Performance and load testing benchmarks
- Security and accessibility testing

**Testing Approach:**
1. Set up testing frameworks and environments
2. Each agent focuses on specific test types
3. Share test data and mocks through coordination files
4. Track coverage metrics and test results
5. Document test cases and scenarios`,

      development: `🚀 **Your Mission:** Build a production-ready application with:
- Modern architecture and clean code principles
- Comprehensive feature implementation
- Robust error handling and logging
- Performance optimization and security
- Full documentation and deployment setup

**Development Approach:**
1. Initialize project with proper structure and tooling
2. Each agent owns specific components/features
3. Define clear interfaces between components
4. Regular integration and testing
5. Continuous documentation updates`,

      analysis: `📊 **Your Mission:** Perform comprehensive data analysis including:
- Data collection from multiple sources
- Exploratory data analysis and visualization
- Statistical modeling and predictions
- Insight generation and recommendations
- Interactive dashboards and reports

**Analysis Approach:**
1. Set up data pipeline and processing
2. Each agent handles specific analysis aspects
3. Share findings through coordination files
4. Validate results collaboratively
5. Create actionable recommendations`,

      debugging: `🐛 **Your Mission:** Identify and resolve critical issues through:
- Systematic issue reproduction
- Root cause analysis
- Performance profiling
- Memory leak detection
- Comprehensive fix implementation

**Debugging Approach:**
1. Reproduce issues consistently
2. Each agent investigates different potential causes
3. Share findings in coordination files
4. Implement and test fixes thoroughly
5. Document solutions for knowledge base`,

      visualization: `🎨 **Your Mission:** Create compelling data visualizations:
- Interactive infographics and dashboards
- Real-time data visualization
- Responsive and accessible design
- Performance-optimized rendering
- Export capabilities for various formats

**Visualization Approach:**
1. Define data requirements and user interactions
2. Each agent handles specific visualization components
3. Ensure consistent design language
4. Optimize for performance and responsiveness
5. Test across devices and browsers`,

      optimization: `⚡ **Your Mission:** Optimize application performance:
- Frontend bundle size and loading times
- Backend API response times
- Database query optimization
- Caching strategies implementation
- Build and deployment optimization

**Optimization Approach:**
1. Establish performance baselines
2. Each agent focuses on specific optimization areas
3. Measure improvements systematically
4. Document optimization techniques
5. Set up continuous monitoring`
    };

    prompt += purposeInstructions[intent.purpose] || purposeInstructions.development;
    
    // Add team composition
    prompt += `\n\n👥 **Your Team:**\n`;
    if (agentList) {
      prompt += `Working alongside: ${agentList}\n`;
    }
    prompt += `Total team size: ${intent.agents} specialized agents\n`;
    
    // Add coordination instructions
    prompt += `\n📁 **Coordination Protocol:**\n`;
    prompt += `- Shared workspace: /tmp/claude_coordination/\n`;
    prompt += `- Claim work areas in active_agents.json before starting\n`;
    prompt += `- Update progress in work_claims.json regularly\n`;
    prompt += `- Communicate through shared status files\n`;
    prompt += `- Avoid duplicating work by checking claims first\n`;
    
    // Add technical requirements if detected
    if (intent.hasVisualization || intent.hasTesting || intent.hasDocumentation) {
      prompt += `\n⚙️ **Special Requirements:**\n`;
      if (intent.hasVisualization) prompt += `- Create visual representations and infographics\n`;
      if (intent.hasTesting) prompt += `- Implement comprehensive test coverage\n`;
      if (intent.hasDocumentation) prompt += `- Provide detailed documentation\n`;
    }
    
    // Add success criteria
    prompt += `\n✅ **Success Criteria:**\n`;
    prompt += `- All tasks completed with high quality\n`;
    prompt += `- No duplicate work between agents\n`;
    prompt += `- Clear documentation of all work done\n`;
    prompt += `- Successful integration of all components\n`;
    prompt += `- Meeting or exceeding project requirements\n`;
    
    // Add timeline based on complexity
    const timeEstimates: { [key: string]: string } = {
      simple: '1-2 hours',
      moderate: '2-4 hours',
      complex: '4-8 hours'
    };
    prompt += `\n⏱️ **Estimated Timeline:** ${timeEstimates[intent.complexity || 'moderate']}\n`;
    
    // Final instructions
    prompt += `\n📝 **Getting Started:**\n`;
    prompt += `1. Review the task steps outlined below\n`;
    prompt += `2. Claim your work area in the coordination files\n`;
    prompt += `3. Begin with your assigned responsibilities\n`;
    prompt += `4. Coordinate with other agents as needed\n`;
    prompt += `5. Update status regularly\n\n`;
    prompt += `When you're ready to begin this collaborative effort with your farm colleagues, respond with "Ready to begin" and start claiming your work areas.`;
    
    return prompt;
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
   * Get agent types based on purpose
   */
  private getAgentTypesForPurpose(purpose: string, numAgents: number): string[] {
    const purposeTypes: { [key: string]: string[] } = {
      review: ['analyzer', 'reviewer', 'auditor', 'reviewer', 'analyzer'],
      testing: ['tester', 'tester', 'tester', 'analyzer', 'reviewer'],
      development: ['developer', 'developer', 'developer', 'developer', 'tester'],
      analysis: ['analyst', 'analyst', 'analyst', 'developer', 'reviewer'],
      debugging: ['debugger', 'developer', 'tester', 'analyzer', 'reviewer'],
      general: ['general', 'general', 'general', 'general', 'general']
    };
    
    const types = purposeTypes[purpose] || purposeTypes.general;
    const agentTypes: string[] = [];
    
    for (let i = 0; i < numAgents; i++) {
      agentTypes.push(types[i % types.length]);
    }
    
    return agentTypes;
  }

  /**
   * Generate agents based on purpose and number
   */
  private generateAgents(purpose: string, numAgents: number, options?: any): AgentDefinition[] {
    // Get farm-themed names for our agents
    const agentTypes = this.getAgentTypesForPurpose(purpose, numAgents);
    const farmAgents = getFarmAgentNames(numAgents, agentTypes);
    
    const agentTemplates: { [key: string]: AgentDefinition[] } = {
      review: [
        {
          name: formatFarmAgentNameNoEmoji(farmAgents[0] || { name: 'Owlbert', animal: 'Barn Owl', personality: 'Wise code reviewer', emoji: '🦉' }),
          type: 'analyzer',
          role: 'Backend API and business logic',
          capabilities: ['Static Analysis', 'Code Quality', 'Best Practices'],
          specialization: 'Backend code review and architecture analysis'
        },
        {
          name: formatFarmAgentNameNoEmoji(farmAgents[1] || { name: 'Clucky', animal: 'Chicken', personality: 'Detail-oriented', emoji: '🐔' }),
          type: 'reviewer',
          role: 'Frontend UI and user experience',
          capabilities: ['React', 'TypeScript', 'Accessibility', 'Performance'],
          specialization: 'Frontend code quality and user experience'
        },
        {
          name: formatFarmAgentNameNoEmoji(farmAgents[2] || { name: 'Tom', animal: 'Turkey', personality: 'Comprehensive reviewer', emoji: '🦃' }),
          type: 'auditor',
          role: 'Security and vulnerability assessment',
          capabilities: ['Security Analysis', 'OWASP', 'Vulnerability Detection'],
          specialization: 'Security review and compliance checking'
        }
      ],
      testing: [
        {
          name: formatFarmAgentNameNoEmoji(farmAgents[0] || { name: 'Clucky', animal: 'Chicken', personality: 'Detail-oriented', emoji: '🐔' }),
          type: 'tester',
          role: 'Unit and component testing',
          capabilities: ['Jest', 'Testing Library', 'Mocking', 'Coverage'],
          specialization: 'Unit test creation and coverage improvement'
        },
        {
          name: formatFarmAgentNameNoEmoji(farmAgents[1] || { name: 'Squeaky', animal: 'Mouse', personality: 'Finds small details', emoji: '🐭' }),
          type: 'tester',
          role: 'API and integration testing',
          capabilities: ['API Testing', 'Database Testing', 'Service Integration'],
          specialization: 'Integration and system testing'
        },
        {
          name: formatFarmAgentNameNoEmoji(farmAgents[2] || { name: 'Buzz', animal: 'Bee', personality: 'Busy worker', emoji: '🐝' }),
          type: 'tester',
          role: 'End-to-end testing and user workflows',
          capabilities: ['Cypress', 'Playwright', 'User Flows', 'Cross-browser'],
          specialization: 'End-to-end test automation'
        }
      ],
      development: [
        {
          name: formatFarmAgentNameNoEmoji(farmAgents[0] || { name: 'Wilbur', animal: 'Pig', personality: 'Clever problem solver', emoji: '🐷' }),
          type: 'developer',
          role: 'Backend API and business logic',
          capabilities: ['Node.js', 'Express', 'PostgreSQL', 'Redis'],
          specialization: 'Server-side development and API design'
        },
        {
          name: formatFarmAgentNameNoEmoji(farmAgents[1] || { name: 'Neighton', animal: 'Horse', personality: 'Fast worker', emoji: '🐴' }),
          type: 'developer',
          role: 'Frontend UI and user experience',
          capabilities: ['React', 'TypeScript', 'Tailwind CSS', 'Zustand'],
          specialization: 'User interface and client-side logic'
        },
        {
          name: formatFarmAgentNameNoEmoji(farmAgents[2] || { name: 'Duke', animal: 'Draft Horse', personality: 'Heavy lifter', emoji: '🐎' }),
          type: 'developer',
          role: 'Database and data management',
          capabilities: ['PostgreSQL', 'Redis', 'Migrations', 'Optimization'],
          specialization: 'Database design and optimization'
        },
        {
          name: formatFarmAgentNameNoEmoji(farmAgents[3] || { name: 'Ferdinand', animal: 'Bull', personality: 'Powerful', emoji: '🐂' }),
          type: 'developer',
          role: 'Testing, CI/CD, and deployment',
          capabilities: ['Docker', 'CI/CD', 'Testing', 'Monitoring'],
          specialization: 'Deployment and infrastructure'
        }
      ],
      analysis: [
        {
          name: formatFarmAgentNameNoEmoji(farmAgents[0] || { name: 'Hammy', animal: 'Hamster', personality: 'Stores data', emoji: '🐹' }),
          type: 'analyst',
          role: 'Data gathering and preprocessing',
          capabilities: ['Data Collection', 'ETL', 'Data Cleaning'],
          specialization: 'Data acquisition and preparation'
        },
        {
          name: formatFarmAgentNameNoEmoji(farmAgents[1] || { name: 'Owlbert', animal: 'Barn Owl', personality: 'Wise analyst', emoji: '🦉' }),
          type: 'analyst',
          role: 'Statistical analysis and modeling',
          capabilities: ['Statistics', 'Machine Learning', 'Predictive Modeling'],
          specialization: 'Statistical analysis and insights'
        },
        {
          name: formatFarmAgentNameNoEmoji(farmAgents[2] || { name: 'Farmer Jane', animal: 'Human Farmer', personality: 'Strategic planner', emoji: '👩‍🌾' }),
          type: 'analyst',
          role: 'Data visualization and reporting',
          capabilities: ['Data Visualization', 'Dashboards', 'Reporting'],
          specialization: 'Visual analytics and reporting'
        }
      ],
      debugging: [
        {
          name: formatFarmAgentNameNoEmoji(farmAgents[0] || { name: 'Whiskers', animal: 'Barn Cat', personality: 'Independent debugger', emoji: '🐈' }),
          type: 'debugger',
          role: 'Issue reproduction and isolation',
          capabilities: ['Debugging', 'Root Cause Analysis', 'Log Analysis'],
          specialization: 'Bug identification and reproduction'
        },
        {
          name: formatFarmAgentNameNoEmoji(farmAgents[1] || { name: 'Spot', animal: 'Dog', personality: 'Loyal and dependable', emoji: '🐕' }),
          type: 'developer',
          role: 'Bug fixing and solution implementation',
          capabilities: ['Code Fixes', 'Refactoring', 'Testing'],
          specialization: 'Solution implementation and testing'
        }
      ]
    };

    const templates = agentTemplates[purpose] || agentTemplates.development;
    const agents: AgentDefinition[] = [];

    // Distribute agents based on available templates and requested number
    if (numAgents <= templates.length) {
      // Use subset of templates
      agents.push(...templates.slice(0, numAgents));
    } else {
      // Use all templates and add generic agents
      agents.push(...templates);
      
      // Add additional generic agents with farm names
      for (let i = templates.length; i < numAgents; i++) {
        const farmAgent = farmAgents[i] || farmAgents[i % farmAgents.length];
        agents.push({
          name: formatFarmAgentNameNoEmoji(farmAgent),
          type: 'general',
          role: `Support agent for ${purpose} tasks`,
          capabilities: ['General Development', 'Code Review', 'Testing'],
          specialization: 'General support and coordination'
        });
      }
    }

    // Add coordination info for multi-agent setups
    if (numAgents > 1) {
      agents.forEach((agent, index) => {
        agent.tasks = [
          `Review coordination files at /tmp/claude_coordination/`,
          `Claim work areas before starting tasks`,
          `Collaborate with other agents on integration points`,
          `Update completed work log when tasks are done`
        ];
      });
    }

    return agents;
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
    // Validate config before converting
    const issues = yamlSanitizer.validateConfig(config);
    if (issues.filter(i => i.type === 'error').length > 0) {
      console.warn('Config has validation errors:', issues);
    }
    
    const yaml = [];
    yaml.push(`name: ${config.name}`);
    
    if (config.description) {
      // Handle multi-line descriptions properly
      if (config.description.includes('\n') || config.description.length > 80) {
        yaml.push(`description: |`);
        yaml.push(...config.description.split('\n').map(line => `  ${line}`));
      } else {
        // For single-line descriptions, properly escape special characters
        const escapedDescription = config.description
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"')
          .replace(/:/g, '\\:')
          .replace(/\n/g, '\\n');
        yaml.push(`description: "${escapedDescription}"`);
      }
    }
    
    // Add agents section (required for Claude Code)
    yaml.push(`agents:`);
    for (const agent of config.agents) {
      yaml.push(`  - name: ${agent.name}`);
      yaml.push(`    type: ${agent.type}`);
      if (agent.role) {
        yaml.push(`    role: ${agent.role}`);
      }
      if (agent.capabilities && agent.capabilities.length > 0) {
        yaml.push(`    capabilities: [${agent.capabilities.join(', ')}]`);
      }
      if (agent.tasks && agent.tasks.length > 0) {
        yaml.push(`    tasks:`);
        agent.tasks.forEach(task => {
          yaml.push(`      - ${task}`);
        });
      }
      if (agent.specialization) {
        yaml.push(`    specialization: ${agent.specialization}`);
      }
    }
    
    yaml.push(`initial_prompt: |`);
    yaml.push(...config.initial_prompt.split('\n').map(line => `  ${line}`));
    
    yaml.push(`steps:`);
    for (const step of config.steps) {
      // Steps should be simple strings or objects with content/description
      if (step.description && step.description !== step.content) {
        yaml.push(`  - content: ${step.content}`);
        yaml.push(`    description: ${step.description}`);
      } else {
        // Simple format for orchestrator.py compatibility
        yaml.push(`  - ${step.content}`);
      }
    }
    
    if (config.config) {
      yaml.push(`config:`);
      for (const [key, value] of Object.entries(config.config)) {
        yaml.push(`  ${key}: ${value}`);
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
    
    const rawYaml = yaml.join('\n');
    
    // Sanitize the final output
    const sanitizationResult = yamlSanitizer.sanitizeYaml(rawYaml);
    if (!sanitizationResult.success) {
      console.warn('YAML output sanitization issues:', sanitizationResult.errors);
    }
    
    return sanitizationResult.sanitized;
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
   * Parse YAML string to YamlConfig object
   */
  private parseYamlString(yamlString: string): YamlConfig {
    try {
      // Simple parsing for Claude Code YAML format
      const lines = yamlString.split('\n');
      const config: any = {
        agents: [],
        steps: []
      };
      
      let currentSection = '';
      let currentStep: any = null;
      let currentAgent: any = null;
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        if (trimmed.startsWith('name:') && currentSection !== 'agents') {
          config.name = trimmed.substring(5).trim();
        } else if (trimmed.startsWith('description:') && currentSection !== 'agents') {
          config.description = trimmed.substring(12).trim();
        } else if (trimmed === 'agents:') {
          currentSection = 'agents';
        } else if (trimmed.startsWith('initial_prompt:')) {
          config.initial_prompt = trimmed.substring(15).trim();
          currentSection = 'initial_prompt';
        } else if (trimmed === 'steps:') {
          currentSection = 'steps';
          if (currentAgent) {
            config.agents.push(currentAgent);
            currentAgent = null;
          }
        } else if (currentSection === 'agents' && trimmed.startsWith('- name:')) {
          if (currentAgent) config.agents.push(currentAgent);
          currentAgent = { name: trimmed.substring(7).trim() };
        } else if (currentAgent && trimmed.startsWith('type:')) {
          currentAgent.type = trimmed.substring(5).trim();
        } else if (currentAgent && trimmed.startsWith('role:')) {
          currentAgent.role = trimmed.substring(5).trim();
        } else if (currentSection === 'initial_prompt' && trimmed && !trimmed.endsWith(':')) {
          config.initial_prompt += '\n' + line;
        } else if (currentSection === 'steps') {
          if (trimmed.startsWith('- content:')) {
            if (currentStep) config.steps.push(currentStep);
            currentStep = { content: trimmed.substring(10).trim() };
          } else if (trimmed.startsWith('- ') && !trimmed.includes(':')) {
            // Simple step format (just a string)
            if (currentStep) config.steps.push(currentStep);
            currentStep = { content: trimmed.substring(2).trim() };
          } else if (currentStep && trimmed.startsWith('description:')) {
            currentStep.description = trimmed.substring(12).trim();
          }
        }
      }
      
      if (currentAgent) config.agents.push(currentAgent);
      if (currentStep) config.steps.push(currentStep);
      
      // Ensure agents array is not empty
      if (config.agents.length === 0) {
        config.agents = [{
          name: 'Default Agent',
          type: 'general',
          role: 'General purpose agent'
        }];
      }
      
      return config as YamlConfig;
    } catch (error) {
      console.error('Failed to parse YAML:', error);
      // Return a basic structure on error with required agents field
      return {
        name: 'Generated Farm',
        description: 'AI-generated farm configuration',
        initial_prompt: yamlString.substring(0, 200),
        agents: [{
          name: 'Default Agent',
          type: 'general',
          role: 'General purpose agent'
        }],
        steps: []
      };
    }
  }

  /**
   * Validate YAML configuration
   */
  async validateYaml(yaml: string): Promise<ValidationResult> {
    try {
      // First sanitize the YAML
      const sanitizationResult = yamlSanitizer.sanitizeYaml(yaml);
      
      if (!sanitizationResult.success) {
        return {
          valid: false,
          errors: sanitizationResult.errors.map(e => ({ field: 'content', message: e })),
          warnings: sanitizationResult.warnings,
          suggestions: ['Fix errors in YAML content', ...sanitizationResult.removed]
        };
      }
      
      // Parse and validate the config
      const config = this.parseYamlString(sanitizationResult.sanitized);
      const issues = yamlSanitizer.validateConfig(config);
      
      const errors = issues
        .filter(i => i.type === 'error')
        .map(i => ({ field: i.field, message: i.message }));
      
      const warnings = issues
        .filter(i => i.type === 'warning')
        .map(i => i.message);
      
      const suggestions = issues
        .filter(i => i.suggestion)
        .map(i => i.suggestion!);
      
      // If local validation passes, try backend validation
      if (errors.length === 0) {
        try {
          const response = await fetch(`${this.apiEndpoint}/api/yaml/validate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ yaml: sanitizationResult.sanitized })
          });

          if (response.ok) {
            const result = await response.json();
            if (result.success && result.data) {
              return {
                valid: result.data.valid,
                errors: [...errors, ...(result.data.errors || [])],
                warnings: [...warnings, ...(result.data.warnings || [])],
                suggestions: [...suggestions, ...(result.data.suggestions || [])]
              };
            }
          }
        } catch {
          // Backend validation failed, use local results
        }
      }
      
      return {
        valid: errors.length === 0,
        errors,
        warnings,
        suggestions: suggestions.length > 0 ? suggestions : ['Check YAML syntax and formatting']
      };
    } catch (error) {
      console.error('YAML validation error:', error);
      return {
        valid: false,
        errors: [{ field: 'validation', message: error instanceof Error ? error.message : 'Failed to validate YAML' }],
        warnings: [],
        suggestions: ['Check YAML syntax and formatting']
      };
    }
  }

  /**
   * Generate YAML from a template
   */
  async generateFromTemplate(templateId: string, variables: Record<string, any>): Promise<string> {
    // Find the template
    const templates = await this.getTemplates();
    const template = templates.find(t => t.id === templateId);
    
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }
    
    // Generate YAML from template with variables
    const request: GenerationRequest = {
      prompt: `Generate a farm based on the ${template.name} template with the following configuration: ${JSON.stringify(variables)}`,
      mode: 'template',
      options: {
        templateId,
        variables,
        ...variables
      }
    };
    
    const response = await this.generateYaml(request);
    if (!response.success || !response.raw_yaml) {
      throw new Error(response.error || 'Failed to generate YAML from template');
    }
    
    return response.raw_yaml;
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
   * Generate YAML from farmer template with user customizations
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
  ): Promise<GenerationResponse> {
    try {
      // Start with the farmer's base YAML
      let customizedYaml = farmerTemplate.yaml_content || '';

      // If we have user inputs, customize the YAML
      if (userInputs.farmName) {
        customizedYaml = customizedYaml.replace(/name:\s*.*$/m, `name: ${userInputs.farmName}`);
      }

      if (userInputs.description) {
        customizedYaml = customizedYaml.replace(/description:\s*.*$/m, `description: ${userInputs.description}`);
      }

      // Handle custom prompt injection
      if (userInputs.customPrompt) {
        // Replace the {{USER_PROMPT}} placeholder or append to initial_prompt
        if (customizedYaml.includes('{{USER_PROMPT}}')) {
          customizedYaml = customizedYaml.replace(/\{\{USER_PROMPT\}\}/g, userInputs.customPrompt);
        } else {
          // Find the initial_prompt section and enhance it
          customizedYaml = customizedYaml.replace(
            /initial_prompt:\s*\|[\s\S]*?(?=\n\w|\n$)/,
            (match) => {
              return match.trimEnd() + '\n\n  Additional Instructions: ' + userInputs.customPrompt;
            }
          );
        }
      }

      // Adjust max agents if specified
      if (userInputs.maxAgents && userInputs.maxAgents !== farmerTemplate.config?.maxAgents) {
        // Update the config section
        customizedYaml = customizedYaml.replace(
          /maxAgents:\s*\d+/,
          `maxAgents: ${userInputs.maxAgents}`
        );
      }

      // Update timeout if specified
      if (userInputs.timeout && userInputs.timeout !== farmerTemplate.config?.timeout) {
        customizedYaml = customizedYaml.replace(
          /timeout:\s*\d+/,
          `timeout: ${userInputs.timeout}`
        );
      }

      // Ensure the YAML has proper farm metadata
      if (!customizedYaml.includes('metadata:')) {
        const metadata = `
metadata:
  created_from: farmer_template
  farmer_template_id: ${farmerTemplate.id}
  farmer_template_name: ${farmerTemplate.title}
  customized_at: ${new Date().toISOString()}
  user_customizations:
    farm_name: ${userInputs.farmName}
    description: ${userInputs.description}
    ${userInputs.customPrompt ? `custom_prompt: ${userInputs.customPrompt}` : ''}
`;
        customizedYaml += metadata;
      }

      return {
        success: true,
        raw_yaml: customizedYaml,
        config: this.parseYamlToConfig(customizedYaml),
        suggestions: [],
        warnings: [],
        validation_passed: true
      };

    } catch (error) {
      console.error('Farmer YAML generation error:', error);
      
      // Fallback to basic template substitution
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate YAML from farmer template',
        raw_yaml: '',
        validation_passed: false
      };
    }
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