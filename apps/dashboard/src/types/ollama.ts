export interface OllamaModel {
  name: string;
  model: string;
  size: number;
  digest: string;
  modified_at: string;
  details?: {
    format: string;
    family: string;
    families?: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export interface OllamaStatus {
  isInstalled: boolean;
  isRunning: boolean;
  modelsPath: string;
  availableModels: OllamaModel[];
  llamaModelInstalled: boolean;
  recommendedModels: RecommendedModel[];
}

export interface RecommendedModel {
  name: string;
  size: string;
  description: string;
  useCase: string;
  installed?: boolean;
}

export interface ModelValidation {
  valid: boolean;
  model?: OllamaModel;
  message?: string;
  instructions?: ModelInstructions;
  testResponse?: string;
  error?: string;
}

export interface ModelInstructions {
  installCommand: string;
  verifyCommand: string;
  documentation: string;
  prerequisites: string[];
  estimatedSize: string;
}

export interface OllamaConfiguration {
  modelName: string;
  ollamaPath?: string;
  apiUrl?: string;
  enabled: boolean;
}

export interface ModelTestResult {
  success: boolean;
  model: string;
  prompt: string;
  response?: string;
  eval_count?: number;
  eval_duration?: number;
  error?: string;
}

export interface LocalModelSetup {
  step: 'detect' | 'validate' | 'download' | 'configure' | 'test' | 'complete';
  status: 'idle' | 'loading' | 'success' | 'error';
  message?: string;
  progress?: number;
}