/**
 * Inference Continuez Service - MaiFarm Integration
 *
 * Provides confidence-based auto-continuation for farm agents.
 * Integrates the inference-continuez plugin with MaiFarm's farming system.
 *
 * Features:
 * - Confidence scoring for agent operations
 * - Auto-continuation based on threshold
 * - Safety guards for destructive operations
 * - Per-farm configuration support
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger, LogCategory } from '../utils/logger';
import { pathConfig } from '../config/paths';

export interface ContinuezSettings {
  confidence_threshold: number;
  enabled: boolean;
  log_decisions: boolean;
  excluded_patterns: string[];
  auto_approve_tools: string[];
  safe_bash_patterns: string[];
}

export interface ConfidenceEvaluation {
  score: number;
  threshold: number;
  shouldContinue: boolean;
  factors: {
    positive: string[];
    negative: string[];
  };
  decision: 'continue' | 'ask' | 'deny';
  reason: string;
}

const DEFAULT_SETTINGS: ContinuezSettings = {
  confidence_threshold: 80,
  enabled: true,
  log_decisions: true,
  excluded_patterns: [
    'destructive',
    'delete',
    'remove',
    'drop',
    'force',
    'reset --hard',
    'rm -rf',
    'truncate',
  ],
  auto_approve_tools: ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'TodoWrite'],
  safe_bash_patterns: [
    'npm run',
    'npm test',
    'npm build',
    'git status',
    'git log',
    'git diff',
    'ls',
    'pwd',
    'cat',
    'head',
    'tail',
  ],
};

// Positive patterns that increase confidence
const POSITIVE_PATTERNS: Array<{ pattern: RegExp; points: number; name: string }> = [
  { pattern: /completed|finished|done|success/i, points: 10, name: 'completion' },
  { pattern: /tests?\s+(pass|passed|passing)/i, points: 15, name: 'tests_pass' },
  { pattern: /build\s+(success|succeeded)/i, points: 12, name: 'build_success' },
  { pattern: /no\s+errors?|error-free/i, points: 10, name: 'no_errors' },
  { pattern: /ready|prepared|set up/i, points: 8, name: 'ready_state' },
  { pattern: /(created|wrote|edited|updated)\s+\d+\s+files?/i, points: 10, name: 'files_modified' },
  { pattern: /todo.*completed/i, points: 10, name: 'todo_completed' },
  { pattern: /progress:\s*\d+%/i, points: 5, name: 'progress_indicator' },
];

// Negative patterns that decrease confidence
const NEGATIVE_PATTERNS: Array<{ pattern: RegExp; points: number; name: string }> = [
  { pattern: /error|exception|failed|failure/i, points: -15, name: 'error' },
  { pattern: /warning|warn:\s*\w+/i, points: -5, name: 'warning' },
  { pattern: /unclear|ambiguous|unsure|not sure/i, points: -20, name: 'uncertainty' },
  { pattern: /should\s+I|do\s+you\s+want|which\s+option/i, points: -25, name: 'user_question' },
  { pattern: /multiple\s+options|several\s+approaches/i, points: -20, name: 'multiple_choices' },
  { pattern: /destructive|irreversible|dangerous/i, points: -30, name: 'dangerous' },
  { pattern: /delete|remove|drop|truncate\s+(all|database|table)/i, points: -30, name: 'destructive_op' },
  { pattern: /permission\s+denied|access\s+denied/i, points: -15, name: 'permission_denied' },
  { pattern: /security|credential|password|secret|token/i, points: -10, name: 'security_sensitive' },
  { pattern: /conflict|merge\s+conflict/i, points: -15, name: 'conflict' },
];

// Dangerous patterns that should NEVER be auto-approved
const DANGEROUS_PATTERNS = [
  /rm\s+(-rf?|--recursive)/,
  /rm\s+.*\*/,
  /sudo\s+/,
  /chmod\s+777/,
  />\s*\/dev\//,
  /mkfs\./,
  /dd\s+if=/,
  /:(){ :|:& };:/,
  /curl\s+.*\|\s*(bash|sh)/,
  /git\s+(push\s+.*--force|reset\s+--hard)/,
  /drop\s+(database|table)/,
  /truncate\s+table/,
  /delete\s+from\s+\w+\s*(;|$)/,
  /\.env/i,
];

class InferenceContinuezService extends EventEmitter {
  private static instance: InferenceContinuezService;
  private settings: ContinuezSettings = { ...DEFAULT_SETTINGS };
  private farmOverrides: Map<string, Partial<ContinuezSettings>> = new Map();

  private constructor() {
    super();
    this.loadSettings();
  }

  static getInstance(): InferenceContinuezService {
    if (!InferenceContinuezService.instance) {
      InferenceContinuezService.instance = new InferenceContinuezService();
    }
    return InferenceContinuezService.instance;
  }

  /**
   * Load settings from plugin configuration
   */
  private async loadSettings(): Promise<void> {
    const settingsPaths = [
      path.join(process.cwd(), 'plugins', 'inference-continuez', 'settings.json'),
      path.join(pathConfig.getPath('MAIBARN_ROOT'), 'plugins', 'inference-continuez', 'settings.json'),
    ];

    for (const settingsPath of settingsPaths) {
      try {
        const content = await fs.readFile(settingsPath, 'utf-8');
        const userSettings = JSON.parse(content);
        this.settings = { ...DEFAULT_SETTINGS, ...userSettings };
        logger.info(LogCategory.CONFIG, `Inference Continuez settings loaded from ${settingsPath}`);
        return;
      } catch {
        // Try next path
      }
    }

    // Check environment variables
    if (process.env.INFERENCE_CONTINUEZ_THRESHOLD) {
      const threshold = parseInt(process.env.INFERENCE_CONTINUEZ_THRESHOLD, 10);
      if (!isNaN(threshold) && threshold >= 0 && threshold <= 99) {
        this.settings.confidence_threshold = threshold;
      }
    }

    if (process.env.INFERENCE_CONTINUEZ_ENABLED) {
      this.settings.enabled = process.env.INFERENCE_CONTINUEZ_ENABLED.toLowerCase() === 'true';
    }

    logger.info(LogCategory.CONFIG, 'Inference Continuez using default settings');
  }

  /**
   * Get current settings
   */
  getSettings(): ContinuezSettings {
    return { ...this.settings };
  }

  /**
   * Update settings
   */
  updateSettings(newSettings: Partial<ContinuezSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    this.emit('settingsChanged', this.settings);
    logger.info(LogCategory.CONFIG, 'Inference Continuez settings updated', newSettings);
  }

  /**
   * Set per-farm overrides
   */
  setFarmOverride(farmId: string, overrides: Partial<ContinuezSettings>): void {
    this.farmOverrides.set(farmId, overrides);
    logger.info(LogCategory.FARM, `Inference Continuez overrides set for farm ${farmId}`, overrides);
  }

  /**
   * Get effective settings for a farm
   */
  getEffectiveSettings(farmId?: string): ContinuezSettings {
    if (farmId && this.farmOverrides.has(farmId)) {
      return { ...this.settings, ...this.farmOverrides.get(farmId) };
    }
    return { ...this.settings };
  }

  /**
   * Check if context contains dangerous patterns
   */
  private containsDangerousPattern(context: string): { isDangerous: boolean; pattern?: string } {
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(context)) {
        return { isDangerous: true, pattern: pattern.source };
      }
    }
    return { isDangerous: false };
  }

  /**
   * Check if context contains excluded patterns
   */
  private containsExcludedPattern(
    context: string,
    settings: ContinuezSettings
  ): { isExcluded: boolean; pattern?: string } {
    const contextLower = context.toLowerCase();
    for (const pattern of settings.excluded_patterns) {
      if (contextLower.includes(pattern.toLowerCase())) {
        return { isExcluded: true, pattern };
      }
    }
    return { isExcluded: false };
  }

  /**
   * Calculate confidence score for a given context
   */
  calculateConfidence(context: string, farmId?: string): ConfidenceEvaluation {
    const settings = this.getEffectiveSettings(farmId);

    if (!settings.enabled) {
      return {
        score: 0,
        threshold: settings.confidence_threshold,
        shouldContinue: false,
        factors: { positive: [], negative: ['disabled'] },
        decision: 'ask',
        reason: 'Inference Continuez is disabled',
      };
    }

    // Check for dangerous patterns first
    const dangerCheck = this.containsDangerousPattern(context);
    if (dangerCheck.isDangerous) {
      return {
        score: 0,
        threshold: settings.confidence_threshold,
        shouldContinue: false,
        factors: { positive: [], negative: [`dangerous: ${dangerCheck.pattern}`] },
        decision: 'deny',
        reason: `Dangerous pattern detected: ${dangerCheck.pattern}`,
      };
    }

    let score = 70; // Base neutral score
    const positiveFactors: string[] = [];
    const negativeFactors: string[] = [];

    // Apply positive patterns
    for (const { pattern, points, name } of POSITIVE_PATTERNS) {
      if (pattern.test(context)) {
        score += points;
        positiveFactors.push(`${name}: +${points}`);
      }
    }

    // Apply negative patterns
    for (const { pattern, points, name } of NEGATIVE_PATTERNS) {
      if (pattern.test(context)) {
        score += points; // points are already negative
        negativeFactors.push(`${name}: ${points}`);
      }
    }

    // Check excluded patterns
    const excludedCheck = this.containsExcludedPattern(context, settings);
    if (excludedCheck.isExcluded) {
      score = Math.min(score, 30);
      negativeFactors.push(`excluded: ${excludedCheck.pattern} (capped at 30)`);
    }

    // Clamp to valid range
    const finalScore = Math.max(0, Math.min(100, score));
    const shouldContinue = finalScore >= settings.confidence_threshold;

    const evaluation: ConfidenceEvaluation = {
      score: finalScore,
      threshold: settings.confidence_threshold,
      shouldContinue,
      factors: { positive: positiveFactors, negative: negativeFactors },
      decision: shouldContinue ? 'continue' : 'ask',
      reason: shouldContinue
        ? `Confidence ${finalScore}% >= threshold ${settings.confidence_threshold}%`
        : `Confidence ${finalScore}% < threshold ${settings.confidence_threshold}%`,
    };

    if (settings.log_decisions) {
      logger.info(LogCategory.AGENT, `[inference-continuez] Evaluation: ${JSON.stringify(evaluation)}`);
    }

    this.emit('evaluated', { farmId, evaluation });

    return evaluation;
  }

  /**
   * Evaluate a tool operation for auto-approval
   */
  evaluateToolOperation(
    toolName: string,
    toolInput: Record<string, unknown>,
    farmId?: string
  ): ConfidenceEvaluation {
    const settings = this.getEffectiveSettings(farmId);

    if (!settings.enabled) {
      return {
        score: 0,
        threshold: settings.confidence_threshold,
        shouldContinue: false,
        factors: { positive: [], negative: ['disabled'] },
        decision: 'ask',
        reason: 'Inference Continuez is disabled',
      };
    }

    const context = `${toolName} ${JSON.stringify(toolInput)}`;

    // Check for dangerous patterns
    const dangerCheck = this.containsDangerousPattern(context);
    if (dangerCheck.isDangerous) {
      return {
        score: 0,
        threshold: settings.confidence_threshold,
        shouldContinue: false,
        factors: { positive: [], negative: [`dangerous: ${dangerCheck.pattern}`] },
        decision: 'deny',
        reason: `Dangerous operation detected: ${dangerCheck.pattern}`,
      };
    }

    // Check if tool is in auto-approve list
    if (settings.auto_approve_tools.includes(toolName)) {
      return {
        score: 100,
        threshold: settings.confidence_threshold,
        shouldContinue: true,
        factors: { positive: [`auto_approve_tool: ${toolName}`], negative: [] },
        decision: 'continue',
        reason: `Tool ${toolName} is in auto-approve list`,
      };
    }

    // For Bash commands, check safe patterns
    if (toolName === 'Bash') {
      const command = (toolInput.command as string) || '';
      for (const safePattern of settings.safe_bash_patterns) {
        if (command.includes(safePattern)) {
          return {
            score: 85,
            threshold: settings.confidence_threshold,
            shouldContinue: true,
            factors: { positive: [`safe_bash: ${safePattern}`], negative: [] },
            decision: 'continue',
            reason: `Bash command matches safe pattern: ${safePattern}`,
          };
        }
      }
    }

    // Fall back to context-based evaluation
    return this.calculateConfidence(context, farmId);
  }

  /**
   * Evaluate a farm agent's output for continuation
   */
  evaluateAgentOutput(
    agentId: string,
    output: string,
    farmId: string
  ): ConfidenceEvaluation {
    const evaluation = this.calculateConfidence(output, farmId);

    if (this.settings.log_decisions) {
      logger.info(
        LogCategory.AGENT,
        `[inference-continuez] Agent ${agentId} evaluation: ${evaluation.decision} (${evaluation.score}%)`
      );
    }

    this.emit('agentEvaluated', { agentId, farmId, evaluation });

    return evaluation;
  }

  /**
   * Clear farm-specific overrides
   */
  clearFarmOverride(farmId: string): void {
    this.farmOverrides.delete(farmId);
    logger.info(LogCategory.FARM, `Inference Continuez overrides cleared for farm ${farmId}`);
  }

  /**
   * Get statistics about evaluations
   */
  getStats(): { evaluations: number; autoContinued: number; askedUser: number; denied: number } {
    // This could be enhanced with actual tracking
    return {
      evaluations: 0,
      autoContinued: 0,
      askedUser: 0,
      denied: 0,
    };
  }
}

export const inferenceContinuezService = InferenceContinuezService.getInstance();
