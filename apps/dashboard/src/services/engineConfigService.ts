/**
 * Engine Configuration Service
 *
 * This service provides a unified abstraction layer for configuring AI engines,
 * handling both the new unified API endpoints and legacy endpoints for backward compatibility.
 */

import type {
  EngineId,
  EngineConfigResult,
  ValidationResult,
} from '../components/Settings/AIEngineSetup/wizardTypes';

// API Base URL
const API_BASE = '/api';

/**
 * Configure an AI engine using the unified endpoint
 */
export async function configureEngine(
  provider: EngineId,
  config: {
    apiKey?: string;
    model?: string;
    config?: Record<string, any>;
  }
): Promise<EngineConfigResult> {
  try {
    const response = await fetch(`${API_BASE}/engines/${provider}/configure`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to configure engine');
    }

    const data = await response.json();

    return {
      provider,
      configured: data.engine?.configured || true,
      model: data.engine?.model || config.model,
      apiKey: config.apiKey,
      config: config.config,
    };
  } catch (error) {
    console.error(`[engineConfigService] Failed to configure ${provider}:`, error);
    throw error;
  }
}

/**
 * Validate an API key without storing it
 */
export async function validateApiKey(
  provider: EngineId,
  apiKey: string
): Promise<ValidationResult> {
  try {
    const response = await fetch(`${API_BASE}/engines/${provider}/validate-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ apiKey }),
    });

    if (!response.ok) {
      const error = await response.json();
      return {
        valid: false,
        message: error.error || 'Validation failed',
        details: {
          format: false,
          connection: false,
        },
      };
    }

    const data: ValidationResult = await response.json();
    return data;
  } catch (error) {
    console.error(`[engineConfigService] Failed to validate ${provider} API key:`, error);
    return {
      valid: false,
      message: 'Network error during validation',
      details: {
        format: false,
        connection: false,
      },
    };
  }
}

/**
 * Get engine configuration status
 */
export async function getEngineStatus(provider: EngineId): Promise<{
  configured: boolean;
  hasApiKey: boolean;
  isLocal: boolean;
  storedConfig?: {
    name: string;
    createdAt: string;
    lastUsed: string;
  };
}> {
  try {
    const response = await fetch(`${API_BASE}/engines/${provider}/status`);

    if (!response.ok) {
      throw new Error('Failed to fetch engine status');
    }

    const data = await response.json();
    return {
      configured: data.configured || false,
      hasApiKey: data.hasApiKey || false,
      isLocal: data.isLocal || false,
      storedConfig: data.storedConfig,
    };
  } catch (error) {
    console.error(`[engineConfigService] Failed to get ${provider} status:`, error);
    return {
      configured: false,
      hasApiKey: false,
      isLocal: provider === 'gpt-oss',
    };
  }
}

/**
 * LEGACY: Configure Claude (backward compatibility)
 * Redirects to new unified endpoint
 */
export async function configureClaude(apiKey: string, model: string): Promise<void> {
  await configureEngine('claude', { apiKey, model });
}

/**
 * LEGACY: Configure OpenAI (backward compatibility)
 * Redirects to new unified endpoint
 */
export async function configureOpenAI(apiKey: string, model: string): Promise<void> {
  await configureEngine('openai', { apiKey, model });
}

/**
 * LEGACY: Configure GPT-OSS (backward compatibility)
 * Redirects to new unified endpoint
 */
export async function configureGptOss(): Promise<void> {
  await configureEngine('gpt-oss', {
    config: { acknowledged: true },
  });
}

/**
 * LEGACY: Configure Llama (backward compatibility)
 * Redirects to new unified endpoint
 */
export async function configureLlama(config: {
  useLocal: boolean;
  apiKey?: string;
  model?: string;
}): Promise<void> {
  await configureEngine('llama', {
    apiKey: config.apiKey,
    model: config.model,
    config: { useLocal: config.useLocal },
  });
}

/**
 * Debounced validation helper
 * Useful for real-time validation as user types
 */
export function createDebouncedValidator(
  provider: EngineId,
  delay: number = 500
): (apiKey: string) => Promise<ValidationResult> {
  let timeoutId: NodeJS.Timeout | null = null;

  return (apiKey: string): Promise<ValidationResult> => {
    return new Promise((resolve) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(async () => {
        const result = await validateApiKey(provider, apiKey);
        resolve(result);
      }, delay);
    });
  };
}

/**
 * Export default service object
 */
export const engineConfigService = {
  configure: configureEngine,
  validateApiKey,
  getStatus: getEngineStatus,

  // Legacy methods (backward compatible)
  configureClaude,
  configureOpenAI,
  configureGptOss,
  configureLlama,

  // Utilities
  createDebouncedValidator,
};

export default engineConfigService;
