import axios from 'axios';
import { loadEnginesConfig, type EngineConfig } from '../engines/config';
import { engineGateway } from './engineGateway';

export interface EngineDiagnosticItem {
  engineKey: string;
  provider: string;
  label?: string;
  status: 'ready' | 'missing_api_key' | 'unreachable' | 'missing_model';
  details: string[];
  availableModels?: string[];
  expectedModel?: string;
  fallback?: string[];
}

export interface EngineDiagnosticsReport {
  status: 'pass' | 'warn' | 'fail';
  items: EngineDiagnosticItem[];
}

class EngineSetupWizard {
  async runDiagnostics(): Promise<EngineDiagnosticsReport> {
    const config = loadEnginesConfig();
    const summaries = engineGateway.getEngineSummaries();
    const items: EngineDiagnosticItem[] = [];

    for (const summary of summaries) {
      const engineConfig = config.engines.find(engine => engine.key === summary.key);
      if (!engineConfig) {
        continue;
      }
      const item = await this.inspectEngine(summary.key, engineConfig);
      items.push(item);
    }

    const hasFailure = items.some(item => item.status === 'unreachable' || item.status === 'missing_model');
    const hasWarning = items.some(item => item.status === 'missing_api_key');

    const status: EngineDiagnosticsReport['status'] = hasFailure ? 'fail' : hasWarning ? 'warn' : 'pass';

    return { status, items };
  }

  private async inspectEngine(engineKey: string, engineConfig: EngineConfig): Promise<EngineDiagnosticItem> {
    const details: string[] = [];
    let status: EngineDiagnosticItem['status'] = 'ready';

    // API key validation for remote providers
    if (this.requiresApiKey(engineConfig.provider) && engineConfig.api_key_env) {
      const hasKey = Boolean(process.env[engineConfig.api_key_env]);
      if (!hasKey) {
        status = 'missing_api_key';
        details.push(`Environment variable ${engineConfig.api_key_env} is not set.`);
      }
    }

    if (this.isLocalProvider(engineConfig.provider)) {
      const reachability = await this.checkLocalEndpoint(engineConfig);
      if (!reachability.reachable) {
        status = 'unreachable';
        details.push(...reachability.messages);
      } else if (!reachability.models.includes(engineConfig.model)) {
        status = 'missing_model';
        details.push(`Model ${engineConfig.model} not reported by server.`);
        if (engineConfig.models && engineConfig.models.length > 0) {
          details.push(
            `Install models via vLLM, e.g. python -m vllm.entrypoints.openai.api_server --model ${engineConfig.models[0].name}`
          );
        }
      } else {
        details.push(`Endpoint reachable at ${engineConfig.base_url ?? 'http://localhost'} with ${reachability.models.length} models.`);
      }
      return {
        engineKey,
        provider: engineConfig.provider,
        label: engineConfig.label,
        status,
        details,
        availableModels: reachability.models,
        expectedModel: engineConfig.model,
        fallback: engineConfig.fallback
      };
    }

    // Remote provider ready status
    details.push('Remote provider configuration loaded.');
    return {
      engineKey,
      provider: engineConfig.provider,
      label: engineConfig.label,
      status,
      details,
      expectedModel: engineConfig.model,
      fallback: engineConfig.fallback
    };
  }

  private requiresApiKey(provider: EngineConfig['provider']): boolean {
    return provider === 'anthropic' || provider === 'openai' || provider === 'azure-openai' || provider === 'bedrock';
  }

  private isLocalProvider(provider: EngineConfig['provider']): boolean {
    return provider === 'vllm' || provider === 'ollama' || provider === 'custom';
  }

  private async checkLocalEndpoint(engineConfig: EngineConfig): Promise<{ reachable: boolean; models: string[]; messages: string[] }>
  {
    const baseURL = engineConfig.base_url ?? 'http://localhost:8000/v1';
    const messages: string[] = [];
    try {
      const response = await axios.get(`${baseURL.replace(/\/$/, '')}/models`, {
        timeout: 4000
      });
      const models = Array.isArray(response.data?.data)
        ? response.data.data.map((entry: any) => entry.id ?? entry.name).filter(Boolean)
        : [];
      if (models.length === 0) {
        messages.push('Endpoint reachable but returned no models. Ensure vLLM/Ollama has models loaded.');
      }
      return { reachable: true, models, messages };
    } catch (error: any) {
      messages.push(`Failed to reach ${baseURL}: ${error.message ?? error}`);
      return { reachable: false, models: [], messages };
    }
  }
}

export const engineSetupWizard = new EngineSetupWizard();
