/**
 * Problem Modeling Service - Model-First Reasoning Implementation
 *
 * Based on "Model-First Reasoning LLM Agents" (arxiv 2512.14474)
 * by Annu Rana and Gaurav Kumar
 *
 * This service implements explicit problem modeling before agent execution:
 * 1. Analyzes farm prompts to extract problem structure
 * 2. Generates formal problem models with entities, variables, actions, constraints, goals
 * 3. Serializes models for agent prompt injection
 * 4. Verifies agent outputs against model constraints
 *
 * Key insight: "Many LLM planning failures stem from representational
 * deficiencies rather than reasoning limitations"
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger, LogCategory } from '../utils/logger';
import { db } from '../database/connection';
import { websocketManager } from '../websocket/websocketManager';
import { pathConfig } from '../config/paths';
import { aiProviderManager, AIProvider } from '../config/aiProviders';
import {
  ProblemModel,
  ProblemEntity,
  ProblemVariable,
  ProblemAction,
  ProblemConstraint,
  ProblemGoal,
  ProblemModelGenerationRequest,
  ProblemModelSummary,
  AgentProblemModelContext,
  VerificationResult,
  ConstraintViolation,
  Condition,
  Effect,
} from '../types/problemModel';

// ============================================================================
// Types & Interfaces
// ============================================================================

interface ModelGenerationResult {
  model: ProblemModel;
  durationMs: number;
  warnings: string[];
}

interface PromptAnalysis {
  mainTask: string;
  subTasks: string[];
  entities: string[];
  constraints: string[];
  goals: string[];
}

// ============================================================================
// AI Prompt Templates
// ============================================================================

const PROBLEM_MODEL_GENERATION_PROMPT = `You are a Problem Modeling Expert. Analyze the following task prompt and generate a structured problem model.

## Task Prompt:
{prompt}

## Farm Context:
- Mode: {mode}
- Number of Agents: {agentCount}
{context}

## Instructions:
Generate a comprehensive problem model in JSON format with the following structure:

1. **entities**: Objects/actors in the problem domain
   - Each entity has: id, name, type (file|function|class|module|service|agent|resource|database|api|component|test|config|other), properties, relationships, description

2. **variables**: State variables to track
   - Each variable has: id, name, type (string|number|boolean|array|object|enum|file_path|status|counter), domain (possible values), initialValue, description, tracked (boolean)

3. **actions**: Operations that can be performed
   - Each action has: id, name, description, preconditions (conditions that must be true), effects (changes when executed), priority (1-10), estimatedDuration (seconds)
   - Preconditions: [{variable, operator (eq|neq|lt|gt|contains|exists), value}]
   - Effects: [{variable, operation (set|add|remove|increment|append), value}]

4. **constraints**: Rules and limitations
   - Each constraint has: id, type (temporal|resource|logical|dependency|mutual_exclusion), description, expression (formal), enforced (boolean), severity (error|warning|info)

5. **goals**: Success criteria
   - Each goal has: id, description, conditions (same format as preconditions), priority (1-10)

Respond ONLY with valid JSON matching this structure:
{
  "entities": [...],
  "variables": [...],
  "actions": [...],
  "constraints": [...],
  "goals": [...]
}`;

// ============================================================================
// Problem Modeling Service
// ============================================================================

export class ProblemModelingService extends EventEmitter {
  private static instance: ProblemModelingService;
  private activeModels: Map<string, ProblemModel> = new Map(); // farmId -> model

  private constructor() {
    super();
    logger.info(LogCategory.SYSTEM, 'ProblemModelingService initialized');
  }

  static getInstance(): ProblemModelingService {
    if (!this.instance) {
      this.instance = new ProblemModelingService();
    }
    return this.instance;
  }

  // ==========================================================================
  // Model Generation
  // ==========================================================================

  /**
   * Generate a problem model from a farm prompt using AI
   */
  async generateModel(request: ProblemModelGenerationRequest): Promise<ModelGenerationResult> {
    const startTime = Date.now();
    const warnings: string[] = [];

    logger.info(LogCategory.FARM, `Generating problem model for farm ${request.farmId}`);

    try {
      // Build the prompt for AI
      const aiPrompt = this.buildGenerationPrompt(request);

      // Call AI provider to generate model
      const aiResponse = await this.callAIProvider(aiPrompt, request.provider);

      // Parse the AI response
      const parsedModel = this.parseAIResponse(aiResponse, warnings);

      // Create the full problem model
      const model: ProblemModel = {
        id: uuidv4(),
        farmId: request.farmId,
        version: 1,
        entities: parsedModel.entities || [],
        variables: parsedModel.variables || [],
        actions: parsedModel.actions || [],
        constraints: parsedModel.constraints || [],
        goals: parsedModel.goals || [],
        verified: false,
        sourcePrompt: request.prompt,
        generatedBy: request.provider || 'claude',
        generatedAt: new Date(),
        metadata: {
          mode: request.mode,
          agentCount: request.agentCount,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Validate and enhance the model
      this.validateModel(model, warnings);
      this.enhanceModel(model, request);

      // Cache the model
      this.activeModels.set(request.farmId, model);

      // Persist to database
      await this.persistModel(model);

      // Write to coordination directory for Python orchestrator
      await this.writeModelToCoordination(model);

      const durationMs = Date.now() - startTime;

      logger.info(LogCategory.FARM,
        `Generated problem model for farm ${request.farmId}: ` +
        `${model.entities.length} entities, ${model.actions.length} actions, ` +
        `${model.constraints.length} constraints, ${model.goals.length} goals ` +
        `(${durationMs}ms)`);

      // Emit event
      this.emit('model:generated', {
        farmId: request.farmId,
        modelId: model.id,
        summary: this.getModelSummary(model),
      });

      return { model, durationMs, warnings };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(LogCategory.FARM, `Failed to generate problem model: ${errorMessage}`);

      // Return a minimal fallback model
      const fallbackModel = this.createFallbackModel(request);
      warnings.push(`AI generation failed, using fallback model: ${errorMessage}`);

      return {
        model: fallbackModel,
        durationMs: Date.now() - startTime,
        warnings,
      };
    }
  }

  /**
   * Build the prompt for AI model generation
   */
  private buildGenerationPrompt(request: ProblemModelGenerationRequest): string {
    let prompt = PROBLEM_MODEL_GENERATION_PROMPT
      .replace('{prompt}', request.prompt)
      .replace('{mode}', request.mode)
      .replace('{agentCount}', String(request.agentCount));

    if (request.context) {
      prompt = prompt.replace('{context}', `- Additional Context: ${request.context}`);
    } else {
      prompt = prompt.replace('{context}', '');
    }

    return prompt;
  }

  /**
   * Call AI provider to generate model
   */
  private async callAIProvider(prompt: string, provider?: 'claude' | 'openai' | 'ollama'): Promise<string> {
    const selectedProvider = provider || 'claude';

    // For now, we'll use a simple HTTP call pattern
    // In production, this would use the actual AI provider SDKs
    try {
      if (selectedProvider === 'claude') {
        return await this.callClaude(prompt);
      } else if (selectedProvider === 'openai') {
        return await this.callOpenAI(prompt);
      } else {
        return await this.callOllama(prompt);
      }
    } catch (error) {
      logger.warn(LogCategory.FARM, `AI provider call failed, using heuristic extraction`);
      throw error;
    }
  }

  /**
   * Call Claude API for model generation
   */
  private async callClaude(prompt: string): Promise<string> {
    const config = await aiProviderManager.getProviderWithRefresh(AIProvider.CLAUDE);
    const apiKey = config.apiKey;
    if (!apiKey) {
      throw new Error('Claude API key not configured');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json() as { content: Array<{ text: string }> };
    return data.content[0]?.text || '';
  }

  /**
   * Call OpenAI API for model generation
   */
  private async callOpenAI(prompt: string): Promise<string> {
    const config = await aiProviderManager.getProviderWithRefresh(AIProvider.OPENAI);
    const apiKey = config.apiKey;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content || '';
  }

  /**
   * Call Ollama for model generation
   */
  private async callOllama(prompt: string): Promise<string> {
    const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';

    const response = await fetch(`${ollamaHost}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2',
        prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = await response.json() as { response: string };
    return data.response || '';
  }

  /**
   * Parse AI response into model components
   */
  private parseAIResponse(
    response: string,
    warnings: string[]
  ): Partial<ProblemModel> {
    try {
      // Extract JSON from response (may be wrapped in markdown code blocks)
      let jsonStr = response;

      // Try to extract JSON from code blocks
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      // Parse JSON
      const parsed = JSON.parse(jsonStr);

      // Validate structure
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid response structure');
      }

      return {
        entities: this.normalizeEntities(parsed.entities || []),
        variables: this.normalizeVariables(parsed.variables || []),
        actions: this.normalizeActions(parsed.actions || []),
        constraints: this.normalizeConstraints(parsed.constraints || []),
        goals: this.normalizeGoals(parsed.goals || []),
      };

    } catch (error) {
      warnings.push(`Failed to parse AI response: ${error}`);
      return {};
    }
  }

  // ==========================================================================
  // Normalization Helpers
  // ==========================================================================

  private normalizeEntities(entities: unknown[]): ProblemEntity[] {
    return entities.map((e: unknown, i: number) => {
      const entity = e as Record<string, unknown>;
      return {
        id: String(entity.id || `entity-${i}`),
        name: String(entity.name || `Entity ${i}`),
        type: this.normalizeEntityType(entity.type),
        properties: (entity.properties as Record<string, unknown>) || {},
        relationships: Array.isArray(entity.relationships) ? entity.relationships : [],
        description: String(entity.description || ''),
      };
    });
  }

  private normalizeEntityType(type: unknown): ProblemEntity['type'] {
    const validTypes = ['file', 'function', 'class', 'module', 'service', 'agent', 'resource', 'database', 'api', 'component', 'test', 'config', 'other'];
    const typeStr = String(type || 'other').toLowerCase();
    return validTypes.includes(typeStr) ? typeStr as ProblemEntity['type'] : 'other';
  }

  private normalizeVariables(variables: unknown[]): ProblemVariable[] {
    return variables.map((v: unknown, i: number) => {
      const variable = v as Record<string, unknown>;
      return {
        id: String(variable.id || `var-${i}`),
        name: String(variable.name || `Variable ${i}`),
        type: this.normalizeVariableType(variable.type),
        domain: Array.isArray(variable.domain) ? variable.domain : undefined,
        initialValue: variable.initialValue,
        currentValue: variable.currentValue,
        description: String(variable.description || ''),
        tracked: Boolean(variable.tracked ?? true),
      };
    });
  }

  private normalizeVariableType(type: unknown): ProblemVariable['type'] {
    const validTypes = ['string', 'number', 'boolean', 'array', 'object', 'enum', 'file_path', 'status', 'counter'];
    const typeStr = String(type || 'string').toLowerCase();
    return validTypes.includes(typeStr) ? typeStr as ProblemVariable['type'] : 'string';
  }

  private normalizeActions(actions: unknown[]): ProblemAction[] {
    return actions.map((a: unknown, i: number) => {
      const action = a as Record<string, unknown>;
      return {
        id: String(action.id || `action-${i}`),
        name: String(action.name || `Action ${i}`),
        description: String(action.description || ''),
        preconditions: this.normalizeConditions(action.preconditions),
        effects: this.normalizeEffects(action.effects),
        priority: Number(action.priority) || 5,
        estimatedDuration: Number(action.estimatedDuration) || undefined,
        targetEntities: Array.isArray(action.targetEntities) ? action.targetEntities : undefined,
        atomic: Boolean(action.atomic),
        status: 'pending',
      };
    });
  }

  private normalizeConditions(conditions: unknown): Condition[] {
    if (!Array.isArray(conditions)) return [];
    return conditions.map((c: unknown) => {
      const cond = c as Record<string, unknown>;
      return {
        variable: String(cond.variable || ''),
        operator: this.normalizeOperator(cond.operator),
        value: cond.value,
        description: String(cond.description || ''),
      };
    });
  }

  private normalizeOperator(op: unknown): Condition['operator'] {
    const validOps = ['eq', 'neq', 'lt', 'gt', 'lte', 'gte', 'contains', 'not_contains', 'exists', 'not_exists'];
    const opStr = String(op || 'eq').toLowerCase();
    return validOps.includes(opStr) ? opStr as Condition['operator'] : 'eq';
  }

  private normalizeEffects(effects: unknown): Effect[] {
    if (!Array.isArray(effects)) return [];
    return effects.map((e: unknown) => {
      const effect = e as Record<string, unknown>;
      return {
        variable: String(effect.variable || ''),
        operation: this.normalizeOperation(effect.operation),
        value: effect.value,
        description: String(effect.description || ''),
      };
    });
  }

  private normalizeOperation(op: unknown): Effect['operation'] {
    const validOps = ['set', 'add', 'remove', 'increment', 'decrement', 'append', 'prepend'];
    const opStr = String(op || 'set').toLowerCase();
    return validOps.includes(opStr) ? opStr as Effect['operation'] : 'set';
  }

  private normalizeConstraints(constraints: unknown[]): ProblemConstraint[] {
    return constraints.map((c: unknown, i: number) => {
      const constraint = c as Record<string, unknown>;
      return {
        id: String(constraint.id || `constraint-${i}`),
        type: this.normalizeConstraintType(constraint.type),
        description: String(constraint.description || ''),
        expression: String(constraint.expression || ''),
        enforced: Boolean(constraint.enforced ?? true),
        severity: this.normalizeSeverity(constraint.severity),
        appliesTo: Array.isArray(constraint.appliesTo) ? constraint.appliesTo : undefined,
      };
    });
  }

  private normalizeConstraintType(type: unknown): ProblemConstraint['type'] {
    const validTypes = ['temporal', 'resource', 'logical', 'dependency', 'mutual_exclusion'];
    const typeStr = String(type || 'logical').toLowerCase();
    return validTypes.includes(typeStr) ? typeStr as ProblemConstraint['type'] : 'logical';
  }

  private normalizeSeverity(severity: unknown): ProblemConstraint['severity'] {
    const validSeverities = ['error', 'warning', 'info'];
    const sevStr = String(severity || 'warning').toLowerCase();
    return validSeverities.includes(sevStr) ? sevStr as ProblemConstraint['severity'] : 'warning';
  }

  private normalizeGoals(goals: unknown[]): ProblemGoal[] {
    return goals.map((g: unknown, i: number) => {
      const goal = g as Record<string, unknown>;
      return {
        id: String(goal.id || `goal-${i}`),
        description: String(goal.description || ''),
        conditions: this.normalizeConditions(goal.conditions),
        priority: Number(goal.priority) || 5,
        verified: false,
        subGoals: Array.isArray(goal.subGoals) ? goal.subGoals : undefined,
      };
    });
  }

  // ==========================================================================
  // Model Validation & Enhancement
  // ==========================================================================

  private validateModel(model: ProblemModel, warnings: string[]): void {
    // Check for empty model
    if (model.entities.length === 0 && model.actions.length === 0) {
      warnings.push('Model has no entities or actions');
    }

    // Check for orphan references
    const entityIds = new Set(model.entities.map(e => e.id));
    const actionIds = new Set(model.actions.map(a => a.id));

    for (const action of model.actions) {
      if (action.targetEntities) {
        for (const targetId of action.targetEntities) {
          if (!entityIds.has(targetId)) {
            warnings.push(`Action ${action.id} references unknown entity ${targetId}`);
          }
        }
      }
    }

    // Check for goals without conditions
    for (const goal of model.goals) {
      if (goal.conditions.length === 0) {
        warnings.push(`Goal ${goal.id} has no verification conditions`);
      }
    }
  }

  private enhanceModel(model: ProblemModel, request: ProblemModelGenerationRequest): void {
    // Add agent entities if not present
    for (let i = 0; i < request.agentCount; i++) {
      const agentId = `agent-${i}`;
      if (!model.entities.find(e => e.id === agentId)) {
        model.entities.push({
          id: agentId,
          name: `Agent ${i + 1}`,
          type: 'agent',
          properties: { index: i },
          relationships: [],
          description: `Farm agent ${i + 1}`,
        });
      }
    }

    // Assign actions to agents if not assigned
    const unassignedActions = model.actions.filter(a => !a.assignedAgent);
    const agentCount = request.agentCount;

    unassignedActions.forEach((action, i) => {
      action.assignedAgent = `agent-${i % agentCount}`;
    });
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  private async persistModel(model: ProblemModel): Promise<void> {
    try {
      await db.query(
        `INSERT INTO problem_models (
          id, farm_id, version, entities, variables, actions, constraints, goals,
          verified, verification_score, source_prompt, generated_by, generated_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (id) DO UPDATE SET
          version = EXCLUDED.version,
          entities = EXCLUDED.entities,
          variables = EXCLUDED.variables,
          actions = EXCLUDED.actions,
          constraints = EXCLUDED.constraints,
          goals = EXCLUDED.goals,
          updated_at = CURRENT_TIMESTAMP`,
        [
          model.id,
          model.farmId,
          model.version,
          JSON.stringify(model.entities),
          JSON.stringify(model.variables),
          JSON.stringify(model.actions),
          JSON.stringify(model.constraints),
          JSON.stringify(model.goals),
          model.verified,
          model.verificationScore,
          model.sourcePrompt,
          model.generatedBy,
          model.generatedAt,
          JSON.stringify(model.metadata),
        ]
      );

      logger.debug(LogCategory.DATABASE, `Persisted problem model ${model.id}`);
    } catch (error) {
      logger.error(LogCategory.DATABASE, `Failed to persist problem model: ${error}`);
      throw error;
    }
  }

  private async writeModelToCoordination(model: ProblemModel): Promise<void> {
    try {
      const coordDir = pathConfig.getFarmCoordinationPath(model.farmId);
      await fs.mkdir(coordDir, { recursive: true });

      const modelPath = path.join(coordDir, 'problem_model.json');
      await fs.writeFile(modelPath, JSON.stringify(model, null, 2));

      logger.debug(LogCategory.FARM, `Wrote problem model to ${modelPath}`);
    } catch (error) {
      logger.error(LogCategory.FARM, `Failed to write model to coordination: ${error}`);
      // Non-fatal, continue execution
    }
  }

  // ==========================================================================
  // Model Retrieval
  // ==========================================================================

  async getModel(farmId: string): Promise<ProblemModel | null> {
    // Check cache first
    const cached = this.activeModels.get(farmId);
    if (cached) return cached;

    // Load from database
    try {
      const result = await db.query(
        `SELECT * FROM problem_models WHERE farm_id = $1 ORDER BY version DESC LIMIT 1`,
        [farmId]
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      const model: ProblemModel = {
        id: row.id,
        farmId: row.farm_id,
        version: row.version,
        entities: row.entities,
        variables: row.variables,
        actions: row.actions,
        constraints: row.constraints,
        goals: row.goals,
        verified: row.verified,
        verificationScore: row.verification_score,
        verificationDetails: row.verification_details,
        sourcePrompt: row.source_prompt,
        generatedBy: row.generated_by,
        generatedAt: row.generated_at,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };

      this.activeModels.set(farmId, model);
      return model;

    } catch (error) {
      logger.error(LogCategory.DATABASE, `Failed to load problem model: ${error}`);
      return null;
    }
  }

  getModelSummary(model: ProblemModel): ProblemModelSummary {
    return {
      id: model.id,
      farmId: model.farmId,
      entityCount: model.entities.length,
      variableCount: model.variables.length,
      actionCount: model.actions.length,
      constraintCount: model.constraints.length,
      goalCount: model.goals.length,
      verified: model.verified,
      verificationScore: model.verificationScore,
      createdAt: model.createdAt,
    };
  }

  // ==========================================================================
  // Agent Context Generation
  // ==========================================================================

  /**
   * Generate context for injection into agent prompts
   */
  getAgentContext(model: ProblemModel, agentId: string): AgentProblemModelContext {
    // Filter actions assigned to this agent
    const assignedActions = model.actions.filter(a => a.assignedAgent === agentId);

    // Get entities relevant to assigned actions
    const relevantEntityIds = new Set<string>();
    for (const action of assignedActions) {
      if (action.targetEntities) {
        action.targetEntities.forEach(id => relevantEntityIds.add(id));
      }
    }

    const relevantEntities = model.entities.filter(e =>
      relevantEntityIds.has(e.id) || e.type === 'agent'
    );

    return {
      entities: relevantEntities.map(e => ({
        id: e.id,
        name: e.name,
        type: e.type,
        description: e.description,
      })),
      variables: model.variables.filter(v => v.tracked).map(v => ({
        id: v.id,
        name: v.name,
        type: v.type,
        description: v.description,
        currentValue: v.currentValue,
      })),
      assignedActions: assignedActions.map(a => ({
        id: a.id,
        name: a.name,
        description: a.description,
        preconditions: a.preconditions,
        effects: a.effects,
        priority: a.priority,
      })),
      constraints: model.constraints.filter(c => c.enforced).map(c => ({
        id: c.id,
        type: c.type,
        description: c.description,
        severity: c.severity,
      })),
      goals: model.goals.map(g => ({
        id: g.id,
        description: g.description,
        priority: g.priority,
      })),
    };
  }

  // ==========================================================================
  // Verification
  // ==========================================================================

  /**
   * Verify agent output against problem model
   */
  async verifyOutput(
    farmId: string,
    agentId: string,
    output: Record<string, unknown>
  ): Promise<VerificationResult> {
    const model = await this.getModel(farmId);
    if (!model) {
      return {
        conforms: true,
        score: 1.0,
        violations: [],
        verifiedActions: [],
        achievedGoals: [],
        timestamp: new Date(),
      };
    }

    const violations: ConstraintViolation[] = [];
    const verifiedActions: string[] = [];
    const achievedGoals: string[] = [];

    // Check constraint violations
    for (const constraint of model.constraints) {
      if (!constraint.enforced) continue;

      const violation = this.checkConstraint(constraint, output, model);
      if (violation) {
        violations.push(violation);
      }
    }

    // Check goal achievement
    for (const goal of model.goals) {
      if (this.checkGoalAchieved(goal, model)) {
        achievedGoals.push(goal.id);
      }
    }

    // Calculate conformance score
    const totalChecks = model.constraints.filter(c => c.enforced).length + model.goals.length;
    const passedChecks = totalChecks - violations.length + achievedGoals.length;
    const score = totalChecks > 0 ? passedChecks / (totalChecks + achievedGoals.length) : 1.0;

    const result: VerificationResult = {
      conforms: violations.filter(v => v.severity === 'error').length === 0,
      score: Math.min(1.0, Math.max(0, score)),
      violations,
      verifiedActions,
      achievedGoals,
      timestamp: new Date(),
    };

    // Update model verification status
    if (result.conforms) {
      model.verified = true;
      model.verificationScore = result.score;
      model.verificationDetails = result;
      await this.persistModel(model);
    }

    return result;
  }

  private checkConstraint(
    constraint: ProblemConstraint,
    output: Record<string, unknown>,
    model: ProblemModel
  ): ConstraintViolation | null {
    // Basic constraint checking - can be enhanced with more sophisticated logic
    // For now, check if constraint expression references anything in the output

    // This is a simplified implementation
    // A full implementation would parse the constraint expression and evaluate it
    return null;
  }

  private checkGoalAchieved(goal: ProblemGoal, model: ProblemModel): boolean {
    // Check all goal conditions
    for (const condition of goal.conditions) {
      const variable = model.variables.find(v => v.id === condition.variable || v.name === condition.variable);
      if (!variable) continue;

      const currentValue = variable.currentValue;
      const targetValue = condition.value;

      switch (condition.operator) {
        case 'eq':
          if (currentValue !== targetValue) return false;
          break;
        case 'neq':
          if (currentValue === targetValue) return false;
          break;
        case 'exists':
          if (currentValue === undefined || currentValue === null) return false;
          break;
        // Add more operators as needed
      }
    }

    return true;
  }

  // ==========================================================================
  // Fallback Model
  // ==========================================================================

  private createFallbackModel(request: ProblemModelGenerationRequest): ProblemModel {
    const id = uuidv4();

    // Extract basic structure from prompt using heuristics
    const analysis = this.analyzePromptHeuristically(request.prompt);

    const entities: ProblemEntity[] = analysis.entities.map((name, i) => ({
      id: `entity-${i}`,
      name,
      type: 'other' as const,
      properties: {},
      relationships: [],
      description: '',
    }));

    // Add agent entities
    for (let i = 0; i < request.agentCount; i++) {
      entities.push({
        id: `agent-${i}`,
        name: `Agent ${i + 1}`,
        type: 'agent',
        properties: { index: i },
        relationships: [],
        description: `Farm agent ${i + 1}`,
      });
    }

    const actions: ProblemAction[] = analysis.subTasks.map((task, i) => ({
      id: `action-${i}`,
      name: task,
      description: task,
      preconditions: [],
      effects: [],
      priority: 5,
      assignedAgent: `agent-${i % request.agentCount}`,
      status: 'pending' as const,
    }));

    const goals: ProblemGoal[] = analysis.goals.map((goal, i) => ({
      id: `goal-${i}`,
      description: goal,
      conditions: [],
      priority: 5,
      verified: false,
    }));

    const constraints: ProblemConstraint[] = analysis.constraints.map((c, i) => ({
      id: `constraint-${i}`,
      type: 'logical' as const,
      description: c,
      expression: c,
      enforced: true,
      severity: 'warning' as const,
    }));

    return {
      id,
      farmId: request.farmId,
      version: 1,
      entities,
      variables: [],
      actions,
      constraints,
      goals,
      verified: false,
      sourcePrompt: request.prompt,
      generatedBy: 'heuristic' as 'claude',
      generatedAt: new Date(),
      metadata: {
        mode: request.mode,
        agentCount: request.agentCount,
        fallback: true,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private analyzePromptHeuristically(prompt: string): PromptAnalysis {
    const words = prompt.split(/\s+/);
    const sentences = prompt.split(/[.!?]+/).filter(s => s.trim());

    // Extract potential entities (capitalized words, quoted strings)
    const entities: string[] = [];
    const entityMatches = prompt.match(/["']([^"']+)["']|`([^`]+)`|\b([A-Z][a-z]+(?:[A-Z][a-z]+)*)\b/g);
    if (entityMatches) {
      entities.push(...entityMatches.slice(0, 10));
    }

    // Extract potential tasks (sentences with action verbs)
    const actionVerbs = ['create', 'build', 'implement', 'add', 'update', 'fix', 'refactor', 'test', 'deploy', 'configure', 'setup', 'install'];
    const subTasks = sentences.filter(s => {
      const lower = s.toLowerCase();
      return actionVerbs.some(v => lower.includes(v));
    }).slice(0, 10);

    // Main task is usually the first sentence
    const mainTask = sentences[0] || prompt.slice(0, 100);

    // Extract constraints (sentences with "must", "should", "cannot", "don't")
    const constraints = sentences.filter(s => {
      const lower = s.toLowerCase();
      return /\b(must|should|cannot|can't|don't|do not|never|always)\b/.test(lower);
    }).slice(0, 5);

    // Goals are often at the end or contain "goal", "objective", "result"
    const goals = sentences.filter(s => {
      const lower = s.toLowerCase();
      return /\b(goal|objective|result|output|deliver|complete|finish|achieve)\b/.test(lower);
    }).slice(0, 5);

    // If no goals found, use the main task
    if (goals.length === 0) {
      goals.push(mainTask);
    }

    return { mainTask, subTasks, entities, constraints, goals };
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  async cleanup(farmId: string): Promise<void> {
    this.activeModels.delete(farmId);
    logger.debug(LogCategory.FARM, `Cleaned up problem model for farm ${farmId}`);
  }

  /**
   * Clear cached model for a farm
   */
  clearCache(farmId: string): void {
    this.activeModels.delete(farmId);
    logger.debug(LogCategory.FARM, `Cleared problem model cache for farm ${farmId}`);
  }
}

// Export singleton instance
export const problemModelingService = ProblemModelingService.getInstance();
