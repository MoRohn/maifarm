/**
 * Production Database Configuration
 * Optimized settings for production deployment
 */

import { PoolConfig } from 'pg';
import { logger, LogCategory } from '../utils/logger';

interface ProductionDatabaseConfig extends PoolConfig {
  // Connection pool settings
  max: number;                    // Maximum number of connections
  min: number;                    // Minimum number of connections
  idleTimeoutMillis: number;      // How long a client can be idle
  connectionTimeoutMillis: number; // Connection timeout
  
  // Performance settings
  statement_timeout?: number;      // Query timeout in ms
  query_timeout?: number;          // Alternative query timeout
  
  // SSL/TLS settings
  ssl?: {
    rejectUnauthorized: boolean;
    ca?: string;
    cert?: string;
    key?: string;
  };
}

/**
 * Get production database configuration
 */
export function getProductionConfig(): ProductionDatabaseConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Base configuration
  const config: ProductionDatabaseConfig = {
    // Connection string components
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'maifarm',
    user: process.env.DB_USER || 'maifarm',
    password: process.env.DB_PASSWORD,
    
    // Connection pool settings (optimized for production)
    max: parseInt(process.env.DB_POOL_MAX || '50'),        // Increased for production
    min: parseInt(process.env.DB_POOL_MIN || '5'),         // Keep minimum connections ready
    idleTimeoutMillis: 30000,                              // 30 seconds
    connectionTimeoutMillis: 5000,                         // 5 seconds
    
    // Query timeout (30 seconds default, configurable)
    statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000'),
    query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT || '30000'),
    
    // Connection behavior
    allowExitOnIdle: false,  // Keep pool alive
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  };
  
  // SSL configuration for production
  if (isProduction || process.env.DB_SSL === 'true') {
    config.ssl = {
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
      ca: process.env.DB_SSL_CA,
      cert: process.env.DB_SSL_CERT,
      key: process.env.DB_SSL_KEY,
    };
  }
  
  // Connection string override (for cloud providers)
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    config.host = url.hostname;
    config.port = parseInt(url.port || '5432');
    config.database = url.pathname.slice(1);
    config.user = url.username;
    config.password = url.password;
    
    // Parse SSL from connection string
    if (url.searchParams.get('sslmode') === 'require') {
      config.ssl = { rejectUnauthorized: false };
    }
  }
  
  return config;
}

/**
 * Database health check configuration
 */
export const healthCheckConfig = {
  interval: 30000,          // Check every 30 seconds
  timeout: 5000,            // 5 second timeout for health checks
  retries: 3,               // Number of retries before marking unhealthy
  retryDelay: 1000,         // Delay between retries
};

/**
 * Database maintenance configuration
 */
export const maintenanceConfig = {
  // Automatic VACUUM settings
  autoVacuumInterval: 24 * 60 * 60 * 1000,  // Daily
  autoAnalyzeInterval: 6 * 60 * 60 * 1000,   // Every 6 hours
  
  // Connection pool maintenance
  poolMaintenanceInterval: 60 * 60 * 1000,   // Hourly
  staleConnectionTimeout: 5 * 60 * 1000,     // 5 minutes
  
  // Query performance monitoring
  slowQueryThreshold: 1000,                  // Log queries slower than 1 second
  queryLogging: process.env.DB_QUERY_LOGGING === 'true',
};

/**
 * Database connection retry configuration
 */
export const retryConfig = {
  maxAttempts: 10,
  initialDelay: 1000,
  maxDelay: 30000,
  factor: 2,              // Exponential backoff factor
  randomize: true,        // Add jitter to prevent thundering herd
};

/**
 * Get optimized query settings for different operation types
 */
export function getQueryConfig(operationType: 'read' | 'write' | 'batch' | 'analytics') {
  switch (operationType) {
    case 'read':
      return {
        statement_timeout: 5000,   // 5 seconds for reads
        lock_timeout: 1000,        // 1 second lock timeout
      };
    
    case 'write':
      return {
        statement_timeout: 10000,  // 10 seconds for writes
        lock_timeout: 5000,        // 5 second lock timeout
      };
    
    case 'batch':
      return {
        statement_timeout: 60000,  // 1 minute for batch operations
        lock_timeout: 10000,       // 10 second lock timeout
      };
    
    case 'analytics':
      return {
        statement_timeout: 300000, // 5 minutes for analytics queries
        lock_timeout: 1000,        // 1 second lock timeout (read-only)
      };
    
    default:
      return {
        statement_timeout: 30000,  // 30 second default
        lock_timeout: 5000,        // 5 second default
      };
  }
}

/**
 * Database performance monitoring thresholds
 */
export const performanceThresholds = {
  // Connection pool thresholds
  poolUtilizationWarning: 0.7,    // Warn at 70% pool usage
  poolUtilizationCritical: 0.9,   // Critical at 90% pool usage
  
  // Query performance thresholds
  avgQueryTimeWarning: 500,        // Warn if avg query time > 500ms
  avgQueryTimeCritical: 1000,      // Critical if avg query time > 1s
  
  // Connection thresholds
  activeConnectionsWarning: 40,    // Warn at 40 active connections
  activeConnectionsCritical: 45,   // Critical at 45 active connections
  
  // Transaction thresholds
  longTransactionWarning: 30000,   // Warn for transactions > 30s
  longTransactionCritical: 60000,  // Critical for transactions > 1min
};

/**
 * Log database configuration (sanitized)
 */
export function logDatabaseConfig(config: ProductionDatabaseConfig): void {
  const sanitized = {
    ...config,
    password: config.password ? '***' : undefined,
    ssl: config.ssl ? {
      ...config.ssl,
      key: config.ssl.key ? '***' : undefined,
      cert: config.ssl.cert ? '***' : undefined,
    } : undefined,
  };
  
  logger.info(LogCategory.DATABASE, 'Database configuration loaded', sanitized);
}

/**
 * Validate database configuration
 */
export function validateDatabaseConfig(config: ProductionDatabaseConfig): string[] {
  const errors: string[] = [];
  
  if (!config.database) {
    errors.push('Database name is required');
  }
  
  if (!config.user) {
    errors.push('Database user is required');
  }
  
  if (!config.password && process.env.NODE_ENV === 'production') {
    errors.push('Database password is required in production');
  }
  
  if (config.max < config.min) {
    errors.push('Maximum pool size must be greater than minimum');
  }
  
  if (config.max > 100) {
    errors.push('Maximum pool size should not exceed 100 connections');
  }
  
  return errors;
}

export default {
  getProductionConfig,
  healthCheckConfig,
  maintenanceConfig,
  retryConfig,
  getQueryConfig,
  performanceThresholds,
  logDatabaseConfig,
  validateDatabaseConfig,
};