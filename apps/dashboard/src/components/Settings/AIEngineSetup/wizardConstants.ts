/**
 * Shared constants for AI Engine Setup Wizards
 *
 * This file centralizes all UI constants, messages, and configuration
 * to ensure consistency across all engine setup wizards.
 */

import type { EngineId, ModelOption } from './wizardTypes';

/**
 * Color schemes for each provider
 * Used for buttons, highlights, and status indicators
 */
export const PROVIDER_COLORS = {
  claude: {
    primary: 'purple-600',
    primaryHover: 'purple-700',
    light: 'purple-50',
    lightDark: 'purple-900/20',
    border: 'purple-500',
    text: 'purple-700',
    textDark: 'purple-300',
  },
  openai: {
    primary: 'blue-600',
    primaryHover: 'blue-700',
    light: 'blue-50',
    lightDark: 'blue-900/20',
    border: 'blue-500',
    text: 'blue-700',
    textDark: 'blue-300',
  },
  'gpt-oss': {
    primary: 'purple-600',
    primaryHover: 'purple-700',
    light: 'purple-50',
    lightDark: 'purple-900/20',
    border: 'purple-500',
    text: 'purple-700',
    textDark: 'purple-300',
  },
  llama: {
    primary: 'emerald-600',
    primaryHover: 'emerald-700',
    light: 'emerald-50',
    lightDark: 'emerald-900/20',
    border: 'emerald-500',
    text: 'emerald-700',
    textDark: 'emerald-300',
    // Secondary color for cloud deployment
    secondary: 'blue-600',
    secondaryHover: 'blue-700',
  },
  grok: {
    primary: 'orange-600',
    primaryHover: 'orange-700',
    light: 'orange-50',
    lightDark: 'orange-900/20',
    border: 'orange-500',
    text: 'orange-700',
    textDark: 'orange-300',
  },
} as const;

/**
 * Standard modal sizes
 */
export const MODAL_SIZES = {
  small: 'max-w-md',
  medium: 'max-w-lg',
  large: 'max-w-2xl',
  xlarge: 'max-w-4xl',
} as const;

/**
 * Modal size mapping by provider
 */
export const PROVIDER_MODAL_SIZE: Record<EngineId, keyof typeof MODAL_SIZES> = {
  claude: 'large',      // Two-column layout
  openai: 'large',      // Two-column layout
  grok: 'large',        // Two-column layout
  'gpt-oss': 'medium',  // Single-column layout
  llama: 'large',        // Two-column layout
};

/**
 * Standardized success message template
 */
export const getSuccessMessage = (provider: string): string => {
  return `${provider} is ready to power your AI agents.`;
};

/**
 * Standardized error messages
 */
export const ERROR_MESSAGES = {
  API_KEY_REQUIRED: (provider: string) => `Please enter your ${provider} API key to continue.`,
  API_KEY_INVALID: (provider: string) => `The ${provider} API key appears to be invalid. Please check and try again.`,
  API_KEY_FORMAT: (provider: string, format: string) => `${provider} API keys should start with "${format}".`,
  MODEL_REQUIRED: 'Please select a model to continue.',
  NETWORK_ERROR: 'Unable to connect. Please check your internet connection and try again.',
  SAVE_FAILED: 'Failed to save configuration. Please try again.',
  VALIDATION_FAILED: 'Please fix the errors before continuing.',
  ACKNOWLEDGMENT_REQUIRED: 'Please acknowledge the terms to continue.',
  DEPLOYMENT_REQUIRED: 'Please select a deployment option.',
} as const;

/**
 * Standardized info messages
 */
export const INFO_MESSAGES = {
  API_KEY_SECURE: 'MaiFarm securely encrypts and stores your API key. It is never shared with third parties.',
  API_KEY_USAGE: 'Your API key is only used when you create farms or run agents.',
  LOCAL_NO_KEY: 'No API key required for local deployment. MaiFarm runs the model on your machine.',
  MODEL_CHANGEABLE: 'You can change the model later from the AI Engine settings.',
} as const;

/**
 * API key format hints by provider
 */
export const API_KEY_FORMATS: Record<string, { prefix: string[]; description: string }> = {
  claude: {
    prefix: ['sk-', 'anthropic-'],
    description: 'Claude API keys start with "sk-" or "anthropic-"',
  },
  openai: {
    prefix: ['sk-'],
    description: 'OpenAI API keys start with "sk-"',
  },
  grok: {
    prefix: ['xai-', 'grok-'],
    description: 'Grok API keys start with "xai-" or "grok-"',
  },
  llama: {
    prefix: [],
    description: 'Llama runs locally - no API key required',
  },
};

/**
 * Model options by provider
 */
export const PROVIDER_MODELS: Record<string, ModelOption[]> = {
  claude: [
    {
      id: 'claude-opus-4-5-20251101',
      label: 'Claude Opus 4.5',
      description: 'Most advanced model with superior reasoning (Default)',
      recommended: true,
      contextWindow: 200000,
      features: ['200K context', 'Superior reasoning', 'Best for complex tasks', 'Latest model'],
    },
    {
      id: 'claude-sonnet-4-20250514',
      label: 'Claude Sonnet 4',
      description: 'Excellent balance of performance and speed',
      contextWindow: 200000,
      features: ['200K context', 'Fast responses', 'Great for coding'],
    },
    {
      id: 'claude-3-5-sonnet-20241022',
      label: 'Claude 3.5 Sonnet',
      description: 'Previous generation, balanced intelligence',
      contextWindow: 200000,
      features: ['200K context', 'Advanced reasoning', 'Fast responses'],
    },
    {
      id: 'claude-3-5-haiku-20241022',
      label: 'Claude 3.5 Haiku',
      description: 'Fastest model with good capabilities',
      contextWindow: 200000,
      features: ['200K context', 'Very fast', 'Cost-effective'],
    },
    {
      id: 'claude-3-opus-20240229',
      label: 'Claude 3 Opus',
      description: 'Previous generation flagship model',
      contextWindow: 200000,
      features: ['200K context', 'Best reasoning', 'Premium quality'],
    },
  ],
  openai: [
    {
      id: 'gpt-4o-mini',
      label: 'GPT-4o Mini',
      description: 'Fast and cost-effective',
      recommended: true,
      contextWindow: 128000,
      features: ['128K context', 'Very fast', 'Most affordable'],
    },
    {
      id: 'gpt-4o',
      label: 'GPT-4o',
      description: 'Advanced multimodal model',
      contextWindow: 128000,
      features: ['128K context', 'Vision support', 'Balanced performance'],
    },
    {
      id: 'gpt-4-turbo',
      label: 'GPT-4 Turbo',
      description: 'Most capable GPT-4 variant',
      contextWindow: 128000,
      features: ['128K context', 'JSON mode', 'Function calling'],
    },
  ],
  llama: [
    {
      id: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
      label: 'Llama 3.1 8B Instruct',
      description: 'Meta\'s latest instruction-tuned model',
      recommended: true,
      contextWindow: 128000,
      features: ['128K context', 'Fast', '8GB RAM minimum', 'Apache 2.0 license'],
    },
    {
      id: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
      label: 'Llama 3.1 70B Instruct',
      description: 'Most capable Llama 3.1 model',
      contextWindow: 128000,
      features: ['128K context', 'Best performance', '40GB+ RAM required'],
    },
  ],
  grok: [
    {
      id: 'grok-2',
      label: 'Grok-2',
      description: 'xAI\'s latest model with real-time knowledge',
      recommended: true,
      contextWindow: 128000,
      features: ['128K context', 'Real-time data', 'Fast responses'],
    },
    {
      id: 'grok-2-mini',
      label: 'Grok-2 Mini',
      description: 'Faster, lighter version of Grok-2',
      contextWindow: 128000,
      features: ['128K context', 'Very fast', 'Cost-effective'],
    },
  ],
};

/**
 * Documentation links by provider
 */
export const PROVIDER_DOCS: Record<string, { apiKeys: string; models: string; quickstart: string }> = {
  claude: {
    apiKeys: 'https://console.anthropic.com/settings/keys',
    models: 'https://docs.anthropic.com/claude/docs/models-overview',
    quickstart: 'https://docs.anthropic.com/claude/docs/quickstart',
  },
  openai: {
    apiKeys: 'https://platform.openai.com/api-keys',
    models: 'https://platform.openai.com/docs/models',
    quickstart: 'https://platform.openai.com/docs/quickstart',
  },
  'gpt-oss': {
    apiKeys: '',
    models: 'https://docs.maifarm.dev/engines/openai-oss',
    quickstart: 'https://docs.maifarm.dev/quickstart',
  },
  llama: {
    apiKeys: '',  // No API key needed for local models
    models: 'https://ollama.com/library/llama3.1',
    quickstart: 'https://docs.maifarm.dev/engines/llama-local',
  },
  grok: {
    apiKeys: 'https://console.x.ai/api-keys',
    models: 'https://x.ai/api',
    quickstart: 'https://docs.x.ai/docs/overview',
  },
};

/**
 * Help text for deployment options (Llama-specific)
 */
export const LLAMA_DEPLOYMENT_HELP = {
  local: {
    title: 'Local Deployment (Ollama/vLLM)',
    description: 'Run Llama 3.1 models on your own machine',
    pros: [
      'Complete privacy - data never leaves your device',
      'No API costs or usage limits',
      'Works offline once models are downloaded',
      'Apache 2.0 open source license',
    ],
    cons: [
      'Requires 8-32GB RAM depending on model size',
      'Slower inference on older hardware',
      'Manual model updates required',
    ],
  },
  cloud: {
    title: 'Cloud Deployment (DashScope)',
    description: 'Use Alibaba Cloud\'s hosted Llama service',
    pros: [
      'No local hardware requirements',
      'Faster inference with cloud GPUs',
      'Automatic model updates',
    ],
    cons: [
      'Requires API key and account',
      'Pay-per-use pricing',
      'Data sent to external service',
    ],
  },
};

/**
 * GPT-OSS installation instructions
 */
export const GPT_OSS_INSTALL_STEPS = [
  'Install Ollama from https://ollama.ai',
  'Run: ollama pull llama3.1:8b',
  'Start Ollama service',
  'MaiFarm will automatically detect and use it',
];

/**
 * Validation debounce delays (milliseconds)
 */
export const VALIDATION_DELAYS = {
  API_KEY_FORMAT: 300,      // Format check (fast)
  API_KEY_CONNECTION: 1000, // Connection test (slower)
  MODEL_COMPATIBILITY: 500, // Model validation
} as const;

/**
 * Animation durations (milliseconds)
 */
export const ANIMATION_DURATIONS = {
  MODAL_ENTER: 200,
  MODAL_EXIT: 150,
  VALIDATION_ICON: 300,
  LOADING_SPINNER: 1000,
} as const;

/**
 * Provider display names (user-friendly)
 */
export const PROVIDER_NAMES: Record<EngineId, string> = {
  claude: 'Claude',
  openai: 'OpenAI',
  grok: 'Grok',
  'gpt-oss': 'GPT-OSS',
  llama: 'Llama',
};

/**
 * LocalStorage keys for persisting selections
 */
export const STORAGE_KEYS = {
  CLAUDE_MODEL: 'claude_model',
  OPENAI_MODEL: 'openai_model',
  GROK_MODEL: 'grok_model',
  LLAMA_MODEL: 'llama_model',
  LLAMA_DEPLOYMENT: 'llama_deployment',
  GPT_OSS_ACKNOWLEDGED: 'gpt_oss_acknowledged',
} as const;
