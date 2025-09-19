/**
 * AI Provider Types for MaiFarm
 * Supports multiple AI models including Claude and OpenAI
 */

export enum AIProvider {
  CLAUDE = 'claude',
  OPENAI = 'openai'
}

export interface AIProviderConfig {
  provider: AIProvider;
  apiKey: string;
  apiEndpoint: string;
  model: string;
  enabled: boolean;
  maxTokens?: number;
  temperature?: number;
  contextWindow?: number;
}

export interface AIProviderSettings {
  defaultProvider: AIProvider;
  providers: {
    [AIProvider.CLAUDE]: AIProviderConfig;
    [AIProvider.OPENAI]: AIProviderConfig;
  };
}

export interface FarmCreationOptionsWithProvider {
  name: string;
  description: string;
  numberOfAgents: number;
  prompt: string;
  provider: AIProvider;
  steps?: string[];
  collaborative?: boolean;
  yamlContent?: string;
  attachments?: Array<{
    path: string;
    type: 'image' | 'file';
    mimeType?: string;
  }>;
  contextFiles?: string[];
}

export interface AIProviderCapabilities {
  maxContextTokens: number;
  supportsVision: boolean;
  supportsStreaming: boolean;
  supportsFunctionCalling: boolean;
  supportsCodeExecution: boolean;
  costPerMillionTokens: {
    input: number;
    output: number;
  };
}

export const AI_PROVIDER_CAPABILITIES: Record<AIProvider, AIProviderCapabilities> = {
  [AIProvider.CLAUDE]: {
    maxContextTokens: 200000,
    supportsVision: true,
    supportsStreaming: true,
    supportsFunctionCalling: true,
    supportsCodeExecution: false,
    costPerMillionTokens: {
      input: 3,
      output: 15
    }
  },
  [AIProvider.OPENAI]: {
    maxContextTokens: 128000,
    supportsVision: true,
    supportsStreaming: true,
    supportsFunctionCalling: true,
    supportsCodeExecution: false,
    costPerMillionTokens: {
      input: 5,
      output: 15
    }
  }
};