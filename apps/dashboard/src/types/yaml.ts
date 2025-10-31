export interface YamlConfiguration {
  id: string;
  name: string;
  description: string;
  content: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  status: YamlConfigStatus;
  tags: string[];
  parentId?: string;
  deploymentStatus?: DeploymentStatus;
}

export enum YamlConfigStatus {
  DRAFT = 'draft',
  VALIDATED = 'validated',
  INVALID = 'invalid',
  DEPLOYED = 'deployed',
  ARCHIVED = 'archived'
}

export interface DeploymentStatus {
  status: 'pending' | 'in_progress' | 'success' | 'failed';
  deployedAt?: Date;
  deployedBy?: string;
  environment?: string;
  logs?: string[];
}

export interface YamlGenerationRequest {
  prompt: string;
  templateId?: string;
  context?: Record<string, any>;
  constraints?: YamlConstraints;
}

export interface YamlConstraints {
  maxAgents?: number;
  requiredCapabilities?: string[];
  resourceLimits?: ResourceLimits;
  complianceRequirements?: string[];
}

export interface ResourceLimits {
  maxMemory?: string;
  maxCpu?: string;
  maxStorage?: string;
}

export interface YamlValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: OptimizationSuggestion[];
}

export interface ValidationError {
  path: string;
  message: string;
  line?: number;
  column?: number;
  severity: 'error' | 'critical';
}

export interface ValidationWarning {
  path: string;
  message: string;
  line?: number;
  column?: number;
  fix?: string;
}

export interface OptimizationSuggestion {
  type: 'performance' | 'security' | 'cost' | 'reliability';
  message: string;
  impact: 'low' | 'medium' | 'high';
  suggestion: string;
  autoFixAvailable: boolean;
}

export interface YamlTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  content: string;
  variables: TemplateVariable[];
  tags: string[];
  popularity: number;
  isOfficial: boolean;
}

export enum TemplateCategory {
  BASIC = 'basic',
  ADVANCED = 'advanced',
  ENTERPRISE = 'enterprise',
  EXPERIMENTAL = 'experimental',
  COMMUNITY = 'community'
}

export interface TemplateVariable {
  name: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  default?: any;
  validation?: string;
}

export interface YamlVersion {
  id: string;
  configId: string;
  version: number;
  content: string;
  changes: string;
  createdAt: Date;
  createdBy: string;
  tags: string[];
  isStable: boolean;
}

export interface YamlDiff {
  additions: DiffLine[];
  deletions: DiffLine[];
  modifications: DiffLine[];
  summary: DiffSummary;
}

export interface DiffLine {
  lineNumber: number;
  content: string;
  path: string;
}

export interface DiffSummary {
  totalChanges: number;
  additions: number;
  deletions: number;
  modifications: number;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface YamlAuditEntry {
  id: string;
  configId: string;
  action: AuditAction;
  userId: string;
  timestamp: Date;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export enum AuditAction {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  VALIDATE = 'validate',
  DEPLOY = 'deploy',
  ROLLBACK = 'rollback',
  ARCHIVE = 'archive',
  RESTORE = 'restore',
  SHARE = 'share',
  EXPORT = 'export'
}

export interface YamlGenerationResponse {
  yaml: string;
  metadata: {
    generationTime: number;
    tokensUsed: number;
    model: string;
    confidence: number;
  };
  validation: YamlValidationResult;
  suggestions: string[];
}

export interface FarmConfiguration {
  apiVersion: string;
  kind: 'Farm';
  metadata: FarmMetadata;
  spec: FarmSpec;
}

export interface FarmMetadata {
  name: string;
  namespace?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

export interface FarmSpec {
  description?: string;
  agents: AgentDefinition[];
  resources?: ResourceRequirements;
  networking?: NetworkingConfig;
  storage?: StorageConfig;
  monitoring?: MonitoringConfig;
  scaling?: ScalingConfig;
}

export interface AgentDefinition {
  name: string;
  type: string;
  replicas?: number;
  capabilities: string[];
  config?: Record<string, any>;
  resources?: ResourceRequirements;
  environment?: Record<string, string>;
  dependencies?: string[];
}

export interface ResourceRequirements {
  requests?: {
    cpu?: string;
    memory?: string;
  };
  limits?: {
    cpu?: string;
    memory?: string;
  };
}

export interface NetworkingConfig {
  type: 'internal' | 'external' | 'hybrid';
  ports?: number[];
  endpoints?: string[];
  security?: {
    tls?: boolean;
    authentication?: string;
  };
}

export interface StorageConfig {
  type: 'local' | 'distributed' | 's3' | 'custom';
  size?: string;
  persistence?: boolean;
  backups?: {
    enabled: boolean;
    schedule?: string;
    retention?: string;
  };
}

export interface MonitoringConfig {
  enabled: boolean;
  metrics?: string[];
  logging?: {
    level: 'debug' | 'info' | 'warn' | 'error';
    format: 'json' | 'text';
  };
  alerts?: AlertConfig[];
}

export interface AlertConfig {
  name: string;
  condition: string;
  threshold: number;
  action: string;
}

export interface ScalingConfig {
  enabled: boolean;
  minReplicas?: number;
  maxReplicas?: number;
  metrics?: ScalingMetric[];
}

export interface ScalingMetric {
  type: 'cpu' | 'memory' | 'custom';
  target: number;
  metric?: string;
}