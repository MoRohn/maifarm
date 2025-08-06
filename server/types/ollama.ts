export interface OllamaModel {
  name: string;
  model: string;
  size: number;
  digest: string;
  modified_at: string;
  details?: {
    family: string;
    families?: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export interface OllamaModelConfig {
  model: string;
  path?: string;
  isLocal: boolean;
  baseUrl?: string;
}

export interface OllamaDetectionResult {
  found: boolean;
  path?: string;
  models?: OllamaModel[];
  error?: string;
}

export interface OllamaValidationResult {
  valid: boolean;
  model?: OllamaModel;
  error?: string;
  suggestion?: string;
}

export interface OllamaDownloadInstructions {
  command: string;
  huggingFaceUrl?: string;
  estimatedSize: string;
  requirements: {
    diskSpace: string;
    memory: string;
  };
}