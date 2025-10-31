/**
 * Centralized configuration for MaiFarm server
 * Single source of truth for all environment variables and configuration
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { logger } from '../utils/logger';

// Load environment variables based on NODE_ENV
const envFile = process.env.NODE_ENV === 'production' 
  ? '.env' 
  : process.env.NODE_ENV === 'test'
  ? '.env.test'
  : '.env.development';

dotenv.config({ path: resolve(process.cwd(), envFile) });

export class ConfigurationValidationError extends Error {
  public readonly errors: string[];

  constructor(errors: string[]) {
    super('Configuration validation failed');
    this.name = 'ConfigurationValidationError';
    this.errors = errors;
  }
}

export interface ConfigurationValidationResult {
  success: boolean;
  errors: string[];
}

// Helper function to get required env variable
function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (!value && !defaultValue) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value!;
}

// Helper function to get boolean env variable
function getBoolEnv(key: string, defaultValue: boolean = false): boolean {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

// Helper function to get number env variable
function getNumberEnv(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const num = parseInt(value, 10);
  return isNaN(num) ? defaultValue : num;
}

// Main configuration object
export const config = {
  // Environment
  env: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV === 'development',
  isTest: process.env.NODE_ENV === 'test',

  // Server configuration
  server: {
    port: getNumberEnv('PORT', 4567),
    host: getEnvVar('HOST', 'localhost'),
    corsOrigin: getEnvVar('CORS_ORIGIN', 'http://localhost:3000'),
    trustProxy: getBoolEnv('TRUST_PROXY', false),
    shutdownTimeout: getNumberEnv('SHUTDOWN_TIMEOUT', 30000), // 30 seconds
  },

  // Database configuration
  database: {
    host: getEnvVar('DB_HOST', 'localhost'),
    port: getNumberEnv('DB_PORT', 5432),
    database: getEnvVar('DB_NAME', 'maifarm'),
    user: getEnvVar('DB_USER', 'maifarm'),
    password: getEnvVar('DB_PASSWORD', 'maifarm123'),
    maxConnections: getNumberEnv('DB_MAX_CONNECTIONS', 20),
    idleTimeout: getNumberEnv('DB_IDLE_TIMEOUT', 10000),
    connectionTimeout: getNumberEnv('DB_CONNECTION_TIMEOUT', 5000),
  },

  // Redis configuration
  redis: {
    url: getEnvVar('REDIS_URL', 'redis://localhost:6379'),
    host: getEnvVar('REDIS_HOST', 'localhost'),
    port: getNumberEnv('REDIS_PORT', 6379),
    password: process.env.REDIS_PASSWORD,
    db: getNumberEnv('REDIS_DB', 0),
    keyPrefix: getEnvVar('REDIS_KEY_PREFIX', 'maifarm:'),
    ttl: getNumberEnv('REDIS_TTL', 3600), // 1 hour default
  },

  // Authentication configuration
  auth: {
    enabled: !getBoolEnv('BYPASS_AUTH', false),
    jwtSecret: getEnvVar('JWT_SECRET', 'development-secret-change-in-production'),
    jwtExpiry: getEnvVar('JWT_EXPIRY', '24h'),
    refreshTokenExpiry: getEnvVar('REFRESH_TOKEN_EXPIRY', '7d'),
    sessionSecret: getEnvVar('SESSION_SECRET', 'session-secret-change-in-production'),
    bcryptRounds: getNumberEnv('BCRYPT_ROUNDS', 10),
  },

  // AI Provider configuration
  providers: {
    // Claude configuration
    claude: {
      enabled: getBoolEnv('CLAUDE_ENABLED', true),
      apiKey: process.env.CLAUDE_API_KEY,
      model: getEnvVar('CLAUDE_MODEL', 'claude-3-opus-20240229'),
      maxTokens: getNumberEnv('CLAUDE_MAX_TOKENS', 4096),
      temperature: parseFloat(process.env.CLAUDE_TEMPERATURE || '0.7'),
    },
    
    // Qwen configuration
    qwen: {
      enabled: getBoolEnv('QWEN_ENABLED', false),
      apiEndpoint: getEnvVar('QWEN_API_ENDPOINT', 'https://dashscope.aliyuncs.com/api/v1'),
      model: getEnvVar('QWEN_MODEL', 'qwen-coder-480b'),
      maxTokens: getNumberEnv('QWEN_MAX_TOKENS', 4096),
      temperature: parseFloat(process.env.QWEN_TEMPERATURE || '0.7'),
      useLLMProxy: getBoolEnv('USE_LLM_PROXY', false),
      llmProxyUrl: getEnvVar('LLM_PROXY_URL', 'http://localhost:8001'),
    },
    
    // Ollama configuration
    ollama: {
      enabled: getBoolEnv('OLLAMA_ENABLED', false),
      baseUrl: getEnvVar('OLLAMA_BASE_URL', 'http://localhost:11434'),
      model: getEnvVar('OLLAMA_MODEL', 'llama2'),
      timeout: getNumberEnv('OLLAMA_TIMEOUT', 30000),
    },
  },

  // File paths configuration
  paths: {
    // Main barn directory for isolated storage
    barn: getEnvVar('BARN_PATH', resolve(process.cwd(), 'maibarn')),
    
    // Coordination directory
    coordination: getEnvVar('COORDINATION_PATH', resolve(process.cwd(), 'maibarn/coordination')),
    
    // Workspace directory
    workspace: getEnvVar('WORKSPACE_PATH', resolve(process.cwd(), 'maibarn/workspaces')),
    
    // Harvests directory
    harvests: getEnvVar('HARVESTS_PATH', resolve(process.cwd(), 'maibarn/harvests')),
    
    // Logs directory
    logs: getEnvVar('LOGS_PATH', resolve(process.cwd(), 'logs')),
    
    // Temp directory
    temp: getEnvVar('TEMP_PATH', resolve(process.cwd(), 'temp')),
  },

  // WebSocket configuration
  websocket: {
    port: getNumberEnv('WS_PORT', 4567), // Same as server port by default
    pingInterval: getNumberEnv('WS_PING_INTERVAL', 30000),
    pingTimeout: getNumberEnv('WS_PING_TIMEOUT', 5000),
    maxReconnectAttempts: getNumberEnv('WS_MAX_RECONNECT_ATTEMPTS', 5),
    reconnectInterval: getNumberEnv('WS_RECONNECT_INTERVAL', 1000),
  },

  // Rate limiting configuration
  rateLimit: {
    enabled: getBoolEnv('RATE_LIMIT_ENABLED', true),
    windowMs: getNumberEnv('RATE_LIMIT_WINDOW_MS', 60000), // 1 minute
    maxRequests: getNumberEnv('RATE_LIMIT_MAX_REQUESTS', 100),
    skipFailedRequests: getBoolEnv('RATE_LIMIT_SKIP_FAILED', false),
    skipSuccessfulRequests: getBoolEnv('RATE_LIMIT_SKIP_SUCCESS', false),
  },

  // Monitoring configuration
  monitoring: {
    enabled: getBoolEnv('MONITORING_ENABLED', true),
    prometheusPort: getNumberEnv('PROMETHEUS_PORT', 9090),
    grafanaPort: getNumberEnv('GRAFANA_PORT', 3001),
    logLevel: getEnvVar('LOG_LEVEL', process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  },

  // Farm configuration
  farm: {
    maxAgents: getNumberEnv('MAX_AGENTS_PER_FARM', 10),
    defaultTimeout: getNumberEnv('FARM_DEFAULT_TIMEOUT', 300000), // 5 minutes
    gracefulShutdownPeriod: getNumberEnv('GRACEFUL_SHUTDOWN_PERIOD', 30000), // 30 seconds
    quickTaskTimeout: getNumberEnv('QUICK_TASK_TIMEOUT', 300000), // 5 minutes (fixed)
  },

  // Security configuration
  security: {
    helmetEnabled: getBoolEnv('HELMET_ENABLED', true),
    csrfEnabled: getBoolEnv('CSRF_ENABLED', true),
    sanitizerEnabled: getBoolEnv('SANITIZER_ENABLED', true),
    maxRequestSize: getEnvVar('MAX_REQUEST_SIZE', '10mb'),
    trustedProxies: process.env.TRUSTED_PROXIES?.split(',') || [],
  },

  // Feature flags
  features: {
    goWildMode: getBoolEnv('FEATURE_GOWILD_MODE', true),
    multiAgentOrchestration: getBoolEnv('FEATURE_MULTI_AGENT', true),
    advancedAnalytics: getBoolEnv('FEATURE_ADVANCED_ANALYTICS', true),
    themeEngine: getBoolEnv('FEATURE_THEME_ENGINE', true),
  },
};

// Validate critical configuration on startup
export function validateConfig(): void {
  const errors: string[] = [];

  // Check database configuration
  if (config.isProduction && config.database.password === 'maifarm123') {
    errors.push('Using default database password in production');
  }

  // Check authentication configuration
  if (config.isProduction && !config.auth.enabled) {
    errors.push('Authentication is disabled in production');
  }

  if (config.isProduction && config.auth.jwtSecret === 'development-secret-change-in-production') {
    errors.push('Using default JWT secret in production');
  }

  // Check AI provider configuration - skip in development for now
  // if (!config.providers.claude.apiKey && !config.providers.ollama.enabled) {
  //   errors.push('No AI provider configured');
  // }

  // Throw error if critical issues found
  if (errors.length > 0) {
    throw new ConfigurationValidationError(errors);
  }
}

// Legacy compatibility exports
export function logConfiguration(): void {
  if (logger && logger.info) {
    logger.info('Server configuration loaded', {
    env: config.env,
    server: {
      port: config.server.port,
      host: config.server.host,
    },
    database: {
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
    },
    redis: {
      host: config.redis.host,
      port: config.redis.port,
    },
    auth: {
      enabled: config.auth.enabled,
    },
    providers: {
      claude: config.providers.claude.enabled,
      qwen: config.providers.qwen.enabled,
      ollama: config.providers.ollama.enabled,
    },
  });
  } else {
    console.log('Server configuration loaded');
  }
}

export function validateConfiguration(): ConfigurationValidationResult {
  try {
    validateConfig();
    logger.info('[CONFIG] Configuration validation passed.');
    return { success: true, errors: [] };
  } catch (error: unknown) {
    const errors = error instanceof ConfigurationValidationError
      ? error.errors
      : [error instanceof Error ? error.message : String(error)];

    logger.error('[CONFIG] Configuration validation failed.');
    errors.forEach(issue => logger.error(`[CONFIG] ${issue}`));

    if (error instanceof Error && error.stack) {
      logger.debug('[CONFIG] Validation stack trace', error.stack);
    }

    return { success: false, errors };
  }
}

// Export for convenience
export default config;
