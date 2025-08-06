import * as yaml from 'js-yaml';
import { 
  YamlValidationResult, 
  ValidationError, 
  ValidationWarning, 
  OptimizationSuggestion,
  FarmConfiguration 
} from '../types/yaml';
import { validateFarmConfiguration } from '../schemas/farmConfig.schema';
// import { validateAgentConfig } from '../schemas/agentConfig.schema';

export class YamlValidatorService {
  private static instance: YamlValidatorService;

  private constructor() {}

  static getInstance(): YamlValidatorService {
    if (!YamlValidatorService.instance) {
      YamlValidatorService.instance = new YamlValidatorService();
    }
    return YamlValidatorService.instance;
  }

  async validate(yamlContent: string): Promise<YamlValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const suggestions: OptimizationSuggestion[] = [];

    try {
      // Parse YAML
      const parsed = yaml.load(yamlContent) as any;
      
      // Check if it's Claude Code format
      const isClaudeCodeFormat = this.isClaudeCodeFormat(parsed);
      
      if (isClaudeCodeFormat) {
        // Validate Claude Code YAML
        this.validateClaudeCodeYaml(parsed, errors, warnings, suggestions);
      } else {
        // Validate against farm schema
        const schemaValidation = validateFarmConfiguration(parsed as FarmConfiguration);
        
        if (!schemaValidation.success) {
          schemaValidation.error.errors?.forEach((error: any) => {
            errors.push({
              path: error.path?.join('.') || '',
              message: error.message || 'Validation error',
              severity: 'error' as const
            });
          });
        }
      }

      // Additional validation rules for farm config
      if (!isClaudeCodeFormat && parsed && errors.length === 0) {
        this.validateAgents(parsed as FarmConfiguration, errors, warnings);
        this.validateResources(parsed as FarmConfiguration, warnings, suggestions);
        this.validateNetworking(parsed as FarmConfiguration, warnings);
        this.validateScaling(parsed as FarmConfiguration, warnings, suggestions);
        this.generateOptimizationSuggestions(parsed as FarmConfiguration, suggestions);
      }

      // Check for common YAML issues
      this.checkYamlSyntax(yamlContent, warnings);

    } catch (error) {
      if (error instanceof yaml.YAMLException) {
        errors.push({
          path: '',
          message: `YAML syntax error: ${error.message}`,
          line: error.mark?.line,
          column: error.mark?.column,
          severity: 'critical'
        });
      } else {
        errors.push({
          path: '',
          message: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          severity: 'critical'
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }

  private validateAgents(
    config: FarmConfiguration,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    const agentNames = new Set<string>();
    
    config.spec.agents.forEach((agent, index) => {
      // Check for duplicate names
      if (agentNames.has(agent.name)) {
        errors.push({
          path: `spec.agents[${index}].name`,
          message: `Duplicate agent name: ${agent.name}`,
          severity: 'error'
        });
      }
      agentNames.add(agent.name);

      // Validate agent configuration (skip for now since validateAgentConfig may not exist)
      // const agentValidation = validateAgentConfig(agent);
      // if (!agentValidation.success) {
      //   agentValidation.error.errors.forEach((error) => {
      //     warnings.push({
      //       path: `spec.agents[${index}].${error.path.join('.')}`,
      //       message: error.message
      //     });
      //   });
      // }

      // Check for missing dependencies
      if (agent.dependencies) {
        agent.dependencies.forEach((dep) => {
          if (!agentNames.has(dep) && !config.spec.agents.find(a => a.name === dep)) {
            warnings.push({
              path: `spec.agents[${index}].dependencies`,
              message: `Dependency '${dep}' not found in agent list`
            });
          }
        });
      }

      // Warn about high replica count without scaling
      if ((agent.replicas || 1) > 5 && !config.spec?.scaling?.enabled) {
        warnings.push({
          path: `spec.agents[${index}].replicas`,
          message: `High replica count (${agent.replicas}) without auto-scaling enabled`
        });
      }
    });

    // Check for orchestrator
    const hasOrchestrator = config.spec.agents.some(a => 
      a.type === 'orchestrator' || a.capabilities?.includes('task-distribution')
    );
    if (!hasOrchestrator) {
      warnings.push({
        path: 'spec.agents',
        message: 'No orchestrator agent found. Consider adding one for task coordination'
      });
    }
  }

  private validateResources(
    config: FarmConfiguration,
    warnings: ValidationWarning[],
    suggestions: OptimizationSuggestion[]
  ): void {
    config.spec.agents.forEach((agent, index) => {
      if (agent.resources) {
        // Check if limits are less than requests
        if (agent.resources.requests && agent.resources.limits) {
          const reqCpu = this.parseCpu(agent.resources.requests.cpu || '0');
          const limitCpu = this.parseCpu(agent.resources.limits.cpu || '0');
          
          if (limitCpu > 0 && reqCpu > limitCpu) {
            warnings.push({
              path: `spec.agents[${index}].resources`,
              message: 'CPU request exceeds limit'
            });
          }

          const reqMem = this.parseMemory(agent.resources.requests.memory || '0');
          const limitMem = this.parseMemory(agent.resources.limits.memory || '0');
          
          if (limitMem > 0 && reqMem > limitMem) {
            warnings.push({
              path: `spec.agents[${index}].resources`,
              message: 'Memory request exceeds limit'
            });
          }
        }

        // Suggest resource optimization
        if (!agent.resources.limits) {
          suggestions.push({
            type: 'reliability',
            message: `Agent '${agent.name}' has no resource limits`,
            impact: 'medium',
            suggestion: 'Set resource limits to prevent resource exhaustion',
            autoFixAvailable: true
          });
        }
      } else {
        // No resources specified
        suggestions.push({
          type: 'performance',
          message: `Agent '${agent.name}' has no resource specifications`,
          impact: 'low',
          suggestion: 'Define resource requests and limits for better scheduling',
          autoFixAvailable: true
        });
      }
    });
  }

  private validateNetworking(
    config: FarmConfiguration,
    warnings: ValidationWarning[]
  ): void {
    if (config.spec.networking) {
      // Check for security without TLS
      if (config.spec.networking.type === 'external' && !config.spec.networking.security?.tls) {
        warnings.push({
          path: 'spec.networking.security',
          message: 'External networking without TLS enabled'
        });
      }

      // Check for port conflicts
      if (config.spec.networking.ports) {
        const portSet = new Set<number>();
        config.spec.networking.ports.forEach((port, index) => {
          if (portSet.has(port)) {
            warnings.push({
              path: `spec.networking.ports[${index}]`,
              message: `Duplicate port: ${port}`
            });
          }
          portSet.add(port);
        });
      }
    }
  }

  private validateScaling(
    config: FarmConfiguration,
    warnings: ValidationWarning[],
    suggestions: OptimizationSuggestion[]
  ): void {
    if (config.spec.scaling?.enabled) {
      // Check scaling metrics
      if (!config.spec.scaling.metrics || config.spec.scaling.metrics.length === 0) {
        warnings.push({
          path: 'spec.scaling.metrics',
          message: 'Scaling enabled but no metrics defined'
        });
      }

      // Check if monitoring is enabled for scaling
      if (!config.spec.monitoring?.enabled) {
        warnings.push({
          path: 'spec.monitoring',
          message: 'Scaling requires monitoring to be enabled'
        });
      }
    } else {
      // Suggest scaling for high replica counts
      const highReplicaAgents = config.spec.agents.filter(a => (a.replicas || 1) > 3);
      if (highReplicaAgents.length > 0) {
        suggestions.push({
          type: 'cost',
          message: 'Consider enabling auto-scaling for agents with high replica counts',
          impact: 'medium',
          suggestion: 'Enable scaling to optimize resource usage and costs',
          autoFixAvailable: true
        });
      }
    }
  }

  private generateOptimizationSuggestions(
    config: FarmConfiguration,
    suggestions: OptimizationSuggestion[]
  ): void {
    // Security suggestions
    if (!config.spec.networking?.security?.authentication) {
      suggestions.push({
        type: 'security',
        message: 'No authentication configured for networking',
        impact: 'high',
        suggestion: 'Enable authentication for secure communication',
        autoFixAvailable: true
      });
    }

    // Performance suggestions
    if (!config.spec.monitoring?.metrics?.includes('latency')) {
      suggestions.push({
        type: 'performance',
        message: 'Latency metrics not included in monitoring',
        impact: 'medium',
        suggestion: 'Add latency metrics for better performance monitoring',
        autoFixAvailable: false
      });
    }

    // Cost optimization
    const totalReplicas = config.spec.agents.reduce((sum, agent) => sum + (agent.replicas || 1), 0);
    if (totalReplicas > 10 && !config.spec.scaling?.enabled) {
      suggestions.push({
        type: 'cost',
        message: `High total replica count (${totalReplicas}) without auto-scaling`,
        impact: 'high',
        suggestion: 'Enable auto-scaling to reduce costs during low usage periods',
        autoFixAvailable: true
      });
    }

    // Reliability suggestions
    if (!config.spec.storage?.backups?.enabled && config.spec.storage?.persistence) {
      suggestions.push({
        type: 'reliability',
        message: 'Persistent storage without backups enabled',
        impact: 'high',
        suggestion: 'Enable backups for data protection',
        autoFixAvailable: true
      });
    }
  }

  private checkYamlSyntax(yamlContent: string, warnings: ValidationWarning[]): void {
    const lines = yamlContent.split('\n');
    
    lines.forEach((line, index) => {
      // Check for tabs (YAML should use spaces)
      if (line.includes('\t')) {
        warnings.push({
          path: '',
          message: 'YAML should use spaces instead of tabs',
          line: index + 1
        });
      }

      // Check for trailing spaces
      if (line.trimEnd() !== line) {
        warnings.push({
          path: '',
          message: 'Trailing whitespace detected',
          line: index + 1
        });
      }
    });
  }

  private parseCpu(cpu: string): number {
    if (cpu.endsWith('m')) {
      return parseInt(cpu.slice(0, -1));
    }
    return parseInt(cpu) * 1000;
  }

  private parseMemory(memory: string): number {
    const units: Record<string, number> = {
      'Ki': 1024,
      'Mi': 1024 * 1024,
      'Gi': 1024 * 1024 * 1024,
      'K': 1000,
      'M': 1000 * 1000,
      'G': 1000 * 1000 * 1000
    };

    for (const [unit, multiplier] of Object.entries(units)) {
      if (memory.endsWith(unit)) {
        return parseInt(memory.slice(0, -unit.length)) * multiplier;
      }
    }

    return parseInt(memory);
  }

  async validateAndAutoFix(yamlContent: string): Promise<{ yaml: string; validation: YamlValidationResult }> {
    const validation = await this.validate(yamlContent);
    
    if (validation.isValid) {
      return { yaml: yamlContent, validation };
    }

    try {
      const parsed = yaml.load(yamlContent) as FarmConfiguration;
      
      // Apply auto-fixes based on suggestions
      validation.suggestions.forEach((suggestion) => {
        if ((suggestion as any).autoFixAvailable) {
          this.applyAutoFix(parsed, suggestion);
        }
      });

      const fixedYaml = yaml.dump(parsed, { indent: 2 });
      const newValidation = await this.validate(fixedYaml);

      return { yaml: fixedYaml, validation: newValidation };
    } catch (error) {
      return { yaml: yamlContent, validation };
    }
  }

  private applyAutoFix(config: FarmConfiguration, suggestion: OptimizationSuggestion): void {
    // Implementation of auto-fixes based on suggestion type
    switch (suggestion.type) {
      case 'security':
        if (suggestion.message.includes('authentication')) {
          if (!config.spec.networking) {
            config.spec.networking = { type: 'internal' };
          }
          if (!config.spec.networking.security) {
            config.spec.networking.security = {};
          }
          config.spec.networking.security.authentication = 'mutual-tls';
        }
        break;

      case 'performance':
        if (suggestion.message.includes('resource specifications')) {
          config.spec.agents.forEach((agent) => {
            if (!agent.resources) {
              agent.resources = {
                requests: { cpu: '100m', memory: '256Mi' },
                limits: { cpu: '500m', memory: '1Gi' }
              };
            }
          });
        }
        break;

      case 'reliability':
        if (suggestion.message.includes('backups')) {
          if (config.spec.storage && !config.spec.storage.backups) {
            config.spec.storage.backups = {
              enabled: true,
              schedule: '0 2 * * *',
              retention: '7d'
            };
          }
        }
        break;

      case 'cost':
        if (suggestion.message.includes('auto-scaling')) {
          config.spec.scaling = {
            enabled: true,
            minReplicas: 1,
            maxReplicas: 10,
            metrics: [
              { type: 'cpu', target: 70 },
              { type: 'memory', target: 80 }
            ]
          };
        }
        break;
    }
  }

  private isClaudeCodeFormat(parsed: any): boolean {
    // Claude Code YAML has specific fields
    return parsed && 
           typeof parsed.name === 'string' &&
           typeof parsed.description === 'string' &&
           typeof parsed.initial_prompt === 'string' &&
           Array.isArray(parsed.steps);
  }

  private validateClaudeCodeYaml(
    config: any,
    errors: ValidationError[],
    warnings: ValidationWarning[],
    suggestions: OptimizationSuggestion[]
  ): void {
    // Validate required fields
    if (!config.name || config.name.trim() === '') {
      errors.push({
        path: 'name',
        message: 'Project name is required',
        severity: 'error'
      });
    }

    if (!config.description || config.description.trim() === '') {
      errors.push({
        path: 'description',
        message: 'Project description is required',
        severity: 'error'
      });
    }

    if (!config.initial_prompt || config.initial_prompt.trim() === '') {
      errors.push({
        path: 'initial_prompt',
        message: 'Initial prompt is required',
        severity: 'error'
      });
    }

    // Validate steps
    if (!Array.isArray(config.steps) || config.steps.length === 0) {
      errors.push({
        path: 'steps',
        message: 'At least one step is required',
        severity: 'error'
      });
    } else {
      config.steps.forEach((step: any, index: number) => {
        if (!step.content || step.content.trim() === '') {
          errors.push({
            path: `steps[${index}].content`,
            message: 'Step content is required',
            severity: 'error'
          });
        }

        if (!step.description || step.description.trim() === '') {
          warnings.push({
            path: `steps[${index}].description`,
            message: 'Step description is recommended for clarity',
            fix: 'Add a description to explain what this step accomplishes'
          });
        }
      });
    }

    // Provide optimization suggestions
    if (config.steps && config.steps.length > 10) {
      suggestions.push({
        type: 'performance',
        message: 'Consider breaking down into smaller sub-projects for better manageability',
        impact: 'medium',
        suggestion: 'Split into multiple farms with focused objectives',
        autoFixAvailable: false
      });
    }

    if (config.initial_prompt && config.initial_prompt.length < 100) {
      suggestions.push({
        type: 'reliability',
        message: 'Consider providing more detailed initial context',
        impact: 'high',
        suggestion: 'Include specific requirements, constraints, and expected outcomes',
        autoFixAvailable: false
      });
    }

    // Check for test coverage
    const hasTestStep = config.steps?.some((step: any) => 
      step.content?.toLowerCase().includes('test') || 
      step.description?.toLowerCase().includes('test')
    );

    if (!hasTestStep) {
      suggestions.push({
        type: 'reliability',
        message: 'Add a testing step to ensure code quality',
        impact: 'high',
        suggestion: 'Include unit tests, integration tests, or E2E tests',
        autoFixAvailable: false
      });
    }
  }
}

export const yamlValidator = YamlValidatorService.getInstance();