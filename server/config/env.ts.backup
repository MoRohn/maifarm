import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');

// Load environment variables based on NODE_ENV
const envFile = process.env.NODE_ENV === 'development' ? '.env.development' : '.env';
const envPath = path.resolve(rootDir, envFile);

// Load environment with explicit path
dotenv.config({ path: envPath });

// Validate and provide defaults for critical environment variables
export const config = {
  // Server Configuration
  port: parseInt(process.env.PORT || '4567', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  
  // API URLs
  apiUrl: process.env.VITE_API_URL || `http://localhost:${process.env.PORT || '4567'}`,
  wsUrl: process.env.VITE_WS_URL || `ws://localhost:${process.env.PORT || '4567'}`,
  
  // Authentication
  jwt: {
    secret: process.env.JWT_SECRET || 'maifarm-dev-secret-key',
    expiry: process.env.JWT_EXPIRY || '7d'
  },
  bypassAuth: process.env.BYPASS_AUTH === 'true',
  
  // Database Configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'maifarm_dev',
    user: process.env.DB_USER || 'maifarm',
    password: process.env.DB_PASSWORD || 'maifarm123',
    poolSize: parseInt(process.env.DB_POOL_SIZE || '20', 10)
  },
  
  // Redis Configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10)
  },
  
  // WebSocket Configuration
  websocket: {
    port: parseInt(process.env.WS_PORT || process.env.PORT || '4567', 10),
    path: process.env.WS_PATH || '/socket.io'
  },
  
  // CORS Configuration
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true
  },
  
  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'debug',
    format: process.env.LOG_FORMAT || 'pretty'
  },
  
  // Security
  security: {
    sessionSecret: process.env.SESSION_SECRET || 'dev-session-secret',
    rateLimitWindow: process.env.RATE_LIMIT_WINDOW || '15m',
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '1000', 10)
  },
  
  // Feature Flags
  features: {
    goWild: process.env.ENABLE_GO_WILD === 'true',
    monitoring: process.env.ENABLE_MONITORING === 'true',
    offlineMode: process.env.ENABLE_OFFLINE_MODE === 'true'
  }
};

// Log configuration on startup (without sensitive data)
export function logConfiguration() {
  console.log('=== MaiFarm Server Configuration ===');
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`Port: ${config.port}`);
  console.log(`WebSocket Port: ${config.websocket.port}`);
  console.log(`WebSocket Path: ${config.websocket.path}`);
  console.log(`CORS Origins: ${config.cors.origin.join(', ')}`);
  console.log(`Auth Bypass: ${config.bypassAuth}`);
  console.log(`Database: ${config.database.host}:${config.database.port}/${config.database.name}`);
  console.log(`Redis: ${config.redis.host}:${config.redis.port}`);
  console.log('Features:', config.features);
  console.log('====================================');
}

// Validate critical configuration
export function validateConfiguration(): boolean {
  const errors: string[] = [];
  
  if (!config.port || config.port < 1 || config.port > 65535) {
    errors.push('Invalid PORT configuration');
  }
  
  if (!config.jwt.secret || config.jwt.secret === 'change-me') {
    if (config.isProduction) {
      errors.push('JWT_SECRET must be set in production');
    } else {
      console.warn('⚠️  Using default JWT_SECRET - not secure for production');
    }
  }
  
  if (errors.length > 0) {
    console.error('Configuration validation failed:');
    errors.forEach(err => console.error(`  - ${err}`));
    return false;
  }
  
  return true;
}

export default config;