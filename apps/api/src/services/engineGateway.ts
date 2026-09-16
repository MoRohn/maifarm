import fs from 'fs';
import path from 'path';
import { logger, LogCategory } from '../utils/logger';
import type { ChatRequest, ChatResponse, StreamEvent } from '../engines/engine-adapter';
import { loadEnginesConfig, type EngineConfig, type EnginesConfig } from '../engines/config';
import { EngineRuntime, type EngineMetricsSnapshot } from '../engines/engine-runtime';
import { EngineExecutionError } from '../engines/errors';

interface EngineGatewayOptions {
  configPath?: string;
}

export interface EngineCallOptions {
  engineKey?: string;
  model?: string;
}

export interface EngineSummary {
  key: string;
  provider: string;
  label?: string;
  defaultModel: string;
  models?: EngineConfig['models'];
  supportsTools: EngineConfig['supports_tools'];
  stream: boolean;
  fallback?: string[];
  hasApiKey: boolean;
}

class EngineGateway {
  private readonly configPath: string;
  private config: EnginesConfig;
  private readonly runtimes = new Map<string, EngineRuntime>();
  private watcherStarted = false;

  // Performance metrics
  private metrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    fallbackUsed: 0,
    avgLatency: 0,
    latencyCount: 0,
    engineStats: new Map<string, { success: number; failure: number; avgLatency: number; count: number }>()
  };

  constructor(options?: EngineGatewayOptions) {
    this.configPath = options?.configPath ?? path.join(process.cwd(), 'config', 'engines.yaml');
    this.config = loadEnginesConfig(this.configPath);
    this.applyConfig(this.config);
    this.startWatcher();
  }

  getDefaultEngineKey(): string {
    return this.config.default_engine;
  }

  async chat(request: ChatRequest, target?: string | EngineCallOptions): Promise<ChatResponse> {
    const { engineKey, model } = this.normalizeCallOptions(target);
    const chain = this.resolveFallbackChain(engineKey);
    const startTime = Date.now();

    this.metrics.totalRequests++;
    let lastError: EngineExecutionError | null = null;
    let attemptedEngines = 0;

    for (const key of chain) {
      attemptedEngines++;
      const runtime = this.runtimes.get(key);
      if (!runtime) {
        logger.warn(LogCategory.SYSTEM, `Engine runtime missing for key ${key}`);
        continue;
      }

      try {
        const { response } = await runtime.chat(request, model);
        const latency = Date.now() - startTime;

        // Track metrics
        this.metrics.successfulRequests++;
        this.updateEngineMetrics(key, true, latency);
        this.updateOverallLatency(latency);

        if (attemptedEngines > 1) {
          this.metrics.fallbackUsed++;
          logger.info(LogCategory.SYSTEM, `Fallback succeeded`, {
            primary: engineKey ?? this.config.default_engine,
            resolved: key,
            error: lastError?.message,
            attempts: attemptedEngines,
            latency: `${latency}ms`
          });
        }

        return response;
      } catch (error) {
        const wrapped = this.asEngineError(error, key);
        const latency = Date.now() - startTime;
        lastError = wrapped;

        // Track failure metrics
        this.updateEngineMetrics(key, false, latency);

        logger.warn(LogCategory.SYSTEM, `Engine ${key} failed`, {
          message: wrapped.message,
          retryable: wrapped.retryable,
          fallbackEligible: wrapped.fallbackEligible,
          status: wrapped.statusCode,
          latency: `${latency}ms`,
          attempt: attemptedEngines
        });
        if (!wrapped.fallbackEligible) {
          throw wrapped;
        }
      }
    }

    // All engines failed
    this.metrics.failedRequests++;

    throw lastError ??
      new EngineExecutionError('No engine available for request', {
        engineKey: engineKey ?? this.config.default_engine,
        provider: this.lookupConfig(engineKey ?? this.config.default_engine)?.provider
      });
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    const successRate = this.metrics.totalRequests > 0
      ? (this.metrics.successfulRequests / this.metrics.totalRequests) * 100
      : 0;

    const fallbackRate = this.metrics.successfulRequests > 0
      ? (this.metrics.fallbackUsed / this.metrics.successfulRequests) * 100
      : 0;

    const engineStats: Record<string, any> = {};
    for (const [key, stats] of this.metrics.engineStats) {
      const total = stats.success + stats.failure;
      engineStats[key] = {
        success: stats.success,
        failure: stats.failure,
        successRate: total > 0 ? ((stats.success / total) * 100).toFixed(2) + '%' : '0%',
        avgLatency: stats.avgLatency.toFixed(2) + 'ms'
      };
    }

    return {
      totalRequests: this.metrics.totalRequests,
      successfulRequests: this.metrics.successfulRequests,
      failedRequests: this.metrics.failedRequests,
      successRate: successRate.toFixed(2) + '%',
      fallbackUsed: this.metrics.fallbackUsed,
      fallbackRate: fallbackRate.toFixed(2) + '%',
      avgLatency: this.metrics.avgLatency.toFixed(2) + 'ms',
      engines: engineStats
    };
  }

  /**
   * Update per-engine metrics
   */
  private updateEngineMetrics(engineKey: string, success: boolean, latency: number): void {
    let stats = this.metrics.engineStats.get(engineKey);
    if (!stats) {
      stats = { success: 0, failure: 0, avgLatency: 0, count: 0 };
      this.metrics.engineStats.set(engineKey, stats);
    }

    if (success) {
      stats.success++;
    } else {
      stats.failure++;
    }

    stats.count++;
    stats.avgLatency = (stats.avgLatency * (stats.count - 1) + latency) / stats.count;
  }

  /**
   * Update overall latency metrics
   */
  private updateOverallLatency(latency: number): void {
    this.metrics.latencyCount++;
    this.metrics.avgLatency =
      (this.metrics.avgLatency * (this.metrics.latencyCount - 1) + latency) /
      this.metrics.latencyCount;
  }

  async stream(
    request: ChatRequest,
    target?: string | EngineCallOptions
  ): Promise<AsyncIterable<StreamEvent>> {
    const { engineKey, model } = this.normalizeCallOptions(target);
    const chain = this.resolveFallbackChain(engineKey);

    let lastError: EngineExecutionError | null = null;

    for (const key of chain) {
      const runtime = this.runtimes.get(key);
      if (!runtime) {
        logger.warn(LogCategory.SYSTEM, `Engine runtime missing for key ${key}`);
        continue;
      }

      try {
        const { response } = await runtime.stream(request, model);
        if (lastError) {
          logger.info(LogCategory.SYSTEM, `Streaming fallback succeeded`, {
            primary: engineKey ?? this.config.default_engine,
            resolved: key,
            error: lastError.message
          });
        }
        return response;
      } catch (error) {
        const wrapped = this.asEngineError(error, key);
        lastError = wrapped;
        logger.warn(LogCategory.SYSTEM, `Engine ${key} stream failed`, {
          message: wrapped.message,
          retryable: wrapped.retryable,
          fallbackEligible: wrapped.fallbackEligible,
          status: wrapped.statusCode
        });
        if (!wrapped.fallbackEligible) {
          throw wrapped;
        }
      }
    }

    throw lastError ??
      new EngineExecutionError('No engine available for streaming request', {
        engineKey: engineKey ?? this.config.default_engine,
        provider: this.lookupConfig(engineKey ?? this.config.default_engine)?.provider
      });
  }

  listEngines(): string[] {
    return this.config.engines.map(engine => engine.key);
  }

  getEngineSummaries(): EngineSummary[] {
    return this.config.engines.map(engine => ({
      key: engine.key,
      provider: engine.provider,
      label: engine.label,
      defaultModel: engine.model,
      models: engine.models,
      supportsTools: engine.supports_tools,
      stream: engine.stream,
      fallback: engine.fallback,
      hasApiKey: engine.api_key_env ? Boolean(process.env[engine.api_key_env]) : true
    }));
  }

  getMetrics(): EngineMetricsSnapshot[] {
    return Array.from(this.runtimes.values()).map(runtime => runtime.getMetrics());
  }

  private startWatcher() {
    if (this.watcherStarted) {
      return;
    }

    try {
      fs.watchFile(this.configPath, { interval: 2000 }, () => {
        try {
          const nextConfig = loadEnginesConfig(this.configPath);
          this.config = nextConfig;
          this.applyConfig(nextConfig);
          logger.info(LogCategory.SYSTEM, 'Reloaded engines.yaml', {
            engines: nextConfig.engines.map(engine => engine.key)
          });
        } catch (error) {
          logger.error(LogCategory.SYSTEM, 'Failed to reload engines.yaml', error);
        }
      });
      this.watcherStarted = true;
    } catch (error) {
      logger.warn(LogCategory.SYSTEM, 'Unable to watch engines.yaml for changes', error);
    }
  }

  private applyConfig(config: EnginesConfig) {
    const nextKeys = new Set<string>();

    for (const engine of config.engines) {
      nextKeys.add(engine.key);
      const secrets = this.resolveSecrets(engine);
      if (engine.api_key_env && !secrets.apiKey) {
        logger.warn(LogCategory.SYSTEM, `Missing API key for ${engine.key}. Set ${engine.api_key_env} before enabling.`);
      }
      const existing = this.runtimes.get(engine.key);
      if (existing) {
        existing.updateConfig(engine, secrets);
      } else {
        this.runtimes.set(engine.key, new EngineRuntime(engine, secrets));
      }
    }

    for (const [key, runtime] of this.runtimes.entries()) {
      if (!nextKeys.has(key)) {
        void runtime.shutdown().catch(error =>
          logger.warn(LogCategory.SYSTEM, `Failed to shutdown runtime for ${key}`, error)
        );
        this.runtimes.delete(key);
      }
    }
  }

  private normalizeCallOptions(target?: string | EngineCallOptions): EngineCallOptions {
    if (typeof target === 'string') {
      return { engineKey: target };
    }
    return {
      engineKey: target?.engineKey,
      model: target?.model
    };
  }

  private resolveFallbackChain(engineKey?: string): string[] {
    const primary = engineKey ?? this.config.default_engine;
    const queue: string[] = [primary];
    const visited = new Set<string>();
    const ordered: string[] = [];

    while (queue.length > 0) {
      const key = queue.shift()!;
      if (visited.has(key)) {
        continue;
      }
      visited.add(key);
      ordered.push(key);
      const cfg = this.lookupConfig(key);
      if (cfg?.fallback) {
        queue.push(...cfg.fallback);
      }
    }

    return ordered;
  }

  private resolveSecrets(engine: EngineConfig) {
    return {
      apiKey: engine.api_key_env ? process.env[engine.api_key_env] : undefined,
      organization: engine.organization_env ? process.env[engine.organization_env] : undefined
    };
  }

  private lookupConfig(key: string): EngineConfig | undefined {
    return this.config.engines.find(engine => engine.key === key);
  }

  private asEngineError(error: unknown, engineKey: string): EngineExecutionError {
    if (error instanceof EngineExecutionError) {
      return error;
    }

    const cfg = this.lookupConfig(engineKey);
    return new EngineExecutionError((error as Error)?.message ?? 'Engine execution failed', {
      engineKey,
      provider: cfg?.provider,
      originalError: error,
      retryable: false,
      fallbackEligible: false
    });
  }
}

export const engineGateway = new EngineGateway();
