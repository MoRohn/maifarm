/**
 * Input Validation and Sanitization Middleware
 * Protects against injection attacks and malformed input
 */

import { Request, Response, NextFunction } from 'express';
import validator from 'validator';
import xss from 'xss';
import { logger } from '../utils/logger';
import { LogCategory } from '../utils/logger';

export interface ValidationRule {
  field: string;
  type: 'string' | 'number' | 'boolean' | 'email' | 'url' | 'uuid' | 'json' | 'array';
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  sanitize?: boolean;
  custom?: (value: any) => boolean;
  message?: string;
}

export interface ValidationSchema {
  body?: ValidationRule[];
  query?: ValidationRule[];
  params?: ValidationRule[];
  headers?: ValidationRule[];
}

// Common validation patterns
const PATTERNS = {
  ALPHANUMERIC: /^[a-zA-Z0-9]+$/,
  ALPHANUMERIC_SPACE: /^[a-zA-Z0-9\s]+$/,
  USERNAME: /^[a-zA-Z0-9_-]{3,32}$/,
  PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/,
  FARM_NAME: /^[a-zA-Z0-9\s_-]{1,100}$/,
  FILE_PATH: /^[a-zA-Z0-9/_.-]+$/,
  NO_SQL: /^(?!.*('|(--|\/\*|\*\/|;)|union|select|insert|update|delete|drop|create|alter|exec|script|javascript|eval|function|var|let|const)).*$/i
};

// Dangerous patterns to detect potential attacks
const DANGEROUS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /<iframe/gi,
  /<object/gi,
  /<embed/gi,
  /eval\(/gi,
  /expression\(/gi,
  /vbscript:/gi,
  /onload\s*=/gi,
  /onerror\s*=/gi,
  /alert\(/gi,
  /confirm\(/gi,
  /prompt\(/gi
];

// SQL injection patterns
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|FROM|WHERE|JOIN|ORDER BY|GROUP BY|HAVING)\b)/gi,
  /(--|#|\/\*|\*\/)/g,
  /(\bOR\b|\bAND\b)\s*['"]?\s*=\s*['"]?/gi,
  /['"];/g,
  /\bEXEC(\s|\()/gi,
  /\bCAST(\s|\()/gi,
  /\bCONVERT(\s|\()/gi
];

// NoSQL injection patterns
const NOSQL_INJECTION_PATTERNS = [
  /\$where/gi,
  /\$regex/gi,
  /\$ne/gi,
  /\$gt/gi,
  /\$lt/gi,
  /\$gte/gi,
  /\$lte/gi,
  /\$in/gi,
  /\$nin/gi,
  /\$exists/gi,
  /\$type/gi,
  /\$mod/gi,
  /\$text/gi,
  /\$where.*function/gi
];

/**
 * Sanitize string input
 */
function sanitizeString(value: string): string {
  // Remove null bytes
  let sanitized = value.replace(/\0/g, '');
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  // Escape HTML
  sanitized = xss(sanitized, {
    whiteList: {},          // No tags allowed by default
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style']
  });
  
  // Remove control characters except newline and tab
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  return sanitized;
}

/**
 * Check for dangerous patterns
 */
function containsDangerousPatterns(value: string): boolean {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(value)) {
      return true;
    }
  }
  return false;
}

/**
 * Check for SQL injection attempts
 */
function containsSQLInjection(value: string): boolean {
  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(value)) {
      return true;
    }
  }
  return false;
}

/**
 * Check for NoSQL injection attempts
 */
function containsNoSQLInjection(value: string): boolean {
  // Check string patterns
  for (const pattern of NOSQL_INJECTION_PATTERNS) {
    if (pattern.test(value)) {
      return true;
    }
  }
  
  // Check for object with $ operators
  if (typeof value === 'object' && value !== null) {
    const json = JSON.stringify(value);
    return NOSQL_INJECTION_PATTERNS.some(pattern => pattern.test(json));
  }
  
  return false;
}

/**
 * Validate a single field
 */
function validateField(value: any, rule: ValidationRule): { valid: boolean; error?: string } {
  // Check required
  if (rule.required && (value === undefined || value === null || value === '')) {
    return { valid: false, error: `${rule.field} is required` };
  }
  
  // Skip validation if not required and empty
  if (!rule.required && (value === undefined || value === null || value === '')) {
    return { valid: true };
  }
  
  // Type validation
  switch (rule.type) {
    case 'string':
      if (typeof value !== 'string') {
        return { valid: false, error: `${rule.field} must be a string` };
      }
      
      // Length validation
      if (rule.min && value.length < rule.min) {
        return { valid: false, error: `${rule.field} must be at least ${rule.min} characters` };
      }
      if (rule.max && value.length > rule.max) {
        return { valid: false, error: `${rule.field} must be at most ${rule.max} characters` };
      }
      
      // Pattern validation
      if (rule.pattern && !rule.pattern.test(value)) {
        return { valid: false, error: rule.message || `${rule.field} has invalid format` };
      }
      
      // Check for dangerous content
      if (containsDangerousPatterns(value)) {
        return { valid: false, error: `${rule.field} contains potentially dangerous content` };
      }
      
      // Check for SQL injection
      if (containsSQLInjection(value)) {
        return { valid: false, error: `${rule.field} contains invalid SQL-like patterns` };
      }
      break;
      
    case 'number':
      const num = Number(value);
      if (isNaN(num)) {
        return { valid: false, error: `${rule.field} must be a number` };
      }
      
      if (rule.min !== undefined && num < rule.min) {
        return { valid: false, error: `${rule.field} must be at least ${rule.min}` };
      }
      if (rule.max !== undefined && num > rule.max) {
        return { valid: false, error: `${rule.field} must be at most ${rule.max}` };
      }
      break;
      
    case 'boolean':
      if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
        return { valid: false, error: `${rule.field} must be a boolean` };
      }
      break;
      
    case 'email':
      if (!validator.isEmail(value)) {
        return { valid: false, error: `${rule.field} must be a valid email` };
      }
      break;
      
    case 'url':
      if (!validator.isURL(value)) {
        return { valid: false, error: `${rule.field} must be a valid URL` };
      }
      break;
      
    case 'uuid':
      if (!validator.isUUID(value)) {
        return { valid: false, error: `${rule.field} must be a valid UUID` };
      }
      break;
      
    case 'json':
      try {
        JSON.parse(typeof value === 'string' ? value : JSON.stringify(value));
        
        // Check for NoSQL injection in JSON
        if (containsNoSQLInjection(value)) {
          return { valid: false, error: `${rule.field} contains invalid patterns` };
        }
      } catch {
        return { valid: false, error: `${rule.field} must be valid JSON` };
      }
      break;
      
    case 'array':
      if (!Array.isArray(value)) {
        return { valid: false, error: `${rule.field} must be an array` };
      }
      
      if (rule.min && value.length < rule.min) {
        return { valid: false, error: `${rule.field} must have at least ${rule.min} items` };
      }
      if (rule.max && value.length > rule.max) {
        return { valid: false, error: `${rule.field} must have at most ${rule.max} items` };
      }
      break;
  }
  
  // Custom validation
  if (rule.custom && !rule.custom(value)) {
    return { valid: false, error: rule.message || `${rule.field} validation failed` };
  }
  
  return { valid: true };
}

/**
 * Input validation middleware
 */
export function validateInput(schema: ValidationSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: string[] = [];
    
    // Validate body
    if (schema.body) {
      for (const rule of schema.body) {
        const value = req.body[rule.field];
        
        // Sanitize if requested
        if (rule.sanitize && typeof value === 'string') {
          req.body[rule.field] = sanitizeString(value);
        }
        
        const result = validateField(req.body[rule.field], rule);
        if (!result.valid) {
          errors.push(result.error!);
        }
      }
    }
    
    // Validate query
    if (schema.query) {
      for (const rule of schema.query) {
        const value = req.query[rule.field];
        
        // Sanitize if requested
        if (rule.sanitize && typeof value === 'string') {
          req.query[rule.field] = sanitizeString(value);
        }
        
        const result = validateField(req.query[rule.field], rule);
        if (!result.valid) {
          errors.push(result.error!);
        }
      }
    }
    
    // Validate params
    if (schema.params) {
      for (const rule of schema.params) {
        const value = req.params[rule.field];
        
        // Sanitize if requested
        if (rule.sanitize && typeof value === 'string') {
          req.params[rule.field] = sanitizeString(value);
        }
        
        const result = validateField(req.params[rule.field], rule);
        if (!result.valid) {
          errors.push(result.error!);
        }
      }
    }
    
    // Validate headers
    if (schema.headers) {
      for (const rule of schema.headers) {
        const value = req.headers[rule.field.toLowerCase()];
        const result = validateField(value, rule);
        if (!result.valid) {
          errors.push(result.error!);
        }
      }
    }
    
    // Return errors if any
    if (errors.length > 0) {
      logger.warn(LogCategory.SECURITY, 'Input validation failed', {
        path: req.path,
        method: req.method,
        errors,
        ip: req.ip
      });
      
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid input provided',
        errors
      });
    }
    
    next();
  };
}

/**
 * Global input sanitization middleware
 * Sanitizes all string inputs by default
 */
export function globalSanitizer(req: Request, res: Response, next: NextFunction) {
  // Sanitize body
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  
  // Sanitize query
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query) as any;
  }
  
  // Don't sanitize params as they're usually IDs
  // Don't sanitize headers as they have specific formats
  
  next();
}

/**
 * Recursively sanitize an object
 */
function sanitizeObject(obj: any): any {
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  
  if (obj && typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Sanitize the key
      const sanitizedKey = sanitizeString(key);
      
      // Skip if key contains dangerous patterns
      if (!containsDangerousPatterns(sanitizedKey)) {
        sanitized[sanitizedKey] = sanitizeObject(value);
      }
    }
    return sanitized;
  }
  
  return obj;
}

/**
 * File upload validation
 */
export function validateFileUpload(options: {
  maxSize?: number;
  allowedTypes?: string[];
  allowedExtensions?: string[];
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const files = (req as any).files;
    
    if (!files || Object.keys(files).length === 0) {
      return next();
    }
    
    for (const file of Object.values(files) as any[]) {
      // Check file size
      if (options.maxSize && file.size > options.maxSize) {
        return res.status(400).json({
          error: 'File too large',
          message: `File size must not exceed ${options.maxSize} bytes`
        });
      }
      
      // Check MIME type
      if (options.allowedTypes && !options.allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({
          error: 'Invalid file type',
          message: `File type must be one of: ${options.allowedTypes.join(', ')}`
        });
      }
      
      // Check extension
      if (options.allowedExtensions) {
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (!ext || !options.allowedExtensions.includes(ext)) {
          return res.status(400).json({
            error: 'Invalid file extension',
            message: `File extension must be one of: ${options.allowedExtensions.join(', ')}`
          });
        }
      }
      
      // Check for double extensions (potential attack)
      if (file.name.split('.').length > 2) {
        return res.status(400).json({
          error: 'Invalid file name',
          message: 'File name contains multiple extensions'
        });
      }
    }
    
    next();
  };
}

// Export common validation schemas
export const commonSchemas = {
  login: {
    body: [
      { field: 'email', type: 'email' as const, required: true },
      { field: 'password', type: 'string' as const, required: true, min: 8 }
    ]
  },
  
  createFarm: {
    body: [
      { field: 'name', type: 'string' as const, required: true, pattern: PATTERNS.FARM_NAME, sanitize: true },
      { field: 'description', type: 'string' as const, required: true, max: 1000, sanitize: true },
      { field: 'agentCount', type: 'number' as const, required: false, min: 1, max: 10 }
    ]
  },
  
  quickTask: {
    body: [
      { field: 'description', type: 'string' as const, required: true, max: 5000, sanitize: true },
      { field: 'priority', type: 'string' as const, required: false, pattern: /^(low|medium|high)$/ }
    ]
  },
  
  farmId: {
    params: [
      { field: 'id', type: 'uuid' as const, required: true }
    ]
  }
};