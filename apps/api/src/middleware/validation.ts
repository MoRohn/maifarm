import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { z } from 'zod';

// Generic validation result handler for express-validator
export const validateExpressRequest = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map(err => ({
        field: err.param,
        message: err.msg
      }))
    });
  }
  next();
};

// Zod validation middleware
interface ValidationSchemas {
  body?: z.ZodType<any, any>;
  query?: z.ZodType<any, any>;
  params?: z.ZodType<any, any>;
}

export const validateRequest = (schemas: ValidationSchemas) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate body
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }
      
      // Validate query
      if (schemas.query) {
        req.query = await schemas.query.parseAsync(req.query);
      }
      
      // Validate params
      if (schemas.params) {
        req.params = await schemas.params.parseAsync(req.params);
      }
      
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          errors: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        });
      }
      
      return res.status(500).json({
        success: false,
        error: 'Validation error'
      });
    }
  };
};

export const validateFarmInput = [
  body('name')
    .trim()
    .notEmpty().withMessage('Farm name is required')
    .isLength({ min: 3, max: 100 }).withMessage('Farm name must be between 3 and 100 characters'),
  
  body('type')
    .isIn(['sequential', 'collaborative', 'autonomous']).withMessage('Invalid farm type'),
  
  body('config.maxAgents')
    .isInt({ min: 1, max: 100 }).withMessage('Max agents must be between 1 and 100'),
  
  body('config.autoScale')
    .isBoolean().withMessage('Auto scale must be a boolean'),
  
  body('config.timeout')
    .optional()
    .isInt({ min: 60, max: 86400 }).withMessage('Timeout must be between 60 and 86400 seconds'),
  
  body('config.yaml')
    .optional()
    .isString().withMessage('YAML config must be a string'),

  // Validation result handler
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array().map(err => ({
          field: err.param,
          message: err.msg
        }))
      });
    }
    next();
  }
];

export const validateAgentInput = [
  body('name')
    .trim()
    .notEmpty().withMessage('Agent name is required')
    .isLength({ min: 3, max: 100 }).withMessage('Agent name must be between 3 and 100 characters'),
  
  body('type')
    .notEmpty().withMessage('Agent type is required')
    .isString().withMessage('Agent type must be a string'),
  
  body('capabilities')
    .isArray().withMessage('Capabilities must be an array')
    .notEmpty().withMessage('At least one capability is required'),
  
  body('capabilities.*')
    .isString().withMessage('Each capability must be a string'),

  // Validation result handler
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array().map(err => ({
          field: err.param,
          message: err.msg
        }))
      });
    }
    next();
  }
];

export const validateTaskInput = [
  body('title')
    .trim()
    .notEmpty().withMessage('Task title is required')
    .isLength({ min: 3, max: 200 }).withMessage('Task title must be between 3 and 200 characters'),
  
  body('description')
    .optional()
    .isString().withMessage('Description must be a string'),
  
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid priority level'),
  
  body('assignedAgents')
    .optional()
    .isArray().withMessage('Assigned agents must be an array'),
  
  body('assignedAgents.*')
    .isUUID().withMessage('Each assigned agent must be a valid UUID'),

  // Validation result handler
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array().map(err => ({
          field: err.param,
          message: err.msg
        }))
      });
    }
    next();
  }
];

export const validateQueryParams = [
  body('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  
  body('offset')
    .optional()
    .isInt({ min: 0 }).withMessage('Offset must be a positive integer'),
  
  body('sort')
    .optional()
    .isIn(['createdAt', 'updatedAt', 'name', 'status']).withMessage('Invalid sort field'),
  
  body('order')
    .optional()
    .isIn(['asc', 'desc']).withMessage('Order must be either asc or desc'),

  // Validation result handler
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array().map(err => ({
          field: err.param,
          message: err.msg
        }))
      });
    }
    next();
  }
];