/**
 * Types for the AI-powered YAML Generator
 */

export interface BuildStep {
  number: number;
  content: string;
  description?: string;
  estimated_time?: number; // in minutes
  dependencies?: number[];
  tags?: string[];
  details?: string; // Additional detailed information about the step
}

export interface AgentDefinition {
  name: string;
  type: string;
  role?: string;
  capabilities?: string[];
  tasks?: string[];
  specialization?: string;
}

export interface YamlConfig {
  name: string;
  description?: string;
  initial_prompt: string;
  agents: AgentDefinition[];
  steps: BuildStep[];
  config?: {
    autoScale?: boolean;
    maxAgents?: number;
    timeout?: number;
    coordination?: 'sequential' | 'collaborative';
    stagger?: number;
    bundle_steps?: number;
  };
  metadata?: {
    created_at?: string;
    author?: string;
    version?: string;
    tags?: string[];
    ai_generated?: boolean;
    num_agents?: number;
    purpose?: string;
    complexity?: string;
    [key: string]: any;
  };
}

export interface GenerationRequest {
  prompt: string;
  mode?: GeneratorMode;
  options?: {
    num_agents?: number;
    complexity?: 'simple' | 'moderate' | 'complex';
    farm_type?: 'development' | 'review' | 'testing' | 'analysis' | 'creative';
    include_estimates?: boolean;
    auto_dependencies?: boolean;
    enhance_prompt?: boolean;
  };
}

export interface PromptEnhancementRequest {
  prompt: string;
  context?: string;
  purpose?: string;
  suggestions?: boolean;
}

export interface PromptEnhancementResponse {
  success: boolean;
  enhanced_prompt?: string;
  original_prompt?: string;
  suggestions?: string[];
  improvements?: string[];
  error?: string;
}

export interface GenerationResponse {
  success: boolean;
  yaml?: YamlConfig;
  raw_yaml?: string;
  error?: string;
  suggestions?: string[];
  estimated_total_time?: number;
  timestamp?: Date;
}

export interface DiffChange {
  type: 'addition' | 'deletion' | 'modification';
  path: string;
  oldValue?: any;
  newValue?: any;
  description?: string;
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  farmId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, any>;
  timestamp: Date;
  success: boolean;
  errorMessage?: string;
  changes?: DiffChange[];
  reason?: string;
  approvers?: string[];
  deploymentId?: string;
  workflowId?: string;
  prompt?: string;
  message?: string;
  generatedBy?: string;
  decision?: 'approve' | 'reject';
  environment?: string;
  commitHash?: string;
  version?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: string[];
}

export interface ValidationError {
  field: string;
  message: string;
  line?: number;
}

export interface ValidationWarning {
  field: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
}

export interface YamlTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  template: Partial<YamlConfig>;
  variables?: TemplateVariable[];
  examples?: string[];
}

export interface TemplateVariable {
  name: string;
  description: string;
  type: 'string' | 'number' | 'array' | 'boolean';
  default?: any;
  required?: boolean;
}

export interface GeneratorStats {
  total_generated: number;
  success_rate: number;
  average_steps: number;
  popular_types: { [key: string]: number };
  recent_prompts: RecentPrompt[];
}

export interface RecentPrompt {
  prompt: string;
  timestamp: string;
  success: boolean;
  farm_name?: string;
}

export type GeneratorMode = 'guided' | 'freestyle' | 'template';

export interface GeneratorState {
  mode: GeneratorMode;
  currentPrompt: string;
  enhancedPrompt?: string;
  isEnhancing?: boolean;
  showEnhancedPrompt?: boolean;
  generatedYaml?: YamlConfig;
  rawYaml: string;
  isGenerating: boolean;
  isValidating: boolean;
  validationResult?: ValidationResult;
  selectedTemplate?: YamlTemplate;
  history: GenerationResponse[];
}