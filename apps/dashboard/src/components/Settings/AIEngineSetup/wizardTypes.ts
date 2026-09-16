/**
 * Shared TypeScript types for AI Engine Setup Wizards
 *
 * This file provides standardized type definitions to ensure consistency
 * across all engine configuration wizards while maintaining backward compatibility.
 */

export type EngineId = 'claude' | 'openai' | 'grok' | 'gpt-oss' | 'llama';

export type DeploymentType = 'local' | 'cloud';

/**
 * Standardized configuration result (NEW - recommended)
 * Use this for new implementations and gradually migrate existing code.
 */
export interface EngineConfigResult {
  /** Engine provider identifier */
  provider: EngineId;

  /** Whether the engine is successfully configured */
  configured: boolean;

  /** Selected AI model (if applicable) */
  model?: string;

  /** API key (sensitive - handle with care) */
  apiKey?: string;

  /** Provider-specific configuration */
  config?: {
    /** For Llama: local vs cloud deployment */
    useLocal?: boolean;
    deployment?: DeploymentType;

    /** For GPT-OSS: user acknowledgment */
    acknowledged?: boolean;

    /** Additional custom settings */
    [key: string]: any;
  };
}

/**
 * Real-time validation result from API
 */
export interface ValidationResult {
  /** Whether the API key is valid */
  valid: boolean;

  /** Human-readable message */
  message: string;

  /** Detailed validation breakdown */
  details?: {
    /** Format check (e.g., starts with sk-) */
    format: boolean;

    /** Connection test passed */
    connection: boolean;

    /** Available permissions/scopes */
    permissions?: string[];

    /** Rate limit information */
    rateLimit?: {
      remaining: number;
      total: number;
    };
  };
}

/**
 * Model option for selection UI
 */
export interface ModelOption {
  /** Unique model identifier */
  id: string;

  /** Display label */
  label: string;

  /** Optional description (shown in tooltip or subtext) */
  description?: string;

  /** Whether this is the recommended/default option */
  recommended?: boolean;

  /** Model capabilities/features */
  features?: string[];

  /** Context window size */
  contextWindow?: number;
}

/**
 * Wizard step configuration (for future multi-step wizards)
 */
export interface WizardStep {
  id: string;
  title: string;
  description?: string;
  validate?: () => Promise<boolean>;
}

/**
 * Base props for all wizard components
 */
export interface BaseWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Legacy callback signature (DEPRECATED but still supported)
 * Used by Claude and OpenAI wizards
 */
export type LegacyApiKeyCallback = (apiKey: string, model: string) => void;

/**
 * Legacy config callback signature (DEPRECATED but still supported)
 * Used by GPT-OSS and Llama wizards
 */
export type LegacyConfigCallback = (config: Record<string, any>) => void;

/**
 * Modern callback signature (RECOMMENDED)
 */
export type ModernCallback = (result: EngineConfigResult) => void;

/**
 * Union type for backward-compatible callbacks
 * Wizards can accept either old or new signature
 */
export type WizardCallback = LegacyApiKeyCallback | LegacyConfigCallback | ModernCallback;

/**
 * Helper function to detect callback type and call appropriately
 */
export function invokeCallback(
  callback: WizardCallback,
  result: EngineConfigResult
): void {
  // Try modern callback first (checks for EngineConfigResult parameter)
  if (callback.length === 1) {
    (callback as ModernCallback)(result);
    return;
  }

  // Fall back to legacy signatures
  if (result.apiKey && result.model) {
    // Legacy API key + model callback (Claude, OpenAI)
    (callback as LegacyApiKeyCallback)(result.apiKey, result.model);
  } else if (result.config) {
    // Legacy config callback (GPT-OSS, Llama)
    (callback as LegacyConfigCallback)(result.config);
  } else {
    // Fallback: call as modern callback
    (callback as ModernCallback)(result);
  }
}

/**
 * Loading state for wizard operations
 */
export interface WizardLoadingState {
  /** Whether a save/configure operation is in progress */
  saving: boolean;

  /** Whether API key validation is in progress */
  validating: boolean;

  /** Whether models are being fetched */
  loadingModels: boolean;
}

/**
 * Wizard validation state
 */
export interface WizardValidationState {
  /** API key validation result */
  apiKey?: ValidationResult;

  /** Model selection validation */
  model?: {
    valid: boolean;
    message: string;
  };

  /** Form-level validation errors */
  errors: string[];
}
