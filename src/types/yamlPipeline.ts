/**
 * Type definitions for the production-ready YAML Pipeline
 */

import { YamlConfig, ValidationResult } from './yamlGenerator';

/**
 * YAML Version Control Types
 */
export interface YamlVersion {
  id: string;
  version: string;
  config: YamlConfig;
  rawYaml: string;
  timestamp: string;
  author: string;
  message: string;
  hash: string;
  parentHash?: string;
  tags?: string[];
  status: 'draft' | 'pending_review' | 'approved' | 'deployed' | 'archived';
}

export interface YamlDiff {
  id: string;
  fromVersion: string;
  toVersion: string;
  changes: DiffChange[];
  summary: {
    additions: number;
    deletions: number;
    modifications: number;
  };
  timestamp: string;
}

export interface DiffChange {
  type: 'addition' | 'deletion' | 'modification';
  path: string;
  lineNumber?: number;
  oldValue?: string;
  newValue?: string;
  context?: string[];
}

/**
 * YAML Validation Types
 */
export interface ValidationRule {
  id: string;
  name: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  category: 'syntax' | 'semantic' | 'security' | 'performance' | 'best-practice';
  check: (config: YamlConfig) => ValidationIssue[];
}

export interface ValidationIssue {
  ruleId: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  field?: string;
  line?: number;
  suggestion?: string;
  autoFixAvailable?: boolean;
}

export interface ExtendedValidationResult extends ValidationResult {
  issues: ValidationIssue[];
  score: number; // 0-100
  passedRules: number;
  totalRules: number;
  securityScore: number;
  performanceScore: number;
}

/**
 * YAML Optimization Types
 */
export interface OptimizationRule {
  id: string;
  name: string;
  description: string;
  category: 'performance' | 'cost' | 'security' | 'maintainability';
  optimize: (config: YamlConfig) => YamlConfig;
  impact: 'low' | 'medium' | 'high';
}

export interface OptimizationResult {
  original: YamlConfig;
  optimized: YamlConfig;
  appliedRules: string[];
  improvements: {
    performance?: number; // percentage
    cost?: number; // percentage
    security?: number; // score increase
    size?: number; // bytes reduced
  };
  suggestions: string[];
}

/**
 * Audit and Compliance Types
 */
export interface AuditEntry {
  id: string;
  timestamp: string;
  action: 'create' | 'update' | 'delete' | 'approve' | 'deploy' | 'rollback';
  yamlId: string;
  version: string;
  userId: string;
  username: string;
  details: {
    changes?: DiffChange[];
    reason?: string;
    approvers?: string[];
    deploymentId?: string;
    prompt?: string;
    message?: string;
    generatedBy?: string;
    decision?: 'approve' | 'reject';
    environment?: string;
    comment?: string;
  };
  ipAddress?: string;
  userAgent?: string;
}

export interface ApprovalWorkflow {
  id: string;
  yamlId: string;
  version: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  requiredApprovers: string[];
  currentApprovers: ApprovalRecord[];
  deadline?: string;
  rules: ApprovalRule[];
}

export interface ApprovalRecord {
  userId: string;
  username: string;
  decision: 'approve' | 'reject';
  timestamp: string;
  comment?: string;
}

export interface ApprovalRule {
  id: string;
  name: string;
  condition: 'all' | 'any' | 'majority';
  requiredCount: number;
  roles?: string[];
  users?: string[];
}

/**
 * CI/CD Integration Types
 */
export interface DeploymentConfig {
  id: string;
  yamlId: string;
  version: string;
  environment: 'development' | 'staging' | 'production';
  pipeline: 'github-actions' | 'gitlab-ci' | 'jenkins' | 'azure-devops';
  settings: {
    branch?: string;
    autoApprove?: boolean;
    rollbackOnFailure?: boolean;
    healthCheckEndpoint?: string;
    notificationChannels?: string[];
  };
}

export interface DeploymentStatus {
  id: string;
  yamlId: string;
  version: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'rolled_back';
  environment: string;
  startTime: string;
  endTime?: string;
  logs?: DeploymentLog[];
  metrics?: DeploymentMetrics;
}

export interface DeploymentLog {
  timestamp: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  stage?: string;
}

export interface DeploymentMetrics {
  duration: number; // seconds
  agentsDeployed: number;
  resourcesUsed: {
    cpu: number;
    memory: number;
    storage: number;
  };
  testsRun?: number;
  testsPassed?: number;
}

/**
 * Advanced YAML Generation Types
 */
export interface AIGenerationContext {
  previousVersions?: YamlVersion[];
  projectContext?: {
    language: string;
    framework: string;
    dependencies: string[];
    teamSize: number;
  };
  constraints?: {
    maxAgents?: number;
    maxSteps?: number;
    maxDuration?: number;
    requiredCapabilities?: string[];
  };
  preferences?: {
    style: 'verbose' | 'concise';
    complexity: 'simple' | 'moderate' | 'advanced';
    focusAreas?: string[];
  };
}

export interface GenerationFeedback {
  yamlId: string;
  version: string;
  rating: number; // 1-5
  feedback: string;
  improvements?: string[];
  timestamp: string;
  userId: string;
}

/**
 * Storage and Caching Types
 */
export interface YamlCache {
  id: string;
  config: YamlConfig;
  rawYaml: string;
  hash: string;
  createdAt: string;
  expiresAt: string;
  accessCount: number;
  lastAccessed: string;
}

export interface YamlStorageMetadata {
  totalVersions: number;
  totalSize: number; // bytes
  oldestVersion: string;
  newestVersion: string;
  mostUsedTemplate?: string;
  averageGenerationTime?: number;
}