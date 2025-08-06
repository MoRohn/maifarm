/**
 * YAML Sanitizer Service
 * Cleans and validates YAML content to prevent invalid structures and error messages
 */

import { YamlConfig, AgentDefinition, BuildStep } from '../types/yamlGenerator';

interface SanitizationResult {
  success: boolean;
  sanitized: string;
  removed: string[];
  warnings: string[];
  errors: string[];
}

interface ValidationIssue {
  type: 'error' | 'warning';
  field: string;
  message: string;
  suggestion?: string;
}

class YamlSanitizer {
  // Patterns that indicate error messages or invalid content
  private readonly errorPatterns = [
    /API\s+Error:/gi,
    /Request\s+timed?\s+out/gi,
    /\[Agent\s+ID:\s*agent_\d+_\d+_\w+\]/gi,
    /⎿\s+API\s+Error/gi,
    /Error:\s+Request/gi,
    /Failed\s+to\s+fetch/gi,
    /Network\s+error/gi,
    /Connection\s+refused/gi,
    /Timeout\s+exceeded/gi,
    /Invalid\s+response/gi,
    /╭─+╮/g,
    /╰─+╯/g,
    /│\s*>\s*│/g,
    /\?\s+for\s+shortcuts/gi,
    /Bypassing\s+Permissions/gi
  ];

  // Patterns that indicate system messages or metadata
  private readonly systemPatterns = [
    /IMPORTANT:/gi,
    /NOTE:/gi,
    /WARNING:/gi,
    /TODO:/gi,
    /FIXME:/gi,
    /DEBUG:/gi,
    /\[System\]/gi,
    /\[Claude\]/gi,
    /\[Assistant\]/gi,
    /Your\s+goal\s+is\s+to/gi,
    /Remember\s+to\s+claim/gi,
    /Choose\s+which\s+step/gi,
    /Collaboration\s+Protocol:/gi,
    /COMPLETE\s+PROJECT\s+STEPS:/gi
  ];

  // Valid agent types
  private readonly validAgentTypes = [
    'general', 'developer', 'tester', 'analyzer', 'reviewer', 
    'debugger', 'auditor', 'analyst', 'builder', 'documenter',
    'designer', 'architect', 'coordinator', 'specialized'
  ];

  // Maximum allowed values for safety
  private readonly limits = {
    maxAgents: 20,
    minAgents: 1,
    maxSteps: 100,
    minSteps: 1,
    maxStepLength: 500,
    maxPromptLength: 2000,
    maxNameLength: 100,
    maxDescriptionLength: 500
  };

  /**
   * Sanitize YAML content
   */
  sanitizeYaml(content: string): SanitizationResult {
    const removed: string[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    try {
      // Step 1: Remove error messages and invalid patterns
      let sanitized = this.removeErrorMessages(content, removed);

      // Step 2: Remove system messages
      sanitized = this.removeSystemMessages(sanitized, removed);

      // Step 3: Clean up formatting issues
      sanitized = this.cleanFormatting(sanitized);

      // Step 4: Validate and fix structure
      const structureResult = this.validateStructure(sanitized);
      if (!structureResult.valid) {
        errors.push(...structureResult.errors);
        sanitized = this.fixStructure(sanitized, structureResult.issues);
      }

      // Step 5: Validate agent definitions
      const agentResult = this.validateAgents(sanitized);
      warnings.push(...agentResult.warnings);
      // Always fix agent issues, not just when invalid
      if (agentResult.issues.length > 0) {
        sanitized = this.fixAgents(sanitized, agentResult.issues);
      }

      // Step 6: Validate steps
      const stepResult = this.validateSteps(sanitized);
      if (!stepResult.valid) {
        warnings.push(...stepResult.warnings);
        sanitized = this.fixSteps(sanitized, stepResult.issues);
      }

      // Step 7: Final cleanup
      sanitized = this.finalCleanup(sanitized);

      return {
        success: errors.length === 0,
        sanitized,
        removed,
        warnings,
        errors
      };
    } catch (error) {
      return {
        success: false,
        sanitized: content,
        removed,
        warnings,
        errors: [error instanceof Error ? error.message : 'Unknown sanitization error']
      };
    }
  }

  /**
   * Remove error messages from content
   */
  private removeErrorMessages(content: string, removed: string[]): string {
    let sanitized = content;

    for (const pattern of this.errorPatterns) {
      const matches = sanitized.match(pattern);
      if (matches) {
        matches.forEach(match => {
          removed.push(`Error pattern: ${match.substring(0, 50)}...`);
        });
        sanitized = sanitized.replace(pattern, '');
      }
    }

    // Remove lines that are clearly error messages
    const lines = sanitized.split('\n');
    const cleanLines = lines.filter(line => {
      const trimmed = line.trim();
      
      // Check if line contains error indicators
      if (trimmed.includes('API Error') || 
          trimmed.includes('Request timed out') ||
          trimmed.includes('Failed to') ||
          trimmed.includes('Error:')) {
        removed.push(`Error line: ${trimmed.substring(0, 50)}...`);
        return false;
      }
      
      return true;
    });

    return cleanLines.join('\n');
  }

  /**
   * Remove system messages from content
   */
  private removeSystemMessages(content: string, removed: string[]): string {
    let sanitized = content;

    // Remove lines containing system patterns
    const lines = sanitized.split('\n');
    const cleanLines = lines.filter(line => {
      for (const pattern of this.systemPatterns) {
        if (pattern.test(line)) {
          removed.push(`System pattern: ${line.substring(0, 50)}...`);
          return false;
        }
      }
      return true;
    });
    
    sanitized = cleanLines.join('\n');

    // Remove instruction blocks
    sanitized = sanitized.replace(/Your\s+goal\s+is[\s\S]*?(?=\n\n|\n[A-Z]|\n\w+:)/gi, '');
    sanitized = sanitized.replace(/Collaboration\s+Protocol:[\s\S]*?(?=\n\n|\n[A-Z]|\n\w+:)/gi, '');
    sanitized = sanitized.replace(/COMPLETE\s+PROJECT\s+STEPS:[\s\S]*?(?=\n\n|\n[A-Z]|\n\w+:)/gi, '');

    return sanitized;
  }

  /**
   * Clean formatting issues
   */
  private cleanFormatting(content: string): string {
    let sanitized = content;

    // Remove excessive whitespace
    sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
    sanitized = sanitized.replace(/[ \t]+$/gm, '');
    
    // Fix indentation issues
    sanitized = this.fixIndentation(sanitized);

    // Remove box drawing characters
    sanitized = sanitized.replace(/[╭╮╰╯│─┌┐└┘├┤┬┴┼]/g, '');

    // Clean up special characters that shouldn't be in YAML
    sanitized = sanitized.replace(/[⎿]/g, '');

    return sanitized;
  }

  /**
   * Fix indentation in YAML
   */
  private fixIndentation(content: string): string {
    const lines = content.split('\n');
    const fixedLines: string[] = [];
    let currentIndent = 0;
    let inMultiline = false;

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed === '') {
        fixedLines.push('');
        continue;
      }

      // Handle multiline strings
      if (trimmed.endsWith('|') || trimmed.endsWith('>')) {
        inMultiline = true;
        fixedLines.push(' '.repeat(currentIndent) + trimmed);
        currentIndent += 2;
        continue;
      }

      if (inMultiline && !trimmed.endsWith(':') && !trimmed.startsWith('-')) {
        fixedLines.push(' '.repeat(currentIndent) + trimmed);
        continue;
      } else if (inMultiline) {
        inMultiline = false;
        currentIndent -= 2;
      }

      // Determine proper indentation
      if (trimmed.endsWith(':') && !trimmed.includes(': ')) {
        // New section
        if (trimmed.startsWith('-')) {
          fixedLines.push(' '.repeat(currentIndent) + trimmed);
        } else if (currentIndent > 0 && !['agents:', 'steps:', 'config:', 'metadata:'].includes(trimmed)) {
          fixedLines.push(' '.repeat(currentIndent) + trimmed);
        } else {
          currentIndent = 0;
          fixedLines.push(trimmed);
        }
        if (!trimmed.startsWith('-')) {
          currentIndent = 0;
        }
      } else if (trimmed.startsWith('- ')) {
        // List item
        if (currentIndent === 0) currentIndent = 2;
        fixedLines.push(' '.repeat(currentIndent) + trimmed);
      } else if (trimmed.includes(': ')) {
        // Key-value pair
        if (currentIndent === 0) currentIndent = 2;
        fixedLines.push(' '.repeat(currentIndent) + trimmed);
      } else {
        // Content line
        fixedLines.push(' '.repeat(currentIndent) + trimmed);
      }
    }

    return fixedLines.join('\n');
  }

  /**
   * Validate YAML structure
   */
  private validateStructure(content: string): { valid: boolean; errors: string[]; issues: ValidationIssue[] } {
    const errors: string[] = [];
    const issues: ValidationIssue[] = [];

    // Check for required fields
    if (!content.includes('name:')) {
      errors.push('Missing required field: name');
      issues.push({ type: 'error', field: 'name', message: 'Name field is required' });
    }

    if (!content.includes('agents:')) {
      errors.push('Missing required field: agents');
      issues.push({ type: 'error', field: 'agents', message: 'Agents section is required' });
    }

    if (!content.includes('initial_prompt:')) {
      issues.push({ 
        type: 'warning', 
        field: 'initial_prompt', 
        message: 'Initial prompt is recommended',
        suggestion: 'Add an initial_prompt field to provide context'
      });
    }

    // Check for duplicate keys
    const lines = content.split('\n');
    const topLevelKeys = new Set<string>();
    
    for (const line of lines) {
      const match = line.match(/^(\w+):/);
      if (match) {
        const key = match[1];
        if (topLevelKeys.has(key)) {
          errors.push(`Duplicate key found: ${key}`);
          issues.push({ type: 'error', field: key, message: 'Duplicate key detected' });
        }
        topLevelKeys.add(key);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      issues
    };
  }

  /**
   * Fix structural issues in YAML
   */
  private fixStructure(content: string, issues: ValidationIssue[]): string {
    let fixed = content;

    // Add missing required fields
    for (const issue of issues) {
      if (issue.type === 'error' && issue.message.includes('required')) {
        switch (issue.field) {
          case 'name':
            fixed = `name: generated-farm-${Date.now()}\n${fixed}`;
            break;
          case 'agents':
            fixed = `${fixed}\n\nagents:\n  - name: Default Agent\n    type: general\n    role: General purpose agent`;
            break;
        }
      }
    }

    return fixed;
  }

  /**
   * Validate agent definitions
   */
  private validateAgents(content: string): { valid: boolean; warnings: string[]; issues: ValidationIssue[] } {
    const warnings: string[] = [];
    const issues: ValidationIssue[] = [];

    // Extract agents section
    const agentsMatch = content.match(/agents:\s*\n((?:\s+.*\n)*)/);
    if (!agentsMatch) {
      return { valid: true, warnings, issues };
    }

    const agentsSection = agentsMatch[1];
    const agentBlocks = agentsSection.split(/(?=\s+-\s+name:)/);

    for (const block of agentBlocks) {
      if (!block.trim()) continue;

      // Check agent type
      const typeMatch = block.match(/type:\s*(\S+)/);
      if (typeMatch) {
        const agentType = typeMatch[1];
        if (!this.validAgentTypes.includes(agentType)) {
          warnings.push(`Invalid agent type: ${agentType}`);
          issues.push({ 
            type: 'warning', 
            field: 'agent.type', 
            message: `Invalid type: ${agentType}`,
            suggestion: `Use one of: ${this.validAgentTypes.join(', ')}`
          });
        }
      }

      // Check for excessive agent count
      if (agentBlocks.length > this.limits.maxAgents) {
        warnings.push(`Too many agents: ${agentBlocks.length} (max: ${this.limits.maxAgents})`);
        issues.push({ 
          type: 'warning', 
          field: 'agents', 
          message: 'Too many agents defined',
          suggestion: `Reduce to ${this.limits.maxAgents} or fewer agents`
        });
      }
    }

    return {
      valid: issues.filter(i => i.type === 'error').length === 0,
      warnings,
      issues
    };
  }

  /**
   * Fix agent issues
   */
  private fixAgents(content: string, issues: ValidationIssue[]): string {
    let fixed = content;

    for (const issue of issues) {
      if (issue.field === 'agent.type' && issue.message.includes('Invalid type')) {
        const invalidType = issue.message.match(/Invalid type: (\S+)/)?.[1];
        if (invalidType) {
          // Escape special regex characters in the invalid type
          const escapedType = invalidType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          fixed = fixed.replace(new RegExp(`type:\\s*${escapedType}\\b`, 'g'), 'type: general');
        }
      }
    }

    return fixed;
  }

  /**
   * Validate steps
   */
  private validateSteps(content: string): { valid: boolean; warnings: string[]; issues: ValidationIssue[] } {
    const warnings: string[] = [];
    const issues: ValidationIssue[] = [];

    // Extract steps section
    const stepsMatch = content.match(/steps:\s*\n((?:\s+.*\n)*)/);
    if (!stepsMatch) {
      return { valid: true, warnings, issues };
    }

    const stepsSection = stepsMatch[1];
    const stepLines = stepsSection.split('\n').filter(line => line.trim().startsWith('-'));

    // Check step count
    if (stepLines.length > this.limits.maxSteps) {
      warnings.push(`Too many steps: ${stepLines.length} (max: ${this.limits.maxSteps})`);
      issues.push({ 
        type: 'warning', 
        field: 'steps', 
        message: 'Too many steps defined',
        suggestion: `Reduce to ${this.limits.maxSteps} or fewer steps`
      });
    }

    // Check step content
    for (const step of stepLines) {
      const content = step.replace(/^\s*-\s*/, '').trim();
      
      if (content.length > this.limits.maxStepLength) {
        warnings.push(`Step too long: ${content.substring(0, 50)}...`);
        issues.push({ 
          type: 'warning', 
          field: 'step', 
          message: 'Step content too long',
          suggestion: 'Break into smaller steps or summarize'
        });
      }

      // Check for error messages in steps
      if (content.match(/API Error|Request timed out|Failed to/i)) {
        issues.push({ 
          type: 'error', 
          field: 'step', 
          message: 'Step contains error message',
          suggestion: 'Remove error messages from steps'
        });
      }
    }

    return {
      valid: issues.filter(i => i.type === 'error').length === 0,
      warnings,
      issues
    };
  }

  /**
   * Fix step issues
   */
  private fixSteps(content: string, issues: ValidationIssue[]): string {
    let fixed = content;

    // Remove steps with error messages
    const lines = fixed.split('\n');
    const cleanLines = lines.filter(line => {
      if (line.trim().startsWith('-')) {
        const content = line.replace(/^\s*-\s*/, '').trim();
        return !content.match(/API Error|Request timed out|Failed to/i);
      }
      return true;
    });

    return cleanLines.join('\n');
  }

  /**
   * Final cleanup pass
   */
  private finalCleanup(content: string): string {
    let cleaned = content;

    // Ensure proper YAML formatting
    cleaned = cleaned.trim();
    
    // Ensure newline at end
    if (!cleaned.endsWith('\n')) {
      cleaned += '\n';
    }

    // Remove any remaining problematic characters
    cleaned = cleaned.replace(/[^\x20-\x7E\n\r\t]/g, '');

    return cleaned;
  }

  /**
   * Validate a complete YAML config object
   */
  validateConfig(config: YamlConfig): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Validate name
    if (!config.name || config.name.trim() === '') {
      issues.push({ type: 'error', field: 'name', message: 'Name is required' });
    } else if (config.name.length > this.limits.maxNameLength) {
      issues.push({ 
        type: 'warning', 
        field: 'name', 
        message: `Name too long (max ${this.limits.maxNameLength} chars)` 
      });
    }

    // Validate agents
    if (!config.agents || config.agents.length === 0) {
      issues.push({ type: 'error', field: 'agents', message: 'At least one agent is required' });
    } else if (config.agents.length > this.limits.maxAgents) {
      issues.push({ 
        type: 'warning', 
        field: 'agents', 
        message: `Too many agents (max ${this.limits.maxAgents})` 
      });
    }

    // Validate each agent
    config.agents?.forEach((agent, index) => {
      if (!agent.name) {
        issues.push({ type: 'error', field: `agents[${index}].name`, message: 'Agent name is required' });
      }
      if (!agent.type || !this.validAgentTypes.includes(agent.type)) {
        issues.push({ 
          type: 'warning', 
          field: `agents[${index}].type`, 
          message: `Invalid agent type: ${agent.type}` 
        });
      }
    });

    // Validate steps
    if (!config.steps || config.steps.length === 0) {
      issues.push({ type: 'warning', field: 'steps', message: 'No steps defined' });
    } else if (config.steps.length > this.limits.maxSteps) {
      issues.push({ 
        type: 'warning', 
        field: 'steps', 
        message: `Too many steps (max ${this.limits.maxSteps})` 
      });
    }

    // Validate initial prompt
    if (config.initial_prompt && config.initial_prompt.length > this.limits.maxPromptLength) {
      issues.push({ 
        type: 'warning', 
        field: 'initial_prompt', 
        message: `Initial prompt too long (max ${this.limits.maxPromptLength} chars)` 
      });
    }

    return issues;
  }
}

export const yamlSanitizer = new YamlSanitizer();
export default yamlSanitizer;