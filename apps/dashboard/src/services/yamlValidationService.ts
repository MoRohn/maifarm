/**
 * Production-ready YAML Validation Service
 * Provides comprehensive validation with security, performance, and best practice checks
 */

import { YamlConfig } from '@/types/yamlGenerator';
import { 
  ValidationRule, 
  ValidationIssue, 
  ExtendedValidationResult 
} from '@/types/yamlPipeline';
import * as yaml from 'js-yaml';

class YamlValidationService {
  private validationRules: ValidationRule[] = [];

  constructor() {
    this.initializeValidationRules();
  }

  /**
   * Initialize all validation rules
   */
  private initializeValidationRules() {
    // Syntax Rules
    this.addRule({
      id: 'syntax-valid-yaml',
      name: 'Valid YAML Syntax',
      description: 'Ensures YAML has valid syntax',
      severity: 'error',
      category: 'syntax',
      check: (config) => {
        const issues: ValidationIssue[] = [];
        try {
          yaml.dump(config);
        } catch (error) {
          issues.push({
            ruleId: 'syntax-valid-yaml',
            severity: 'error',
            message: `Invalid YAML syntax: ${error}`,
          });
        }
        return issues;
      }
    });

    // Required Fields Rules
    this.addRule({
      id: 'required-name',
      name: 'Required Name Field',
      description: 'Farm must have a name',
      severity: 'error',
      category: 'syntax',
      check: (config) => {
        const issues: ValidationIssue[] = [];
        if (!config.name || config.name.trim() === '') {
          issues.push({
            ruleId: 'required-name',
            severity: 'error',
            message: 'Farm name is required',
            field: 'name',
            suggestion: 'Add a descriptive name for your farm'
          });
        }
        return issues;
      }
    });

    this.addRule({
      id: 'required-steps',
      name: 'Required Steps',
      description: 'Farm must have at least one step',
      severity: 'error',
      category: 'syntax',
      check: (config) => {
        const issues: ValidationIssue[] = [];
        if (!config.steps || config.steps.length === 0) {
          issues.push({
            ruleId: 'required-steps',
            severity: 'error',
            message: 'At least one step is required',
            field: 'steps',
            suggestion: 'Add steps to define the farm workflow'
          });
        }
        return issues;
      }
    });

    // Security Rules
    this.addRule({
      id: 'security-no-secrets',
      name: 'No Hardcoded Secrets',
      description: 'Prevents hardcoded secrets in configuration',
      severity: 'error',
      category: 'security',
      check: (config) => {
        const issues: ValidationIssue[] = [];
        const secretPatterns = [
          /api[_-]?key\s*[:=]\s*['"]?[a-zA-Z0-9]{20,}/gi,
          /password\s*[:=]\s*['"]?.+/gi,
          /secret\s*[:=]\s*['"]?.+/gi,
          /token\s*[:=]\s*['"]?[a-zA-Z0-9]{20,}/gi,
          /private[_-]?key\s*[:=]\s*['"]?.+/gi
        ];

        const yamlString = JSON.stringify(config);
        for (const pattern of secretPatterns) {
          if (pattern.test(yamlString)) {
            issues.push({
              ruleId: 'security-no-secrets',
              severity: 'error',
              message: 'Potential hardcoded secret detected',
              suggestion: 'Use environment variables or secure vaults for sensitive data',
              autoFixAvailable: true
            });
            break;
          }
        }
        return issues;
      }
    });

    this.addRule({
      id: 'security-safe-commands',
      name: 'Safe Command Execution',
      description: 'Ensures commands are safe to execute',
      severity: 'warning',
      category: 'security',
      check: (config) => {
        const issues: ValidationIssue[] = [];
        const dangerousCommands = ['rm -rf', 'eval', 'exec', 'sudo', 'chmod 777'];
        
        config.steps.forEach((step, index) => {
          const content = step.content.toLowerCase();
          for (const cmd of dangerousCommands) {
            if (content.includes(cmd)) {
              issues.push({
                ruleId: 'security-safe-commands',
                severity: 'warning',
                message: `Potentially dangerous command "${cmd}" in step ${step.number}`,
                field: `steps[${index}].content`,
                suggestion: 'Review command for security implications'
              });
            }
          }
        });
        return issues;
      }
    });

    // Performance Rules
    this.addRule({
      id: 'perf-optimal-agents',
      name: 'Optimal Agent Count',
      description: 'Ensures optimal number of agents for performance',
      severity: 'warning',
      category: 'performance',
      check: (config) => {
        const issues: ValidationIssue[] = [];
        const agentCount = this.extractAgentCount(config);
        
        if (agentCount > 10) {
          issues.push({
            ruleId: 'perf-optimal-agents',
            severity: 'warning',
            message: `High agent count (${agentCount}) may impact performance`,
            suggestion: 'Consider breaking into smaller farms for better resource utilization'
          });
        }
        return issues;
      }
    });

    this.addRule({
      id: 'perf-step-complexity',
      name: 'Step Complexity Check',
      description: 'Ensures steps are not overly complex',
      severity: 'info',
      category: 'performance',
      check: (config) => {
        const issues: ValidationIssue[] = [];
        
        config.steps.forEach((step, index) => {
          const lineCount = step.content.split('\n').length;
          if (lineCount > 50) {
            issues.push({
              ruleId: 'perf-step-complexity',
              severity: 'info',
              message: `Step ${step.number} is complex (${lineCount} lines)`,
              field: `steps[${index}]`,
              suggestion: 'Consider breaking into smaller sub-steps'
            });
          }
        });
        return issues;
      }
    });

    // Best Practice Rules
    this.addRule({
      id: 'bp-naming-convention',
      name: 'Naming Convention',
      description: 'Ensures proper naming conventions',
      severity: 'info',
      category: 'best-practice',
      check: (config) => {
        const issues: ValidationIssue[] = [];
        const namePattern = /^[a-z][a-z0-9-]*$/;
        
        if (!namePattern.test(config.name)) {
          issues.push({
            ruleId: 'bp-naming-convention',
            severity: 'info',
            message: 'Farm name should use lowercase letters, numbers, and hyphens',
            field: 'name',
            suggestion: `Consider renaming to: ${config.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`,
            autoFixAvailable: true
          });
        }
        return issues;
      }
    });

    this.addRule({
      id: 'bp-step-descriptions',
      name: 'Step Descriptions',
      description: 'Ensures all steps have descriptions',
      severity: 'info',
      category: 'best-practice',
      check: (config) => {
        const issues: ValidationIssue[] = [];
        
        config.steps.forEach((step, index) => {
          if (!step.description || step.description.trim() === '') {
            issues.push({
              ruleId: 'bp-step-descriptions',
              severity: 'info',
              message: `Step ${step.number} lacks a description`,
              field: `steps[${index}].description`,
              suggestion: 'Add a brief description for better clarity'
            });
          }
        });
        return issues;
      }
    });

    this.addRule({
      id: 'bp-metadata-completeness',
      name: 'Metadata Completeness',
      description: 'Ensures metadata is complete',
      severity: 'info',
      category: 'best-practice',
      check: (config) => {
        const issues: ValidationIssue[] = [];
        
        if (!config.metadata) {
          issues.push({
            ruleId: 'bp-metadata-completeness',
            severity: 'info',
            message: 'Consider adding metadata for better tracking',
            field: 'metadata',
            suggestion: 'Add metadata with created_at, purpose, and other relevant info'
          });
        }
        return issues;
      }
    });
  }

  /**
   * Add a validation rule
   */
  private addRule(rule: ValidationRule) {
    this.validationRules.push(rule);
  }

  /**
   * Validate YAML configuration
   */
  async validate(config: YamlConfig): Promise<ExtendedValidationResult> {
    const allIssues: ValidationIssue[] = [];
    let passedRules = 0;

    // Run all validation rules
    for (const rule of this.validationRules) {
      const issues = rule.check(config);
      if (issues.length === 0) {
        passedRules++;
      }
      allIssues.push(...issues);
    }

    // Calculate scores
    const errors = allIssues.filter(i => i.severity === 'error');
    const warnings = allIssues.filter(i => i.severity === 'warning');
    const infos = allIssues.filter(i => i.severity === 'info');

    const securityIssues = allIssues.filter(i => 
      this.validationRules.find(r => r.id === i.ruleId)?.category === 'security'
    );
    const performanceIssues = allIssues.filter(i => 
      this.validationRules.find(r => r.id === i.ruleId)?.category === 'performance'
    );

    const totalScore = this.calculateScore(errors.length, warnings.length, infos.length);
    const securityScore = this.calculateCategoryScore(securityIssues);
    const performanceScore = this.calculateCategoryScore(performanceIssues);

    // Generate suggestions
    const suggestions = this.generateSuggestions(config, allIssues);

    return {
      valid: errors.length === 0,
      errors: errors.map(e => ({ field: e.field || '', message: e.message })),
      warnings: warnings.map(w => ({ 
        field: w.field || '', 
        message: w.message, 
        severity: 'low' as const 
      })),
      suggestions,
      issues: allIssues,
      score: totalScore,
      passedRules,
      totalRules: this.validationRules.length,
      securityScore,
      performanceScore
    };
  }

  /**
   * Validate raw YAML string
   */
  async validateYamlString(yamlString: string): Promise<ExtendedValidationResult> {
    try {
      const config = yaml.load(yamlString) as YamlConfig;
      return this.validate(config);
    } catch (error) {
      return {
        valid: false,
        errors: [{ field: 'syntax', message: `YAML parsing error: ${error}` }],
        warnings: [],
        suggestions: ['Fix YAML syntax errors before validation'],
        issues: [{
          ruleId: 'syntax-valid-yaml',
          severity: 'error',
          message: `YAML parsing error: ${error}`
        }],
        score: 0,
        passedRules: 0,
        totalRules: this.validationRules.length,
        securityScore: 0,
        performanceScore: 0
      };
    }
  }

  /**
   * Auto-fix issues where possible
   */
  async autoFix(config: YamlConfig, issues: ValidationIssue[]): Promise<YamlConfig> {
    let fixedConfig = { ...config };

    for (const issue of issues) {
      if (!issue.autoFixAvailable) continue;

      switch (issue.ruleId) {
        case 'bp-naming-convention':
          fixedConfig.name = fixedConfig.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
          break;
        case 'security-no-secrets':
          // Replace hardcoded secrets with env variable references
          const yamlString = JSON.stringify(fixedConfig);
          const fixed = yamlString.replace(
            /(['"]?)([A-Za-z0-9]{20,})(['"]?)/g,
            '${ENV_VAR_NAME}'
          );
          fixedConfig = JSON.parse(fixed);
          break;
        // Add more auto-fix cases
      }
    }

    return fixedConfig;
  }

  /**
   * Calculate overall validation score
   */
  private calculateScore(errors: number, warnings: number, infos: number): number {
    const baseScore = 100;
    const errorPenalty = 20;
    const warningPenalty = 5;
    const infoPenalty = 1;

    const score = baseScore - (errors * errorPenalty) - (warnings * warningPenalty) - (infos * infoPenalty);
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate category-specific score
   */
  private calculateCategoryScore(issues: ValidationIssue[]): number {
    if (issues.length === 0) return 100;
    
    const errors = issues.filter(i => i.severity === 'error').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;
    
    return Math.max(0, 100 - (errors * 30) - (warnings * 10));
  }

  /**
   * Extract agent count from config
   */
  private extractAgentCount(config: YamlConfig): number {
    const promptMatch = config.initial_prompt.match(/(\d+)\s*agents?/i);
    if (promptMatch) {
      return parseInt(promptMatch[1]);
    }
    return config.metadata?.num_agents || 3;
  }

  /**
   * Generate intelligent suggestions
   */
  private generateSuggestions(config: YamlConfig, issues: ValidationIssue[]): string[] {
    const suggestions: string[] = [];

    // Add issue-specific suggestions
    issues.forEach(issue => {
      if (issue.suggestion) {
        suggestions.push(issue.suggestion);
      }
    });

    // Add general suggestions
    if (!config.steps.some(s => s.tags?.includes('testing'))) {
      suggestions.push('Consider adding testing steps for quality assurance');
    }

    if (!config.steps.some(s => s.tags?.includes('documentation'))) {
      suggestions.push('Add documentation steps for better maintainability');
    }

    const totalTime = config.steps.reduce((sum, step) => sum + (step.estimated_time || 15), 0);
    if (totalTime > 480) {
      suggestions.push('Farm duration exceeds 8 hours - consider splitting into smaller farms');
    }

    return [...new Set(suggestions)]; // Remove duplicates
  }

  /**
   * Get validation rules by category
   */
  getRulesByCategory(category: string): ValidationRule[] {
    return this.validationRules.filter(rule => rule.category === category);
  }

  /**
   * Get all validation rules
   */
  getAllRules(): ValidationRule[] {
    return [...this.validationRules];
  }
}

export default new YamlValidationService();