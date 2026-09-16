/**
 * AI Engine Management Service
 * Handles version checking, model management, and engine upgrades for AI providers
 *
 * Features:
 * - Check for available engine versions
 * - List available models for each provider
 * - Validate model compatibility
 * - Upgrade engine versions
 * - Change active models
 *
 * @module AIEngineManagementService
 */

import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';
import { logger, LogCategory } from '../utils/logger';
import { aiProviderManager } from '../config/aiProviders';
import { db } from '../database/connection';
import {
  AIEngineVersion,
  AIModelInfo,
  AIModelCapability,
  EngineUpgradeRequest,
  EngineUpgradeResponse,
  EngineUpgradeStep,
  ModelChangeRequest,
  ModelChangeResponse,
  ModelCompatibilityIssue,
  AvailableModelsResponse,
  ModelFilter
} from '../types/ai';

/**
 * Claude Models Database
 * Updated as of January 2026 - Includes Opus 4.5 as default
 */
const CLAUDE_MODELS: AIModelInfo[] = [
  {
    id: 'claude-opus-4-5-20251101',
    name: 'claude-opus-4-5-20251101',
    displayName: 'Claude Opus 4.5',
    provider: 'claude',
    version: '4.5',
    releaseDate: '2025-11-01',
    isDefault: true,
    isDeprecated: false,
    maxTokens: 16384,
    contextWindow: 200000,
    costPer1kPromptTokens: 15.0,
    costPer1kCompletionTokens: 75.0,
    capabilities: [
      'text-generation',
      'code-generation',
      'vision',
      'function-calling',
      'json-mode',
      'streaming',
      'extended-thinking',
      'computer-use',
      'mcp'
    ],
    description: 'Most advanced Claude model with superior reasoning and extended thinking',
    performanceProfile: {
      speed: 'medium',
      quality: 'premium',
      costEfficiency: 'premium'
    }
  },
  {
    id: 'claude-sonnet-4-20250514',
    name: 'claude-sonnet-4-20250514',
    displayName: 'Claude Sonnet 4',
    provider: 'claude',
    version: '4.0',
    releaseDate: '2025-05-14',
    isDefault: false,
    isDeprecated: false,
    maxTokens: 16384,
    contextWindow: 200000,
    costPer1kPromptTokens: 3.0,
    costPer1kCompletionTokens: 15.0,
    capabilities: [
      'text-generation',
      'code-generation',
      'vision',
      'function-calling',
      'json-mode',
      'streaming',
      'extended-thinking',
      'computer-use'
    ],
    description: 'Excellent balance of performance, speed and cost',
    performanceProfile: {
      speed: 'fast',
      quality: 'high',
      costEfficiency: 'balanced'
    }
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'claude-3-5-sonnet-20241022',
    displayName: 'Claude 3.5 Sonnet (Oct 2024)',
    provider: 'claude',
    version: '3.5',
    releaseDate: '2024-10-22',
    isDefault: false,
    isDeprecated: false,
    maxTokens: 8192,
    contextWindow: 200000,
    costPer1kPromptTokens: 3.0,
    costPer1kCompletionTokens: 15.0,
    capabilities: [
      'text-generation',
      'code-generation',
      'vision',
      'function-calling',
      'json-mode',
      'streaming',
      'extended-thinking'
    ],
    description: 'Previous generation model with extended thinking capabilities',
    performanceProfile: {
      speed: 'medium',
      quality: 'high',
      costEfficiency: 'balanced'
    }
  },
  {
    id: 'claude-3-5-haiku-20241022',
    name: 'claude-3-5-haiku-20241022',
    displayName: 'Claude 3.5 Haiku',
    provider: 'claude',
    version: '3.5',
    releaseDate: '2024-10-22',
    isDefault: false,
    isDeprecated: false,
    maxTokens: 8192,
    contextWindow: 200000,
    costPer1kPromptTokens: 0.25,
    costPer1kCompletionTokens: 1.25,
    capabilities: [
      'text-generation',
      'code-generation',
      'vision',
      'function-calling',
      'json-mode',
      'streaming'
    ],
    description: 'Fastest and most cost-effective Claude model',
    performanceProfile: {
      speed: 'fast',
      quality: 'standard',
      costEfficiency: 'budget'
    }
  },
  {
    id: 'claude-3-opus-20240229',
    name: 'claude-3-opus-20240229',
    displayName: 'Claude 3 Opus',
    provider: 'claude',
    version: '3.0',
    releaseDate: '2024-02-29',
    isDefault: false,
    isDeprecated: false,
    maxTokens: 4096,
    contextWindow: 200000,
    costPer1kPromptTokens: 15.0,
    costPer1kCompletionTokens: 75.0,
    capabilities: [
      'text-generation',
      'code-generation',
      'vision',
      'function-calling',
      'streaming'
    ],
    description: 'Previous generation flagship model',
    performanceProfile: {
      speed: 'slow',
      quality: 'premium',
      costEfficiency: 'premium'
    }
  }
];

/**
 * OpenAI Models Database
 * Updated as of January 2026 - Includes GPT-4o and o1 reasoning models
 */
const OPENAI_MODELS: AIModelInfo[] = [
  {
    id: 'gpt-4o',
    name: 'gpt-4o',
    displayName: 'GPT-4o',
    provider: 'openai',
    version: '4o',
    releaseDate: '2024-05-13',
    isDefault: true,
    isDeprecated: false,
    maxTokens: 16384,
    contextWindow: 128000,
    costPer1kPromptTokens: 2.5,
    costPer1kCompletionTokens: 10.0,
    capabilities: [
      'text-generation',
      'code-generation',
      'vision',
      'function-calling',
      'json-mode',
      'streaming',
      'audio'
    ],
    description: 'Flagship multimodal model with text, vision, and audio',
    performanceProfile: {
      speed: 'fast',
      quality: 'premium',
      costEfficiency: 'balanced'
    }
  },
  {
    id: 'gpt-4o-mini',
    name: 'gpt-4o-mini',
    displayName: 'GPT-4o Mini',
    provider: 'openai',
    version: '4o',
    releaseDate: '2024-07-18',
    isDefault: false,
    isDeprecated: false,
    maxTokens: 16384,
    contextWindow: 128000,
    costPer1kPromptTokens: 0.15,
    costPer1kCompletionTokens: 0.6,
    capabilities: [
      'text-generation',
      'code-generation',
      'vision',
      'function-calling',
      'json-mode',
      'streaming'
    ],
    description: 'Fast and affordable multimodal model',
    performanceProfile: {
      speed: 'fast',
      quality: 'high',
      costEfficiency: 'budget'
    }
  },
  {
    id: 'o1',
    name: 'o1',
    displayName: 'o1',
    provider: 'openai',
    version: 'o1',
    releaseDate: '2024-12-17',
    isDefault: false,
    isDeprecated: false,
    maxTokens: 100000,
    contextWindow: 200000,
    costPer1kPromptTokens: 15.0,
    costPer1kCompletionTokens: 60.0,
    capabilities: [
      'text-generation',
      'code-generation',
      'vision',
      'function-calling',
      'streaming',
      'deep-reasoning'
    ],
    description: 'Advanced reasoning model with extended thinking capabilities',
    performanceProfile: {
      speed: 'slow',
      quality: 'premium',
      costEfficiency: 'premium'
    }
  },
  {
    id: 'o1-mini',
    name: 'o1-mini',
    displayName: 'o1 Mini',
    provider: 'openai',
    version: 'o1',
    releaseDate: '2024-09-12',
    isDefault: false,
    isDeprecated: false,
    maxTokens: 65536,
    contextWindow: 128000,
    costPer1kPromptTokens: 3.0,
    costPer1kCompletionTokens: 12.0,
    capabilities: [
      'text-generation',
      'code-generation',
      'function-calling',
      'streaming',
      'deep-reasoning'
    ],
    description: 'Cost-effective reasoning model for coding and STEM tasks',
    performanceProfile: {
      speed: 'medium',
      quality: 'high',
      costEfficiency: 'balanced'
    }
  },
  {
    id: 'gpt-4-turbo',
    name: 'gpt-4-turbo',
    displayName: 'GPT-4 Turbo',
    provider: 'openai',
    version: '4.0',
    releaseDate: '2024-04-09',
    isDefault: false,
    isDeprecated: false,
    maxTokens: 4096,
    contextWindow: 128000,
    costPer1kPromptTokens: 10.0,
    costPer1kCompletionTokens: 30.0,
    capabilities: [
      'text-generation',
      'code-generation',
      'vision',
      'function-calling',
      'json-mode',
      'streaming'
    ],
    description: 'GPT-4 Turbo with vision and JSON mode',
    performanceProfile: {
      speed: 'fast',
      quality: 'premium',
      costEfficiency: 'balanced'
    }
  },
  {
    id: 'gpt-4o-mini-2024-07-18',
    name: 'gpt-4o-mini-2024-07-18',
    displayName: 'GPT-4o Mini (Jul 2024)',
    provider: 'openai',
    version: '4o',
    releaseDate: '2024-07-18',
    isDefault: false,
    isDeprecated: false,
    maxTokens: 16384,
    contextWindow: 128000,
    costPer1kPromptTokens: 0.15,
    costPer1kCompletionTokens: 0.6,
    capabilities: [
      'text-generation',
      'code-generation',
      'vision',
      'function-calling',
      'json-mode',
      'streaming'
    ],
    description: 'Snapshot of GPT-4o Mini from July 2024',
    performanceProfile: {
      speed: 'fast',
      quality: 'high',
      costEfficiency: 'budget'
    }
  }
];

/**
 * Grok Models Database (xAI)
 * Updated as of January 2026
 */
const GROK_MODELS: AIModelInfo[] = [
  {
    id: 'grok-2',
    name: 'grok-2',
    displayName: 'Grok-2',
    provider: 'grok',
    version: '2.0',
    releaseDate: '2024-12-01',
    isDefault: true,
    isDeprecated: false,
    maxTokens: 8192,
    contextWindow: 128000,
    costPer1kPromptTokens: 2.0,
    costPer1kCompletionTokens: 10.0,
    capabilities: [
      'text-generation',
      'code-generation',
      'function-calling',
      'json-mode',
      'streaming'
    ],
    description: 'xAI flagship model with real-time data access',
    performanceProfile: {
      speed: 'fast',
      quality: 'premium',
      costEfficiency: 'balanced'
    }
  },
  {
    id: 'grok-2-vision',
    name: 'grok-2-vision',
    displayName: 'Grok-2 Vision',
    provider: 'grok',
    version: '2.0',
    releaseDate: '2024-12-01',
    isDefault: false,
    isDeprecated: false,
    maxTokens: 8192,
    contextWindow: 128000,
    costPer1kPromptTokens: 5.0,
    costPer1kCompletionTokens: 15.0,
    capabilities: [
      'text-generation',
      'code-generation',
      'vision',
      'function-calling',
      'json-mode',
      'streaming'
    ],
    description: 'Grok-2 with vision capabilities for image understanding',
    performanceProfile: {
      speed: 'medium',
      quality: 'premium',
      costEfficiency: 'balanced'
    }
  },
  {
    id: 'grok-2-mini',
    name: 'grok-2-mini',
    displayName: 'Grok-2 Mini',
    provider: 'grok',
    version: '2.0',
    releaseDate: '2024-12-01',
    isDefault: false,
    isDeprecated: false,
    maxTokens: 8192,
    contextWindow: 128000,
    costPer1kPromptTokens: 0.5,
    costPer1kCompletionTokens: 2.0,
    capabilities: [
      'text-generation',
      'code-generation',
      'function-calling',
      'json-mode',
      'streaming'
    ],
    description: 'Cost-effective Grok model for lighter workloads',
    performanceProfile: {
      speed: 'fast',
      quality: 'high',
      costEfficiency: 'budget'
    }
  }
];

/**
 * Gemini Models Database (Google AI)
 * Updated as of January 2026
 */
const GEMINI_MODELS: AIModelInfo[] = [
  {
    id: 'gemini-1.5-pro',
    name: 'gemini-1.5-pro',
    displayName: 'Gemini 1.5 Pro',
    provider: 'gemini',
    version: '1.5',
    releaseDate: '2024-05-14',
    isDefault: true,
    isDeprecated: false,
    maxTokens: 8192,
    contextWindow: 1000000,  // 1M tokens
    costPer1kPromptTokens: 1.25,
    costPer1kCompletionTokens: 5.0,
    capabilities: [
      'text-generation',
      'code-generation',
      'vision',
      'function-calling',
      'json-mode',
      'streaming',
      'audio',
      'video'
    ],
    description: 'Advanced multimodal model with 1M token context window',
    performanceProfile: {
      speed: 'medium',
      quality: 'premium',
      costEfficiency: 'balanced'
    }
  },
  {
    id: 'gemini-1.5-flash',
    name: 'gemini-1.5-flash',
    displayName: 'Gemini 1.5 Flash',
    provider: 'gemini',
    version: '1.5',
    releaseDate: '2024-05-14',
    isDefault: false,
    isDeprecated: false,
    maxTokens: 8192,
    contextWindow: 1000000,
    costPer1kPromptTokens: 0.075,
    costPer1kCompletionTokens: 0.3,
    capabilities: [
      'text-generation',
      'code-generation',
      'vision',
      'function-calling',
      'json-mode',
      'streaming'
    ],
    description: 'Fast and efficient model for high-volume tasks',
    performanceProfile: {
      speed: 'fast',
      quality: 'high',
      costEfficiency: 'budget'
    }
  },
  {
    id: 'gemini-2.0-flash',
    name: 'gemini-2.0-flash',
    displayName: 'Gemini 2.0 Flash',
    provider: 'gemini',
    version: '2.0',
    releaseDate: '2024-12-11',
    isDefault: false,
    isDeprecated: false,
    maxTokens: 8192,
    contextWindow: 1000000,
    costPer1kPromptTokens: 0.1,
    costPer1kCompletionTokens: 0.4,
    capabilities: [
      'text-generation',
      'code-generation',
      'vision',
      'function-calling',
      'json-mode',
      'streaming',
      'audio',
      'agentic'
    ],
    description: 'Latest Gemini model with agentic capabilities',
    performanceProfile: {
      speed: 'fast',
      quality: 'high',
      costEfficiency: 'budget'
    }
  },
  {
    id: 'gemini-2.0-flash-thinking',
    name: 'gemini-2.0-flash-thinking',
    displayName: 'Gemini 2.0 Flash Thinking',
    provider: 'gemini',
    version: '2.0',
    releaseDate: '2024-12-19',
    isDefault: false,
    isDeprecated: false,
    maxTokens: 8192,
    contextWindow: 1000000,
    costPer1kPromptTokens: 0.1,
    costPer1kCompletionTokens: 0.4,
    capabilities: [
      'text-generation',
      'code-generation',
      'vision',
      'streaming',
      'deep-reasoning'
    ],
    description: 'Gemini with extended thinking for complex reasoning',
    performanceProfile: {
      speed: 'medium',
      quality: 'premium',
      costEfficiency: 'balanced'
    }
  }
];

/**
 * AI Engine Management Service
 */
class AIEngineManagementService extends EventEmitter {
  private static instance: AIEngineManagementService;
  private claudeClient: AxiosInstance;
  private openaiClient: AxiosInstance;

  private constructor() {
    super();

    // Initialize API clients
    this.claudeClient = axios.create({
      baseURL: 'https://api.anthropic.com/v1',
      timeout: 10000,
      headers: {
        'anthropic-version': '2023-06-01'
      }
    });

    this.openaiClient = axios.create({
      baseURL: 'https://api.openai.com/v1',
      timeout: 10000
    });

    logger.info(LogCategory.SYSTEM, 'AIEngineManagementService initialized');
  }

  public static getInstance(): AIEngineManagementService {
    if (!AIEngineManagementService.instance) {
      AIEngineManagementService.instance = new AIEngineManagementService();
    }
    return AIEngineManagementService.instance;
  }

  /**
   * Get current engine version for a provider
   */
  public async getCurrentVersion(provider: 'claude' | 'openai'): Promise<AIEngineVersion> {
    try {
      if (provider === 'claude') {
        return this.getClaudeVersion();
      } else {
        return this.getOpenAIVersion();
      }
    } catch (error) {
      logger.error(LogCategory.SYSTEM, `Failed to get current version for ${provider}:`, error);
      throw error;
    }
  }

  /**
   * Get Claude API version information
   */
  private getClaudeVersion(): AIEngineVersion {
    // Claude uses date-based API versioning
    const currentVersion = '2023-06-01';
    const latestVersion = '2024-01-15'; // This would be fetched from Anthropic's API in production

    return {
      current: currentVersion,
      latest: latestVersion,
      releaseDate: '2024-01-15',
      isDeprecated: currentVersion !== latestVersion,
      updateAvailable: currentVersion !== latestVersion,
      changelogUrl: 'https://docs.anthropic.com/claude/reference/versions',
      migrationGuideUrl: 'https://docs.anthropic.com/claude/reference/versioning-guide'
    };
  }

  /**
   * Get OpenAI API version information
   */
  private getOpenAIVersion(): AIEngineVersion {
    // OpenAI uses v1 API with model-based versioning
    const currentVersion = 'v1';
    const latestVersion = 'v1';

    return {
      current: currentVersion,
      latest: latestVersion,
      releaseDate: '2024-01-01',
      isDeprecated: false,
      updateAvailable: false,
      changelogUrl: 'https://platform.openai.com/docs/api-reference/introduction',
      migrationGuideUrl: 'https://platform.openai.com/docs/guides/migration'
    };
  }

  /**
   * Get available models for a provider
   */
  public async getAvailableModels(
    provider: 'claude' | 'openai' | 'grok' | 'gemini',
    filter?: ModelFilter
  ): Promise<AvailableModelsResponse> {
    try {
      const models = provider === 'claude'
        ? [...CLAUDE_MODELS]
        : provider === 'grok'
          ? [...GROK_MODELS]
          : provider === 'gemini'
            ? [...GEMINI_MODELS]
            : [...OPENAI_MODELS];

      // Apply filters
      let filteredModels = models;

      if (filter) {
        if (filter.includeDeprecated === false) {
          filteredModels = filteredModels.filter(m => !m.isDeprecated);
        }

        if (filter.capabilities && filter.capabilities.length > 0) {
          filteredModels = filteredModels.filter(m =>
            filter.capabilities!.every(cap => m.capabilities.includes(cap))
          );
        }

        if (filter.minContextWindow) {
          filteredModels = filteredModels.filter(m =>
            m.contextWindow >= filter.minContextWindow!
          );
        }

        if (filter.maxCostPerRequest) {
          filteredModels = filteredModels.filter(m => {
            const estimatedCost = (m.costPer1kPromptTokens * 1) + (m.costPer1kCompletionTokens * 1);
            return estimatedCost <= filter.maxCostPerRequest!;
          });
        }
      }

      // Get current model from provider config
      const currentConfig = aiProviderManager.getProvider(
        provider === 'claude' ? 'claude' : 'openai'
      );

      // Find recommended model (latest non-deprecated with good performance)
      const recommendedModel = filteredModels
        .filter(m => !m.isDeprecated)
        .sort((a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime())
        [0]?.id;

      return {
        provider,
        currentModel: currentConfig.model,
        models: filteredModels,
        recommendedModel,
        filters: filter
      };
    } catch (error) {
      logger.error(LogCategory.SYSTEM, `Failed to get available models for ${provider}:`, error);
      throw error;
    }
  }

  /**
   * Change the active model for a provider
   */
  public async changeModel(request: ModelChangeRequest): Promise<ModelChangeResponse> {
    const { provider, modelId, validateCompatibility = true } = request;

    try {
      // Get available models
      const availableModels = await this.getAvailableModels(provider);
      const targetModel = availableModels.models.find(m => m.id === modelId);

      if (!targetModel) {
        throw new Error(`Model ${modelId} not found for provider ${provider}`);
      }

      if (targetModel.isDeprecated) {
        logger.warn(LogCategory.SYSTEM, `Model ${modelId} is deprecated`);
      }

      // Get current configuration
      const currentConfig = aiProviderManager.getProvider(
        provider === 'claude' ? 'claude' : 'openai'
      );
      const previousModel = currentConfig.model;

      // Validate compatibility if requested
      const compatibilityIssues: ModelCompatibilityIssue[] = [];

      if (validateCompatibility) {
        const issues = await this.validateModelCompatibility(provider, modelId);
        compatibilityIssues.push(...issues);
      }

      // Check for critical compatibility issues
      const criticalIssues = compatibilityIssues.filter(i => i.type === 'error');
      if (criticalIssues.length > 0) {
        return {
          success: false,
          provider,
          previousModel,
          newModel: modelId,
          warnings: compatibilityIssues.filter(i => i.type === 'warning').map(i => i.message),
          requiresRestart: false,
          compatibilityIssues
        };
      }

      // Update model in database
      await this.updateModelInDatabase(provider, modelId);

      // Update environment variable
      if (provider === 'claude') {
        process.env.CLAUDE_MODEL = modelId;
      } else {
        process.env.OPENAI_MODEL = modelId;
      }

      // Emit event
      this.emit('model:changed', {
        provider,
        previousModel,
        newModel: modelId
      });

      logger.info(LogCategory.SYSTEM, `Model changed for ${provider}: ${previousModel} -> ${modelId}`);

      return {
        success: true,
        provider,
        previousModel,
        newModel: modelId,
        warnings: compatibilityIssues.filter(i => i.type === 'warning').map(i => i.message),
        requiresRestart: true, // Model change requires restart to take effect
        compatibilityIssues
      };

    } catch (error) {
      logger.error(LogCategory.SYSTEM, `Failed to change model for ${provider}:`, error);
      throw error;
    }
  }

  /**
   * Validate model compatibility with current configuration
   */
  private async validateModelCompatibility(
    provider: 'claude' | 'openai' | 'grok' | 'gemini',
    modelId: string
  ): Promise<ModelCompatibilityIssue[]> {
    const issues: ModelCompatibilityIssue[] = [];
    const models = provider === 'claude'
      ? CLAUDE_MODELS
      : provider === 'grok'
        ? GROK_MODELS
        : provider === 'gemini'
          ? GEMINI_MODELS
          : OPENAI_MODELS;
    const model = models.find(m => m.id === modelId);

    if (!model) {
      issues.push({
        type: 'error',
        feature: 'model-exists',
        message: `Model ${modelId} not found`,
        resolution: 'Select a valid model from the available models list'
      });
      return issues;
    }

    // Check deprecation
    if (model.isDeprecated) {
      issues.push({
        type: 'warning',
        feature: 'deprecation',
        message: `Model ${modelId} is deprecated`,
        resolution: model.deprecationDate
          ? `This model will be removed on ${model.deprecationDate}. Consider upgrading to a newer model.`
          : 'Consider upgrading to a newer model'
      });
    }

    // Check if context window is smaller than current
    const currentConfig = aiProviderManager.getProvider(
      provider === 'claude' ? 'claude' : 'openai'
    );

    if (model.contextWindow < (currentConfig.contextWindow || 0)) {
      issues.push({
        type: 'warning',
        feature: 'context-window',
        message: `New model has smaller context window (${model.contextWindow} vs ${currentConfig.contextWindow})`,
        resolution: 'Ensure your prompts fit within the new context window size'
      });
    }

    return issues;
  }

  /**
   * Upgrade engine version
   */
  public async upgradeEngine(request: EngineUpgradeRequest): Promise<EngineUpgradeResponse> {
    const { provider, targetVersion, forceUpgrade = false, backupConfig = true } = request;

    const steps: EngineUpgradeStep[] = [
      { step: 1, name: 'Validate target version', status: 'pending' },
      { step: 2, name: 'Backup current configuration', status: 'pending' },
      { step: 3, name: 'Check API compatibility', status: 'pending' },
      { step: 4, name: 'Update API version', status: 'pending' },
      { step: 5, name: 'Verify upgrade', status: 'pending' }
    ];

    try {
      const currentVersion = await this.getCurrentVersion(provider);

      // Step 1: Validate target version
      steps[0].status = 'in-progress';
      steps[0].startTime = new Date();

      if (currentVersion.current === targetVersion && !forceUpgrade) {
        steps[0].status = 'failed';
        steps[0].error = 'Already on target version';
        steps[0].endTime = new Date();

        return {
          success: false,
          provider,
          previousVersion: currentVersion.current,
          newVersion: targetVersion,
          upgradeSteps: steps,
          errors: ['Already on target version'],
          rollbackAvailable: false
        };
      }

      steps[0].status = 'completed';
      steps[0].endTime = new Date();

      // Step 2: Backup configuration
      if (backupConfig) {
        steps[1].status = 'in-progress';
        steps[1].startTime = new Date();

        await this.backupConfiguration(provider);

        steps[1].status = 'completed';
        steps[1].endTime = new Date();
      } else {
        steps[1].status = 'skipped';
      }

      // Step 3: Check compatibility
      steps[2].status = 'in-progress';
      steps[2].startTime = new Date();

      const compatibilityCheck = await this.checkVersionCompatibility(provider, targetVersion);

      if (!compatibilityCheck.compatible && !forceUpgrade) {
        steps[2].status = 'failed';
        steps[2].error = compatibilityCheck.reason;
        steps[2].endTime = new Date();

        return {
          success: false,
          provider,
          previousVersion: currentVersion.current,
          newVersion: targetVersion,
          upgradeSteps: steps,
          errors: [compatibilityCheck.reason || 'Version incompatible'],
          rollbackAvailable: backupConfig
        };
      }

      steps[2].status = 'completed';
      steps[2].endTime = new Date();

      // Step 4: Update API version
      steps[3].status = 'in-progress';
      steps[3].startTime = new Date();

      await this.updateApiVersion(provider, targetVersion);

      steps[3].status = 'completed';
      steps[3].endTime = new Date();

      // Step 5: Verify upgrade
      steps[4].status = 'in-progress';
      steps[4].startTime = new Date();

      const verificationResult = await this.verifyUpgrade(provider, targetVersion);

      if (!verificationResult.success) {
        steps[4].status = 'failed';
        steps[4].error = verificationResult.error;
        steps[4].endTime = new Date();

        return {
          success: false,
          provider,
          previousVersion: currentVersion.current,
          newVersion: targetVersion,
          upgradeSteps: steps,
          errors: [verificationResult.error || 'Verification failed'],
          rollbackAvailable: backupConfig
        };
      }

      steps[4].status = 'completed';
      steps[4].endTime = new Date();

      // Emit upgrade event
      this.emit('engine:upgraded', {
        provider,
        previousVersion: currentVersion.current,
        newVersion: targetVersion
      });

      logger.info(LogCategory.SYSTEM, `Engine upgraded for ${provider}: ${currentVersion.current} -> ${targetVersion}`);

      return {
        success: true,
        provider,
        previousVersion: currentVersion.current,
        newVersion: targetVersion,
        upgradeSteps: steps,
        rollbackAvailable: backupConfig
      };

    } catch (error) {
      logger.error(LogCategory.SYSTEM, `Failed to upgrade engine for ${provider}:`, error);

      // Mark current step as failed
      const currentStep = steps.find(s => s.status === 'in-progress');
      if (currentStep) {
        currentStep.status = 'failed';
        currentStep.error = error instanceof Error ? error.message : 'Unknown error';
        currentStep.endTime = new Date();
      }

      return {
        success: false,
        provider,
        previousVersion: (await this.getCurrentVersion(provider)).current,
        newVersion: targetVersion,
        upgradeSteps: steps,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        rollbackAvailable: backupConfig
      };
    }
  }

  /**
   * Backup current configuration
   */
  private async backupConfiguration(provider: 'claude' | 'openai'): Promise<void> {
    try {
      const currentConfig = aiProviderManager.getProvider(
        provider === 'claude' ? 'claude' : 'openai'
      );

      await db.query(
        `INSERT INTO engine_config_backups (provider, config, created_at)
         VALUES ($1, $2, NOW())`,
        [provider, JSON.stringify(currentConfig)]
      );

      logger.info(LogCategory.SYSTEM, `Configuration backed up for ${provider}`);
    } catch (error) {
      logger.error(LogCategory.SYSTEM, `Failed to backup configuration for ${provider}:`, error);
      throw error;
    }
  }

  /**
   * Check version compatibility
   */
  private async checkVersionCompatibility(
    provider: 'claude' | 'openai',
    targetVersion: string
  ): Promise<{ compatible: boolean; reason?: string }> {
    // For Claude, check if target version is valid API version
    if (provider === 'claude') {
      const validVersions = ['2023-06-01', '2024-01-15'];
      if (!validVersions.includes(targetVersion)) {
        return {
          compatible: false,
          reason: `Invalid Claude API version: ${targetVersion}`
        };
      }
    }

    // For OpenAI, API is currently v1 only
    if (provider === 'openai') {
      if (targetVersion !== 'v1') {
        return {
          compatible: false,
          reason: `Invalid OpenAI API version: ${targetVersion}`
        };
      }
    }

    return { compatible: true };
  }

  /**
   * Update API version in database
   */
  private async updateApiVersion(provider: 'claude' | 'openai', version: string): Promise<void> {
    try {
      await db.query(
        `INSERT INTO settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [`${provider}_api_version`, version]
      );

      logger.info(LogCategory.SYSTEM, `API version updated for ${provider}: ${version}`);
    } catch (error) {
      logger.error(LogCategory.SYSTEM, `Failed to update API version for ${provider}:`, error);
      throw error;
    }
  }

  /**
   * Update model in database
   */
  private async updateModelInDatabase(provider: 'claude' | 'openai', modelId: string): Promise<void> {
    try {
      await db.query(
        `INSERT INTO settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [`${provider}_model`, modelId]
      );

      logger.info(LogCategory.SYSTEM, `Model updated in database for ${provider}: ${modelId}`);
    } catch (error) {
      logger.error(LogCategory.SYSTEM, `Failed to update model in database for ${provider}:`, error);
      throw error;
    }
  }

  /**
   * Verify upgrade success
   */
  private async verifyUpgrade(
    provider: 'claude' | 'openai',
    expectedVersion: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const currentVersion = await this.getCurrentVersion(provider);

      if (currentVersion.current !== expectedVersion) {
        return {
          success: false,
          error: `Version mismatch: expected ${expectedVersion}, got ${currentVersion.current}`
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Verification failed'
      };
    }
  }

  /**
   * Get model by ID
   */
  public getModelById(provider: 'claude' | 'openai' | 'grok' | 'gemini', modelId: string): AIModelInfo | undefined {
    const models = provider === 'claude'
      ? CLAUDE_MODELS
      : provider === 'grok'
        ? GROK_MODELS
        : provider === 'gemini'
          ? GEMINI_MODELS
          : OPENAI_MODELS;
    return models.find(m => m.id === modelId);
  }

  /**
   * Get recommended model for provider
   */
  public getRecommendedModel(provider: 'claude' | 'openai' | 'grok' | 'gemini'): AIModelInfo {
    const models = provider === 'claude'
      ? CLAUDE_MODELS
      : provider === 'grok'
        ? GROK_MODELS
        : provider === 'gemini'
          ? GEMINI_MODELS
          : OPENAI_MODELS;
    return models.find(m => m.isDefault) || models[0];
  }

  /**
   * Get all available models across all providers
   */
  public getAllModels(): AIModelInfo[] {
    return [
      ...CLAUDE_MODELS,
      ...OPENAI_MODELS,
      ...GROK_MODELS,
      ...GEMINI_MODELS
    ];
  }
}

// Export singleton instance
export const aiEngineManagementService = AIEngineManagementService.getInstance();
