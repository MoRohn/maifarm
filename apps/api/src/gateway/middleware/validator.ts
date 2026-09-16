import { Request, Response, NextFunction } from 'express';
import { z, ZodError, ZodSchema } from 'zod';

interface ValidationOptions {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

export function requestValidator(options?: ValidationOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Skip validation if no schemas provided
      if (!options) {
        return next();
      }
      
      // Validate request body
      if (options.body) {
        req.body = await options.body.parseAsync(req.body);
      }
      
      // Validate query parameters
      if (options.query) {
        req.query = await options.query.parseAsync(req.query);
      }
      
      // Validate route parameters
      if (options.params) {
        req.params = await options.params.parseAsync(req.params);
      }
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Format Zod errors
        const errors = error.errors.map(err => ({
          code: 'VALIDATION_ERROR',
          message: err.message,
          field: err.path.join('.'),
          details: {
            type: err.code,
            expected: (err as any).expected,
            received: (err as any).received
          }
        }));
        
        return res.status(400).json({
          success: false,
          errors,
          meta: {
            timestamp: new Date().toISOString(),
            version: 'v2'
          }
        });
      }
      
      // Pass other errors to error handler
      next(error);
    }
  };
}

// Common validation schemas
export const commonSchemas = {
  // Pagination
  pagination: z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc')
  }),
  
  // ID parameter
  idParam: z.object({
    id: z.string().uuid()
  }),
  
  // Date range
  dateRange: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional()
  }),
  
  // Search
  search: z.object({
    q: z.string().min(1).max(255),
    fields: z.array(z.string()).optional()
  })
};

// Resource-specific schemas
export const resourceSchemas = {
  // Farm creation
  createFarm: z.object({
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    prompt: z.string().optional(),
    mode: z.enum(['sequential', 'collaborative', 'autonomous', 'gowild', 'quick-task']).optional(),
    agentCount: z.number().min(1).max(100).optional(),
    provider: z.enum(['claude', 'openai']).optional(),
    orchestratorType: z.enum(['maifarm', 'xenosync']).optional(),
    config: z.union([
      z.string(),
      z.object({
        prompt: z.string().optional(),
        yaml: z.string().optional(),
        timeout: z.number().optional(),
        timeoutMinutes: z.number().optional(),
        maxAgents: z.number().optional(),
        autoScale: z.boolean().optional(),
        retryPolicy: z.object({
          enabled: z.boolean().optional(),
          maxRetries: z.number().optional(),
          backoffMultiplier: z.number().optional()
        }).optional(),
        resourceLimits: z.object({
          cpu: z.number().optional(),
          memory: z.number().optional(),
          gpu: z.number().optional()
        }).optional(),
        goWildMode: z.object({
          enabled: z.boolean().optional(),
          creativityLevel: z.number().min(1).max(5).optional(),
          boundaries: z.array(z.string()).optional()
        }).optional(),
        contextFiles: z.array(z.string()).optional(),
        attachedFiles: z.array(z.string()).optional(),
        barnReferences: z.array(z.string()).optional(),
        staggerDelay: z.number().optional(),
        numberOfAgents: z.number().optional()
      })
    ]).optional(),
    contextFiles: z.array(z.string()).optional(),
    barnReferences: z.array(z.string()).optional(),
    userId: z.string().optional(),
    createdBy: z.string().optional(),
    farmerTemplateId: z.string().optional(),
    farmerTemplateName: z.string().optional()
  }),
  
  // Task creation
  createTask: z.object({
    type: z.string().min(1),
    priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    payload: z.record(z.any()),
    timeout: z.number().optional(),
    retries: z.number().min(0).max(5).default(3)
  }),
  
  // Provider configuration
  configureProvider: z.object({
    provider: z.enum(['claude', 'openai', 'llama', 'ollama']),
    apiKey: z.string().min(1).optional(),
    model: z.string().min(1),
    maxTokens: z.number().optional(),
    temperature: z.number().min(0).max(2).optional(),
    endpoint: z.string().url().optional()
  })
};

// Create validation middleware factory
export function validate(schema: ValidationOptions) {
  return requestValidator(schema);
}
