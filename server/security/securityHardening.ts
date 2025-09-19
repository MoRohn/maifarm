/**
 * Security Hardening Module
 * Comprehensive security measures for production deployment
 */

import { Application, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { createHash, randomBytes } from 'crypto';
import { logger, LogCategory } from '../utils/logger';
import { RateLimiter } from '../middleware/rateLimiter';

/**
 * Security configuration
 */
export interface SecurityConfig {
  // CORS settings
  corsOrigins: string[];
  corsCredentials: boolean;
  
  // CSP settings
  contentSecurityPolicy: boolean;
  cspDirectives?: Record<string, string[]>;
  
  // Session settings
  sessionSecret: string;
  sessionMaxAge: number;
  
  // API security
  apiKeyRequired: boolean;
  apiKeyHeader: string;
  
  // Request validation
  maxRequestSize: string;
  maxParameterLimit: number;
  
  // Security headers
  enableHSTS: boolean;
  hstsMaxAge: number;
  
  // Input sanitization
  enableSanitization: boolean;
  
  // Monitoring
  enableAuditLog: boolean;
  enableSecurityAlerts: boolean;
}

/**
 * Default security configuration for production
 */
export const defaultSecurityConfig: SecurityConfig = {
  // CORS
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  corsCredentials: true,
  
  // CSP
  contentSecurityPolicy: true,
  cspDirectives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],  // Needed for React
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "https:"],
    connectSrc: ["'self'", "ws:", "wss:"],
    fontSrc: ["'self'", "data:"],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    frameSrc: ["'none'"],
  },
  
  // Session
  sessionSecret: process.env.SESSION_SECRET || randomBytes(32).toString('hex'),
  sessionMaxAge: 24 * 60 * 60 * 1000,  // 24 hours
  
  // API
  apiKeyRequired: process.env.NODE_ENV === 'production',
  apiKeyHeader: 'x-api-key',
  
  // Request limits
  maxRequestSize: '10mb',
  maxParameterLimit: 1000,
  
  // HSTS
  enableHSTS: process.env.NODE_ENV === 'production',
  hstsMaxAge: 31536000,  // 1 year
  
  // Features
  enableSanitization: true,
  enableAuditLog: true,
  enableSecurityAlerts: true,
};

/**
 * Apply comprehensive security hardening
 */
export function applySecurityHardening(app: Application, config: SecurityConfig = defaultSecurityConfig): void {
  logger.info(LogCategory.SECURITY, 'Applying security hardening...');
  
  // 1. Basic security headers with Helmet
  app.use(helmet({
    contentSecurityPolicy: config.contentSecurityPolicy ? {
      directives: config.cspDirectives,
    } : false,
    hsts: config.enableHSTS ? {
      maxAge: config.hstsMaxAge,
      includeSubDomains: true,
      preload: true,
    } : false,
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    dnsPrefetchControl: true,
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    xssFilter: true,
  }));
  
  // 2. CORS configuration
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);
      
      if (config.corsOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn(LogCategory.SECURITY, `CORS blocked origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: config.corsCredentials,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-CSRF-Token'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    maxAge: 86400,  // 24 hours
  }));
  
  // 3. Request size limits
  app.use(express.json({ 
    limit: config.maxRequestSize,
    strict: true,
  }));
  
  app.use(express.urlencoded({ 
    limit: config.maxRequestSize,
    extended: true,
    parameterLimit: config.maxParameterLimit,
  }));
  
  // 4. Security monitoring middleware
  if (config.enableAuditLog) {
    app.use(createAuditLogger());
  }
  
  // 5. Input sanitization
  if (config.enableSanitization) {
    app.use(createSanitizer());
  }
  
  // 6. CSRF protection
  app.use(createCSRFProtection());
  
  // 7. SQL injection protection
  app.use(createSQLInjectionProtection());
  
  // 8. XSS protection
  app.use(createXSSProtection());
  
  // 9. Path traversal protection
  app.use(createPathTraversalProtection());
  
  // 10. Security headers validation
  app.use(validateSecurityHeaders());
  
  logger.info(LogCategory.SECURITY, 'Security hardening applied successfully');
}

/**
 * Create audit logger middleware
 */
function createAuditLogger() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const auditEntry = {
      timestamp: new Date(),
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userId: (req as any).user?.id,
      requestId: randomBytes(16).toString('hex'),
    };
    
    // Log response details
    res.on('finish', async () => {
      const duration = Date.now() - startTime;
      const logEntry = {
        ...auditEntry,
        statusCode: res.statusCode,
        duration,
        responseSize: res.get('content-length'),
      };
      
      // Log security events
      if (res.statusCode === 401) {
        logger.warn(LogCategory.SECURITY, 'Unauthorized access attempt', logEntry);
      } else if (res.statusCode === 403) {
        logger.warn(LogCategory.SECURITY, 'Forbidden access attempt', logEntry);
      } else if (res.statusCode >= 500) {
        logger.error(LogCategory.SECURITY, 'Server error', logEntry);
      }
      
      // Store in database for compliance
      try {
        const { pool } = await import('../database/connection');
        await pool.query(
          `INSERT INTO events (event_type, event_category, event_data, ip_address, user_agent, user_id, severity)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          ['api_request', 'audit', JSON.stringify(logEntry), req.ip, req.get('user-agent'), (req as any).user?.id, 'info']
        );
      } catch (error) {
        logger.error(LogCategory.SECURITY, 'Failed to store audit log', error);
      }
    });
    
    next();
  };
}

/**
 * Create input sanitizer middleware
 */
function createSanitizer() {
  const dangerousPatterns = [
    /<script[^>]*>.*?<\/script>/gi,
    /<iframe[^>]*>.*?<\/iframe>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
  ];
  
  return (req: Request, res: Response, next: NextFunction) => {
    // Sanitize body
    if (req.body) {
      req.body = sanitizeObject(req.body, dangerousPatterns);
    }
    
    // Sanitize query params
    if (req.query) {
      req.query = sanitizeObject(req.query, dangerousPatterns) as any;
    }
    
    // Sanitize params
    if (req.params) {
      req.params = sanitizeObject(req.params, dangerousPatterns) as any;
    }
    
    next();
  };
}

/**
 * Sanitize object recursively
 */
function sanitizeObject(obj: any, patterns: RegExp[]): any {
  if (typeof obj === 'string') {
    let sanitized = obj;
    for (const pattern of patterns) {
      sanitized = sanitized.replace(pattern, '');
    }
    return sanitized;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, patterns));
  }
  
  if (obj && typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value, patterns);
    }
    return sanitized;
  }
  
  return obj;
}

/**
 * Create CSRF protection middleware
 */
function createCSRFProtection() {
  const csrfTokens = new Map<string, { token: string; expires: number }>();
  
  // Cleanup expired tokens
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of csrfTokens.entries()) {
      if (value.expires < now) {
        csrfTokens.delete(key);
      }
    }
  }, 60000);
  
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip for safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }
    
    // Skip for API endpoints with API key
    if (req.headers['x-api-key']) {
      return next();
    }
    
    // Validate CSRF token
    const token = req.headers['x-csrf-token'] as string || req.body?._csrf;
    const sessionId = (req as any).sessionID || req.ip;
    
    const stored = csrfTokens.get(sessionId);
    if (!stored || stored.token !== token || stored.expires < Date.now()) {
      logger.warn(LogCategory.SECURITY, 'CSRF token validation failed', {
        ip: req.ip,
        path: req.path,
        method: req.method,
      });
      return res.status(403).json({ error: 'Invalid CSRF token' });
    }
    
    next();
  };
}

/**
 * Create SQL injection protection
 */
function createSQLInjectionProtection() {
  const sqlPatterns = [
    /('|(\-\-)|(;)|(\|\|)|(\/\*)|(\*\/))/gi,
    /(\b(ALTER|CREATE|DELETE|DROP|EXEC(UTE)?|INSERT( +INTO)?|SELECT|UNION( +ALL)?|UPDATE)\b)/gi,
  ];
  
  return (req: Request, res: Response, next: NextFunction) => {
    const checkString = (str: string): boolean => {
      return sqlPatterns.some(pattern => pattern.test(str));
    };
    
    const checkObject = (obj: any): boolean => {
      if (typeof obj === 'string') {
        return checkString(obj);
      }
      if (Array.isArray(obj)) {
        return obj.some(checkObject);
      }
      if (obj && typeof obj === 'object') {
        return Object.values(obj).some(checkObject);
      }
      return false;
    };
    
    // Check all inputs
    if (checkObject(req.body) || checkObject(req.query) || checkObject(req.params)) {
      logger.warn(LogCategory.SECURITY, 'Potential SQL injection attempt', {
        ip: req.ip,
        path: req.path,
        method: req.method,
      });
      return res.status(400).json({ error: 'Invalid input detected' });
    }
    
    next();
  };
}

/**
 * Create XSS protection
 */
function createXSSProtection() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Set additional XSS protection headers
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    next();
  };
}

/**
 * Create path traversal protection
 */
function createPathTraversalProtection() {
  const pathPatterns = [
    /\.\.\/|\.\.\\/gi,
    /%2e%2e%2f|%2e%2e%5c/gi,
    /\.\.%2f|\.\.%5c/gi,
  ];
  
  return (req: Request, res: Response, next: NextFunction) => {
    const suspicious = pathPatterns.some(pattern => 
      pattern.test(req.path) || 
      pattern.test(req.originalUrl) ||
      pattern.test(JSON.stringify(req.query)) ||
      pattern.test(JSON.stringify(req.params))
    );
    
    if (suspicious) {
      logger.warn(LogCategory.SECURITY, 'Path traversal attempt blocked', {
        ip: req.ip,
        path: req.path,
        method: req.method,
      });
      return res.status(400).json({ error: 'Invalid path' });
    }
    
    next();
  };
}

/**
 * Validate security headers
 */
function validateSecurityHeaders() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Check for security headers in request
    const requiredHeaders = [
      'user-agent',
      'accept',
    ];
    
    for (const header of requiredHeaders) {
      if (!req.headers[header]) {
        logger.warn(LogCategory.SECURITY, `Missing required header: ${header}`, {
          ip: req.ip,
          path: req.path,
        });
      }
    }
    
    next();
  };
}

/**
 * Generate secure API key
 */
export function generateAPIKey(): string {
  const prefix = 'maifarm';
  const random = randomBytes(32).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
  return `${prefix}_${random}`;
}

/**
 * Hash API key for storage
 */
export function hashAPIKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Validate API key format
 */
export function validateAPIKeyFormat(apiKey: string): boolean {
  return /^maifarm_[a-zA-Z0-9]{32,}$/.test(apiKey);
}

/**
 * Security health check
 */
export async function performSecurityHealthCheck(): Promise<{
  healthy: boolean;
  issues: string[];
}> {
  const issues: string[] = [];
  
  // Check environment variables
  if (!process.env.SESSION_SECRET) {
    issues.push('SESSION_SECRET not set');
  }
  
  if (!process.env.API_KEY_ENCRYPTION_KEY) {
    issues.push('API_KEY_ENCRYPTION_KEY not set');
  }
  
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.DB_SSL || process.env.DB_SSL !== 'true') {
      issues.push('Database SSL not enabled');
    }
    
    if (!process.env.REDIS_PASSWORD) {
      issues.push('Redis password not set');
    }
  }
  
  return {
    healthy: issues.length === 0,
    issues,
  };
}

export default {
  applySecurityHardening,
  defaultSecurityConfig,
  generateAPIKey,
  hashAPIKey,
  validateAPIKeyFormat,
  performSecurityHealthCheck,
};