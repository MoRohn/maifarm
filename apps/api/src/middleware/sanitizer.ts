import { Request, Response, NextFunction } from 'express';
import DOMPurify from 'isomorphic-dompurify';
import validator from 'validator';

// Configure DOMPurify for API usage
const cleanHTML = (dirty: string): string => {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true
  });
};

// Recursively sanitize object properties
function sanitizeObject(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    // Remove HTML tags and escape special characters
    return cleanHTML(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        // Sanitize the key itself
        const sanitizedKey = cleanHTML(key);
        sanitized[sanitizedKey] = sanitizeObject(obj[key]);
      }
    }
    return sanitized;
  }

  return obj;
}

// Validate and sanitize common input types
export const sanitizers = {
  email: (email: string): string | null => {
    if (!email) return null;
    const cleaned = cleanHTML(email);
    return validator.isEmail(cleaned) ? validator.normalizeEmail(cleaned) || null : null;
  },

  url: (url: string): string | null => {
    if (!url) return null;
    const cleaned = cleanHTML(url);
    return validator.isURL(cleaned) ? cleaned : null;
  },

  alphanumeric: (str: string): string => {
    if (!str) return '';
    return validator.whitelist(str, 'a-zA-Z0-9');
  },

  filename: (filename: string): string => {
    if (!filename) return '';
    // Allow alphanumeric, dots, hyphens, underscores
    return validator.whitelist(filename, 'a-zA-Z0-9.-_');
  },

  sqlIdentifier: (identifier: string): string => {
    if (!identifier) return '';
    // Only allow valid SQL identifier characters
    return validator.whitelist(identifier, 'a-zA-Z0-9_');
  },

  jsonPath: (path: string): string => {
    if (!path) return '';
    // Allow alphanumeric, dots, brackets, and dollar signs for JSON paths
    return validator.whitelist(path, 'a-zA-Z0-9.[]$');
  }
};

// Middleware to sanitize request body
export const sanitizeBody = (req: Request, res: Response, next: NextFunction) => {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  next();
};

// Middleware to sanitize query parameters
export const sanitizeQuery = (req: Request, res: Response, next: NextFunction) => {
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  next();
};

// Middleware to sanitize path parameters
export const sanitizeParams = (req: Request, res: Response, next: NextFunction) => {
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }
  next();
};

// Combined middleware for full sanitization
export const sanitizeAll = (req: Request, res: Response, next: NextFunction) => {
  // Sanitize all input sources
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }
  
  next();
};

// Middleware to prevent SQL injection in specific fields
export const preventSQLInjection = (fields: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    for (const field of fields) {
      if (req.body && req.body[field]) {
        // Check for common SQL injection patterns
        const value = String(req.body[field]);
        const sqlPatterns = [
          /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC|EXECUTE)\b)/gi,
          /(--|#|\/\*|\*\/)/g,
          /(\bOR\b.*=.*)/gi,
          /(\bAND\b.*=.*)/gi,
          /(';|";)/g
        ];

        for (const pattern of sqlPatterns) {
          if (pattern.test(value)) {
            return res.status(400).json({
              success: false,
              error: {
                code: 'INVALID_INPUT',
                message: `Invalid characters detected in field: ${field}`
              }
            });
          }
        }
      }
    }
    next();
  };
};

// Middleware to validate and sanitize specific field types
export const validateFields = (validations: Record<string, 'email' | 'url' | 'alphanumeric' | 'filename'>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    for (const [field, type] of Object.entries(validations)) {
      if (req.body && req.body[field]) {
        const value = req.body[field];
        let sanitized: any;

        switch (type) {
          case 'email':
            sanitized = sanitizers.email(value);
            if (!sanitized) {
              return res.status(400).json({
                success: false,
                error: {
                  code: 'VALIDATION_ERROR',
                  message: `Invalid email format in field: ${field}`
                }
              });
            }
            break;
          case 'url':
            sanitized = sanitizers.url(value);
            if (!sanitized) {
              return res.status(400).json({
                success: false,
                error: {
                  code: 'VALIDATION_ERROR',
                  message: `Invalid URL format in field: ${field}`
                }
              });
            }
            break;
          case 'alphanumeric':
            sanitized = sanitizers.alphanumeric(value);
            break;
          case 'filename':
            sanitized = sanitizers.filename(value);
            break;
        }

        req.body[field] = sanitized;
      }
    }
    next();
  };
};

// Export all middleware functions
export default {
  sanitizeBody,
  sanitizeQuery,
  sanitizeParams,
  sanitizeAll,
  preventSQLInjection,
  validateFields,
  sanitizers
};