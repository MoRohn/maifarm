import { 
  YamlGenerationRequest,
  YamlGenerationResponse,
  YamlTemplate
} from '../../types/yaml';
import * as yaml from 'js-yaml';
import { getFarmAgentName, formatFarmAgentName, formatFarmAgentNameNoEmoji } from '../utils/farmAgentNames';
import { promptEnhancer } from './promptEnhancer';
import { promptEnhancementService } from './promptEnhancementService';

interface ParsedPrompt {
  agentCount: number;
  taskType: string;
  technologies: string[];
  description: string;
  provider?: 'claude' | 'qwen';
  contextWindowSize?: number;
}

export class YamlGeneratorService {
  private static instance: YamlGeneratorService;
  private templates: Map<string, YamlTemplate>;
  private history: any[] = [];

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

  private initializeTemplates() {
    // Basic templates
    this.templates.set('react-testing', {
      id: 'react-testing',
      name: 'React Testing Farm',
      description: 'Farm for testing React applications',
      category: 'testing',
      content: `name: React Testing Farm
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

    return {
      agentCount,
      taskType,
      technologies,
      description: prompt
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

  private generateAgentConfig(parsed: ParsedPrompt): any[] {
    const agents = [];
    const baseRoles = [
      { name: 'coordinator', role: 'Coordinate tasks and manage workflow' },
      { name: 'developer', role: 'Implement features and fix bugs' },
      { name: 'tester', role: 'Test functionality and ensure quality' },
      { name: 'analyzer', role: 'Analyze code and provide insights' },
      { name: 'documenter', role: 'Create and maintain documentation' }
    ];

    for (let i = 0; i < Math.min(parsed.agentCount, baseRoles.length); i++) {
      const role = baseRoles[i];
      const farmAgent = getFarmAgentName(role.name, i);
      agents.push({
        name: formatFarmAgentNameNoEmoji(farmAgent),
        role: role.role,
        capabilities: this.getCapabilitiesForRole(role.name, parsed.technologies),
        personality: farmAgent.personality
      });
    }

    // Add more agents if needed with farm names
    if (parsed.agentCount > baseRoles.length) {
      for (let i = baseRoles.length; i < parsed.agentCount; i++) {
        const farmAgent = getFarmAgentName('general', i);
        agents.push({
          name: formatFarmAgentNameNoEmoji(farmAgent),
          role: 'Support various tasks as needed',
          capabilities: ['general-support', 'task-assistance'],
          personality: farmAgent.personality
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

  async generateYaml(request: YamlGenerationRequest): Promise<YamlGenerationResponse> {
    const startTime = Date.now();
    
    try {
      // Determine provider from request or environment
      const provider = request.provider || process.env.AI_PROVIDER || 'claude';
      const isQwen = provider === 'qwen';
      
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
            additionalInstructions: isQwen 
              ? 'Optimize for Qwen\'s large context window (256K tokens) and chain-of-thought reasoning'
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
      parsed.provider = provider as 'claude' | 'qwen';
      parsed.contextWindowSize = isQwen ? 256000 : 100000; // Qwen has larger context
      parsed.originalPrompt = originalPrompt; // Preserve original prompt
      
      // Generate configuration based on parsed prompt - matching Claude Code format
      const agents = this.generateAgentConfig(parsed);
      const config = {
        name: `${parsed.technologies.join('-') || 'general'}-${parsed.taskType}-farm`,
        description: originalPrompt, // Use original prompt as description
        agents: agents,
        initial_prompt: this.generateInitialPrompt(parsed, agents),
        steps: this.generateSteps(parsed),
        config: {
          autoScale: false,
          maxAgents: isQwen ? Math.min(parsed.agentCount * 2, 16) : Math.min(parsed.agentCount * 2, 10),
          timeout: 3600,
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
          original_prompt: originalPrompt
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
          model: provider === 'qwen' ? 'qwen-based' : 'rule-based',
          provider: provider,
          confidence: 0.95,
          promptEnhanced: !!enhancementMetadata,
          enhancementMetadata,
          contextWindowSize: parsed.contextWindowSize
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
        'Set up comprehensive testing environment: Install Jest, Cypress, Playwright, and other testing frameworks. Configure test databases, mock servers, and test data fixtures. Set up continuous integration hooks and coverage reporting tools',
        'Create unit test suites with high coverage: Write tests for all utility functions, test React components with Testing Library, properly mock external dependencies, achieve minimum 80% code coverage, and implement snapshot testing where appropriate',
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
        'Initialize project with production-ready setup: Create well-organized project structure, configure TypeScript with strict settings, set up ESLint and Prettier with team standards, initialize Git with comprehensive .gitignore, configure environment variables and secrets management',
        'Design and implement core architecture: Define data models and database schema with migrations, create base classes and interfaces for type safety, implement dependency injection patterns, set up state management (Redux/Zustand/Context), establish error boundary strategies and fallbacks',
        'Develop authentication and authorization: Implement secure user registration with validation, create JWT-based authentication with refresh tokens, set up role-based access control (RBAC), implement password reset and email verification, add session management and security headers',
        'Build primary features and business logic: Implement core domain functionality with clean architecture, create reusable service layers and utilities, develop data processing pipelines, implement business rule engines, add feature flags for gradual rollout',
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
        'Initialize project environment: Set up development environment with all necessary tools, configure version control and branching strategy, establish project structure and conventions, set up continuous integration, create initial documentation',
        'Analyze requirements thoroughly: Gather and document all requirements, identify technical constraints and dependencies, create user stories and acceptance criteria, estimate effort and timeline, identify potential risks',
        'Design solution architecture: Create high-level design documents, define component interfaces and APIs, establish data flow and schemas, plan for scalability and performance, document architectural decisions',
        'Implement core functionality: Build main features iteratively, follow coding best practices, implement proper error handling, add comprehensive logging, ensure code maintainability',
        'Test and validate: Write comprehensive test suites, perform integration testing, validate against requirements, conduct user acceptance testing, ensure performance targets met',
        'Document and deliver: Create user documentation, write technical documentation, prepare deployment guides, conduct knowledge transfer, archive project artifacts'
      ]
    };

    return stepTemplates[parsed.taskType] || stepTemplates.general;
  }

  private generateInitialPrompt(parsed: any, agents: any[]): string {
    const agentNames = agents.map(a => a.name).slice(0, 3).join(', ');
    const fullTeamSize = agents.length;
    
    // Build comprehensive prompt with detailed instructions
    let prompt = `🌾 Welcome to MaiFarm! 🌾\n\n`;
    prompt += `You are joining a collaborative team of ${fullTeamSize} specialized agents for an important task.\n\n`;
    
    // Add original request if available
    if (parsed.originalPrompt) {
      prompt += `📋 **Original Request:**\n${parsed.originalPrompt}\n\n`;
    } else if (parsed.description) {
      prompt += `📋 **Task Description:**\n${parsed.description}\n\n`;
    }
    
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

    prompt += missionDescriptions[parsed.taskType] || missionDescriptions.general;
    
    // Add team information
    prompt += `\n\n👥 **Your Team:**\n`;
    prompt += `Working with: ${agentNames}${agents.length > 3 ? ' and others' : ''}\n`;
    prompt += `Total team size: ${fullTeamSize} specialized agents\n`;
    
    // Add specific agent capabilities if using special provider
    if (parsed.provider === 'qwen') {
      prompt += `\n🔧 **Provider Capabilities (Qwen):**\n`;
      prompt += `- 256K token context window for handling large codebases\n`;
      prompt += `- Advanced chain-of-thought reasoning\n`;
      prompt += `- Optimized for complex multi-file operations\n`;
    }
    
    // Add coordination protocol
    prompt += `\n📁 **Coordination Protocol:**\n`;
    prompt += `- Shared workspace: /tmp/claude_coordination/\n`;
    prompt += `- Claim work in active_agents.json before starting\n`;
    prompt += `- Update progress in work_claims.json regularly\n`;
    prompt += `- Check existing claims to avoid duplicate work\n`;
    prompt += `- Communicate via shared status files\n`;
    
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
    prompt += `1. Review the detailed task steps below\n`;
    prompt += `2. Claim your work area in coordination files\n`;
    prompt += `3. Begin with your specialized responsibilities\n`;
    prompt += `4. Coordinate with other agents as needed\n`;
    prompt += `5. Update your progress regularly\n\n`;
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
    const isQwen = parsed.provider === 'qwen';

    if (!parsed.technologies.length) {
      suggestions.push('Consider specifying technologies for more targeted agent capabilities');
    }

    if (isQwen) {
      // Qwen-specific suggestions
      if (parsed.agentCount > 8) {
        suggestions.push('While Qwen can handle more agents, consider limiting to 8 for optimal coordination');
      }
      suggestions.push('Leverage Qwen\'s 256K context window for complex, multi-file tasks');
      suggestions.push('Use chain-of-thought prompting for better reasoning with Qwen');
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

  async enhancePrompt(request: { prompt: string; context?: string; purpose?: string }): Promise<any> {
    try {
      // Use the prompt enhancer service
      const enhanced = await promptEnhancer.enhancePrompt({
        prompt: request.prompt,
        context: request.context,
        purpose: request.purpose as any || 'farm',
        style: 'technical'
      });
      
      return enhanced;
    } catch (error) {
      console.error('Error enhancing prompt:', error);
      // Fallback to basic enhancement
      return {
        enhanced_prompt: request.prompt,
        original_prompt: request.prompt,
        suggestions: ['Consider adding more specific requirements'],
        improvements: {}
      };
    }
  }

  async getHistory(userId?: string, options?: { limit: number; offset: number }): Promise<any[]> {
    const { limit = 10, offset = 0 } = options || {};
    return this.history.slice(offset, offset + limit);
  }

  /**
   * Enhance a user prompt to make it more effective for YAML generation
   * This method uses creative prompt engineering to improve the user's input
   */
  async enhancePrompt(request: {
    prompt: string;
    context?: string;
    purpose?: string;
  }): Promise<{
    enhanced_prompt: string;
    suggestions: string[];
    improvements: string[];
  }> {
    const { prompt, context, purpose } = request;
    
    // Parse the original prompt
    const parsed = this.parsePrompt(prompt);
    
    // Build an enhanced prompt with better structure and clarity
    const enhancements: string[] = [];
    const improvements: string[] = [];
    const suggestions: string[] = [];
    
    // Start with a clear task definition
    let enhancedPrompt = `Create a MaiFarm configuration for ${parsed.agentCount} agents`;
    
    // Add purpose-specific enhancements
    if (purpose || parsed.taskType !== 'general') {
      const taskPurpose = purpose || parsed.taskType;
      enhancedPrompt += ` specialized in ${taskPurpose}`;
      improvements.push(`Added clear specialization for ${taskPurpose}`);
    }
    
    // Add technology stack if detected
    if (parsed.technologies.length > 0) {
      enhancedPrompt += ` using ${parsed.technologies.join(', ')}`;
      improvements.push(`Specified technology stack: ${parsed.technologies.join(', ')}`);
    } else if (prompt.toLowerCase().includes('web') || prompt.toLowerCase().includes('app')) {
      enhancedPrompt += ` using React, TypeScript, and Node.js`;
      suggestions.push('Consider specifying your exact technology stack');
      improvements.push('Added common web development stack');
    }
    
    // Add task breakdown and coordination
    enhancedPrompt += `. The farm should coordinate the following tasks:`;
    
    // Generate task list based on purpose
    const tasksByPurpose: Record<string, string[]> = {
      testing: [
        'Set up comprehensive testing environment with proper dependencies',
        'Create unit tests with high coverage for critical components',
        'Implement integration tests for API endpoints and services',
        'Develop end-to-end tests for user workflows',
        'Generate detailed test reports with coverage metrics'
      ],
      review: [
        'Analyze codebase structure and architecture patterns',
        'Review code quality and adherence to best practices',
        'Check for security vulnerabilities and performance issues',
        'Validate documentation completeness and accuracy',
        'Generate comprehensive review report with actionable recommendations'
      ],
      development: [
        'Initialize project with modern tooling and framework setup',
        'Design and implement core architecture and features',
        'Create responsive UI with accessibility considerations',
        'Implement data persistence and API integration',
        'Add comprehensive error handling and logging',
        'Write technical documentation and deployment guides'
      ],
      debugging: [
        'Reproduce reported issues consistently across environments',
        'Analyze error logs and stack traces for root causes',
        'Use debugging tools to trace execution flow',
        'Implement and validate bug fixes',
        'Document issues and solutions for future reference'
      ],
      deployment: [
        'Prepare production build with optimizations',
        'Configure CI/CD pipeline for automated deployment',
        'Set up monitoring and alerting systems',
        'Perform smoke tests in staging environment',
        'Execute production deployment with rollback plan'
      ]
    };
    
    const tasks = tasksByPurpose[parsed.taskType] || tasksByPurpose.development;
    tasks.forEach((task, index) => {
      enhancedPrompt += `\n${index + 1}. ${task}`;
    });
    
    // Add collaboration requirements
    enhancedPrompt += '\n\nAgents should collaborate using:';
    enhancedPrompt += '\n- Shared coordination files at /tmp/claude_coordination/';
    enhancedPrompt += '\n- Work claims to prevent duplicate efforts';
    enhancedPrompt += '\n- Clear interfaces and integration points';
    enhancedPrompt += '\n- Regular status updates and progress tracking';
    
    // Add farm-themed personality
    enhancedPrompt += '\n\nEach agent should have a unique farm animal personality that reflects their role:';
    if (parsed.agentCount <= 5) {
      const personalities = [
        'Wise Barn Owl for analysis and review',
        'Busy Bee for detailed implementation work',
        'Loyal Dog for testing and quality assurance',
        'Clever Pig for creative problem solving',
        'Strong Horse for heavy lifting and infrastructure'
      ];
      personalities.slice(0, parsed.agentCount).forEach(p => {
        enhancedPrompt += `\n- ${p}`;
      });
    } else {
      enhancedPrompt += '\n- A diverse mix of farm animals matching their specialized roles';
    }
    
    // Add context if provided
    if (context) {
      enhancedPrompt += `\n\nAdditional context: ${context}`;
      improvements.push('Incorporated provided context');
    }
    
    // Generate suggestions for further improvement
    if (!parsed.technologies.length) {
      suggestions.push('Specify your technology stack for better agent configuration');
    }
    
    if (parsed.agentCount === 3) {
      suggestions.push('Default 3 agents is good for small tasks. Consider 5-7 for complex projects');
    }
    
    if (!prompt.toLowerCase().includes('test')) {
      suggestions.push('Consider adding testing requirements for quality assurance');
    }
    
    if (!prompt.toLowerCase().includes('document')) {
      suggestions.push('Include documentation tasks for better maintainability');
    }
    
    // Add creative farm-themed suggestion
    suggestions.push('Your farm will be more productive with clear task boundaries and collaboration points');
    
    return {
      enhanced_prompt: enhancedPrompt,
      suggestions,
      improvements
    };
  }
}

export const yamlGenerator = YamlGeneratorService.getInstance();