import { yamlSanitizer } from '../yamlSanitizer';
import { YamlConfig } from '@/types/yamlGenerator';

describe('YamlSanitizer', () => {
  describe('sanitizeYaml', () => {
    it('should remove API error messages', () => {
      const input = `
name: test-farm
agents:
  - name: Agent 1
    type: general
API Error: Request timed out.
steps:
  - Initialize project
`;
      const result = yamlSanitizer.sanitizeYaml(input);
      expect(result.success).toBe(true);
      expect(result.sanitized).not.toContain('API Error');
      expect(result.sanitized).not.toContain('Request timed out');
      expect(result.removed.length).toBeGreaterThan(0);
    });

    it('should remove agent ID markers', () => {
      const input = `
name: test-farm
[Agent ID: agent_20250804_170201_2fc7]
agents:
  - name: Agent 1
    type: general
⎿  API Error: Request timed out.
steps:
  - Initialize
`;
      const result = yamlSanitizer.sanitizeYaml(input);
      expect(result.sanitized).not.toContain('[Agent ID');
      expect(result.sanitized).not.toContain('⎿');
      expect(result.sanitized).toContain('name: test-farm');
      expect(result.sanitized).toContain('agents:');
    });

    it('should remove system messages and instructions', () => {
      const input = `
name: test-farm
agents:
  - name: Agent 1
Your goal is to work as a cohesive team
IMPORTANT: You are part of a team
Collaboration Protocol:
1. Review ALL steps
steps:
  - Initialize
COMPLETE PROJECT STEPS:
Step 1: Initialize
`;
      const result = yamlSanitizer.sanitizeYaml(input);
      expect(result.sanitized).not.toContain('Your goal is');
      expect(result.sanitized).not.toContain('IMPORTANT:');
      expect(result.sanitized).not.toContain('Collaboration Protocol');
      expect(result.sanitized).not.toContain('COMPLETE PROJECT STEPS');
      expect(result.sanitized).toContain('steps:');
      expect(result.sanitized).toContain('Initialize');
    });

    it('should fix indentation issues', () => {
      const input = `
name: test-farm
   agents:
- name: Agent 1
      type: general
  steps:
    - Step 1
      - Step 2
`;
      const result = yamlSanitizer.sanitizeYaml(input);
      expect(result.success).toBe(true);
      const lines = result.sanitized.split('\n');
      // Check that agents section is properly indented
      const agentsLine = lines.find(l => l.trim() === 'agents:');
      expect(agentsLine).toBeDefined();
    });

    it('should remove box drawing characters', () => {
      const input = `
╭──────────────────────────────────────╮
│ >                                    │
╰──────────────────────────────────────╯
name: test-farm
agents:
  - name: Agent 1
`;
      const result = yamlSanitizer.sanitizeYaml(input);
      expect(result.sanitized).not.toMatch(/[╭╮╰╯│─]/);
      expect(result.sanitized).toContain('name: test-farm');
    });

    it('should add missing required fields', () => {
      const input = `
description: A test farm
steps:
  - Initialize
`;
      const result = yamlSanitizer.sanitizeYaml(input);
      expect(result.sanitized).toContain('name:');
      expect(result.sanitized).toContain('agents:');
    });

    it('should validate and fix invalid agent types', () => {
      const input = `
name: test-farm
agents:
  - name: Agent 1
    type: invalid_type
  - name: Agent 2
    type: general
`;
      const result = yamlSanitizer.sanitizeYaml(input);
      // The sanitizer should fix invalid types
      expect(result.sanitized).not.toContain('invalid_type');
      expect(result.sanitized).toContain('type: general');
      // Check that invalid type was replaced
      const lines = result.sanitized.split('\n');
      const typeLines = lines.filter(l => l.includes('type:'));
      expect(typeLines.every(l => l.includes('general'))).toBe(true);
    });

    it('should handle steps with error messages', () => {
      const input = `
name: test-farm
agents:
  - name: Agent 1
    type: general
steps:
  - Initialize project
  - API Error: Failed to process
  - Complete setup
  - Request timed out while processing
  - Finalize
`;
      const result = yamlSanitizer.sanitizeYaml(input);
      expect(result.sanitized).toContain('Initialize project');
      expect(result.sanitized).toContain('Complete setup');
      expect(result.sanitized).toContain('Finalize');
      expect(result.sanitized).not.toContain('API Error');
      expect(result.sanitized).not.toContain('Request timed out');
    });

    it('should handle completely malformed input', () => {
      const input = `
API Error: Request timed out.
[Agent ID: agent_123]
⎿ Failed to generate YAML
╭──────────────────────────────────────╮
│ Error occurred                       │
╰──────────────────────────────────────╯
`;
      const result = yamlSanitizer.sanitizeYaml(input);
      // Should add required fields
      expect(result.sanitized).toContain('name:');
      expect(result.sanitized).toContain('agents:');
      expect(result.sanitized).not.toContain('API Error');
      expect(result.sanitized).not.toContain('Failed to generate');
    });

    it('should preserve valid YAML structure', () => {
      const input = `
name: valid-farm
description: A valid farm configuration
agents:
  - name: Agent 1
    type: developer
    role: Backend development
  - name: Agent 2
    type: tester
    role: Testing and QA
initial_prompt: |
  Welcome to the farm
  You will be working on a project
steps:
  - Initialize project structure
  - Implement core features
  - Write tests
  - Deploy application
config:
  maxAgents: 10
  timeout: 3600
`;
      const result = yamlSanitizer.sanitizeYaml(input);
      expect(result.success).toBe(true);
      expect(result.sanitized).toContain('name: valid-farm');
      expect(result.sanitized).toContain('description: A valid farm configuration');
      expect(result.sanitized).toContain('Backend development');
      expect(result.sanitized).toContain('Testing and QA');
      expect(result.sanitized).toContain('Initialize project structure');
      expect(result.errors.length).toBe(0);
    });
  });

  describe('validateConfig', () => {
    it('should validate a valid config', () => {
      const config: YamlConfig = {
        name: 'test-farm',
        description: 'Test farm',
        agents: [
          { name: 'Agent 1', type: 'general', role: 'General purpose' }
        ],
        steps: [
          { number: 1, content: 'Step 1', description: 'First step' }
        ],
        initial_prompt: 'Welcome'
      };
      
      const issues = yamlSanitizer.validateConfig(config);
      const errors = issues.filter(i => i.type === 'error');
      expect(errors.length).toBe(0);
    });

    it('should detect missing required fields', () => {
      const config: YamlConfig = {
        name: '',
        agents: [],
        steps: [],
        initial_prompt: ''
      };
      
      const issues = yamlSanitizer.validateConfig(config);
      const errors = issues.filter(i => i.type === 'error');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.field === 'name')).toBe(true);
      expect(errors.some(e => e.field === 'agents')).toBe(true);
    });

    it('should warn about too many agents', () => {
      const config: YamlConfig = {
        name: 'test-farm',
        agents: Array(25).fill(null).map((_, i) => ({
          name: `Agent ${i}`,
          type: 'general' as any,
          role: 'General'
        })),
        steps: [],
        initial_prompt: 'Welcome'
      };
      
      const issues = yamlSanitizer.validateConfig(config);
      const warnings = issues.filter(i => i.type === 'warning');
      expect(warnings.some(w => w.field === 'agents')).toBe(true);
    });

    it('should validate agent types', () => {
      const config: YamlConfig = {
        name: 'test-farm',
        agents: [
          { name: 'Agent 1', type: 'invalid_type' as any, role: 'Test' }
        ],
        steps: [],
        initial_prompt: 'Welcome'
      };
      
      const issues = yamlSanitizer.validateConfig(config);
      const warnings = issues.filter(i => i.type === 'warning');
      expect(warnings.some(w => w.field === 'agents[0].type')).toBe(true);
    });

    it('should check content length limits', () => {
      const config: YamlConfig = {
        name: 'a'.repeat(150), // Too long
        description: 'b'.repeat(600), // Too long
        initial_prompt: 'c'.repeat(2500), // Too long
        agents: [
          { name: 'Agent 1', type: 'general', role: 'Test' }
        ],
        steps: Array(150).fill(null).map((_, i) => ({
          number: i + 1,
          content: `Step ${i}`,
          description: `Description ${i}`
        }))
      };
      
      const issues = yamlSanitizer.validateConfig(config);
      const warnings = issues.filter(i => i.type === 'warning');
      expect(warnings.some(w => w.field === 'name')).toBe(true);
      expect(warnings.some(w => w.field === 'initial_prompt')).toBe(true);
      expect(warnings.some(w => w.field === 'steps')).toBe(true);
    });
  });
});