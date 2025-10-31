/**
 * Security Headers Middleware
 * Implements comprehensive security headers for protection against common attacks
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { LogCategory } from '../utils/logger';

export interface SecurityHeadersConfig {
  contentSecurityPolicy?: boolean | ContentSecurityPolicyOptions;
  crossOriginEmbedderPolicy?: boolean;
  crossOriginOpenerPolicy?: boolean;
  crossOriginResourcePolicy?: boolean;
  dnsPrefetchControl?: boolean;
  frameguard?: boolean | { action: 'deny' | 'sameorigin' };
  hidePoweredBy?: boolean;
  hsts?: boolean | HstsOptions;
  ieNoOpen?: boolean;
  noSniff?: boolean;
  originAgentCluster?: boolean;
  permittedCrossDomainPolicies?: boolean;
  referrerPolicy?: boolean | ReferrerPolicyOptions;
  xssFilter?: boolean;
}

interface ContentSecurityPolicyOptions {
  directives: Record<string, string[]>;
  reportOnly?: boolean;
}

interface HstsOptions {
  maxAge?: number;
  includeSubDomains?: boolean;
  preload?: boolean;
}

interface ReferrerPolicyOptions {
  policy: string | string[];
}

// Default CSP directives
const DEFAULT_CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.jsdelivr.net', 'https://unpkg.com'],
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net'],
  'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
  'img-src': ["'self'", 'data:', 'https:', 'blob:'],
  'connect-src': ["'self'", 'ws:', 'wss:', 'http://localhost:*', 'https://api.anthropic.com', 'https://api.openai.com'],
  'media-src': ["'self'"],
  'object-src': ["'none'"],
  'frame-src': ["'self'"],
  'frame-ancestors': ["'self'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'manifest-src': ["'self'"],
  'worker-src': ["'self'", 'blob:'],
  'child-src': ["'self'", 'blob:']
};

// Production CSP directives (stricter)
const PRODUCTION_CSP_DIRECTIVES = {
  'default-src': ["'none'"],
  'script-src': ["'self'"],
  'style-src': ["'self'"],
  'font-src': ["'self'"],
  'img-src': ["'self'", 'data:', 'https:'],
  'connect-src': ["'self'", 'wss:', 'https://api.anthropic.com', 'https://api.openai.com'],
  'media-src': ["'none'"],
  'object-src': ["'none'"],
  'frame-src': ["'none'"],
  'frame-ancestors': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'upgrade-insecure-requests': [],
  'block-all-mixed-content': []
};

/**
 * Generate nonce for CSP
 */
function generateNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}

/**
 * Build CSP header string
 */
function buildCSPHeader(directives: Record<string, string[]>, nonce?: string): string {
  const parts: string[] = [];
  
  for (const [directive, values] of Object.entries(directives)) {
    if (values.length === 0) {
      parts.push(directive);
    } else {
      let directiveValues = values;
      
      // Add nonce to script-src and style-src if provided
      if (nonce && (directive === 'script-src' || directive === 'style-src')) {
        directiveValues = [...values, `'nonce-${nonce}'`];
      }
      
      parts.push(`${directive} ${directiveValues.join(' ')}`);
    }
  }
  
  return parts.join('; ');
}

/**
 * Security headers middleware
 */
export function securityHeaders(options: SecurityHeadersConfig = {}) {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Set defaults
  const config: SecurityHeadersConfig = {
    contentSecurityPolicy: true,
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: false, // Can break cross-origin requests
    dnsPrefetchControl: true,
    frameguard: true,
    hidePoweredBy: true,
    hsts: isProduction,
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: false,
    referrerPolicy: true,
    xssFilter: true,
    ...options
  };
  
  return (req: Request, res: Response, next: NextFunction) => {
    // Content Security Policy
    if (config.contentSecurityPolicy) {
      const cspOptions = typeof config.contentSecurityPolicy === 'object' 
        ? config.contentSecurityPolicy 
        : { directives: isProduction ? PRODUCTION_CSP_DIRECTIVES : DEFAULT_CSP_DIRECTIVES };
      
      // Generate nonce for inline scripts
      const nonce = generateNonce();
      (req as any).nonce = nonce;
      
      const headerName = cspOptions.reportOnly 
        ? 'Content-Security-Policy-Report-Only' 
        : 'Content-Security-Policy';
      
      res.setHeader(headerName, buildCSPHeader(cspOptions.directives, nonce));
    }
    
    // Cross-Origin-Embedder-Policy
    if (config.crossOriginEmbedderPolicy) {
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    }
    
    // Cross-Origin-Opener-Policy
    if (config.crossOriginOpenerPolicy) {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    }
    
    // Cross-Origin-Resource-Policy
    if (config.crossOriginResourcePolicy) {
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    }
    
    // X-DNS-Prefetch-Control
    if (config.dnsPrefetchControl) {
      res.setHeader('X-DNS-Prefetch-Control', 'off');
    }
    
    // X-Frame-Options
    if (config.frameguard) {
      const action = typeof config.frameguard === 'object' 
        ? config.frameguard.action 
        : 'sameorigin';
      res.setHeader('X-Frame-Options', action.toUpperCase());
    }
    
    // X-Powered-By
    if (config.hidePoweredBy) {
      res.removeHeader('X-Powered-By');
    }
    
    // Strict-Transport-Security (HSTS)
    if (config.hsts) {
      const hstsOptions = typeof config.hsts === 'object' 
        ? config.hsts 
        : {};
      
      const maxAge = hstsOptions.maxAge || 31536000; // 1 year
      let headerValue = `max-age=${maxAge}`;
      
      if (hstsOptions.includeSubDomains) {
        headerValue += '; includeSubDomains';
      }
      
      if (hstsOptions.preload) {
        headerValue += '; preload';
      }
      
      res.setHeader('Strict-Transport-Security', headerValue);
    }
    
    // X-Download-Options
    if (config.ieNoOpen) {
      res.setHeader('X-Download-Options', 'noopen');
    }
    
    // X-Content-Type-Options
    if (config.noSniff) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }
    
    // Origin-Agent-Cluster
    if (config.originAgentCluster) {
      res.setHeader('Origin-Agent-Cluster', '?1');
    }
    
    // X-Permitted-Cross-Domain-Policies
    if (config.permittedCrossDomainPolicies) {
      res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    }
    
    // Referrer-Policy
    if (config.referrerPolicy) {
      const policy = typeof config.referrerPolicy === 'object'
        ? config.referrerPolicy.policy
        : 'strict-origin-when-cross-origin';
      
      res.setHeader('Referrer-Policy', Array.isArray(policy) ? policy.join(',') : policy);
    }
    
    // X-XSS-Protection (deprecated but still used by older browsers)
    if (config.xssFilter) {
      res.setHeader('X-XSS-Protection', '1; mode=block');
    }
    
    // Additional security headers
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    
    next();
  };
}

/**
 * CORS configuration with security best practices
 */
export function configureCORS(options: {
  origin?: string | string[] | boolean | ((origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void);
  credentials?: boolean;
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  maxAge?: number;
} = {}) {
  const defaults = {
    origin: process.env.NODE_ENV === 'production' 
      ? (process.env.ALLOWED_ORIGINS?.split(',') || ['https://maifarm.app'])
      : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    maxAge: 86400 // 24 hours
  };
  
  const config = { ...defaults, ...options };
  
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    
    // Handle origin validation
    if (typeof config.origin === 'function') {
      config.origin(origin, (err, allow) => {
        if (err) {
          return next(err);
        }
        if (allow) {
          res.setHeader('Access-Control-Allow-Origin', origin || '*');
        }
      });
    } else if (typeof config.origin === 'boolean') {
      if (config.origin) {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
      }
    } else if (Array.isArray(config.origin)) {
      if (origin && config.origin.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      }
    } else if (typeof config.origin === 'string') {
      res.setHeader('Access-Control-Allow-Origin', config.origin);
    }
    
    // Set other CORS headers
    if (config.credentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    
    if (config.methods && config.methods.length > 0) {
      res.setHeader('Access-Control-Allow-Methods', config.methods.join(', '));
    }
    
    if (config.allowedHeaders && config.allowedHeaders.length > 0) {
      res.setHeader('Access-Control-Allow-Headers', config.allowedHeaders.join(', '));
    }
    
    if (config.exposedHeaders && config.exposedHeaders.length > 0) {
      res.setHeader('Access-Control-Expose-Headers', config.exposedHeaders.join(', '));
    }
    
    if (config.maxAge) {
      res.setHeader('Access-Control-Max-Age', config.maxAge.toString());
    }
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
    } else {
      next();
    }
  };
}

/**
 * Request ID middleware for tracing
 */
export function requestId(headerName: string = 'X-Request-ID') {
  return (req: Request, res: Response, next: NextFunction) => {
    const id = req.headers[headerName.toLowerCase()] || crypto.randomUUID();
    (req as any).id = id;
    res.setHeader(headerName, id);
    next();
  };
}

/**
 * Security logging middleware
 */
export function securityLogger(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  
  // Log security-relevant request details
  const securityContext = {
    requestId: (req as any).id,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    referer: req.headers.referer,
    contentType: req.headers['content-type']
  };
  
  // Check for suspicious patterns
  const suspicious = [];
  
  // Check for SQL injection attempts in URL
  if (req.url.match(/(\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b|\bUNION\b)/i)) {
    suspicious.push('SQL injection attempt in URL');
  }
  
  // Check for path traversal
  if (req.url.includes('../') || req.url.includes('..\\')) {
    suspicious.push('Path traversal attempt');
  }
  
  // Check for suspicious user agents
  const ua = req.headers['user-agent']?.toLowerCase() || '';
  if (ua.includes('scanner') || ua.includes('bot') || ua.includes('crawler')) {
    suspicious.push('Suspicious user agent');
  }
  
  if (suspicious.length > 0) {
    logger.warn(LogCategory.SECURITY, 'Suspicious request detected', {
      ...securityContext,
      suspicious
    });
  }
  
  // Log response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    if (res.statusCode >= 400) {
      logger.warn(LogCategory.SECURITY, 'Request failed', {
        ...securityContext,
        statusCode: res.statusCode,
        duration
      });
    }
  });
  
  next();
}