import { Request, Response, NextFunction } from 'express';
import DOMPurify from 'isomorphic-dompurify';
import validator from 'validator';

// XSS Protection middleware
export function xssProtection(req: Request, res: Response, next: NextFunction) {
  // Set security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Sanitize request body
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  
  // Sanitize query parameters
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }
  
  // Sanitize params
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeObject(req.params);
  }
  
  next();
}

// Input validation middleware factory
export function validateInput(schema: any) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });
    
    if (error) {
      const errors = error.details.map((detail: any) => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: errors
        }
      });
    }
    
    req.body = value;
    next();
  };
}

// SQL injection prevention
export function sanitizeSqlInput(input: string): string {
  // Remove or escape dangerous SQL characters
  return input
    .replace(/['";\\]/g, '') // Remove quotes and backslash
    .replace(/--/g, '') // Remove SQL comments
    .replace(/\/\*/g, '') // Remove multi-line comments start
    .replace(/\*\//g, '') // Remove multi-line comments end
    .replace(/\b(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|EXEC|EXECUTE)\b/gi, ''); // Remove SQL keywords
}

// Sanitize object recursively
function sanitizeObject(obj: any): any {
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  
  if (obj && typeof obj === 'object') {
    const sanitized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        // Sanitize the key itself
        const sanitizedKey = sanitizeString(key);
        sanitized[sanitizedKey] = sanitizeObject(obj[key]);
      }
    }
    return sanitized;
  }
  
  return obj;
}

// Sanitize string input
function sanitizeString(input: string): string {
  if (typeof input !== 'string') {
    return input;
  }
  
  // First, use DOMPurify to remove any HTML/JS
  let sanitized = DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true
  });
  
  // Then escape HTML entities
  sanitized = validator.escape(sanitized);
  
  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  return sanitized;
}

// CSRF token validation (for non-GET requests)
const CSRF_HEADER = 'x-csrf-token';
const CSRF_COOKIE = 'csrf-token';

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Skip CSRF for GET requests and API endpoints that use JWT
  if (req.method === 'GET' || req.path.startsWith('/api/')) {
    return next();
  }
  
  const token = req.headers[CSRF_HEADER] || req.body._csrf;
  const cookie = req.cookies[CSRF_COOKIE];
  
  if (!token || !cookie || token !== cookie) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'CSRF_ERROR',
        message: 'Invalid CSRF token'
      }
    });
  }
  
  next();
}

// Content Security Policy
export function contentSecurityPolicy(req: Request, res: Response, next: NextFunction) {
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net", // Allow for development
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self' ws://localhost:* wss://localhost:* http://localhost:* https://localhost:*",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ];
  
  res.setHeader('Content-Security-Policy', cspDirectives.join('; '));
  next();
}

// Input sanitization for specific field types
export const sanitizers = {
  email: (email: string) => {
    if (!validator.isEmail(email)) {
      throw new Error('Invalid email format');
    }
    return validator.normalizeEmail(email) || email;
  },
  
  url: (url: string) => {
    if (!validator.isURL(url, { require_protocol: true })) {
      throw new Error('Invalid URL format');
    }
    return url;
  },
  
  alphanumeric: (input: string) => {
    if (!validator.isAlphanumeric(input, 'en-US', { ignore: '-_' })) {
      throw new Error('Input must be alphanumeric');
    }
    return input;
  },
  
  farmName: (name: string) => {
    // Allow alphanumeric, spaces, hyphens, underscores
    const sanitized = name.replace(/[^a-zA-Z0-9\s\-_]/g, '');
    if (sanitized.length < 3 || sanitized.length > 100) {
      throw new Error('Farm name must be between 3 and 100 characters');
    }
    return sanitized;
  },
  
  taskDescription: (desc: string) => {
    // Allow more characters but still sanitize
    const sanitized = DOMPurify.sanitize(desc, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true
    });
    
    if (sanitized.length > 1000) {
      throw new Error('Description must be less than 1000 characters');
    }
    
    return sanitized;
  }
};

// File upload validation
export function validateFileUpload(allowedTypes: string[], maxSize: number = 10 * 1024 * 1024) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.file) {
      return next();
    }
    
    // Check file type
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FILE_TYPE',
          message: `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`
        }
      });
    }
    
    // Check file size
    if (req.file.size > maxSize) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: `File size exceeds maximum allowed size of ${maxSize / (1024 * 1024)}MB`
        }
      });
    }
    
    // Sanitize filename
    req.file.originalname = sanitizeString(req.file.originalname);
    
    next();
  };
}

// Security audit logging
export function securityAuditLog(action: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const log = {
      timestamp: new Date().toISOString(),
      action,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      method: req.method,
      path: req.path,
      userId: (req as any).user?.id,
      body: req.method !== 'GET' ? '[REDACTED]' : undefined
    };
    
    // In production, send to logging service
    console.log('SECURITY_AUDIT:', JSON.stringify(log));
    
    next();
  };
}

// Export all middleware as a group
export const securityMiddleware = {
  xssProtection,
  validateInput,
  sanitizeSqlInput,
  csrfProtection,
  contentSecurityPolicy,
  sanitizers,
  validateFileUpload,
  securityAuditLog
};