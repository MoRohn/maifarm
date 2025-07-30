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
}

export interface YamlConfig {
  name: string;
  description?: string;
  initial_prompt: string;
  steps: BuildStep[];
  metadata?: {
    created_at?: string;
    author?: string;
    version?: string;
    tags?: string[];
    ai_generated?: boolean;
    [key: string]: any;
  };
}

export interface GenerationRequest {
  prompt: string;
  options?: {
    num_agents?: number;
    complexity?: 'simple' | 'moderate' | 'complex';
    farm_type?: 'development' | 'review' | 'testing' | 'analysis' | 'creative';
    include_estimates?: boolean;
    auto_dependencies?: boolean;
  };
}

export interface GenerationResponse {
  success: boolean;
  yaml?: YamlConfig;
  raw_yaml?: string;
  error?: string;
  suggestions?: string[];
  estimated_total_time?: number;
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
  generatedYaml?: YamlConfig;
  rawYaml: string;
  isGenerating: boolean;
  isValidating: boolean;
  validationResult?: ValidationResult;
  selectedTemplate?: YamlTemplate;
  history: GenerationResponse[];
}