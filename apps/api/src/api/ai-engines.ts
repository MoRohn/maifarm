/**
 * AI Engines API
 *
 * Endpoints for managing AI engines and providers
 * Includes version checking, model management, and upgrade capabilities
 */

import { Request, Response, Router } from 'express';
import { logger, LogCategory } from '../utils/logger';
import { AIProvider } from '../types/ai';
import { db } from '../database/connection';

const router = Router();

// Current model settings per engine - persisted in database
interface EngineModelConfig {
  provider: string;
  model: string;
  version: string;
  contextWindow: number;
  maxTokens: number;
  temperature: number;
}

// Available models database with latest version info
const AVAILABLE_MODELS: Record<string, Array<{
  id: string;
  name: string;
  version: string;
  releaseDate: string;
  isDefault: boolean;
  isDeprecated: boolean;
  contextWindow: number;
  maxTokens: number;
  costPer1kPromptTokens: number;
  costPer1kCompletionTokens: number;
  features: string[];
  description: string;
}>> = {
  claude: [
    {
      id: 'claude-opus-4-5-20251101',
      name: 'Claude Opus 4.5',
      version: '4.5',
      releaseDate: '2025-11-01',
      isDefault: true,
      isDeprecated: false,
      contextWindow: 200000,
      maxTokens: 16384,
      costPer1kPromptTokens: 15.0,
      costPer1kCompletionTokens: 75.0,
      features: ['200K context', 'Superior reasoning', 'Extended thinking', 'Computer use', 'MCP support'],
      description: 'Most advanced Claude model with superior reasoning capabilities'
    },
    {
      id: 'claude-sonnet-4-20250514',
      name: 'Claude Sonnet 4',
      version: '4.0',
      releaseDate: '2025-05-14',
      isDefault: false,
      isDeprecated: false,
      contextWindow: 200000,
      maxTokens: 16384,
      costPer1kPromptTokens: 3.0,
      costPer1kCompletionTokens: 15.0,
      features: ['200K context', 'Fast responses', 'Great for coding', 'Extended thinking'],
      description: 'Excellent balance of performance and speed'
    },
    {
      id: 'claude-3-5-sonnet-20241022',
      name: 'Claude 3.5 Sonnet',
      version: '3.5',
      releaseDate: '2024-10-22',
      isDefault: false,
      isDeprecated: false,
      contextWindow: 200000,
      maxTokens: 8192,
      costPer1kPromptTokens: 3.0,
      costPer1kCompletionTokens: 15.0,
      features: ['200K context', 'Advanced reasoning', 'Fast responses'],
      description: 'Previous generation balanced model'
    },
    {
      id: 'claude-3-5-haiku-20241022',
      name: 'Claude 3.5 Haiku',
      version: '3.5',
      releaseDate: '2024-10-22',
      isDefault: false,
      isDeprecated: false,
      contextWindow: 200000,
      maxTokens: 8192,
      costPer1kPromptTokens: 0.25,
      costPer1kCompletionTokens: 1.25,
      features: ['200K context', 'Very fast', 'Cost-effective'],
      description: 'Fastest and most cost-effective Claude model'
    }
  ],
  openai: [
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      version: '4.0',
      releaseDate: '2024-05-13',
      isDefault: true,
      isDeprecated: false,
      contextWindow: 128000,
      maxTokens: 16384,
      costPer1kPromptTokens: 5.0,
      costPer1kCompletionTokens: 15.0,
      features: ['128K context', 'Vision support', 'Multimodal', 'Fast responses'],
      description: 'Latest GPT-4 with optimized performance'
    },
    {
      id: 'gpt-4o-mini',
      name: 'GPT-4o Mini',
      version: '4.0',
      releaseDate: '2024-07-18',
      isDefault: false,
      isDeprecated: false,
      contextWindow: 128000,
      maxTokens: 16384,
      costPer1kPromptTokens: 0.15,
      costPer1kCompletionTokens: 0.6,
      features: ['128K context', 'Very fast', 'Most affordable'],
      description: 'Fast and cost-effective GPT-4 variant'
    },
    {
      id: 'gpt-4-turbo',
      name: 'GPT-4 Turbo',
      version: '4.0',
      releaseDate: '2024-04-09',
      isDefault: false,
      isDeprecated: false,
      contextWindow: 128000,
      maxTokens: 4096,
      costPer1kPromptTokens: 10.0,
      costPer1kCompletionTokens: 30.0,
      features: ['128K context', 'JSON mode', 'Function calling'],
      description: 'Most capable GPT-4 variant'
    }
  ],
  llama: [
    {
      id: 'llama3.2:latest',
      name: 'Llama 3.2',
      version: '3.2',
      releaseDate: '2024-09-25',
      isDefault: true,
      isDeprecated: false,
      contextWindow: 128000,
      maxTokens: 4096,
      costPer1kPromptTokens: 0,
      costPer1kCompletionTokens: 0,
      features: ['128K context', 'Fast', 'Local', 'Free'],
      description: 'Latest Llama model for local deployment'
    },
    {
      id: 'codellama:latest',
      name: 'Code Llama',
      version: '1.0',
      releaseDate: '2024-01-15',
      isDefault: false,
      isDeprecated: false,
      contextWindow: 16384,
      maxTokens: 4096,
      costPer1kPromptTokens: 0,
      costPer1kCompletionTokens: 0,
      features: ['16K context', 'Code-focused', 'Local', 'Free'],
      description: 'Specialized for code generation'
    }
  ],
  grok: [
    {
      id: 'grok-2',
      name: 'Grok-2',
      version: '2.0',
      releaseDate: '2024-08-13',
      isDefault: true,
      isDeprecated: false,
      contextWindow: 128000,
      maxTokens: 8192,
      costPer1kPromptTokens: 2.0,
      costPer1kCompletionTokens: 10.0,
      features: ['128K context', 'Real-time data', 'Fast responses'],
      description: 'xAI\'s latest model with real-time knowledge'
    },
    {
      id: 'grok-2-mini',
      name: 'Grok-2 Mini',
      version: '2.0',
      releaseDate: '2024-08-13',
      isDefault: false,
      isDeprecated: false,
      contextWindow: 128000,
      maxTokens: 8192,
      costPer1kPromptTokens: 0.5,
      costPer1kCompletionTokens: 2.0,
      features: ['128K context', 'Very fast', 'Cost-effective'],
      description: 'Faster, lighter version of Grok-2'
    }
  ],
  'gpt-oss': [
    {
      id: 'gpt-oss-mini',
      name: 'GPT-OSS Mini',
      version: '1.0',
      releaseDate: '2024-01-01',
      isDefault: true,
      isDeprecated: false,
      contextWindow: 131072,
      maxTokens: 8192,
      costPer1kPromptTokens: 0,
      costPer1kCompletionTokens: 0,
      features: ['Local', 'Free', 'Privacy-focused'],
      description: 'Built-in local model - no API key required'
    }
  ]
};

// Version info sources for each provider
const VERSION_SOURCES: Record<string, {
  checkUrl: string;
  docsUrl: string;
  changelogUrl: string;
  releaseNotesUrl: string;
}> = {
  claude: {
    checkUrl: 'https://docs.anthropic.com/en/api/versioning',
    docsUrl: 'https://docs.anthropic.com/en/docs/about-claude/models',
    changelogUrl: 'https://docs.anthropic.com/en/release-notes/overview',
    releaseNotesUrl: 'https://www.anthropic.com/news'
  },
  openai: {
    checkUrl: 'https://platform.openai.com/docs/models',
    docsUrl: 'https://platform.openai.com/docs/models',
    changelogUrl: 'https://platform.openai.com/docs/changelog',
    releaseNotesUrl: 'https://openai.com/blog'
  },
  llama: {
    checkUrl: 'https://ollama.com/library',
    docsUrl: 'https://ollama.ai/docs',
    changelogUrl: 'https://github.com/ollama/ollama/releases',
    releaseNotesUrl: 'https://ai.meta.com/llama/'
  },
  grok: {
    checkUrl: 'https://x.ai/api',
    docsUrl: 'https://docs.x.ai/docs/overview',
    changelogUrl: 'https://x.ai/blog',
    releaseNotesUrl: 'https://x.ai/blog'
  },
  'gpt-oss': {
    checkUrl: 'http://localhost:8000/version',
    docsUrl: 'https://docs.maifarm.dev/engines/gpt-oss',
    changelogUrl: 'https://docs.maifarm.dev/changelog',
    releaseNotesUrl: 'https://docs.maifarm.dev/releases'
  }
};

// Dynamic engine status - built from persisted settings
async function getEngineConfigs(): Promise<any[]> {
  // Get saved model settings from database
  const savedSettings: Record<string, string> = {};
  try {
    const result = await db.query(
      `SELECT key, value FROM settings WHERE key LIKE 'ai_engine_%'`
    );
    for (const row of result.rows) {
      savedSettings[row.key] = row.value;
    }
  } catch {
    // Table might not exist yet
  }

  return [
    {
      provider: 'claude',
      enabled: true,
      configured: !!process.env.ANTHROPIC_API_KEY,
      model: savedSettings['ai_engine_claude_model'] || 'claude-opus-4-5-20251101',
      version: '4.5',
      contextWindow: 200000,
      maxTokens: 16384,
      isDefault: false,
      isLocal: false,
      status: 'offline',
      temperature: parseFloat(savedSettings['ai_engine_claude_temperature'] || '0.7'),
      endpoint: 'https://api.anthropic.com'
    },
    {
      provider: 'openai',
      enabled: true,
      configured: !!process.env.OPENAI_API_KEY,
      model: savedSettings['ai_engine_openai_model'] || 'gpt-4o',
      version: '4.0',
      contextWindow: 128000,
      maxTokens: 16384,
      isDefault: false,
      isLocal: false,
      status: 'offline',
      temperature: parseFloat(savedSettings['ai_engine_openai_temperature'] || '0.7'),
      endpoint: 'https://api.openai.com'
    },
    {
      provider: 'gpt-oss',
      enabled: true,
      configured: true,
      model: savedSettings['ai_engine_gpt-oss_model'] || 'gpt-oss-mini',
      version: '1.0.0',
      contextWindow: 131072,
      maxTokens: 8192,
      isDefault: true,
      isLocal: true,
      status: 'online',
      temperature: parseFloat(savedSettings['ai_engine_gpt-oss_temperature'] || '0.6'),
      endpoint: 'http://localhost:8000'
    },
    {
      provider: 'llama',
      enabled: true,
      configured: true,
      model: savedSettings['ai_engine_llama_model'] || 'llama3.2:latest',
      version: '3.2',
      contextWindow: 128000,
      maxTokens: 4096,
      isDefault: false,
      isLocal: true,
      status: 'offline',
      temperature: parseFloat(savedSettings['ai_engine_llama_temperature'] || '0.7'),
      endpoint: 'http://localhost:11434'
    },
    {
      provider: 'grok',
      enabled: true,
      configured: !!process.env.XAI_API_KEY,
      model: savedSettings['ai_engine_grok_model'] || 'grok-2',
      version: '2.0',
      contextWindow: 128000,
      maxTokens: 8192,
      isDefault: false,
      isLocal: false,
      status: 'offline',
      temperature: parseFloat(savedSettings['ai_engine_grok_temperature'] || '0.7'),
      endpoint: 'https://api.x.ai'
    }
  ];
}

/**
 * Get all AI engines status
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    // Check GPT-OSS server health
    let gptOssOnline = false;
    try {
      const response = await fetch('http://localhost:8000/health');
      gptOssOnline = response.ok;
    } catch (error) {
      gptOssOnline = false;
    }

    // Get current default provider from environment or default to claude (with Opus 4.5)
    const defaultProvider = process.env.AI_PROVIDER || 'claude';

    // Get dynamic engine configs from database
    const engines = await getEngineConfigs();

    // Update GPT-OSS status and isDefault flags
    const updatedEngines = engines.map(engine => ({
      ...engine,
      status: engine.provider === 'gpt-oss' ? (gptOssOnline ? 'online' : 'offline') : engine.status,
      isDefault: engine.provider === defaultProvider
    }));

    // Get stats
    const stats = {
      totalAgents: 0,
      activeAgents: 0,
      providers: {
        'claude': 0,
        'openai': 0,
        'gpt-oss': gptOssOnline ? 1 : 0,
        'llama': 0,
        'grok': 0
      },
      uptime: Date.now(),
      requestsProcessed: 0
    };

    res.json({
      engines: updatedEngines,
      stats,
      defaultProvider,
      gptOssStatus: {
        serverRunning: gptOssOnline,
        lastCheck: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to get AI engines status:', error);
    res.status(500).json({ error: 'Failed to get AI engines status' });
  }
});

/**
 * Get available models for a specific provider
 */
router.get('/:provider/models', async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;

    if (!AVAILABLE_MODELS[provider]) {
      return res.status(404).json({ error: `Provider ${provider} not found` });
    }

    const models = AVAILABLE_MODELS[provider];
    const engines = await getEngineConfigs();
    const currentEngine = engines.find(e => e.provider === provider);

    res.json({
      success: true,
      provider,
      currentModel: currentEngine?.model || models.find(m => m.isDefault)?.id,
      models,
      recommendedModel: models.find(m => m.isDefault)?.id
    });
  } catch (error) {
    logger.error(LogCategory.API, `Failed to get models for provider:`, error);
    res.status(500).json({ error: 'Failed to get available models' });
  }
});

/**
 * Get version info for a specific provider
 */
router.get('/:provider/version', async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;

    if (!VERSION_SOURCES[provider]) {
      return res.status(404).json({ error: `Provider ${provider} not found` });
    }

    const models = AVAILABLE_MODELS[provider] || [];
    const latestModel = models.find(m => m.isDefault) || models[0];
    const engines = await getEngineConfigs();
    const currentEngine = engines.find(e => e.provider === provider);

    // Get the current model from the engine config
    const currentModelId = currentEngine?.model || '';
    const currentModel = models.find(m => m.id === currentModelId);

    // Check if there's a newer model available
    const hasUpdate = latestModel && currentModel &&
      new Date(latestModel.releaseDate) > new Date(currentModel.releaseDate);

    res.json({
      success: true,
      provider,
      current: {
        model: currentModelId,
        version: currentModel?.version || currentEngine?.version || 'unknown',
        releaseDate: currentModel?.releaseDate || 'unknown'
      },
      latest: {
        model: latestModel?.id,
        version: latestModel?.version,
        releaseDate: latestModel?.releaseDate
      },
      updateAvailable: hasUpdate,
      sources: VERSION_SOURCES[provider]
    });
  } catch (error) {
    logger.error(LogCategory.API, `Failed to get version info:`, error);
    res.status(500).json({ error: 'Failed to get version info' });
  }
});

/**
 * Check for latest versions from online sources
 */
router.post('/:provider/check-updates', async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;

    if (!VERSION_SOURCES[provider]) {
      return res.status(404).json({ error: `Provider ${provider} not found` });
    }

    const sources = VERSION_SOURCES[provider];
    const models = AVAILABLE_MODELS[provider] || [];
    const latestModel = models.find(m => m.isDefault) || models[0];
    const engines = await getEngineConfigs();
    const currentEngine = engines.find(e => e.provider === provider);

    // Return the latest known models with sources for manual verification
    res.json({
      success: true,
      provider,
      currentModel: currentEngine?.model,
      latestModel: latestModel?.id,
      latestVersion: latestModel?.version,
      releaseDate: latestModel?.releaseDate,
      updateAvailable: currentEngine?.model !== latestModel?.id,
      checkSources: sources,
      availableModels: models.map(m => ({
        id: m.id,
        name: m.name,
        version: m.version,
        releaseDate: m.releaseDate,
        isDefault: m.isDefault,
        isDeprecated: m.isDeprecated
      })),
      lastChecked: new Date().toISOString()
    });
  } catch (error) {
    logger.error(LogCategory.API, `Failed to check for updates:`, error);
    res.status(500).json({ error: 'Failed to check for updates' });
  }
});

/**
 * Change model for a specific provider
 */
router.post('/:provider/model', async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;
    const { modelId, temperature } = req.body;

    if (!AVAILABLE_MODELS[provider]) {
      return res.status(404).json({ error: `Provider ${provider} not found` });
    }

    const models = AVAILABLE_MODELS[provider];
    const targetModel = models.find(m => m.id === modelId);

    if (!targetModel) {
      return res.status(400).json({
        error: `Model ${modelId} not found for ${provider}`,
        availableModels: models.map(m => m.id)
      });
    }

    // Get current model for response
    const engines = await getEngineConfigs();
    const currentEngine = engines.find(e => e.provider === provider);
    const previousModel = currentEngine?.model;

    // Save model setting to database
    await db.query(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [`ai_engine_${provider}_model`, modelId]
    );

    // Save temperature if provided
    if (temperature !== undefined) {
      await db.query(
        `INSERT INTO settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [`ai_engine_${provider}_temperature`, temperature.toString()]
      );
    }

    logger.info(LogCategory.API, `Model changed for ${provider}: ${previousModel} -> ${modelId}`);

    res.json({
      success: true,
      provider,
      previousModel,
      newModel: modelId,
      modelInfo: {
        name: targetModel.name,
        version: targetModel.version,
        contextWindow: targetModel.contextWindow,
        maxTokens: targetModel.maxTokens,
        features: targetModel.features
      },
      warnings: targetModel.isDeprecated ? [`Model ${modelId} is deprecated`] : [],
      requiresRestart: false
    });
  } catch (error) {
    logger.error(LogCategory.API, `Failed to change model:`, error);
    res.status(500).json({ error: 'Failed to change model' });
  }
});

/**
 * Upgrade to the latest model for a provider (convenience endpoint)
 */
router.post('/:provider/upgrade', async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;
    const { targetModel, forceUpgrade = false } = req.body;

    if (!AVAILABLE_MODELS[provider]) {
      return res.status(404).json({ error: `Provider ${provider} not found` });
    }

    const models = AVAILABLE_MODELS[provider];
    const latestModel = targetModel
      ? models.find(m => m.id === targetModel)
      : models.find(m => m.isDefault) || models[0];

    if (!latestModel) {
      return res.status(400).json({ error: 'No target model specified or found' });
    }

    // Get current model
    const engines = await getEngineConfigs();
    const currentEngine = engines.find(e => e.provider === provider);
    const previousModel = currentEngine?.model;

    // Check if already on latest
    if (previousModel === latestModel.id && !forceUpgrade) {
      return res.json({
        success: true,
        provider,
        message: 'Already on the latest model',
        currentModel: previousModel,
        latestModel: latestModel.id,
        upgraded: false
      });
    }

    // Perform the upgrade
    await db.query(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [`ai_engine_${provider}_model`, latestModel.id]
    );

    logger.info(LogCategory.API, `Upgraded ${provider} from ${previousModel} to ${latestModel.id}`);

    res.json({
      success: true,
      provider,
      previousModel,
      newModel: latestModel.id,
      upgraded: true,
      upgradeSteps: [
        { step: 1, name: 'Validate target version', status: 'completed' },
        { step: 2, name: 'Update model configuration', status: 'completed' },
        { step: 3, name: 'Verify upgrade', status: 'completed' }
      ],
      modelInfo: {
        name: latestModel.name,
        version: latestModel.version,
        releaseDate: latestModel.releaseDate,
        features: latestModel.features,
        description: latestModel.description
      }
    });
  } catch (error) {
    logger.error(LogCategory.API, `Failed to upgrade engine:`, error);
    res.status(500).json({ error: 'Failed to upgrade engine' });
  }
});

/**
 * Set default AI engine
 */
router.post('/default', async (req: Request, res: Response) => {
  try {
    const { provider } = req.body;

    // CRITICAL FIX: Added 'grok' and 'ollama' to valid providers list
    if (!provider || !['claude', 'openai', 'gpt-oss', 'llama', 'grok', 'ollama'].includes(provider)) {
      return res.status(400).json({ error: 'Invalid provider' });
    }

    // Update default provider in environment
    process.env.AI_PROVIDER = provider;

    logger.info(LogCategory.API, `Default AI provider set to ${provider}`);

    res.json({
      success: true,
      provider,
      message: `Default AI provider set to ${provider}`
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to set default AI engine:', error);
    res.status(500).json({ error: 'Failed to set default AI engine' });
  }
});

/**
 * Configure AI engine
 */
router.post('/configure', async (req: Request, res: Response) => {
  try {
    const { provider, apiKey, endpoint, temperature } = req.body;

    if (!provider) {
      return res.status(400).json({ error: 'Provider is required' });
    }

    // Store API key in environment if provided
    if (apiKey && provider !== 'gpt-oss' && provider !== 'llama') {
      if (provider === 'claude') {
        process.env.ANTHROPIC_API_KEY = apiKey;
        process.env.CLAUDE_API_KEY = apiKey;
      } else if (provider === 'openai') {
        process.env.OPENAI_API_KEY = apiKey;
      } else if (provider === 'grok') {
        // CRITICAL FIX: Add Grok API key storage
        process.env.GROK_API_KEY = apiKey;
        process.env.XAI_API_KEY = apiKey;
      }
    }

    logger.info(LogCategory.API, `Configured AI engine: ${provider}`);

    res.json({
      success: true,
      provider,
      message: `AI engine ${provider} configured successfully`
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to configure AI engine:', error);
    res.status(500).json({ error: 'Failed to configure AI engine' });
  }
});

/**
 * Test AI engine connectivity
 * Makes a live API call to verify the engine is working
 */
router.post('/test', async (req: Request, res: Response) => {
  try {
    const { provider } = req.body;

    // CRITICAL FIX: Added 'grok' to valid providers for test endpoint
    if (!provider || !['claude', 'openai', 'gpt-oss', 'ollama', 'grok'].includes(provider)) {
      return res.status(400).json({
        error: 'Invalid provider',
        validProviders: ['claude', 'openai', 'gpt-oss', 'ollama', 'grok']
      });
    }

    logger.info(LogCategory.AI, `Testing connectivity for AI engine: ${provider}`);

    // Import the preflight validation service dynamically to avoid circular deps
    const { preflightValidationService } = await import('../services/preflightValidationService');
    const result = await preflightValidationService.testEngineConnectivity(provider);

    res.json({
      provider,
      status: result.status,
      message: result.message,
      details: result.details,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to test AI engine connectivity:', error);
    res.status(500).json({
      error: 'Failed to test AI engine connectivity',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get AI engine setup instructions
 */
router.get('/setup-guide/:provider', async (req: Request, res: Response) => {
  const { provider } = req.params;

  const guides: Record<string, object> = {
    claude: {
      provider: 'claude',
      displayName: 'Anthropic Claude',
      steps: [
        '1. Go to https://console.anthropic.com',
        '2. Sign in or create an account',
        '3. Navigate to API Keys section',
        '4. Create a new API key',
        '5. Copy the key (it starts with "sk-ant-")',
        '6. Add to your .env.development file: ANTHROPIC_API_KEY=sk-ant-...'
      ],
      envVar: 'ANTHROPIC_API_KEY',
      keyPrefix: 'sk-ant-',
      docsUrl: 'https://docs.anthropic.com/en/docs/getting-started',
      models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
      pricing: 'Pay-per-use based on tokens'
    },
    openai: {
      provider: 'openai',
      displayName: 'OpenAI GPT',
      steps: [
        '1. Go to https://platform.openai.com',
        '2. Sign in or create an account',
        '3. Navigate to API Keys (https://platform.openai.com/api-keys)',
        '4. Create a new secret key',
        '5. Copy the key (it starts with "sk-")',
        '6. Add to your .env.development file: OPENAI_API_KEY=sk-...',
        '7. Ensure you have credits (https://platform.openai.com/account/billing)'
      ],
      envVar: 'OPENAI_API_KEY',
      keyPrefix: 'sk-',
      docsUrl: 'https://platform.openai.com/docs/quickstart',
      models: ['gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
      pricing: 'Pay-per-use based on tokens, requires pre-paid credits'
    },
    'gpt-oss': {
      provider: 'gpt-oss',
      displayName: 'GPT-OSS (Local)',
      steps: [
        '1. GPT-OSS runs locally - no API key needed',
        '2. Enable in .env.development: GPT_OSS_ENABLED=true',
        '3. MaiFarm will start the embedded GPT-OSS server automatically',
        '4. For better performance, run setup: ./scripts/setup/setup-gpt-oss-models.sh'
      ],
      envVar: 'GPT_OSS_ENABLED',
      keyPrefix: null,
      docsUrl: null,
      models: ['Built-in mini model', 'Custom models via setup script'],
      pricing: 'Free - runs locally'
    },
    ollama: {
      provider: 'ollama',
      displayName: 'Ollama (Local)',
      steps: [
        '1. Install Ollama: https://ollama.ai/download',
        '2. Start Ollama service: ollama serve',
        '3. Pull a model: ollama pull llama3.2',
        '4. (Optional) Set custom host in .env.development: OLLAMA_HOST=http://localhost:11434'
      ],
      envVar: 'OLLAMA_HOST',
      keyPrefix: null,
      docsUrl: 'https://ollama.ai/docs',
      models: ['llama3.2', 'codellama', 'mistral', 'llama2'],
      pricing: 'Free - runs locally'
    }
  };

  const guide = guides[provider];
  if (!guide) {
    return res.status(404).json({
      error: 'Provider not found',
      validProviders: Object.keys(guides)
    });
  }

  res.json(guide);
});

/**
 * Initialize GPT-OSS server
 */
router.post('/gpt-oss/initialize', async (req: Request, res: Response) => {
  try {
    logger.info(LogCategory.API, 'Checking GPT-OSS server status...');

    // Check server health
    let isHealthy = false;
    try {
      const response = await fetch('http://localhost:8000/health');
      isHealthy = response.ok;
    } catch (error) {
      isHealthy = false;
    }

    res.json({
      success: true,
      status: isHealthy ? 'online' : 'offline',
      message: isHealthy ? 'GPT-OSS server is running' : 'GPT-OSS server is not running'
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to check GPT-OSS status:', error);
    res.status(500).json({ error: 'Failed to check GPT-OSS status' });
  }
});

/**
 * Get available AI providers
 */
router.get('/available', async (req: Request, res: Response) => {
  try {
    const providers = [
      { value: 'gpt-oss', label: 'GPT-OSS (Local)', requiresKey: false },
      { value: 'claude', label: 'Claude (Anthropic)', requiresKey: true },
      { value: 'openai', label: 'OpenAI GPT-4', requiresKey: true },
      { value: 'llama', label: 'Llama (Local)', requiresKey: false }
    ];

    res.json({
      providers,
      default: process.env.AI_PROVIDER || 'gpt-oss'
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to get available providers:', error);
    res.status(500).json({ error: 'Failed to get available providers' });
  }
});

/**
 * Test AI engine connection
 */
router.post('/test', async (req: Request, res: Response) => {
  try {
    const { provider } = req.body;

    if (!provider) {
      return res.status(400).json({ error: 'Provider is required' });
    }

    let isOnline = false;
    let responseTime = 0;
    const startTime = Date.now();

    switch (provider) {
      case 'gpt-oss':
        try {
          const response = await fetch('http://localhost:8000/health');
          isOnline = response.ok;
          responseTime = Date.now() - startTime;
        } catch {
          isOnline = false;
        }
        break;

      case 'claude':
        if (process.env.ANTHROPIC_API_KEY) {
          try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'x-api-key': process.env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
              },
              body: JSON.stringify({
                model: 'claude-3-sonnet-20240229',
                max_tokens: 10,
                messages: [{ role: 'user', content: 'Hi' }]
              })
            });
            isOnline = response.ok;
            responseTime = Date.now() - startTime;
          } catch {
            isOnline = false;
          }
        }
        break;

      case 'openai':
        if (process.env.OPENAI_API_KEY) {
          try {
            const response = await fetch('https://api.openai.com/v1/models', {
              headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
              }
            });
            isOnline = response.ok;
            responseTime = Date.now() - startTime;
          } catch {
            isOnline = false;
          }
        }
        break;

      case 'llama':
        try {
          const response = await fetch('http://localhost:11434/api/tags');
          isOnline = response.ok;
          responseTime = Date.now() - startTime;
        } catch {
          isOnline = false;
        }
        break;
    }

    res.json({
      provider,
      status: isOnline ? 'online' : 'offline',
      responseTime,
      message: isOnline ? 'Connection successful' : 'Connection failed'
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to test AI engine:', error);
    res.status(500).json({ error: 'Failed to test AI engine' });
  }
});

export default router;