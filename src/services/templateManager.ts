// Template management service for farm templates

import { v4 as uuidv4 } from 'uuid';
import { Farm } from '../types';
import { FarmTemplate, AgentBlueprint } from '../types/farm';
import { WorkflowTemplate } from '../types/workflow';

class TemplateManager {
  private templates: Map<string, FarmTemplate> = new Map();
  private builtInTemplates: FarmTemplate[] = [];

  constructor() {
    this.initializeBuiltInTemplates();
  }

  async getTemplate(templateId: string): Promise<FarmTemplate> {
    const template = this.templates.get(templateId) || 
                   this.builtInTemplates.find(t => t.id === templateId);
    
    if (!template) {
      throw new Error('Template not found');
    }

    return template;
  }

  async getTemplates(category?: string): Promise<FarmTemplate[]> {
    const allTemplates = [
      ...this.builtInTemplates,
      ...Array.from(this.templates.values()),
    ];

    if (category) {
      return allTemplates.filter(t => t.category === category);
    }

    return allTemplates;
  }

  async createTemplate(template: Omit<FarmTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<FarmTemplate> {
    const newTemplate: FarmTemplate = {
      ...template,
      id: uuidv4(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.templates.set(newTemplate.id, newTemplate);
    return newTemplate;
  }

  async updateTemplate(templateId: string, updates: Partial<FarmTemplate>): Promise<FarmTemplate> {
    const template = await this.getTemplate(templateId);
    
    if (this.builtInTemplates.find(t => t.id === templateId)) {
      throw new Error('Cannot modify built-in templates');
    }

    const updatedTemplate = {
      ...template,
      ...updates,
      updatedAt: new Date(),
    };

    this.templates.set(templateId, updatedTemplate);
    return updatedTemplate;
  }

  async deleteTemplate(templateId: string): Promise<void> {
    if (this.builtInTemplates.find(t => t.id === templateId)) {
      throw new Error('Cannot delete built-in templates');
    }

    this.templates.delete(templateId);
  }

  async getTemplateFromFarm(farm: Farm): Promise<FarmTemplate | null> {
    // Try to reconstruct a template from an existing farm
    if (!farm.config.yaml) {
      return null;
    }

    // Parse YAML to extract agent blueprints
    const agentBlueprints = this.extractAgentBlueprints(farm);

    const template: FarmTemplate = {
      id: uuidv4(),
      name: `${farm.name} Template`,
      description: `Template based on ${farm.name}`,
      category: 'custom',
      config: farm.config,
      agentBlueprints,
      estimatedDuration: 3600,
      popularity: 0,
      tags: ['custom', 'derived'],
      createdBy: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return template;
  }

  private extractAgentBlueprints(farm: Farm): AgentBlueprint[] {
    // Extract agent configurations from farm
    return farm.agents.map(agent => ({
      name: agent.name,
      type: agent.type,
      capabilities: agent.capabilities,
      resources: {
        cpu: 2,
        memory: 4,
        priority: 'medium' as const,
      },
    }));
  }

  private initializeBuiltInTemplates(): void {
    this.builtInTemplates = [
      {
        id: 'web-app-builder',
        name: 'Web Application Builder',
        description: 'Full-stack web application development with React and Node.js',
        category: 'development',
        icon: '🌐',
        config: {
          autoScale: true,
          maxAgents: 6,
          timeout: 7200,
          retryPolicy: {
            enabled: true,
            maxRetries: 3,
            backoffMultiplier: 2,
          },
        },
        agentBlueprints: [
          {
            name: 'Frontend Developer',
            type: 'builder',
            capabilities: ['React', 'TypeScript', 'Tailwind CSS', 'Vite'],
            resources: { cpu: 2, memory: 4, priority: 'high' },
            scalingPolicy: {
              minInstances: 1,
              maxInstances: 3,
              scaleTriggers: [
                {
                  metric: 'queue_depth',
                  threshold: 5,
                  duration: 300,
                  action: 'scale_up',
                },
              ],
            },
          },
          {
            name: 'Backend Developer',
            type: 'builder',
            capabilities: ['Node.js', 'Express', 'PostgreSQL', 'Redis'],
            resources: { cpu: 4, memory: 8, priority: 'high' },
            scalingPolicy: {
              minInstances: 1,
              maxInstances: 2,
              scaleTriggers: [
                {
                  metric: 'cpu',
                  threshold: 80,
                  duration: 300,
                  action: 'scale_up',
                },
              ],
            },
          },
          {
            name: 'DevOps Engineer',
            type: 'builder',
            capabilities: ['Docker', 'Kubernetes', 'CI/CD', 'Monitoring'],
            resources: { cpu: 2, memory: 4, priority: 'medium' },
          },
          {
            name: 'QA Engineer',
            type: 'tester',
            capabilities: ['Jest', 'Cypress', 'Performance Testing'],
            resources: { cpu: 2, memory: 4, priority: 'medium' },
          },
        ],
        requirements: {
          minAgents: 3,
          maxAgents: 8,
          estimatedCpu: 10,
          estimatedMemory: 20,
          estimatedCost: 50,
        },
        estimatedDuration: 7200,
        popularity: 95,
        tags: ['web', 'fullstack', 'react', 'nodejs'],
        createdBy: 'system',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'code-review-pipeline',
        name: 'Automated Code Review Pipeline',
        description: 'Comprehensive code review with quality checks and security scanning',
        category: 'testing',
        icon: '🔍',
        config: {
          autoScale: false,
          maxAgents: 4,
          timeout: 3600,
          retryPolicy: {
            enabled: true,
            maxRetries: 2,
            backoffMultiplier: 1.5,
          },
        },
        agentBlueprints: [
          {
            name: 'Code Reviewer',
            type: 'reviewer',
            capabilities: ['Code Analysis', 'Best Practices', 'Design Patterns'],
            resources: { cpu: 2, memory: 4, priority: 'high' },
          },
          {
            name: 'Security Scanner',
            type: 'reviewer',
            capabilities: ['SAST', 'Dependency Scanning', 'OWASP'],
            resources: { cpu: 3, memory: 6, priority: 'high' },
          },
          {
            name: 'Performance Analyzer',
            type: 'reviewer',
            capabilities: ['Performance Testing', 'Memory Profiling', 'Optimization'],
            resources: { cpu: 2, memory: 4, priority: 'medium' },
          },
        ],
        workflowTemplate: {
          id: 'code-review-workflow',
          name: 'Code Review Workflow',
          description: 'Sequential code review process',
          tasks: [
            {
              id: 'lint-check',
              name: 'Linting',
              type: 'agent_task',
              agentType: 'reviewer',
              config: { tool: 'eslint' },
              timeout: 300,
            },
            {
              id: 'security-scan',
              name: 'Security Scanning',
              type: 'agent_task',
              agentType: 'reviewer',
              config: { tool: 'snyk' },
              timeout: 600,
              dependencies: ['lint-check'],
            },
            {
              id: 'performance-check',
              name: 'Performance Analysis',
              type: 'agent_task',
              agentType: 'reviewer',
              config: { tool: 'lighthouse' },
              timeout: 900,
              dependencies: ['lint-check'],
            },
          ],
          dependencies: [
            { from: 'lint-check', to: 'security-scan', type: 'finish_to_start' },
            { from: 'lint-check', to: 'performance-check', type: 'finish_to_start' },
          ],
        },
        requirements: {
          minAgents: 2,
          maxAgents: 4,
          estimatedCpu: 7,
          estimatedMemory: 14,
          estimatedCost: 25,
        },
        estimatedDuration: 1800,
        popularity: 88,
        tags: ['code-review', 'quality', 'security', 'testing'],
        createdBy: 'system',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'data-pipeline',
        name: 'Data Processing Pipeline',
        description: 'ETL pipeline for data processing and analytics',
        category: 'analysis',
        icon: '📊',
        config: {
          autoScale: true,
          maxAgents: 10,
          timeout: 14400,
          retryPolicy: {
            enabled: true,
            maxRetries: 5,
            backoffMultiplier: 2,
          },
        },
        agentBlueprints: [
          {
            name: 'Data Extractor',
            type: 'builder',
            capabilities: ['SQL', 'API Integration', 'File Processing'],
            resources: { cpu: 2, memory: 8, priority: 'high' },
            scalingPolicy: {
              minInstances: 2,
              maxInstances: 5,
              scaleTriggers: [
                {
                  metric: 'queue_depth',
                  threshold: 10,
                  duration: 180,
                  action: 'scale_up',
                },
              ],
            },
          },
          {
            name: 'Data Transformer',
            type: 'builder',
            capabilities: ['Python', 'Pandas', 'Data Cleaning'],
            resources: { cpu: 4, memory: 16, priority: 'high' },
            scalingPolicy: {
              minInstances: 1,
              maxInstances: 3,
              scaleTriggers: [
                {
                  metric: 'memory',
                  threshold: 80,
                  duration: 300,
                  action: 'scale_up',
                },
              ],
            },
          },
          {
            name: 'Data Validator',
            type: 'tester',
            capabilities: ['Data Quality', 'Schema Validation', 'Anomaly Detection'],
            resources: { cpu: 2, memory: 4, priority: 'medium' },
          },
          {
            name: 'Data Loader',
            type: 'builder',
            capabilities: ['Database Loading', 'Data Warehouse', 'Batch Processing'],
            resources: { cpu: 3, memory: 8, priority: 'high' },
          },
        ],
        requirements: {
          minAgents: 4,
          maxAgents: 11,
          estimatedCpu: 15,
          estimatedMemory: 40,
          estimatedCost: 75,
        },
        estimatedDuration: 10800,
        popularity: 82,
        tags: ['data', 'etl', 'analytics', 'pipeline'],
        createdBy: 'system',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'microservices-deployment',
        name: 'Microservices Deployment',
        description: 'Deploy and manage microservices architecture with Kubernetes',
        category: 'deployment',
        icon: '🚀',
        config: {
          autoScale: true,
          maxAgents: 8,
          timeout: 5400,
          retryPolicy: {
            enabled: true,
            maxRetries: 3,
            backoffMultiplier: 2,
          },
        },
        agentBlueprints: [
          {
            name: 'Container Builder',
            type: 'builder',
            capabilities: ['Docker', 'Container Registry', 'Multi-stage Builds'],
            resources: { cpu: 4, memory: 8, priority: 'high' },
          },
          {
            name: 'Kubernetes Deployer',
            type: 'builder',
            capabilities: ['Kubernetes', 'Helm', 'Service Mesh'],
            resources: { cpu: 2, memory: 4, priority: 'high' },
          },
          {
            name: 'Infrastructure Manager',
            type: 'builder',
            capabilities: ['Terraform', 'Cloud Providers', 'IaC'],
            resources: { cpu: 2, memory: 4, priority: 'medium' },
          },
          {
            name: 'Monitoring Setup',
            type: 'builder',
            capabilities: ['Prometheus', 'Grafana', 'Alerting'],
            resources: { cpu: 2, memory: 4, priority: 'medium' },
          },
        ],
        requirements: {
          minAgents: 3,
          maxAgents: 8,
          estimatedCpu: 10,
          estimatedMemory: 20,
          estimatedCost: 60,
          dependencies: ['docker', 'kubernetes'],
        },
        estimatedDuration: 3600,
        popularity: 75,
        tags: ['deployment', 'kubernetes', 'microservices', 'devops'],
        createdBy: 'system',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
  }
}

export const templateManager = new TemplateManager();