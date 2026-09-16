/**
 * Preflight Validation Service
 *
 * Validates farm creation requests before execution to catch errors early
 * and provide better user feedback
 */

import { logger, LogCategory } from '../utils/logger';
import { db } from '../database/connection';
import { pathConfig } from '../config/paths';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import { gptOssLauncher } from '../engines/gpt-oss-launcher';
import { aiProviderManager, AIProvider } from '../config/aiProviders';
import { thermalMonitoringService } from './ThermalMonitoringService';

const execAsync = promisify(exec);

export interface PreflightCheck {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: any;
}

export interface PreflightResult {
  success: boolean;
  checks: PreflightCheck[];
  errors: string[];
  warnings: string[];
  canProceed: boolean;
}

interface FarmCreationRequest {
  name: string;
  prompt?: string;
  agentCount?: number;
  // CRITICAL FIX: Added all AI providers including grok (ollama is handled via llama)
  provider?: 'claude' | 'openai' | 'grok' | 'gpt-oss' | 'llama';
  mode?: 'harvest' | 'quicktask' | 'gowild';
  timeout?: number;
}

class PreflightValidationService {
  private static instance: PreflightValidationService;

  private constructor() {}

  static getInstance(): PreflightValidationService {
    if (!PreflightValidationService.instance) {
      PreflightValidationService.instance = new PreflightValidationService();
    }
    return PreflightValidationService.instance;
  }

  /**
   * Run all preflight checks for farm creation
   */
  async validateFarmCreation(request: FarmCreationRequest): Promise<PreflightResult> {
    const checks: PreflightCheck[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    logger.info(LogCategory.FARM, 'Running preflight validation for farm creation', {
      name: request.name,
      mode: request.mode,
      provider: request.provider
    });

    // 1. Validate farm name
    const nameCheck = await this.validateFarmName(request.name);
    checks.push(nameCheck);
    if (nameCheck.status === 'fail') errors.push(nameCheck.message);

    // 2. Check database connectivity
    const dbCheck = await this.checkDatabaseConnectivity();
    checks.push(dbCheck);
    if (dbCheck.status === 'fail') errors.push(dbCheck.message);

    // 3. Validate provider availability (default to active provider when not specified)
    const providerToCheck = this.resolveRequestedProvider(request.provider);
    const providerCheck = await this.validateProvider(providerToCheck);
    checks.push(providerCheck);
    if (providerCheck.status === 'fail') {
      errors.push(providerCheck.message);
    } else if (providerCheck.status === 'warning') {
      warnings.push(providerCheck.message);
    }

    if (providerToCheck === 'gpt-oss') {
      const gptOssCheck = await this.validateGptOssServer();
      checks.push(gptOssCheck);
      if (gptOssCheck.status === 'fail') {
        errors.push(gptOssCheck.message);
      } else if (gptOssCheck.status === 'warning') {
        warnings.push(gptOssCheck.message);
      }
    }

    // 4. Check tmux availability
    const tmuxCheck = await this.checkTmuxAvailability();
    checks.push(tmuxCheck);
    if (tmuxCheck.status === 'fail') errors.push(tmuxCheck.message);

    // 5. Check workspace directory
    const workspaceCheck = await this.checkWorkspaceDirectory();
    checks.push(workspaceCheck);
    if (workspaceCheck.status === 'fail') errors.push(workspaceCheck.message);
    if (workspaceCheck.status === 'warning') warnings.push(workspaceCheck.message);

    // 6. Validate agent count
    if (request.agentCount) {
      const agentCheck = this.validateAgentCount(request.agentCount, request.mode);
      checks.push(agentCheck);
      if (agentCheck.status === 'fail') {
        errors.push(agentCheck.message);
      } else if (agentCheck.status === 'warning') {
        warnings.push(agentCheck.message);
      }
    }

    // 7. Check system resources
    const resourceCheck = await this.checkSystemResources();
    checks.push(resourceCheck);
    if (resourceCheck.status === 'warning') warnings.push(resourceCheck.message);

    // 8. Check for existing farms with same name
    const duplicateCheck = await this.checkDuplicateFarmName(request.name);
    checks.push(duplicateCheck);
    if (duplicateCheck.status === 'warning') warnings.push(duplicateCheck.message);

    // 9. Validate timeout
    if (request.timeout) {
      const timeoutCheck = this.validateTimeout(request.timeout, request.mode);
      checks.push(timeoutCheck);
      if (timeoutCheck.status === 'fail') {
        errors.push(timeoutCheck.message);
      } else if (timeoutCheck.status === 'warning') {
        warnings.push(timeoutCheck.message);
      }
    }

    // 10. Check thermal/device health (iOS/iMac critical check)
    const thermalCheck = await this.checkThermalHealth(request.agentCount);
    checks.push(thermalCheck);
    if (thermalCheck.status === 'fail') {
      errors.push(thermalCheck.message);
    } else if (thermalCheck.status === 'warning') {
      warnings.push(thermalCheck.message);
    }

    const canProceed = errors.length === 0;
    const success = canProceed && warnings.length === 0;

    logger.info(LogCategory.FARM, 'Preflight validation complete', {
      success,
      canProceed,
      errorCount: errors.length,
      warningCount: warnings.length
    });

    return {
      success,
      checks,
      errors,
      warnings,
      canProceed
    };
  }

  // CRITICAL FIX: Added all AI providers including grok
  private resolveRequestedProvider(
    provider?: FarmCreationRequest['provider']
  ): 'claude' | 'openai' | 'grok' | 'gpt-oss' | 'llama' {
    if (provider) {
      return provider;
    }

    const defaultProvider = aiProviderManager.getDefaultProvider();
    if (defaultProvider === AIProvider.OPENAI) {
      return 'openai';
    }
    if (defaultProvider === AIProvider.GPT_OSS) {
      return 'gpt-oss';
    }
    if (defaultProvider === AIProvider.GROK) {
      return 'grok';
    }
    if (defaultProvider === AIProvider.LLAMA) {
      return 'llama';
    }
    return 'claude';
  }

  /**
   * Validate farm name
   */
  private async validateFarmName(name: string): Promise<PreflightCheck> {
    if (!name || name.trim().length === 0) {
      return {
        name: 'Farm Name',
        status: 'fail',
        message: 'Farm name is required'
      };
    }

    if (name.length > 100) {
      return {
        name: 'Farm Name',
        status: 'fail',
        message: 'Farm name must be less than 100 characters'
      };
    }

    // Check for invalid characters
    if (!/^[a-zA-Z0-9\s\-_]+$/.test(name)) {
      return {
        name: 'Farm Name',
        status: 'warning',
        message: 'Farm name contains special characters'
      };
    }

    return {
      name: 'Farm Name',
      status: 'pass',
      message: 'Farm name is valid'
    };
  }

  /**
   * Check database connectivity
   */
  private async checkDatabaseConnectivity(): Promise<PreflightCheck> {
    try {
      await db.query('SELECT 1');
      return {
        name: 'Database',
        status: 'pass',
        message: 'Database connection successful'
      };
    } catch (error) {
      return {
        name: 'Database',
        status: 'fail',
        message: `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: error
      };
    }
  }

  /**
   * Validate AI provider availability
   * CRITICAL FIX: Added validation for grok and llama providers
   */
  private async validateProvider(provider: 'claude' | 'openai' | 'grok' | 'gpt-oss' | 'llama'): Promise<PreflightCheck> {
    if (provider === 'gpt-oss') {
      // GPT-OSS must be explicitly enabled (opt-in)
      const enabled = process.env.GPT_OSS_ENABLED === 'true';
      const host = process.env.GPT_OSS_HOST || 'http://localhost:8000/v1';
      const model = process.env.GPT_OSS_MODEL || 'openai/gpt-oss-20b';

      if (!enabled) {
        return {
          name: 'AI Provider',
          status: 'fail',
          message: 'GPT-OSS provider selected but GPT_OSS_ENABLED is not set to true'
        };
      }

      const status: 'pass' | 'warning' = process.env.GPT_OSS_MODEL ? 'pass' : 'warning';
      const message = status === 'warning'
        ? 'GPT_OSS_MODEL not set; using default model (openai/gpt-oss-20b)'
        : 'GPT-OSS provider configured';

      return {
        name: 'AI Provider',
        status,
        message,
        details: {
          host,
          model,
          usingDefaults: {
            host: !process.env.GPT_OSS_HOST,
            model: !process.env.GPT_OSS_MODEL
          }
        }
      };
    }

    // CRITICAL FIX: Added llama/ollama validation (local provider)
    if (provider === 'llama') {
      const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';

      return {
        name: 'AI Provider',
        status: 'pass',
        message: 'Llama/Ollama provider configured (local)',
        details: {
          host: ollamaHost,
          isLocal: true
        }
      };
    }

    // CRITICAL FIX: Added grok validation
    if (provider === 'grok') {
      const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;

      if (!apiKey) {
        return {
          name: 'AI Provider',
          status: 'fail',
          message: 'Grok (xAI) API key not configured (GROK_API_KEY or XAI_API_KEY)'
        };
      }

      // Check key format
      if (!apiKey.startsWith('xai-') && !apiKey.startsWith('grok-')) {
        return {
          name: 'AI Provider',
          status: 'warning',
          message: 'Grok API key format appears invalid (should start with xai- or grok-)'
        };
      }

      return {
        name: 'AI Provider',
        status: 'pass',
        message: 'Grok (xAI) provider configured',
        details: { provider, keyLength: apiKey.length }
      };
    }

    const apiKeyEnvVar = provider === 'claude' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
    const apiKey = process.env[apiKeyEnvVar];

    if (!apiKey) {
      return {
        name: 'AI Provider',
        status: 'fail',
        message: `${provider.toUpperCase()} API key not configured (${apiKeyEnvVar})`
      };
    }

    // Basic validation - check key format
    if (provider === 'claude' && !apiKey.startsWith('sk-ant-')) {
      return {
        name: 'AI Provider',
        status: 'warning',
        message: 'Claude API key format appears invalid'
      };
    }

    if (provider === 'openai' && !apiKey.startsWith('sk-')) {
      return {
        name: 'AI Provider',
        status: 'warning',
        message: 'OpenAI API key format appears invalid'
      };
    }

    return {
      name: 'AI Provider',
      status: 'pass',
      message: `${provider.toUpperCase()} provider configured`,
      details: { provider, keyLength: apiKey.length }
    };
  }

  /**
   * Run a live connectivity test for cloud AI providers
   * Makes a minimal API call to verify the key is valid and the provider is reachable
   */
  // CRITICAL FIX: Added 'grok' to supported providers for connectivity testing
  async testEngineConnectivity(provider: 'claude' | 'openai' | 'gpt-oss' | 'ollama' | 'grok'): Promise<PreflightCheck> {
    logger.info(LogCategory.AI, 'Testing engine connectivity', { provider });

    if (provider === 'gpt-oss') {
      return this.validateGptOssServer();
    }

    if (provider === 'ollama') {
      return this.testOllamaConnectivity();
    }

    if (provider === 'grok') {
      return this.testGrokConnectivity();
    }

    const apiKeyEnvVar = provider === 'claude' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
    const apiKey = process.env[apiKeyEnvVar];

    if (!apiKey) {
      return {
        name: 'Engine Connectivity',
        status: 'fail',
        message: `${provider.toUpperCase()} API key not configured`,
        details: {
          hint: provider === 'claude'
            ? 'Set ANTHROPIC_API_KEY in your .env.development file. Get your key at https://console.anthropic.com/account/keys'
            : 'Set OPENAI_API_KEY in your .env.development file. Get your key at https://platform.openai.com/api-keys'
        }
      };
    }

    try {
      if (provider === 'claude') {
        // Make a minimal request to verify the API key
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307', // Use cheapest model for test
            max_tokens: 1,
            messages: [{ role: 'user', content: 'Hi' }]
          })
        });

        if (response.ok) {
          return {
            name: 'Engine Connectivity',
            status: 'pass',
            message: 'Claude API connection verified successfully',
            details: { provider: 'claude', responseTime: 'N/A' }
          };
        }

        const error = await response.json().catch(() => ({}));
        const errorType = (error as any)?.error?.type;

        if (response.status === 401 || errorType === 'authentication_error') {
          return {
            name: 'Engine Connectivity',
            status: 'fail',
            message: 'Claude API key is invalid or expired',
            details: {
              hint: 'Verify your ANTHROPIC_API_KEY is correct. Generate a new key at https://console.anthropic.com/account/keys',
              statusCode: response.status,
              error
            }
          };
        }

        if (response.status === 429) {
          return {
            name: 'Engine Connectivity',
            status: 'warning',
            message: 'Claude API rate limited - key is valid but usage quota reached',
            details: { statusCode: response.status }
          };
        }

        return {
          name: 'Engine Connectivity',
          status: 'fail',
          message: `Claude API returned unexpected status: ${response.status}`,
          details: { statusCode: response.status, error }
        };
      } else {
        // OpenAI test
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo', // Use cheapest model for test
            max_tokens: 1,
            messages: [{ role: 'user', content: 'Hi' }]
          })
        });

        if (response.ok) {
          return {
            name: 'Engine Connectivity',
            status: 'pass',
            message: 'OpenAI API connection verified successfully',
            details: { provider: 'openai', responseTime: 'N/A' }
          };
        }

        const error = await response.json().catch(() => ({}));
        const errorType = (error as any)?.error?.type;

        if (response.status === 401 || errorType === 'invalid_api_key') {
          return {
            name: 'Engine Connectivity',
            status: 'fail',
            message: 'OpenAI API key is invalid or expired',
            details: {
              hint: 'Verify your OPENAI_API_KEY is correct. Generate a new key at https://platform.openai.com/api-keys',
              statusCode: response.status,
              error
            }
          };
        }

        if (response.status === 429) {
          return {
            name: 'Engine Connectivity',
            status: 'warning',
            message: 'OpenAI API rate limited - key is valid but usage quota reached',
            details: { statusCode: response.status }
          };
        }

        if (response.status === 402 || errorType === 'insufficient_quota') {
          return {
            name: 'Engine Connectivity',
            status: 'fail',
            message: 'OpenAI API key has no remaining credits',
            details: {
              hint: 'Add credits to your OpenAI account at https://platform.openai.com/account/billing',
              statusCode: response.status
            }
          };
        }

        return {
          name: 'Engine Connectivity',
          status: 'fail',
          message: `OpenAI API returned unexpected status: ${response.status}`,
          details: { statusCode: response.status, error }
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        name: 'Engine Connectivity',
        status: 'fail',
        message: `Failed to connect to ${provider.toUpperCase()} API: ${message}`,
        details: {
          hint: 'Check your network connection and ensure the API endpoint is accessible',
          error: message
        }
      };
    }
  }

  /**
   * Test Ollama local server connectivity
   */
  private async testOllamaConnectivity(): Promise<PreflightCheck> {
    const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';

    try {
      const response = await fetch(`${ollamaHost}/api/tags`);

      if (response.ok) {
        const data = await response.json();
        const models = (data as any)?.models || [];

        if (models.length === 0) {
          return {
            name: 'Engine Connectivity',
            status: 'warning',
            message: 'Ollama is running but no models are installed',
            details: {
              hint: 'Install a model with: ollama pull llama3.2',
              host: ollamaHost
            }
          };
        }

        return {
          name: 'Engine Connectivity',
          status: 'pass',
          message: `Ollama is running with ${models.length} model(s) available`,
          details: {
            host: ollamaHost,
            models: models.slice(0, 5).map((m: any) => m.name)
          }
        };
      }

      return {
        name: 'Engine Connectivity',
        status: 'fail',
        message: `Ollama returned unexpected status: ${response.status}`,
        details: { host: ollamaHost, statusCode: response.status }
      };
    } catch (error) {
      return {
        name: 'Engine Connectivity',
        status: 'fail',
        message: 'Ollama server is not running or not accessible',
        details: {
          hint: 'Start Ollama with: ollama serve',
          host: ollamaHost,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  /**
   * Test Grok (xAI) API connectivity
   * CRITICAL FIX: Added Grok connectivity testing support
   */
  private async testGrokConnectivity(): Promise<PreflightCheck> {
    const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;

    if (!apiKey) {
      return {
        name: 'Engine Connectivity',
        status: 'fail',
        message: 'Grok (xAI) API key not configured',
        details: {
          hint: 'Set GROK_API_KEY or XAI_API_KEY in your .env.development file. Get your key at https://console.x.ai/api-keys'
        }
      };
    }

    try {
      // Make a minimal request to verify the API key
      // xAI uses an OpenAI-compatible API format
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'grok-2-mini', // Use cheaper model for test
          max_tokens: 1,
          messages: [{ role: 'user', content: 'Hi' }]
        })
      });

      if (response.ok) {
        return {
          name: 'Engine Connectivity',
          status: 'pass',
          message: 'Grok (xAI) API connection verified successfully',
          details: { provider: 'grok', responseTime: 'N/A' }
        };
      }

      const error = await response.json().catch(() => ({}));
      const errorMessage = (error as any)?.error?.message;

      if (response.status === 401) {
        return {
          name: 'Engine Connectivity',
          status: 'fail',
          message: 'Grok API key is invalid or expired',
          details: {
            hint: 'Verify your GROK_API_KEY is correct. Generate a new key at https://console.x.ai/api-keys',
            statusCode: response.status,
            error
          }
        };
      }

      if (response.status === 429) {
        return {
          name: 'Engine Connectivity',
          status: 'warning',
          message: 'Grok API rate limited - key is valid but usage quota reached',
          details: { statusCode: response.status }
        };
      }

      if (response.status === 402) {
        return {
          name: 'Engine Connectivity',
          status: 'fail',
          message: 'Grok API key has no remaining credits',
          details: {
            hint: 'Add credits to your xAI account at https://console.x.ai',
            statusCode: response.status
          }
        };
      }

      return {
        name: 'Engine Connectivity',
        status: 'fail',
        message: `Grok API returned unexpected status: ${response.status}`,
        details: { statusCode: response.status, error, errorMessage }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        name: 'Engine Connectivity',
        status: 'fail',
        message: `Failed to connect to Grok (xAI) API: ${message}`,
        details: {
          hint: 'Check your network connection and ensure the xAI API endpoint is accessible',
          error: message
        }
      };
    }
  }

  /**
   * Validate GPT-OSS server health
   */
  private async validateGptOssServer(): Promise<PreflightCheck> {
    try {
      const status = await gptOssLauncher.checkHealth();

      if (!status.running) {
        return {
          name: 'GPT-OSS Server',
          status: 'fail',
          message: 'GPT-OSS server is not running',
          details: status
        };
      }

      if (!status.healthy) {
        return {
          name: 'GPT-OSS Server',
          status: 'fail',
          message: 'GPT-OSS server is running but reported unhealthy',
          details: status
        };
      }

      const isMock = status.backend === 'mock';
      const isMini = status.backend === 'mini';

      return {
        name: 'GPT-OSS Server',
        status: isMock ? 'warning' : 'pass',
        message: isMock
          ? 'GPT-OSS mock backend active — install full backend for production scenarios'
          : isMini
            ? 'GPT-OSS embedded mini backend ready'
            : 'GPT-OSS server is healthy',
        details: status
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        name: 'GPT-OSS Server',
        status: 'fail',
        message: `Failed to verify GPT-OSS server health: ${message}`,
        details: error
      };
    }
  }

  /**
   * Check tmux availability
   */
  private async checkTmuxAvailability(): Promise<PreflightCheck> {
    try {
      const { stdout } = await execAsync('tmux -V');
      const version = stdout.trim();

      return {
        name: 'Tmux',
        status: 'pass',
        message: 'Tmux is available',
        details: { version }
      };
    } catch (error) {
      return {
        name: 'Tmux',
        status: 'fail',
        message: 'Tmux is not installed or not accessible',
        details: error
      };
    }
  }

  /**
   * Check workspace directory
   */
  private async checkWorkspaceDirectory(): Promise<PreflightCheck> {
    try {
      const workspacesDir = pathConfig.getPath('WORKSPACES_DIR');

      // Check if directory exists
      try {
        await fs.access(workspacesDir);
      } catch {
        // Directory doesn't exist, try to create it
        await fs.mkdir(workspacesDir, { recursive: true });
      }

      // Check write permissions
      await fs.access(workspacesDir, fs.constants.W_OK);

      // Check disk space
      const stats = await fs.stat(workspacesDir);

      return {
        name: 'Workspace Directory',
        status: 'pass',
        message: 'Workspace directory is accessible',
        details: { path: workspacesDir }
      };
    } catch (error) {
      return {
        name: 'Workspace Directory',
        status: 'fail',
        message: `Workspace directory error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: error
      };
    }
  }

  /**
   * Validate agent count for mode
   */
  private validateAgentCount(count: number, mode?: string): PreflightCheck {
    if (count < 1) {
      return {
        name: 'Agent Count',
        status: 'fail',
        message: 'Agent count must be at least 1'
      };
    }

    if (count > 32) {
      return {
        name: 'Agent Count',
        status: 'fail',
        message: 'Agent count cannot exceed 32'
      };
    }

    // Mode-specific validation
    if (mode === 'quicktask' && count !== 2) {
      return {
        name: 'Agent Count',
        status: 'warning',
        message: 'Quick Task mode works best with 2 agents (will be adjusted)'
      };
    }

    if (mode === 'gowild' && count < 3) {
      return {
        name: 'Agent Count',
        status: 'warning',
        message: 'Go Wild mode works best with 3+ agents'
      };
    }

    if (count > 10) {
      return {
        name: 'Agent Count',
        status: 'warning',
        message: 'Large agent count may impact performance',
        details: { count }
      };
    }

    return {
      name: 'Agent Count',
      status: 'pass',
      message: `Agent count (${count}) is valid`,
      details: { count }
    };
  }

  /**
   * Check system resources
   */
  private async checkSystemResources(): Promise<PreflightCheck> {
    try {
      // Check memory (basic check)
      const memoryUsage = process.memoryUsage();
      const heapUsedPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

      if (heapUsedPercent > 90) {
        return {
          name: 'System Resources',
          status: 'warning',
          message: 'High memory usage detected',
          details: { heapUsedPercent: heapUsedPercent.toFixed(2) }
        };
      }

      return {
        name: 'System Resources',
        status: 'pass',
        message: 'System resources are adequate',
        details: {
          heapUsedPercent: heapUsedPercent.toFixed(2),
          rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)}MB`
        }
      };
    } catch (error) {
      return {
        name: 'System Resources',
        status: 'warning',
        message: 'Unable to check system resources',
        details: error
      };
    }
  }

  /**
   * Check for duplicate farm names
   */
  private async checkDuplicateFarmName(name: string): Promise<PreflightCheck> {
    try {
      const result = await db.query(
        `SELECT COUNT(*) as count FROM farms
         WHERE name = $1 AND status IN ('launching', 'running', 'active')`,
        [name]
      );

      const count = parseInt(result.rows[0].count);

      if (count > 0) {
        return {
          name: 'Duplicate Check',
          status: 'warning',
          message: `A farm with name "${name}" is already active`,
          details: { existingCount: count }
        };
      }

      return {
        name: 'Duplicate Check',
        status: 'pass',
        message: 'No duplicate farm names found'
      };
    } catch (error) {
      return {
        name: 'Duplicate Check',
        status: 'warning',
        message: 'Unable to check for duplicate farms',
        details: error
      };
    }
  }

  /**
   * Validate timeout settings
   */
  private validateTimeout(timeout: number, mode?: string): PreflightCheck {
    if (timeout < 60) {
      return {
        name: 'Timeout',
        status: 'fail',
        message: 'Timeout must be at least 60 seconds'
      };
    }

    if (timeout > 86400) {
      return {
        name: 'Timeout',
        status: 'fail',
        message: 'Timeout cannot exceed 24 hours (86400 seconds)'
      };
    }

    // Mode-specific recommendations
    if (mode === 'quicktask' && timeout !== 300) {
      return {
        name: 'Timeout',
        status: 'warning',
        message: 'Quick Task mode timeout is fixed at 5 minutes (will be adjusted)'
      };
    }

    if (mode === 'harvest' && timeout < 1800) {
      return {
        name: 'Timeout',
        status: 'warning',
        message: 'Harvest mode typically needs at least 30 minutes'
      };
    }

    return {
      name: 'Timeout',
      status: 'pass',
      message: `Timeout (${timeout}s) is valid`,
      details: { timeout }
    };
  }

  /**
   * Check thermal and device health before farm creation
   * Critical for iOS/iMac devices to prevent launching farms under thermal stress
   */
  private async checkThermalHealth(requestedAgentCount?: number): Promise<PreflightCheck> {
    try {
      // Check if farm launch is allowed based on thermal state
      const canLaunch = thermalMonitoringService.canLaunchFarm();

      if (!canLaunch.allowed) {
        return {
          name: 'Thermal Health',
          status: 'fail',
          message: `Device thermal protection active: ${canLaunch.reason || 'System is overheating'}`,
          details: {
            reason: canLaunch.reason,
            hint: 'Wait for device to cool down before creating farms'
          }
        };
      }

      // Check if agent count should be reduced based on thermal conditions
      if (requestedAgentCount) {
        const recommended = thermalMonitoringService.getRecommendedAgentCount(requestedAgentCount);

        if (recommended < requestedAgentCount) {
          return {
            name: 'Thermal Health',
            status: 'warning',
            message: `Thermal conditions suggest reducing agents from ${requestedAgentCount} to ${recommended}`,
            details: {
              requestedAgents: requestedAgentCount,
              recommendedAgents: recommended,
              reason: 'Device is under moderate thermal stress'
            }
          };
        }
      }

      return {
        name: 'Thermal Health',
        status: 'pass',
        message: 'Device thermal conditions are optimal for farming',
        details: {
          canLaunch: true
        }
      };
    } catch (error) {
      // If thermal service fails, log warning but allow farm creation
      // (don't block on monitoring service failure)
      logger.warn(LogCategory.FARM, 'Thermal health check failed, proceeding with caution', { error });

      return {
        name: 'Thermal Health',
        status: 'warning',
        message: 'Unable to verify thermal health - proceeding with caution',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          hint: 'Thermal monitoring service may not be running'
        }
      };
    }
  }
}

export const preflightValidationService = PreflightValidationService.getInstance();
export { PreflightValidationService };
