import { z } from 'zod';

export const ResourceRequirementsSchema = z.object({
  requests: z.object({
    cpu: z.string().optional(),
    memory: z.string().optional()
  }).optional(),
  limits: z.object({
    cpu: z.string().optional(),
    memory: z.string().optional()
  }).optional()
});

export const AgentDefinitionSchema = z.object({
  name: z.string().min(1, 'Agent name is required'),
  type: z.string().min(1, 'Agent type is required'),
  replicas: z.number().int().min(1).max(100).optional(),
  capabilities: z.array(z.string()).min(1, 'At least one capability is required'),
  config: z.record(z.any()).optional(),
  resources: ResourceRequirementsSchema.optional(),
  environment: z.record(z.string()).optional(),
  dependencies: z.array(z.string()).optional()
});

export const NetworkingConfigSchema = z.object({
  type: z.enum(['internal', 'external', 'hybrid']),
  ports: z.array(z.number().int().min(1).max(65535)).optional(),
  endpoints: z.array(z.string().url()).optional(),
  security: z.object({
    tls: z.boolean().optional(),
    authentication: z.string().optional()
  }).optional()
});

export const StorageConfigSchema = z.object({
  type: z.enum(['local', 'distributed', 's3', 'custom']),
  size: z.string().regex(/^\d+[KMGT]i?$/, 'Invalid storage size format').optional(),
  persistence: z.boolean().optional(),
  backups: z.object({
    enabled: z.boolean(),
    schedule: z.string().optional(),
    retention: z.string().optional()
  }).optional()
});

export const AlertConfigSchema = z.object({
  name: z.string().min(1),
  condition: z.string().min(1),
  threshold: z.number(),
  action: z.string().min(1)
});

export const MonitoringConfigSchema = z.object({
  enabled: z.boolean(),
  metrics: z.array(z.string()).optional(),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']),
    format: z.enum(['json', 'text'])
  }).optional(),
  alerts: z.array(AlertConfigSchema).optional()
});

export const ScalingMetricSchema = z.object({
  type: z.enum(['cpu', 'memory', 'custom']),
  target: z.number().min(0).max(100),
  metric: z.string().optional()
});

export const ScalingConfigSchema = z.object({
  enabled: z.boolean(),
  minReplicas: z.number().int().min(1).optional(),
  maxReplicas: z.number().int().min(1).optional(),
  metrics: z.array(ScalingMetricSchema).optional()
}).refine(
  (data) => {
    if (data.minReplicas && data.maxReplicas) {
      return data.minReplicas <= data.maxReplicas;
    }
    return true;
  },
  {
    message: 'minReplicas must be less than or equal to maxReplicas'
  }
);

export const FarmMetadataSchema = z.object({
  name: z.string()
    .min(1, 'Farm name is required')
    .max(63, 'Farm name must be 63 characters or less')
    .regex(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/, 'Farm name must be lowercase alphanumeric with hyphens'),
  namespace: z.string()
    .regex(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/, 'Invalid namespace format')
    .optional(),
  labels: z.record(z.string()).optional(),
  annotations: z.record(z.string()).optional()
});

export const FarmSpecSchema = z.object({
  description: z.string().optional(),
  agents: z.array(AgentDefinitionSchema).min(1, 'At least one agent is required'),
  resources: ResourceRequirementsSchema.optional(),
  networking: NetworkingConfigSchema.optional(),
  storage: StorageConfigSchema.optional(),
  monitoring: MonitoringConfigSchema.optional(),
  scaling: ScalingConfigSchema.optional()
});

export const FarmConfigurationSchema = z.object({
  apiVersion: z.string().regex(/^v\d+(\.\d+)?$/, 'Invalid API version format'),
  kind: z.literal('Farm'),
  metadata: FarmMetadataSchema,
  spec: FarmSpecSchema
});

export const validateFarmConfiguration = (config: unknown) => {
  return FarmConfigurationSchema.safeParse(config);
};

export const FARM_CONFIG_TEMPLATES = {
  basic: {
    apiVersion: 'v1',
    kind: 'Farm',
    metadata: {
      name: 'my-farm',
      labels: {
        environment: 'development'
      }
    },
    spec: {
      description: 'Basic farm configuration',
      agents: [
        {
          name: 'coordinator',
          type: 'orchestrator',
          replicas: 1,
          capabilities: ['task-distribution', 'monitoring']
        },
        {
          name: 'worker',
          type: 'executor',
          replicas: 3,
          capabilities: ['code-generation', 'testing']
        }
      ],
      monitoring: {
        enabled: true,
        logging: {
          level: 'info',
          format: 'json'
        }
      }
    }
  },
  advanced: {
    apiVersion: 'v1',
    kind: 'Farm',
    metadata: {
      name: 'production-farm',
      namespace: 'prod',
      labels: {
        environment: 'production',
        team: 'platform'
      }
    },
    spec: {
      description: 'Production-grade farm with high availability',
      agents: [
        {
          name: 'coordinator',
          type: 'orchestrator',
          replicas: 3,
          capabilities: ['task-distribution', 'monitoring', 'failover'],
          resources: {
            requests: { cpu: '500m', memory: '1Gi' },
            limits: { cpu: '2000m', memory: '4Gi' }
          }
        },
        {
          name: 'analyzer',
          type: 'analysis',
          replicas: 2,
          capabilities: ['code-analysis', 'security-scanning', 'performance-profiling']
        },
        {
          name: 'executor',
          type: 'worker',
          replicas: 5,
          capabilities: ['code-generation', 'testing', 'deployment']
        }
      ],
      networking: {
        type: 'internal',
        security: {
          tls: true,
          authentication: 'mutual-tls'
        }
      },
      storage: {
        type: 'distributed',
        size: '100Gi',
        persistence: true,
        backups: {
          enabled: true,
          schedule: '0 2 * * *',
          retention: '30d'
        }
      },
      monitoring: {
        enabled: true,
        metrics: ['cpu', 'memory', 'requests', 'errors'],
        logging: {
          level: 'info',
          format: 'json'
        },
        alerts: [
          {
            name: 'high-cpu',
            condition: 'cpu_usage',
            threshold: 80,
            action: 'scale-up'
          }
        ]
      },
      scaling: {
        enabled: true,
        minReplicas: 3,
        maxReplicas: 10,
        metrics: [
          {
            type: 'cpu',
            target: 70
          },
          {
            type: 'memory',
            target: 80
          }
        ]
      }
    }
  }
};