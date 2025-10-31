/**
 * Production Configuration
 * Centralized configuration for production deployment
 */

import { LogLevel } from '../utils/logger';

export interface ProductionConfig {
  // Server Configuration
  server: {
    port: number;
    host: string;
    trustProxy: boolean;
    corsOrigins: string[];
    maxRequestSize: string;
    requestTimeout: number;
    shutdownTimeout: number;
  };

  // Database Configuration
  database: {
    maxConnections: number;
    connectionTimeout: number;
    idleTimeout: number;
    statementTimeout: number;
    enableSSL: boolean;
    retryAttempts: number;
    retryDelay: number;
  };

  // Redis Configuration
  redis: {
    maxReconnectAttempts: number;
    reconnectDelay: number;
    commandTimeout: number;
    enableOfflineQueue: boolean;
    maxQueueSize: number;
  };

  // Memory Management
  memory: {
    warningThreshold: number;
    criticalThreshold: number;
    emergencyThreshold: number;
    monitorInterval: number;
    maxHeapSize: number;
    enableGarbageCollection: boolean;
  };

  // Logging Configuration
  logging: {
    level: LogLevel;
    enableFileLogging: boolean;
    logDirectory: string;
    maxFileSize: string;
    maxFiles: number;
    enableErrorReporting: boolean;
    errorReportingEndpoint?: string;
  };

  // Security Configuration
  security: {
    enableRateLimit: boolean;
    rateLimitWindow: number;
    rateLimitMax: number;
    enableHelmet: boolean;
    enableCSRF: boolean;
    sessionSecret: string;
    jwtSecret: string;
    jwtExpiry: string;
    bcryptRounds: number;
  };

  // Monitoring Configuration
  monitoring: {
    enableMetrics: boolean;
    metricsPort: number;
    enableHealthCheck: boolean;
    healthCheckInterval: number;
    enableAPM: boolean;
    apmServiceName: string;
    enableTracing: boolean;
  };

  // Performance Configuration
  performance: {
    enableCompression: boolean;
    compressionLevel: number;
    enableCaching: boolean;
    cacheMaxAge: number;
    enableCDN: boolean;
    cdnUrl?: string;
    enableMinification: boolean;
  };

  // Farm Configuration
  farms: {
    maxConcurrentFarms: number;
    maxAgentsPerFarm: number;
    defaultTimeout: number;
    maxTimeout: number;
    enableAutoCleanup: boolean;
    cleanupInterval: number;
    maxRetries: number;
  };

  // WebSocket Configuration
  websocket: {
    maxConnections: number;
    pingInterval: number;
    pingTimeout: number;
    maxMessageSize: number;
    enableCompression: boolean;
    perMessageDeflate: boolean;
  };
}

const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

export const productionConfig: ProductionConfig = {
  server: {
    port: parseInt(process.env.PORT || '4567', 10),
    host: process.env.HOST || '0.0.0.0',
    trustProxy: process.env.TRUST_PROXY === 'true',
    corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    maxRequestSize: process.env.MAX_REQUEST_SIZE || '50mb',
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '120000', 10),
    shutdownTimeout: parseInt(process.env.SHUTDOWN_TIMEOUT || '30000', 10)
  },

  database: {
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
    connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '30000', 10),
    idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || '10000', 10),
    statementTimeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '60000', 10),
    enableSSL: process.env.DB_SSL === 'true',
    retryAttempts: parseInt(process.env.DB_RETRY_ATTEMPTS || '3', 10),
    retryDelay: parseInt(process.env.DB_RETRY_DELAY || '1000', 10)
  },

  redis: {
    maxReconnectAttempts: parseInt(process.env.REDIS_MAX_RECONNECT || '10', 10),
    reconnectDelay: parseInt(process.env.REDIS_RECONNECT_DELAY || '1000', 10),
    commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '5000', 10),
    enableOfflineQueue: process.env.REDIS_OFFLINE_QUEUE !== 'false',
    maxQueueSize: parseInt(process.env.REDIS_MAX_QUEUE_SIZE || '1000', 10)
  },

  memory: {
    warningThreshold: parseFloat(process.env.MEMORY_WARNING_THRESHOLD || '0.7'),
    criticalThreshold: parseFloat(process.env.MEMORY_CRITICAL_THRESHOLD || '0.85'),
    emergencyThreshold: parseFloat(process.env.MEMORY_EMERGENCY_THRESHOLD || '0.95'),
    monitorInterval: parseInt(process.env.MEMORY_MONITOR_INTERVAL || '30000', 10),
    maxHeapSize: parseInt(process.env.MAX_HEAP_SIZE || '8589934592', 10), // 8GB default
    enableGarbageCollection: process.env.ENABLE_GC === 'true'
  },

  logging: {
    level: (process.env.LOG_LEVEL as LogLevel) || (isProduction ? LogLevel.INFO : LogLevel.DEBUG),
    enableFileLogging: process.env.ENABLE_FILE_LOGGING === 'true',
    logDirectory: process.env.LOG_DIRECTORY || './logs',
    maxFileSize: process.env.LOG_MAX_FILE_SIZE || '20m',
    maxFiles: parseInt(process.env.LOG_MAX_FILES || '14', 10),
    enableErrorReporting: process.env.ENABLE_ERROR_REPORTING === 'true',
    errorReportingEndpoint: process.env.ERROR_REPORTING_ENDPOINT
  },

  security: {
    enableRateLimit: process.env.ENABLE_RATE_LIMIT !== 'false',
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '900000', 10), // 15 minutes
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    enableHelmet: process.env.ENABLE_HELMET !== 'false',
    enableCSRF: process.env.ENABLE_CSRF === 'true',
    sessionSecret: process.env.SESSION_SECRET || 'change-me-in-production',
    jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
    jwtExpiry: process.env.JWT_EXPIRY || '7d',
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10)
  },

  monitoring: {
    enableMetrics: process.env.ENABLE_METRICS === 'true',
    metricsPort: parseInt(process.env.METRICS_PORT || '9090', 10),
    enableHealthCheck: process.env.ENABLE_HEALTH_CHECK !== 'false',
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000', 10),
    enableAPM: process.env.ENABLE_APM === 'true',
    apmServiceName: process.env.APM_SERVICE_NAME || 'maifarm',
    enableTracing: process.env.ENABLE_TRACING === 'true'
  },

  performance: {
    enableCompression: process.env.ENABLE_COMPRESSION !== 'false',
    compressionLevel: parseInt(process.env.COMPRESSION_LEVEL || '6', 10),
    enableCaching: process.env.ENABLE_CACHING !== 'false',
    cacheMaxAge: parseInt(process.env.CACHE_MAX_AGE || '3600', 10),
    enableCDN: process.env.ENABLE_CDN === 'true',
    cdnUrl: process.env.CDN_URL,
    enableMinification: isProduction
  },

  farms: {
    maxConcurrentFarms: parseInt(process.env.MAX_CONCURRENT_FARMS || '10', 10),
    maxAgentsPerFarm: parseInt(process.env.MAX_AGENTS_PER_FARM || '10', 10),
    defaultTimeout: parseInt(process.env.FARM_DEFAULT_TIMEOUT || '3600', 10), // 1 hour
    maxTimeout: parseInt(process.env.FARM_MAX_TIMEOUT || '86400', 10), // 24 hours
    enableAutoCleanup: process.env.ENABLE_AUTO_CLEANUP !== 'false',
    cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL || '300000', 10), // 5 minutes
    maxRetries: parseInt(process.env.FARM_MAX_RETRIES || '3', 10)
  },

  websocket: {
    maxConnections: parseInt(process.env.WS_MAX_CONNECTIONS || '1000', 10),
    pingInterval: parseInt(process.env.WS_PING_INTERVAL || '30000', 10),
    pingTimeout: parseInt(process.env.WS_PING_TIMEOUT || '5000', 10),
    maxMessageSize: parseInt(process.env.WS_MAX_MESSAGE_SIZE || '1048576', 10), // 1MB
    enableCompression: process.env.WS_ENABLE_COMPRESSION === 'true',
    perMessageDeflate: process.env.WS_PER_MESSAGE_DEFLATE === 'true'
  }
};

// Validation function
export function validateProductionConfig(): void {
  const errors: string[] = [];

  // Validate required secrets in production
  if (isProduction) {
    if (productionConfig.security.sessionSecret === 'change-me-in-production') {
      errors.push('SESSION_SECRET must be set in production');
    }
    if (productionConfig.security.jwtSecret === 'change-me-in-production') {
      errors.push('JWT_SECRET must be set in production');
    }
    if (!process.env.API_KEY_ENCRYPTION_KEY) {
      errors.push('API_KEY_ENCRYPTION_KEY must be set in production');
    }
  }

  // Validate memory thresholds
  if (productionConfig.memory.warningThreshold >= productionConfig.memory.criticalThreshold) {
    errors.push('Memory warning threshold must be less than critical threshold');
  }
  if (productionConfig.memory.criticalThreshold >= productionConfig.memory.emergencyThreshold) {
    errors.push('Memory critical threshold must be less than emergency threshold');
  }

  // Validate database configuration
  if (productionConfig.database.maxConnections < 1) {
    errors.push('Database max connections must be at least 1');
  }

  // Validate farm configuration
  if (productionConfig.farms.defaultTimeout > productionConfig.farms.maxTimeout) {
    errors.push('Farm default timeout cannot exceed max timeout');
  }

  if (errors.length > 0) {
    throw new Error(`Production configuration validation failed:\n${errors.join('\n')}`);
  }
}

// Export helper functions
export function isProductionMode(): boolean {
  return isProduction;
}

export function isDevelopmentMode(): boolean {
  return isDevelopment;
}

export function getEnvironment(): string {
  return process.env.NODE_ENV || 'development';
}