import * as yaml from 'js-yaml';
import Ajv from 'ajv';

interface ValidationError {
  message: string;
  path?: string;
  line?: number;
  column?: number;
}

interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: string[];
  suggestions: string[];
}

const farmConfigSchema = {
  type: 'object',
  required: ['version', 'farm', 'agents'],
  properties: {
    version: {
      type: 'string',
      pattern: '^\\d+\\.\\d+$'
    },
    farm: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', minLength: 1 },
        description: { type: 'string' },
        mode: { 
          type: 'string',
          enum: ['collaborative', 'competitive', 'independent']
        }
      }
    },
    agents: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['id', 'name', 'type'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          type: { 
            type: 'string',
            enum: ['developer', 'tester', 'debugger', 'analyst', 'designer']
          },
          capabilities: {
            type: 'array',
            items: { type: 'string' }
          },
          resources: {
            type: 'object',
            properties: {
              cpu: { type: 'number', minimum: 0.1 },
              memory: { type: 'string', pattern: '^\\d+(\\.\\d+)?(Mi|Gi)$' }
            }
          }
        }
      }
    },
    orchestration: {
      type: 'object',
      properties: {
        strategy: {
          type: 'string',
          enum: ['sequential', 'parallel', 'adaptive']
        },
        errorHandling: {
          type: 'string',
          enum: ['stop', 'continue', 'retry']
        },
        monitoring: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            interval: { type: 'number', minimum: 1 }
          }
        }
      }
    }
  }
};

class YamlValidator {
  private ajv: Ajv;
  
  constructor() {
    this.ajv = new Ajv({ allErrors: true });
  }
  
  async validate(yamlContent: string): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: []
    };
    
    try {
      // Parse YAML
      const config = yaml.load(yamlContent) as any;
      
      // Validate against schema
      const validate = this.ajv.compile(farmConfigSchema);
      const valid = validate(config);
      
      if (!valid) {
        result.isValid = false;
        result.errors = (validate.errors || []).map(err => ({
          message: err.message || 'Unknown error',
          path: err.instancePath
        }));
      }
      
      // Additional validation rules
      this.validateAgentUniqueness(config, result);
      this.validateResourceLimits(config, result);
      this.generateWarnings(config, result);
      this.generateSuggestions(config, result);
      
    } catch (error: any) {
      result.isValid = false;
      result.errors.push({
        message: `YAML parsing error: ${error.message}`,
        line: error.mark?.line,
        column: error.mark?.column
      });
    }
    
    return result;
  }
  
  private validateAgentUniqueness(config: any, result: ValidationResult): void {
    if (!config.agents || !Array.isArray(config.agents)) return;
    
    const ids = new Set<string>();
    const names = new Set<string>();
    
    config.agents.forEach((agent: any, index: number) => {
      if (ids.has(agent.id)) {
        result.isValid = false;
        result.errors.push({
          message: `Duplicate agent ID: ${agent.id}`,
          path: `/agents/${index}/id`
        });
      }
      if (names.has(agent.name)) {
        result.warnings.push(`Duplicate agent name: ${agent.name}`);
      }
      
      ids.add(agent.id);
      names.add(agent.name);
    });
  }
  
  private validateResourceLimits(config: any, result: ValidationResult): void {
    if (!config.agents) return;
    
    let totalCpu = 0;
    let totalMemory = 0;
    
    config.agents.forEach((agent: any) => {
      if (agent.resources) {
        totalCpu += agent.resources.cpu || 0;
        
        // Parse memory values
        if (agent.resources.memory) {
          const match = agent.resources.memory.match(/^(\d+(?:\.\d+)?)(Mi|Gi)$/);
          if (match) {
            const value = parseFloat(match[1]);
            const unit = match[2];
            totalMemory += unit === 'Gi' ? value * 1024 : value;
          }
        }
      }
    });
    
    if (totalCpu > 16) {
      result.warnings.push(`Total CPU allocation (${totalCpu}) exceeds recommended limit of 16 cores`);
    }
    
    if (totalMemory > 32768) { // 32Gi in Mi
      result.warnings.push(`Total memory allocation exceeds recommended limit of 32Gi`);
    }
  }
  
  private generateWarnings(config: any, result: ValidationResult): void {
    if (config.agents?.length > 10) {
      result.warnings.push('Large number of agents may impact performance');
    }
    
    if (!config.orchestration?.errorHandling) {
      result.warnings.push('No error handling strategy defined');
    }
    
    if (!config.orchestration?.monitoring?.enabled) {
      result.warnings.push('Monitoring is disabled - consider enabling for production use');
    }
  }
  
  private generateSuggestions(config: any, result: ValidationResult): void {
    if (!config.orchestration?.retryPolicy) {
      result.suggestions.push('Add retry policy for better fault tolerance');
    }
    
    if (!config.farm?.tags) {
      result.suggestions.push('Add tags to your farm for better organization');
    }
    
    const hasTestingAgent = config.agents?.some((a: any) => a.type === 'tester');
    if (!hasTestingAgent && config.agents?.length > 2) {
      result.suggestions.push('Consider adding a dedicated testing agent');
    }
    
    if (config.agents?.length === 1) {
      result.suggestions.push('Single agent farms may benefit from parallel task execution');
    }
  }
}

export const yamlValidator = new YamlValidator();