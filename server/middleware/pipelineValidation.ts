/**
 * Pipeline Validation Middleware
 * Validates pipeline configurations, events, and system integrations
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
const pipelineOrchestrator: any = {}; // Stub
import { crossSystemIntegration } from '../services/crossSystemIntegration';
import { eventBridge } from '../utils/eventBridge';

// Zod schemas for validation
const PipelinePhaseSchema = z.object({
  name: z.string().min(1).max(100),
  dependencies: z.array(z.string()).default([]),
  timeout: z.number().min(1000).max(3600000).optional(), // 1 second to 1 hour
  maxRetries: z.number().min(0).max(10).default(3)
});

const PipelineConfigSchema = z.object({
  maxConcurrentPhases: z.number().min(1).max(10).default(1),
  timeout: z.number().min(60000).max(7200000).default(3600000), // 1 minute to 2 hours
  retryPolicy: z.enum(['none', 'individual', 'pipeline']).default('individual'),
  failureMode: z.enum(['stop', 'continue', 'retry']).default('stop'),
  coordination: z.enum(['sequential', 'parallel', 'hybrid']).default('sequential')
});

const PipelineCreateSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.string().min(1).max(50),
  phases: z.array(PipelinePhaseSchema).min(1).max(20),
  config: PipelineConfigSchema.optional(),
  coordinationPath: z.string().optional()
});

const SystemConfigSchema = z.object({
  id: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().min(1).max(100),
  type: z.enum(['pipeline', 'service', 'external']),
  coordinationPath: z.string().min(1),
  eventMappings: z.record(z.string(), z.string()),
  stateSchema: z.record(z.string(), z.string()),
  healthEndpoint: z.string().url().optional(),
  apiEndpoints: z.record(z.string(), z.string()).optional()
});

const TrumpInfogConfigSchema = z.object({
  agentCount: z.number().min(1).max(8).default(4),
  sources: z.array(z.string()).default([]),
  outputFormats: z.array(z.string()).default(['PNG', 'PDF']),
  qualityThresholds: z.object({
    contentAccuracy: z.number().min(0).max(1).default(0.95),
    designConsistency: z.number().min(0).max(1).default(0.90),
    processingSpeed: z.number().min(60).max(1800).default(900) // 1 minute to 30 minutes
  }).optional()
});

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  value?: any;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings?: string[];
}

export class PipelineValidationError extends Error {
  constructor(
    message: string,
    public errors: ValidationError[],
    public code: string = 'VALIDATION_ERROR'
  ) {
    super(message);
    this.name = 'PipelineValidationError';
  }
}

export class PipelineValidator {
  /**
   * Validate pipeline creation request
   */
  public static validatePipelineCreation(data: any): ValidationResult {
    try {
      const parsed = PipelineCreateSchema.parse(data);
      const errors: ValidationError[] = [];
      const warnings: string[] = [];

      // Custom validation rules
      const phaseNameSet = new Set();
      const phaseIdSet = new Set();

      parsed.phases.forEach((phase, index) => {
        const phaseId = `${parsed.type}_phase_${index}`;
        
        // Check for duplicate phase names
        if (phaseNameSet.has(phase.name)) {
          errors.push({
            field: `phases[${index}].name`,
            message: `Duplicate phase name: ${phase.name}`,
            code: 'DUPLICATE_PHASE_NAME',
            value: phase.name
          });
        }
        phaseNameSet.add(phase.name);
        phaseIdSet.add(phaseId);

        // Validate dependencies
        phase.dependencies.forEach((depId, depIndex) => {
          // Check if dependency is a valid phase ID format or refers to existing phase
          if (!depId.match(/^[a-zA-Z0-9_-]+_phase_\d+$/)) {
            errors.push({
              field: `phases[${index}].dependencies[${depIndex}]`,
              message: `Invalid dependency ID format: ${depId}`,
              code: 'INVALID_DEPENDENCY_FORMAT',
              value: depId
            });
          }
        });

        // Check for reasonable timeout values
        if (phase.timeout && phase.timeout < 10000) {
          warnings.push(`Phase "${phase.name}" has a very short timeout (${phase.timeout}ms)`);
        }
      });

      // Validate dependency cycles
      const cycleError = this.detectDependencyCycles(parsed.phases, parsed.type);
      if (cycleError) {
        errors.push(cycleError);
      }

      // Type-specific validation
      if (parsed.type === 'trump-infog') {
        const trumpValidation = this.validateTrumpInfogPipeline(parsed);
        errors.push(...trumpValidation.errors);
        warnings.push(...(trumpValidation.warnings || []));
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          valid: false,
          errors: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code,
            value: err.input
          }))
        };
      }

      return {
        valid: false,
        errors: [{
          field: 'unknown',
          message: error.message || 'Unknown validation error',
          code: 'UNKNOWN_ERROR'
        }]
      };
    }
  }

  /**
   * Validate Trump Infographics pipeline specific requirements
   */
  private static validateTrumpInfogPipeline(data: any): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    // Check required phases for Trump Infog
    const requiredPhases = ['Data Collection', 'Content Analysis', 'Design Generation', 'Output Assembly'];
    const phaseNames = data.phases.map((p: any) => p.name);

    requiredPhases.forEach(requiredPhase => {
      if (!phaseNames.includes(requiredPhase)) {
        errors.push({
          field: 'phases',
          message: `Missing required Trump Infog phase: ${requiredPhase}`,
          code: 'MISSING_REQUIRED_PHASE',
          value: requiredPhase
        });
      }
    });

    // Validate coordination path
    if (!data.coordinationPath || !data.coordinationPath.includes('trump_infog')) {
      warnings.push('Trump Infog pipeline should use isolated coordination path within maibarn');
    }

    // Validate phase order and dependencies
    if (data.phases.length >= 4) {
      const dataCollectionIndex = phaseNames.indexOf('Data Collection');
      const analysisIndex = phaseNames.indexOf('Content Analysis');
      const designIndex = phaseNames.indexOf('Design Generation');
      const assemblyIndex = phaseNames.indexOf('Output Assembly');

      if (dataCollectionIndex > 0) {
        warnings.push('Data Collection should typically be the first phase');
      }

      if (analysisIndex >= 0 && analysisIndex <= dataCollectionIndex) {
        warnings.push('Content Analysis should come after Data Collection');
      }

      if (assemblyIndex >= 0 && assemblyIndex !== data.phases.length - 1) {
        warnings.push('Output Assembly should typically be the final phase');
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Detect circular dependencies in pipeline phases
   */
  private static detectDependencyCycles(phases: any[], pipelineType: string): ValidationError | null {
    const phaseMap = new Map();
    phases.forEach((phase, index) => {
      const phaseId = `${pipelineType}_phase_${index}`;
      phaseMap.set(phaseId, phase.dependencies || []);
    });

    const visited = new Set();
    const visiting = new Set();

    const hasCycle = (phaseId: string): boolean => {
      if (visiting.has(phaseId)) return true;
      if (visited.has(phaseId)) return false;

      visiting.add(phaseId);
      const dependencies = phaseMap.get(phaseId) || [];

      for (const dep of dependencies) {
        if (hasCycle(dep)) return true;
      }

      visiting.delete(phaseId);
      visited.add(phaseId);
      return false;
    };

    for (const phaseId of phaseMap.keys()) {
      if (hasCycle(phaseId)) {
        return {
          field: 'phases.dependencies',
          message: 'Circular dependency detected in pipeline phases',
          code: 'CIRCULAR_DEPENDENCY'
        };
      }
    }

    return null;
  }

  /**
   * Validate system registration configuration
   */
  public static validateSystemConfig(data: any): ValidationResult {
    try {
      SystemConfigSchema.parse(data);

      const errors: ValidationError[] = [];
      const warnings: string[] = [];

      // Check if system ID already exists
      const existingSystem = crossSystemIntegration.getSystemState(data.id);
      if (existingSystem) {
        warnings.push(`System with ID '${data.id}' already exists and will be overwritten`);
      }

      // Validate coordination path
      if (!data.coordinationPath.startsWith('/tmp/')) {
        warnings.push('Coordination path should typically be under /tmp/');
      }

      // Validate event mappings
      if (Object.keys(data.eventMappings).length === 0) {
        warnings.push('System has no event mappings defined');
      }

      // Check for reasonable API endpoints
      if (data.apiEndpoints) {
        Object.entries(data.apiEndpoints).forEach(([key, endpoint]) => {
          if (typeof endpoint === 'string' && !endpoint.startsWith('/api/')) {
            warnings.push(`API endpoint '${key}' should typically start with '/api/'`);
          }
        });
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          valid: false,
          errors: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code,
            value: err.input
          }))
        };
      }

      return {
        valid: false,
        errors: [{
          field: 'unknown',
          message: error.message || 'Unknown validation error',
          code: 'UNKNOWN_ERROR'
        }]
      };
    }
  }

  /**
   * Validate Trump Infographics trigger configuration
   */
  public static validateTrumpInfogConfig(data: any): ValidationResult {
    try {
      TrumpInfogConfigSchema.parse(data);

      const warnings: string[] = [];

      // Provide helpful warnings for Trump Infog configuration
      if (data.agentCount > 4) {
        warnings.push('Using more than 4 agents may not provide significant benefits for Trump Infog pipeline');
      }

      if (data.sources && data.sources.length > 10) {
        warnings.push('Using too many sources may increase processing time significantly');
      }

      if (data.qualityThresholds) {
        if (data.qualityThresholds.contentAccuracy > 0.98) {
          warnings.push('Very high content accuracy thresholds may cause frequent rejections');
        }
        if (data.qualityThresholds.processingSpeed < 300) {
          warnings.push('Very short processing time limits may cause timeouts');
        }
      }

      return {
        valid: true,
        errors: [],
        warnings
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          valid: false,
          errors: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code,
            value: err.input
          }))
        };
      }

      return {
        valid: false,
        errors: [{
          field: 'unknown',
          message: error.message || 'Unknown validation error',
          code: 'UNKNOWN_ERROR'
        }]
      };
    }
  }

  /**
   * Validate pipeline state for operations
   */
  public static validatePipelineOperation(pipelineId: string, operation: string): ValidationResult {
    const pipeline = pipelineOrchestrator.getPipeline(pipelineId);
    const errors: ValidationError[] = [];

    if (!pipeline) {
      errors.push({
        field: 'pipelineId',
        message: `Pipeline not found: ${pipelineId}`,
        code: 'PIPELINE_NOT_FOUND',
        value: pipelineId
      });
      return { valid: false, errors };
    }

    // Validate operation based on current pipeline state
    switch (operation) {
      case 'start':
        if (pipeline.status !== 'initializing') {
          errors.push({
            field: 'status',
            message: `Cannot start pipeline in ${pipeline.status} state`,
            code: 'INVALID_STATE_TRANSITION',
            value: pipeline.status
          });
        }
        break;

      case 'pause':
        if (pipeline.status !== 'running') {
          errors.push({
            field: 'status',
            message: `Cannot pause pipeline in ${pipeline.status} state`,
            code: 'INVALID_STATE_TRANSITION',
            value: pipeline.status
          });
        }
        break;

      case 'resume':
        if (pipeline.status !== 'paused') {
          errors.push({
            field: 'status',
            message: `Cannot resume pipeline in ${pipeline.status} state`,
            code: 'INVALID_STATE_TRANSITION',
            value: pipeline.status
          });
        }
        break;

      case 'cancel':
        if (['completed', 'failed'].includes(pipeline.status)) {
          errors.push({
            field: 'status',
            message: `Cannot cancel pipeline in ${pipeline.status} state`,
            code: 'INVALID_STATE_TRANSITION',
            value: pipeline.status
          });
        }
        break;

      default:
        errors.push({
          field: 'operation',
          message: `Unknown operation: ${operation}`,
          code: 'UNKNOWN_OPERATION',
          value: operation
        });
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate event bridge rule
   */
  public static validateEventRule(rule: any): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    // Required fields
    const requiredFields = ['id', 'name', 'sourceSystem', 'sourceEvent', 'targetSystem', 'targetEvent'];
    requiredFields.forEach(field => {
      if (!rule[field] || typeof rule[field] !== 'string' || rule[field].trim() === '') {
        errors.push({
          field,
          message: `${field} is required and must be a non-empty string`,
          code: 'REQUIRED_FIELD_MISSING',
          value: rule[field]
        });
      }
    });

    // Priority validation
    if (typeof rule.priority !== 'number' || rule.priority < 0 || rule.priority > 100) {
      errors.push({
        field: 'priority',
        message: 'Priority must be a number between 0 and 100',
        code: 'INVALID_PRIORITY',
        value: rule.priority
      });
    }

    // Enabled validation
    if (typeof rule.enabled !== 'boolean') {
      errors.push({
        field: 'enabled',
        message: 'Enabled must be a boolean value',
        code: 'INVALID_ENABLED',
        value: rule.enabled
      });
    }

    // Validate transform function if present
    if (rule.transform && typeof rule.transform !== 'function') {
      errors.push({
        field: 'transform',
        message: 'Transform must be a function',
        code: 'INVALID_TRANSFORM',
        value: typeof rule.transform
      });
    }

    // Validate condition function if present
    if (rule.condition && typeof rule.condition !== 'function') {
      errors.push({
        field: 'condition',
        message: 'Condition must be a function',
        code: 'INVALID_CONDITION',
        value: typeof rule.condition
      });
    }

    // Check for rule ID conflicts
    const existingRule = eventBridge.getRule(rule.id);
    if (existingRule && existingRule.id === rule.id) {
      warnings.push(`Rule with ID '${rule.id}' already exists and will be overwritten`);
    }

    // Validate system references
    const sourceSystem = crossSystemIntegration.getSystemState(rule.sourceSystem);
    const targetSystem = crossSystemIntegration.getSystemState(rule.targetSystem);

    if (!sourceSystem && rule.sourceSystem !== 'pipeline-orchestrator') {
      warnings.push(`Source system '${rule.sourceSystem}' is not registered`);
    }

    if (!targetSystem && !['websocket', 'broadcast'].includes(rule.targetSystem)) {
      warnings.push(`Target system '${rule.targetSystem}' is not registered`);
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}

// Express middleware functions
export const validatePipelineCreation = (req: Request, res: Response, next: NextFunction) => {
  const validation = PipelineValidator.validatePipelineCreation(req.body);
  
  if (!validation.valid) {
    return res.status(400).json({
      error: 'Pipeline validation failed',
      details: validation.errors,
      warnings: validation.warnings
    });
  }

  if (validation.warnings && validation.warnings.length > 0) {
    res.locals.warnings = validation.warnings;
  }

  next();
};

export const validateSystemRegistration = (req: Request, res: Response, next: NextFunction) => {
  const validation = PipelineValidator.validateSystemConfig(req.body);
  
  if (!validation.valid) {
    return res.status(400).json({
      error: 'System configuration validation failed',
      details: validation.errors,
      warnings: validation.warnings
    });
  }

  if (validation.warnings && validation.warnings.length > 0) {
    res.locals.warnings = validation.warnings;
  }

  next();
};

export const validateTrumpInfogTrigger = (req: Request, res: Response, next: NextFunction) => {
  const validation = PipelineValidator.validateTrumpInfogConfig(req.body);
  
  if (!validation.valid) {
    return res.status(400).json({
      error: 'Trump Infog configuration validation failed',
      details: validation.errors,
      warnings: validation.warnings
    });
  }

  if (validation.warnings && validation.warnings.length > 0) {
    res.locals.warnings = validation.warnings;
  }

  next();
};

export const validatePipelineOperation = (operation: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const pipelineId = req.params.pipelineId;
    const validation = PipelineValidator.validatePipelineOperation(pipelineId, operation);
    
    if (!validation.valid) {
      return res.status(400).json({
        error: `Pipeline ${operation} validation failed`,
        details: validation.errors
      });
    }

    next();
  };
};

export const validateEventRule = (req: Request, res: Response, next: NextFunction) => {
  const validation = PipelineValidator.validateEventRule(req.body);
  
  if (!validation.valid) {
    return res.status(400).json({
      error: 'Event rule validation failed',
      details: validation.errors,
      warnings: validation.warnings
    });
  }

  if (validation.warnings && validation.warnings.length > 0) {
    res.locals.warnings = validation.warnings;
  }

  next();
};