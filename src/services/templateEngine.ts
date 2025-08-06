import { OrchestrationConfig } from '../types/orchestration';
import { Farm } from '../types';
import yamlGeneratorService from './yamlGeneratorService';
import { v4 as uuidv4 } from 'uuid';

// Extended FarmTemplate interface for template engine
interface ExtendedFarmTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  yaml: string;
  config: {
    maxConcurrentAgents: number;
    agentTimeout: number;
    retryAttempts: number;
    retryDelay: number;
    healthCheckInterval: number;
    autoScaling: {
      enabled: boolean;
      minAgents: number;
      maxAgents: number;
      scaleUpThreshold: number;
      scaleDownThreshold: number;
      cooldownPeriod: number;
    };
  };
  requiredIntegrations: string[];
  estimatedResources: {
    agents: number;
    cpu: number;
    memory: number;
  };
  popularity: number;
  tags: string[];
}

// Type alias for compatibility
type FarmTemplate = ExtendedFarmTemplate;

interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  default?: any;
  required: boolean;
  description?: string;
  validation?: string;
}

interface TemplateRegistry {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  author: string;
  template: ExtendedFarmTemplate;
  variables: TemplateVariable[];
  examples: TemplateExample[];
  createdAt: Date;
  updatedAt: Date;
}

interface TemplateExample {
  name: string;
  description: string;
  variables: Record<string, any>;
  expectedOutput: string;
}

class TemplateEngine {
  private templates: Map<string, TemplateRegistry> = new Map();
  private customTemplates: Map<string, FarmTemplate> = new Map();

  constructor() {
    this.registerDefaultTemplates();
  }

  private registerDefaultTemplates() {
    // Web Development Template
    this.registerTemplate({
      id: 'web-dev-basic',
      name: 'Web Development Team',
      description: 'A collaborative team for building web applications',
      category: 'Development',
      version: '1.0.0',
      author: 'MaiFarm',
      template: {
        id: 'web-dev-basic',
        name: 'Web Development Team',
        description: 'Frontend, backend, and testing agents working together',
        category: 'Development',
        yaml: '',
        config: {
          maxConcurrentAgents: 5,
          agentTimeout: 300000,
          retryAttempts: 3,
          retryDelay: 1000,
          healthCheckInterval: 30000,
          autoScaling: {
            enabled: true,
            minAgents: 3,
            maxAgents: 8,
            scaleUpThreshold: 80,
            scaleDownThreshold: 20,
            cooldownPeriod: 60000
          }
        },
        requiredIntegrations: ['github'],
        estimatedResources: {
          agents: 5,
          cpu: 10,
          memory: 20480
        },
        popularity: 95,
        tags: ['web', 'development', 'full-stack']
      },
      variables: [
        {
          name: 'projectName',
          type: 'string',
          required: true,
          description: 'The name of your web project'
        },
        {
          name: 'framework',
          type: 'string',
          default: 'react',
          required: false,
          description: 'Frontend framework (react, vue, angular)'
        },
        {
          name: 'backend',
          type: 'string',
          default: 'node',
          required: false,
          description: 'Backend technology (node, python, java)'
        }
      ],
      examples: [
        {
          name: 'E-commerce Site',
          description: 'Building an online store',
          variables: {
            projectName: 'MyStore',
            framework: 'react',
            backend: 'node'
          },
          expectedOutput: 'A team with React frontend, Node.js backend, and testing agents'
        }
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Data Pipeline Template
    this.registerTemplate({
      id: 'data-pipeline',
      name: 'Data Processing Pipeline',
      description: 'Automated data ingestion, processing, and analysis',
      category: 'Data',
      version: '1.0.0',
      author: 'MaiFarm',
      template: {
        id: 'data-pipeline',
        name: 'Data Processing Pipeline',
        description: 'ETL pipeline with data validation and analysis',
        category: 'Data',
        yaml: '',
        config: {
          maxConcurrentAgents: 10,
          agentTimeout: 600000,
          retryAttempts: 5,
          retryDelay: 2000,
          healthCheckInterval: 60000,
          autoScaling: {
            enabled: true,
            minAgents: 2,
            maxAgents: 20,
            scaleUpThreshold: 70,
            scaleDownThreshold: 30,
            cooldownPeriod: 120000
          }
        },
        requiredIntegrations: ['aws', 'docker'],
        estimatedResources: {
          agents: 10,
          cpu: 20,
          memory: 40960
        },
        popularity: 87,
        tags: ['data', 'etl', 'analytics', 'pipeline']
      },
      variables: [
        {
          name: 'dataSource',
          type: 'string',
          required: true,
          description: 'Source of data (s3, database, api)'
        },
        {
          name: 'processingSteps',
          type: 'array',
          default: ['validate', 'transform', 'aggregate'],
          required: false,
          description: 'Data processing steps'
        },
        {
          name: 'outputFormat',
          type: 'string',
          default: 'parquet',
          required: false,
          description: 'Output data format'
        }
      ],
      examples: [],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // CI/CD Template
    this.registerTemplate({
      id: 'cicd-pipeline',
      name: 'CI/CD Pipeline',
      description: 'Continuous integration and deployment workflow',
      category: 'DevOps',
      version: '1.0.0',
      author: 'MaiFarm',
      template: {
        id: 'cicd-pipeline',
        name: 'CI/CD Pipeline',
        description: 'Automated build, test, and deployment pipeline',
        category: 'DevOps',
        yaml: '',
        config: {
          maxConcurrentAgents: 8,
          agentTimeout: 1800000,
          retryAttempts: 2,
          retryDelay: 5000,
          healthCheckInterval: 30000,
          autoScaling: {
            enabled: true,
            minAgents: 2,
            maxAgents: 15,
            scaleUpThreshold: 75,
            scaleDownThreshold: 25,
            cooldownPeriod: 180000
          }
        },
        requiredIntegrations: ['github', 'docker', 'aws'],
        estimatedResources: {
          agents: 8,
          cpu: 16,
          memory: 32768
        },
        popularity: 92,
        tags: ['cicd', 'devops', 'automation', 'deployment']
      },
      variables: [
        {
          name: 'repository',
          type: 'string',
          required: true,
          description: 'Git repository URL'
        },
        {
          name: 'branch',
          type: 'string',
          default: 'main',
          required: false,
          description: 'Branch to deploy from'
        },
        {
          name: 'environment',
          type: 'string',
          default: 'production',
          required: false,
          description: 'Deployment environment'
        }
      ],
      examples: [],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Research Template
    this.registerTemplate({
      id: 'research-team',
      name: 'Research & Analysis Team',
      description: 'Autonomous agents for research and analysis tasks',
      category: 'Research',
      version: '1.0.0',
      author: 'MaiFarm',
      template: {
        id: 'research-team',
        name: 'Research & Analysis Team',
        description: 'Collaborative research with data gathering and analysis',
        category: 'Research',
        yaml: '',
        config: {
          maxConcurrentAgents: 6,
          agentTimeout: 3600000,
          retryAttempts: 3,
          retryDelay: 10000,
          healthCheckInterval: 60000,
          autoScaling: {
            enabled: false,
            minAgents: 4,
            maxAgents: 6,
            scaleUpThreshold: 90,
            scaleDownThreshold: 10,
            cooldownPeriod: 300000
          }
        },
        requiredIntegrations: [],
        estimatedResources: {
          agents: 6,
          cpu: 12,
          memory: 24576
        },
        popularity: 78,
        tags: ['research', 'analysis', 'autonomous', 'exploration']
      },
      variables: [
        {
          name: 'researchTopic',
          type: 'string',
          required: true,
          description: 'Main research topic or question'
        },
        {
          name: 'sources',
          type: 'array',
          default: ['web', 'papers', 'datasets'],
          required: false,
          description: 'Data sources to explore'
        },
        {
          name: 'outputType',
          type: 'string',
          default: 'report',
          required: false,
          description: 'Type of output (report, presentation, dataset)'
        }
      ],
      examples: [],
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  registerTemplate(registry: TemplateRegistry): void {
    this.templates.set(registry.id, registry);
  }

  async instantiateTemplate(
    templateId: string,
    variables: Record<string, any>
  ): Promise<ExtendedFarmTemplate> {
    const registry = this.templates.get(templateId);
    if (!registry) {
      throw new Error(`Template ${templateId} not found`);
    }

    // Validate variables
    this.validateVariables(registry.variables, variables);

    // Deep clone the template
    const instance: FarmTemplate = JSON.parse(JSON.stringify(registry.template));
    instance.id = uuidv4();

    // Generate YAML with variables
    instance.yaml = await this.generateTemplateYAML(registry, variables);

    // Apply variable substitutions to config
    instance.config = this.applyVariables(instance.config, variables);

    // Update metadata
    instance.name = this.applyStringTemplate(instance.name, variables);
    instance.description = this.applyStringTemplate(instance.description, variables);

    return instance;
  }

  createCustomTemplate(
    name: string,
    description: string,
    farmConfig: Partial<Farm>
  ): ExtendedFarmTemplate {
    const template: ExtendedFarmTemplate = {
      id: uuidv4(),
      name,
      description,
      category: 'Custom',
      yaml: farmConfig.config?.yaml || '',
      config: this.extractOrchestrationConfig(farmConfig),
      requiredIntegrations: [],
      estimatedResources: {
        agents: farmConfig.agents?.length || 1,
        cpu: 2,
        memory: 4096
      },
      popularity: 0,
      tags: ['custom', 'user-created']
    };

    this.customTemplates.set(template.id, template);
    return template;
  }

  private validateVariables(
    definitions: TemplateVariable[],
    provided: Record<string, any>
  ): void {
    for (const def of definitions) {
      if (def.required && !(def.name in provided)) {
        throw new Error(`Required variable '${def.name}' not provided`);
      }

      const value = provided[def.name];
      if (value !== undefined) {
        // Type validation
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== def.type && def.type !== 'object') {
          throw new Error(`Variable '${def.name}' must be of type ${def.type}`);
        }

        // Custom validation
        if (def.validation) {
          const isValid = this.runValidation(def.validation, value);
          if (!isValid) {
            throw new Error(`Variable '${def.name}' failed validation`);
          }
        }
      }
    }
  }

  private async generateTemplateYAML(
    registry: TemplateRegistry,
    variables: Record<string, any>
  ): Promise<string> {
    const yamlTemplate = this.getYAMLTemplate(registry.template.id);
    
    // Replace variable placeholders
    let yaml = yamlTemplate;
    for (const [key, value] of Object.entries(variables)) {
      yaml = yaml.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    }

    // Generate agent configurations based on template
    const agentConfigs = this.generateAgentConfigs(registry.template, variables);
    
    // Build final YAML
    const finalYaml = `
name: ${this.applyStringTemplate(registry.template.name, variables)}
description: ${this.applyStringTemplate(registry.template.description, variables)}
type: ${this.determineType(registry.template)}

agents:
${agentConfigs.map(config => this.formatAgentYAML(config)).join('\n')}

config:
  autoScale: ${registry.template.config.autoScaling.enabled}
  maxAgents: ${registry.template.config.autoScaling.maxAgents}
  timeout: ${registry.template.config.agentTimeout}
  retryPolicy:
    enabled: true
    maxRetries: ${registry.template.config.retryAttempts}
    backoffMultiplier: 2
`;

    return finalYaml.trim();
  }

  private getYAMLTemplate(templateId: string): string {
    // Base YAML templates for each type
    const templates: Record<string, string> = {
      'web-dev-basic': `
name: {{projectName}} Development Team
type: collaborative

agents:
  - name: Frontend Developer
    type: builder
    capabilities: [{{framework}}, JavaScript, CSS, HTML]
    tasks:
      - Initialize {{framework}} project
      - Build UI components
      - Implement routing and state management
      - Optimize performance

  - name: Backend Developer
    type: builder
    capabilities: [{{backend}}, API, Database]
    tasks:
      - Setup {{backend}} server
      - Design and implement APIs
      - Database schema and integration
      - Authentication and authorization

  - name: QA Engineer
    type: tester
    capabilities: [Testing, Automation, Quality Assurance]
    tasks:
      - Write unit tests
      - Create integration tests
      - Perform E2E testing
      - Code quality analysis
`,
      'data-pipeline': `
name: Data Pipeline - {{dataSource}}
type: sequential

agents:
  - name: Data Ingester
    type: extractor
    capabilities: [{{dataSource}}, Data Collection]
    tasks:
      - Connect to {{dataSource}}
      - Extract raw data
      - Validate data integrity

  - name: Data Processor
    type: transformer
    capabilities: [Data Processing, ETL]
    tasks:
      {{processingSteps}}

  - name: Data Analyst
    type: analyzer
    capabilities: [Analytics, Reporting]
    tasks:
      - Generate analytics
      - Create visualizations
      - Export as {{outputFormat}}
`,
      'cicd-pipeline': `
name: CI/CD Pipeline - {{repository}}
type: sequential

agents:
  - name: Source Controller
    type: controller
    capabilities: [Git, Version Control]
    tasks:
      - Clone {{repository}}
      - Checkout {{branch}}
      - Detect changes

  - name: Builder
    type: builder
    capabilities: [Build, Compile, Package]
    tasks:
      - Install dependencies
      - Run build scripts
      - Create artifacts

  - name: Tester
    type: tester
    capabilities: [Testing, Quality]
    tasks:
      - Run unit tests
      - Run integration tests
      - Generate coverage reports

  - name: Deployer
    type: deployer
    capabilities: [Deployment, {{environment}}]
    tasks:
      - Build container images
      - Push to registry
      - Deploy to {{environment}}
      - Verify deployment
`,
      'research-team': `
name: Research Team - {{researchTopic}}
type: autonomous

agents:
  - name: Lead Researcher
    type: coordinator
    capabilities: [Research, Planning, Analysis]
    tasks:
      - Define research methodology
      - Coordinate team efforts
      - Synthesize findings

  - name: Data Gatherer
    type: explorer
    capabilities: [{{sources}}]
    tasks:
      - Search relevant sources
      - Collect data and references
      - Validate information

  - name: Analyst
    type: analyzer
    capabilities: [Analysis, Statistics, Visualization]
    tasks:
      - Analyze collected data
      - Identify patterns
      - Generate insights

  - name: Writer
    type: creator
    capabilities: [Writing, Documentation]
    tasks:
      - Structure findings
      - Write {{outputType}}
      - Format and polish output
`
    };

    return templates[templateId] || '';
  }

  private generateAgentConfigs(
    template: ExtendedFarmTemplate,
    variables: Record<string, any>
  ): any[] {
    // Generate agent configurations based on template type
    switch (template.id) {
      case 'web-dev-basic':
        return [
          {
            name: 'Frontend Developer',
            type: 'builder',
            capabilities: [variables.framework || 'react', 'JavaScript', 'CSS'],
            count: 1
          },
          {
            name: 'Backend Developer',
            type: 'builder',
            capabilities: [variables.backend || 'node', 'API', 'Database'],
            count: 1
          },
          {
            name: 'QA Engineer',
            type: 'tester',
            capabilities: ['Testing', 'Automation'],
            count: 1
          }
        ];
      
      case 'data-pipeline':
        const steps = variables.processingSteps || ['validate', 'transform'];
        return [
          {
            name: 'Data Ingester',
            type: 'extractor',
            capabilities: [variables.dataSource],
            count: 1
          },
          {
            name: 'Data Processor',
            type: 'transformer',
            capabilities: ['ETL', ...steps],
            count: Math.min(steps.length, 3)
          },
          {
            name: 'Data Analyst',
            type: 'analyzer',
            capabilities: ['Analytics'],
            count: 1
          }
        ];
      
      default:
        return [];
    }
  }

  private formatAgentYAML(config: any): string {
    return `  - name: ${config.name}
    type: ${config.type}
    capabilities: [${config.capabilities.join(', ')}]
    count: ${config.count}`;
  }

  private applyVariables(
    obj: any,
    variables: Record<string, any>
  ): any {
    if (typeof obj === 'string') {
      return this.applyStringTemplate(obj, variables);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.applyVariables(item, variables));
    }
    
    if (typeof obj === 'object' && obj !== null) {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.applyVariables(value, variables);
      }
      return result;
    }
    
    return obj;
  }

  private applyStringTemplate(
    template: string,
    variables: Record<string, any>
  ): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    }
    return result;
  }

  private runValidation(validation: string, value: any): boolean {
    try {
      // Simple validation expressions
      // In production, use a proper validation library
      const fn = new Function('value', `return ${validation}`);
      return fn(value);
    } catch {
      return false;
    }
  }

  private extractOrchestrationConfig(farmConfig: Partial<Farm>): ExtendedFarmTemplate['config'] {
    return {
      maxConcurrentAgents: farmConfig.config?.maxAgents || 5,
      agentTimeout: farmConfig.config?.timeout || 300000,
      retryAttempts: farmConfig.config?.retryPolicy?.maxRetries || 3,
      retryDelay: 1000,
      healthCheckInterval: 30000,
      autoScaling: {
        enabled: farmConfig.config?.autoScale || false,
        minAgents: 1,
        maxAgents: farmConfig.config?.maxAgents || 10,
        scaleUpThreshold: 80,
        scaleDownThreshold: 20,
        cooldownPeriod: 60000
      }
    };
  }

  private determineType(template: ExtendedFarmTemplate): string {
    if (template.category === 'DevOps' || template.category === 'Data') {
      return 'sequential';
    }
    if (template.category === 'Research') {
      return 'autonomous';
    }
    return 'collaborative';
  }

  // Public API methods
  getTemplate(id: string): TemplateRegistry | undefined {
    return this.templates.get(id);
  }

  getAllTemplates(): TemplateRegistry[] {
    return Array.from(this.templates.values());
  }

  getTemplatesByCategory(category: string): TemplateRegistry[] {
    return Array.from(this.templates.values())
      .filter(t => t.template.category === category);
  }

  getCustomTemplates(): ExtendedFarmTemplate[] {
    return Array.from(this.customTemplates.values());
  }

  searchTemplates(query: string): TemplateRegistry[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.templates.values()).filter(t =>
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery) ||
      t.template.tags.some((tag: string) => tag.toLowerCase().includes(lowerQuery))
    );
  }
}

export const templateEngine = new TemplateEngine();
export { TemplateEngine };