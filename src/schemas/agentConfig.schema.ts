import { z } from 'zod';

export const AgentCapabilitySchema = z.enum([
  'code-generation',
  'code-analysis',
  'testing',
  'deployment',
  'monitoring',
  'security-scanning',
  'performance-profiling',
  'documentation',
  'refactoring',
  'debugging',
  'task-distribution',
  'failover',
  'data-processing',
  'ui-development',
  'api-development',
  'database-management',
  'infrastructure',
  'machine-learning',
  'natural-language-processing',
  'image-processing'
]);

export const AgentTypeSchema = z.enum([
  'orchestrator',
  'executor',
  'worker',
  'analyzer',
  'specialist',
  'coordinator',
  'monitor',
  'security',
  'data',
  'ml',
  'ui',
  'api',
  'infrastructure'
]);

export const AgentConfigSchema = z.object({
  name: z.string()
    .min(1, 'Agent name is required')
    .max(50, 'Agent name must be 50 characters or less')
    .regex(/^[a-zA-Z0-9-_]+$/, 'Agent name must be alphanumeric with hyphens or underscores'),
  type: AgentTypeSchema,
  description: z.string().optional(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must follow semantic versioning').optional(),
  capabilities: z.array(AgentCapabilitySchema).min(1, 'At least one capability is required'),
  configuration: z.object({
    maxConcurrentTasks: z.number().int().min(1).max(100).optional(),
    timeout: z.string().regex(/^\d+[smh]$/, 'Timeout must be in format: 30s, 5m, 1h').optional(),
    retryPolicy: z.object({
      maxRetries: z.number().int().min(0).max(10).optional(),
      backoffMultiplier: z.number().min(1).max(5).optional(),
      initialInterval: z.string().regex(/^\d+[sm]$/).optional()
    }).optional(),
    environment: z.record(z.string()).optional(),
    secrets: z.array(z.string()).optional(),
    healthCheck: z.object({
      enabled: z.boolean(),
      interval: z.string().regex(/^\d+[smh]$/).optional(),
      timeout: z.string().regex(/^\d+[sm]$/).optional(),
      path: z.string().optional()
    }).optional()
  }).optional(),
  requirements: z.object({
    runtime: z.enum(['nodejs', 'python', 'go', 'rust', 'java', 'dotnet']).optional(),
    dependencies: z.array(z.string()).optional(),
    systemPackages: z.array(z.string()).optional(),
    gpuRequired: z.boolean().optional()
  }).optional(),
  networking: z.object({
    exposePort: z.number().int().min(1).max(65535).optional(),
    allowedInbound: z.array(z.string()).optional(),
    allowedOutbound: z.array(z.string()).optional()
  }).optional(),
  observability: z.object({
    metrics: z.array(z.string()).optional(),
    traces: z.boolean().optional(),
    logs: z.object({
      level: z.enum(['debug', 'info', 'warn', 'error']),
      format: z.enum(['json', 'text'])
    }).optional()
  }).optional()
});

export const AgentTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum(['general', 'specialized', 'experimental', 'enterprise']),
  baseConfig: AgentConfigSchema,
  variables: z.array(z.object({
    name: z.string(),
    description: z.string(),
    type: z.enum(['string', 'number', 'boolean', 'array']),
    required: z.boolean(),
    default: z.any().optional()
  })),
  examples: z.array(z.object({
    name: z.string(),
    description: z.string(),
    config: z.record(z.any())
  })).optional()
});

export const validateAgentConfig = (config: unknown) => {
  return AgentConfigSchema.safeParse(config);
};

export const AGENT_TEMPLATES = {
  codeGenerator: {
    name: 'code-generator',
    type: 'worker',
    description: 'Agent specialized in generating code based on specifications',
    capabilities: ['code-generation', 'testing', 'documentation'],
    configuration: {
      maxConcurrentTasks: 5,
      timeout: '5m',
      retryPolicy: {
        maxRetries: 3,
        backoffMultiplier: 2,
        initialInterval: '5s'
      }
    },
    requirements: {
      runtime: 'nodejs',
      dependencies: ['typescript', 'eslint', 'prettier']
    }
  },
  securityAnalyzer: {
    name: 'security-analyzer',
    type: 'analyzer',
    description: 'Agent for security scanning and vulnerability detection',
    capabilities: ['security-scanning', 'code-analysis'],
    configuration: {
      maxConcurrentTasks: 3,
      timeout: '10m',
      environment: {
        SCAN_DEPTH: 'deep',
        VULNERABILITY_DB: 'latest'
      }
    },
    requirements: {
      runtime: 'python',
      dependencies: ['bandit', 'safety', 'semgrep'],
      systemPackages: ['git', 'docker']
    }
  },
  orchestrator: {
    name: 'main-orchestrator',
    type: 'orchestrator',
    description: 'Central orchestrator for task distribution and coordination',
    capabilities: ['task-distribution', 'monitoring', 'failover'],
    configuration: {
      maxConcurrentTasks: 20,
      timeout: '30m',
      healthCheck: {
        enabled: true,
        interval: '30s',
        timeout: '5s',
        path: '/health'
      }
    },
    networking: {
      exposePort: 8080,
      allowedInbound: ['*'],
      allowedOutbound: ['*']
    },
    observability: {
      metrics: ['tasks_processed', 'queue_size', 'agent_health'],
      traces: true,
      logs: {
        level: 'info',
        format: 'json'
      }
    }
  },
  mlSpecialist: {
    name: 'ml-specialist',
    type: 'ml',
    description: 'Machine learning specialist for AI-powered features',
    capabilities: ['machine-learning', 'natural-language-processing', 'data-processing'],
    configuration: {
      maxConcurrentTasks: 2,
      timeout: '20m',
      environment: {
        MODEL_PATH: '/models',
        CACHE_SIZE: '4GB'
      }
    },
    requirements: {
      runtime: 'python',
      dependencies: ['tensorflow', 'transformers', 'numpy', 'pandas'],
      gpuRequired: true
    }
  }
};