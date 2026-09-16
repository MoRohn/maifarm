/**
 * Causal Modeling Service - DEMOCRITUS-Inspired Implementation
 *
 * Based on "Large Causal Models from Large Language Models" (arxiv 2512.07796)
 * by Sridhar Mahadevan
 *
 * DEMOCRITUS: A system for extracting, organizing, and visualizing
 * large causal models (LCMs) from LLM queries.
 *
 * Six-module pipeline:
 * 1. Extract - Parse prompt for causal statements
 * 2. Organize - Group triples by relationship type
 * 3. Detect - Find conflicting claims
 * 4. Resolve - Apply resolution strategy
 * 5. Build - Construct directed graph
 * 6. Order - Topological sort for task sequence
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
  CausalModel,
  CausalTriple,
  CausalNode,
  CausalEdge,
  CausalGraph,
  CausalGraphStats,
  CausalConflict,
  CausalRelationship,
  CausalSource,
  ConflictType,
  ResolutionStrategy,
  ConflictResolution,
  ConflictResolutionStatus,
  CausalModelExtractionRequest,
  CausalExtractionResult,
  ConflictDetectionResult,
  GraphConstructionResult,
  CausalModelSummary,
  AgentCausalModelContext,
  CausalPipelineResults,
  CausalModelEvent,
} from '../types/causalModel';

// ============================================================================
// AI Prompt Templates
// ============================================================================

const CAUSAL_EXTRACTION_PROMPT = `You are a Causal Relationship Expert. Analyze the following task description and extract causal relationships.

## Task Description:
{prompt}

## Problem Model Context (if available):
{problemModelContext}

## Instructions:
Extract all causal relationships as triples in the format: cause → relationship → effect

Relationship types:
- causes: A directly causes B to happen
- enables: A makes B possible (but doesn't guarantee it)
- prevents: A blocks B from occurring
- requires: A needs B to exist/complete first
- follows: A comes after B (temporal ordering)
- produces: A creates/outputs B
- consumes: A uses up B
- modifies: A changes B
- triggers: A initiates B

For each triple, provide:
- cause: The causing entity or action
- effect: The affected entity or action
- relationship: One of the relationship types above
- confidence: 0.0 to 1.0 confidence in this relationship
- evidence: Brief explanation of why this relationship exists

Respond ONLY with valid JSON:
{
  "triples": [
    {
      "cause": "string",
      "effect": "string",
      "relationship": "causes|enables|prevents|requires|follows|produces|consumes|modifies|triggers",
      "confidence": 0.0-1.0,
      "evidence": "string"
    }
  ]
}`;

// ============================================================================
// Causal Modeling Service
// ============================================================================

export class CausalModelingService extends EventEmitter {
  private static instance: CausalModelingService;
  private activeModels: Map<string, CausalModel> = new Map(); // farmId -> model

  private constructor() {
    super();
    logger.info(LogCategory.SYSTEM, 'CausalModelingService initialized');
  }

  static getInstance(): CausalModelingService {
    if (!this.instance) {
      this.instance = new CausalModelingService();
    }
    return this.instance;
  }

  // ==========================================================================
  // Main Pipeline
  // ==========================================================================

  /**
   * Execute the full DEMOCRITUS-inspired 6-module pipeline
   */
  async extractCausalModel(request: CausalModelExtractionRequest): Promise<CausalModel> {
    const pipelineStart = Date.now();
    const farmId = request.farmId;

    logger.info(LogCategory.FARM, `Starting causal model extraction for farm ${farmId}`);

    this.emitEvent('extraction_started', farmId);

    const pipelineResults: Partial<CausalPipelineResults> = {};

    try {
      // Stage 1: Extract causal triples from prompt
      const extractionResult = await this.stageExtract(request);
      pipelineResults.extraction = extractionResult;

      // Stage 2: Organize triples by relationship type
      const organization = this.stageOrganize(extractionResult.triples);
      pipelineResults.organization = organization;

      // Stage 3: Detect conflicts between triples
      const detectionResult = this.stageDetect(extractionResult.triples);
      pipelineResults.detection = detectionResult;

      // Stage 4: Resolve conflicts
      const resolvedConflicts = this.stageResolve(
        detectionResult.conflicts,
        extractionResult.triples
      );
      pipelineResults.resolution = resolvedConflicts;

      // Mark resolved triples as inactive
      const activeTriples = this.applyResolutions(extractionResult.triples, resolvedConflicts);

      // Stage 5: Build causal graph
      const constructionResult = this.stageBuild(activeTriples);
      pipelineResults.construction = constructionResult;

      // Stage 6: Topological ordering
      const orderingStart = Date.now();
      const orderingResult = this.stageOrder(constructionResult.graph);
      pipelineResults.ordering = {
        order: orderingResult.order,
        isDAG: orderingResult.isDAG,
        cycles: orderingResult.cycles,
        durationMs: Date.now() - orderingStart,
      };

      // Create the causal model
      const model: CausalModel = {
        id: uuidv4(),
        farmId,
        problemModelId: undefined, // Will be linked if problem model exists
        version: 1,
        triples: extractionResult.triples,
        graph: {
          ...constructionResult.graph,
          topologicalOrder: orderingResult.order,
          isDAG: orderingResult.isDAG,
          cycles: orderingResult.cycles,
        },
        conflicts: resolvedConflicts,
        conflictResolutionStatus: this.determineResolutionStatus(resolvedConflicts),
        topologicalOrder: orderingResult.order,
        sourcePrompt: request.prompt,
        extractedBy: request.provider || 'claude',
        extractedAt: new Date(),
        metadata: {
          pipelineResults: {
            ...pipelineResults,
            totalDurationMs: Date.now() - pipelineStart,
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Cache the model
      this.activeModels.set(farmId, model);

      // Persist to database
      await this.persistModel(model);

      // Write to coordination directory
      await this.writeModelToCoordination(model);

      logger.info(LogCategory.FARM,
        `Completed causal model for farm ${farmId}: ` +
        `${model.triples.length} triples, ${model.graph.nodes.length} nodes, ` +
        `${model.conflicts.length} conflicts (${Date.now() - pipelineStart}ms)`);

      this.emitEvent('pipeline_completed', farmId, model.id, {
        tripleCount: model.triples.length,
        nodeCount: model.graph.nodes.length,
        conflictCount: model.conflicts.length,
        isDAG: model.graph.isDAG,
      });

      return model;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(LogCategory.FARM, `Causal model extraction failed: ${errorMessage}`);

      this.emitEvent('error', farmId, undefined, { error: errorMessage });

      // Return a minimal fallback model
      return this.createFallbackModel(request);
    }
  }

  // ==========================================================================
  // Stage 1: Extract
  // ==========================================================================

  private async stageExtract(request: CausalModelExtractionRequest): Promise<CausalExtractionResult> {
    const startTime = Date.now();
    const warnings: string[] = [];

    try {
      // Build prompt for AI
      const prompt = this.buildExtractionPrompt(request);

      // Call AI provider
      const response = await this.callAIProvider(prompt, request.provider);

      // Parse response
      const triples = this.parseExtractionResponse(response, warnings);

      // Add IDs and normalize
      const normalizedTriples = triples.map((t, i) => ({
        ...t,
        id: `triple-${i}`,
        active: true,
      }));

      return {
        triples: normalizedTriples,
        confidence: this.calculateOverallConfidence(normalizedTriples),
        durationMs: Date.now() - startTime,
        warnings: warnings.length > 0 ? warnings : undefined,
      };

    } catch (error) {
      logger.warn(LogCategory.FARM, `AI extraction failed, using heuristic extraction`);

      // Fall back to heuristic extraction
      const triples = this.extractTriplesHeuristically(request.prompt);

      return {
        triples,
        confidence: 0.5,
        durationMs: Date.now() - startTime,
        warnings: [`AI extraction failed: ${error}`, 'Using heuristic extraction'],
      };
    }
  }

  private buildExtractionPrompt(request: CausalModelExtractionRequest): string {
    let prompt = CAUSAL_EXTRACTION_PROMPT.replace('{prompt}', request.prompt);

    if (request.problemModel) {
      const contextStr = JSON.stringify({
        entities: request.problemModel.entities,
        actions: request.problemModel.actions,
      }, null, 2);
      prompt = prompt.replace('{problemModelContext}', contextStr);
    } else {
      prompt = prompt.replace('{problemModelContext}', 'No problem model available');
    }

    return prompt;
  }

  private async callAIProvider(prompt: string, provider?: 'claude' | 'openai' | 'ollama'): Promise<string> {
    const selectedProvider = provider || 'claude';

    if (selectedProvider === 'claude') {
      return await this.callClaude(prompt);
    } else if (selectedProvider === 'openai') {
      return await this.callOpenAI(prompt);
    } else {
      return await this.callOllama(prompt);
    }
  }

  private async callClaude(prompt: string): Promise<string> {
    const config = await aiProviderManager.getProviderWithRefresh(AIProvider.CLAUDE);
    const apiKey = config.apiKey;
    if (!apiKey) throw new Error('Claude API key not configured');

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

    if (!response.ok) throw new Error(`Claude API error: ${response.status}`);

    const data = await response.json() as { content: Array<{ text: string }> };
    return data.content[0]?.text || '';
  }

  private async callOpenAI(prompt: string): Promise<string> {
    const config = await aiProviderManager.getProviderWithRefresh(AIProvider.OPENAI);
    const apiKey = config.apiKey;
    if (!apiKey) throw new Error('OpenAI API key not configured');

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

    if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content || '';
  }

  private async callOllama(prompt: string): Promise<string> {
    const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';

    const response = await fetch(`${ollamaHost}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama3.2', prompt, stream: false }),
    });

    if (!response.ok) throw new Error(`Ollama API error: ${response.status}`);

    const data = await response.json() as { response: string };
    return data.response || '';
  }

  private parseExtractionResponse(response: string, warnings: string[]): CausalTriple[] {
    try {
      // Extract JSON from response
      let jsonStr = response;
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      const parsed = JSON.parse(jsonStr);
      const triples = parsed.triples || parsed;

      if (!Array.isArray(triples)) {
        throw new Error('Response is not an array of triples');
      }

      return triples.map((t: Record<string, unknown>, i: number) =>
        this.normalizeTriple(t, i)
      );

    } catch (error) {
      warnings.push(`Failed to parse AI response: ${error}`);
      return [];
    }
  }

  private normalizeTriple(triple: Record<string, unknown>, index: number): CausalTriple {
    const validRelationships: CausalRelationship[] = [
      'causes', 'enables', 'prevents', 'requires', 'follows',
      'produces', 'consumes', 'modifies', 'triggers'
    ];

    const relStr = String(triple.relationship || 'causes').toLowerCase();
    const relationship = validRelationships.includes(relStr as CausalRelationship)
      ? relStr as CausalRelationship
      : 'causes';

    return {
      id: `triple-${index}`,
      cause: String(triple.cause || ''),
      effect: String(triple.effect || ''),
      relationship,
      confidence: Math.min(1, Math.max(0, Number(triple.confidence) || 0.7)),
      source: 'extracted' as CausalSource,
      evidence: triple.evidence ? [String(triple.evidence)] : undefined,
      active: true,
    };
  }

  private extractTriplesHeuristically(prompt: string): CausalTriple[] {
    const triples: CausalTriple[] = [];
    const sentences = prompt.split(/[.!?]+/).filter(s => s.trim());

    // Pattern matching for causal indicators
    const causalPatterns = [
      { pattern: /(\w+(?:\s+\w+)*)\s+(?:causes?|leads?\s+to)\s+(\w+(?:\s+\w+)*)/gi, rel: 'causes' as const },
      { pattern: /(\w+(?:\s+\w+)*)\s+(?:enables?|allows?)\s+(\w+(?:\s+\w+)*)/gi, rel: 'enables' as const },
      { pattern: /(\w+(?:\s+\w+)*)\s+(?:prevents?|blocks?)\s+(\w+(?:\s+\w+)*)/gi, rel: 'prevents' as const },
      { pattern: /(\w+(?:\s+\w+)*)\s+(?:requires?|needs?|depends?\s+on)\s+(\w+(?:\s+\w+)*)/gi, rel: 'requires' as const },
      { pattern: /(\w+(?:\s+\w+)*)\s+(?:(?:comes?|happens?)\s+)?(?:after|following)\s+(\w+(?:\s+\w+)*)/gi, rel: 'follows' as const },
      { pattern: /(\w+(?:\s+\w+)*)\s+(?:produces?|creates?|generates?)\s+(\w+(?:\s+\w+)*)/gi, rel: 'produces' as const },
      { pattern: /(?:before|first)\s+(\w+(?:\s+\w+)*)\s*,?\s*(?:then)\s+(\w+(?:\s+\w+)*)/gi, rel: 'follows' as const },
    ];

    for (const sentence of sentences) {
      for (const { pattern, rel } of causalPatterns) {
        pattern.lastIndex = 0; // Reset regex
        let match;
        while ((match = pattern.exec(sentence)) !== null) {
          triples.push({
            id: `triple-${triples.length}`,
            cause: match[1].trim(),
            effect: match[2].trim(),
            relationship: rel,
            confidence: 0.6,
            source: 'inferred',
            evidence: [`Extracted from: "${sentence.trim()}"`],
            active: true,
          });
        }
      }
    }

    return triples;
  }

  // ==========================================================================
  // Stage 2: Organize
  // ==========================================================================

  private stageOrganize(triples: CausalTriple[]): Record<CausalRelationship, CausalTriple[]> {
    const organized: Record<CausalRelationship, CausalTriple[]> = {
      causes: [],
      enables: [],
      prevents: [],
      requires: [],
      follows: [],
      produces: [],
      consumes: [],
      modifies: [],
      triggers: [],
    };

    for (const triple of triples) {
      organized[triple.relationship].push(triple);
    }

    return organized;
  }

  // ==========================================================================
  // Stage 3: Detect Conflicts
  // ==========================================================================

  private stageDetect(triples: CausalTriple[]): ConflictDetectionResult {
    const startTime = Date.now();
    const conflicts: CausalConflict[] = [];

    // Check for contradictions (A causes B AND A prevents B)
    for (let i = 0; i < triples.length; i++) {
      for (let j = i + 1; j < triples.length; j++) {
        const t1 = triples[i];
        const t2 = triples[j];

        // Same cause and effect
        if (t1.cause === t2.cause && t1.effect === t2.effect) {
          // Check for contradictory relationships
          if (this.areContradictory(t1.relationship, t2.relationship)) {
            conflicts.push({
              id: `conflict-${conflicts.length}`,
              tripleIds: [t1.id, t2.id],
              type: 'contradiction',
              description: `"${t1.cause}" both ${t1.relationship} and ${t2.relationship} "${t1.effect}"`,
              resolved: false,
              detectedAt: new Date(),
            });

            // Mark triples as conflicting
            t1.conflictsWith = t1.conflictsWith || [];
            t1.conflictsWith.push(t2.id);
            t2.conflictsWith = t2.conflictsWith || [];
            t2.conflictsWith.push(t1.id);
          }
        }
      }
    }

    // Check for cycles (will be done in graph construction)
    // For now, just note potential cycle indicators

    return {
      conflicts,
      hasCriticalConflicts: conflicts.some(c => c.type === 'contradiction'),
      durationMs: Date.now() - startTime,
    };
  }

  private areContradictory(rel1: CausalRelationship, rel2: CausalRelationship): boolean {
    const contradictions: Array<[CausalRelationship, CausalRelationship]> = [
      ['causes', 'prevents'],
      ['enables', 'prevents'],
      ['produces', 'consumes'],
    ];

    return contradictions.some(
      ([a, b]) => (rel1 === a && rel2 === b) || (rel1 === b && rel2 === a)
    );
  }

  // ==========================================================================
  // Stage 4: Resolve Conflicts
  // ==========================================================================

  private stageResolve(conflicts: CausalConflict[], triples: CausalTriple[]): CausalConflict[] {
    const tripleMap = new Map(triples.map(t => [t.id, t]));

    for (const conflict of conflicts) {
      if (conflict.resolved) continue;

      // Get conflicting triples
      const conflictingTriples = conflict.tripleIds
        .map(id => tripleMap.get(id))
        .filter((t): t is CausalTriple => t !== undefined);

      if (conflictingTriples.length < 2) continue;

      // Apply resolution strategy
      const resolution = this.resolveConflict(conflictingTriples, conflict.type);

      if (resolution) {
        conflict.resolution = resolution;
        conflict.resolved = true;

        this.emitEvent('conflict_resolved', '', undefined, {
          conflictId: conflict.id,
          strategy: resolution.strategy,
          winner: resolution.resolvedTripleId,
        });
      }
    }

    return conflicts;
  }

  private resolveConflict(
    triples: CausalTriple[],
    conflictType: ConflictType
  ): ConflictResolution | undefined {
    // Strategy 1: Confidence-based
    const byConfidence = [...triples].sort((a, b) => b.confidence - a.confidence);
    if (byConfidence[0].confidence > byConfidence[1].confidence + 0.2) {
      return {
        strategy: 'confidence',
        resolvedTripleId: byConfidence[0].id,
        reason: `Higher confidence (${byConfidence[0].confidence.toFixed(2)} vs ${byConfidence[1].confidence.toFixed(2)})`,
        resolvedAt: new Date(),
      };
    }

    // Strategy 2: Authority-based (prefer extracted over inferred)
    const extracted = triples.filter(t => t.source === 'extracted');
    const inferred = triples.filter(t => t.source === 'inferred');
    if (extracted.length === 1 && inferred.length >= 1) {
      return {
        strategy: 'authority',
        resolvedTripleId: extracted[0].id,
        reason: 'Extracted triples take precedence over inferred',
        resolvedAt: new Date(),
      };
    }

    // Strategy 3: Evidence-based (prefer triples with more evidence)
    const byEvidence = [...triples].sort(
      (a, b) => (b.evidence?.length || 0) - (a.evidence?.length || 0)
    );
    if ((byEvidence[0].evidence?.length || 0) > (byEvidence[1].evidence?.length || 0)) {
      return {
        strategy: 'evidence',
        resolvedTripleId: byEvidence[0].id,
        reason: `More supporting evidence (${byEvidence[0].evidence?.length || 0} vs ${byEvidence[1].evidence?.length || 0})`,
        resolvedAt: new Date(),
      };
    }

    // Cannot auto-resolve, mark for manual review
    return undefined;
  }

  private applyResolutions(triples: CausalTriple[], conflicts: CausalConflict[]): CausalTriple[] {
    const winnerIds = new Set(
      conflicts
        .filter(c => c.resolved && c.resolution)
        .map(c => c.resolution!.resolvedTripleId)
    );

    const loserIds = new Set(
      conflicts
        .filter(c => c.resolved && c.resolution)
        .flatMap(c => c.tripleIds.filter(id => id !== c.resolution!.resolvedTripleId))
    );

    return triples.map(t => ({
      ...t,
      active: !loserIds.has(t.id),
    }));
  }

  // ==========================================================================
  // Stage 5: Build Graph
  // ==========================================================================

  private stageBuild(triples: CausalTriple[]): GraphConstructionResult {
    const startTime = Date.now();
    const issues: string[] = [];

    // Only use active triples
    const activeTriples = triples.filter(t => t.active);

    // Collect unique nodes
    const nodeSet = new Set<string>();
    for (const triple of activeTriples) {
      nodeSet.add(triple.cause);
      nodeSet.add(triple.effect);
    }

    // Create nodes
    const nodes: CausalNode[] = Array.from(nodeSet).map(label => ({
      id: label,
      label,
      type: this.inferNodeType(label),
      inDegree: 0,
      outDegree: 0,
      isRoot: true,
      isLeaf: true,
    }));

    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // Create edges
    const edges: CausalEdge[] = activeTriples.map((triple, i) => ({
      id: `edge-${i}`,
      source: triple.cause,
      target: triple.effect,
      weight: triple.confidence,
      relationship: triple.relationship,
      tripleId: triple.id,
    }));

    // Update node degrees
    for (const edge of edges) {
      const sourceNode = nodeMap.get(edge.source);
      const targetNode = nodeMap.get(edge.target);

      if (sourceNode) {
        sourceNode.outDegree++;
        sourceNode.isLeaf = false;
      }
      if (targetNode) {
        targetNode.inDegree++;
        targetNode.isRoot = false;
      }
    }

    // Calculate stats
    const stats: CausalGraphStats = {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      rootCount: nodes.filter(n => n.isRoot).length,
      leafCount: nodes.filter(n => n.isLeaf).length,
      maxDepth: this.calculateMaxDepth(nodes, edges),
      avgConfidence: edges.length > 0
        ? edges.reduce((sum, e) => sum + e.weight, 0) / edges.length
        : 0,
      componentCount: this.countComponents(nodes, edges),
    };

    const graph: CausalGraph = {
      nodes,
      edges,
      topologicalOrder: [],
      isDAG: true,
      stats,
    };

    return {
      graph,
      durationMs: Date.now() - startTime,
      issues: issues.length > 0 ? issues : undefined,
    };
  }

  private inferNodeType(label: string): CausalNode['type'] {
    const lower = label.toLowerCase();

    if (/^(create|build|implement|add|update|fix|test|deploy)/.test(lower)) {
      return 'action';
    }
    if (/^(goal|objective|target|complete|finish)/.test(lower)) {
      return 'goal';
    }
    if (/(status|state|ready|done|complete)$/.test(lower)) {
      return 'state';
    }
    if (/(must|should|cannot|constraint|limit)/.test(lower)) {
      return 'constraint';
    }

    return 'entity';
  }

  private calculateMaxDepth(nodes: CausalNode[], edges: CausalEdge[]): number {
    // Build adjacency list
    const adj = new Map<string, string[]>();
    for (const node of nodes) {
      adj.set(node.id, []);
    }
    for (const edge of edges) {
      adj.get(edge.source)?.push(edge.target);
    }

    // Find roots
    const roots = nodes.filter(n => n.isRoot);
    if (roots.length === 0) return 0;

    // BFS to find max depth
    let maxDepth = 0;
    const visited = new Set<string>();

    for (const root of roots) {
      const queue: Array<{ id: string; depth: number }> = [{ id: root.id, depth: 0 }];

      while (queue.length > 0) {
        const { id, depth } = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);

        maxDepth = Math.max(maxDepth, depth);

        for (const neighbor of adj.get(id) || []) {
          if (!visited.has(neighbor)) {
            queue.push({ id: neighbor, depth: depth + 1 });
          }
        }
      }
    }

    return maxDepth;
  }

  private countComponents(nodes: CausalNode[], edges: CausalEdge[]): number {
    if (nodes.length === 0) return 0;

    // Build undirected adjacency list
    const adj = new Map<string, Set<string>>();
    for (const node of nodes) {
      adj.set(node.id, new Set());
    }
    for (const edge of edges) {
      adj.get(edge.source)?.add(edge.target);
      adj.get(edge.target)?.add(edge.source);
    }

    // Count components with BFS
    const visited = new Set<string>();
    let components = 0;

    for (const node of nodes) {
      if (visited.has(node.id)) continue;

      components++;
      const queue = [node.id];

      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);

        for (const neighbor of adj.get(current) || []) {
          if (!visited.has(neighbor)) {
            queue.push(neighbor);
          }
        }
      }
    }

    return components;
  }

  // ==========================================================================
  // Stage 6: Topological Order
  // ==========================================================================

  private stageOrder(graph: CausalGraph): { order: string[]; isDAG: boolean; cycles: string[][] } {
    // Kahn's algorithm for topological sort
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const node of graph.nodes) {
      inDegree.set(node.id, 0);
      adj.set(node.id, []);
    }

    for (const edge of graph.edges) {
      adj.get(edge.source)?.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }

    // Find nodes with no incoming edges
    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id);
    }

    const order: string[] = [];
    let index = 0;

    while (queue.length > 0) {
      const current = queue.shift()!;
      order.push(current);

      // Update topological index on node
      const node = graph.nodes.find(n => n.id === current);
      if (node) node.topologicalIndex = index++;

      for (const neighbor of adj.get(current) || []) {
        const newDegree = (inDegree.get(neighbor) || 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) queue.push(neighbor);
      }
    }

    // Check if all nodes were processed (no cycles)
    const isDAG = order.length === graph.nodes.length;

    // Find cycles if not a DAG
    const cycles: string[][] = [];
    if (!isDAG) {
      // Simple cycle detection - nodes not in topological order
      const remaining = graph.nodes
        .filter(n => !order.includes(n.id))
        .map(n => n.id);

      if (remaining.length > 0) {
        cycles.push(remaining);
      }
    }

    return { order, isDAG, cycles };
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  private async persistModel(model: CausalModel): Promise<void> {
    try {
      await db.query(
        `INSERT INTO causal_models (
          id, farm_id, problem_model_id, version,
          triples, graph_nodes, graph_edges, topological_order,
          is_dag, cycles, critical_path, graph_stats,
          conflicts, conflict_resolution_status,
          source_prompt, extracted_by, extracted_at, pipeline_results, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        ON CONFLICT (id) DO UPDATE SET
          version = EXCLUDED.version,
          triples = EXCLUDED.triples,
          graph_nodes = EXCLUDED.graph_nodes,
          graph_edges = EXCLUDED.graph_edges,
          topological_order = EXCLUDED.topological_order,
          conflicts = EXCLUDED.conflicts,
          conflict_resolution_status = EXCLUDED.conflict_resolution_status,
          updated_at = CURRENT_TIMESTAMP`,
        [
          model.id,
          model.farmId,
          model.problemModelId,
          model.version,
          JSON.stringify(model.triples),
          JSON.stringify(model.graph.nodes),
          JSON.stringify(model.graph.edges),
          model.topologicalOrder,
          model.graph.isDAG,
          JSON.stringify(model.graph.cycles || []),
          model.graph.criticalPath || [],
          JSON.stringify(model.graph.stats),
          JSON.stringify(model.conflicts),
          model.conflictResolutionStatus,
          model.sourcePrompt,
          model.extractedBy,
          model.extractedAt,
          JSON.stringify(model.metadata),
          JSON.stringify({}),
        ]
      );

      logger.debug(LogCategory.DATABASE, `Persisted causal model ${model.id}`);
    } catch (error) {
      logger.error(LogCategory.DATABASE, `Failed to persist causal model: ${error}`);
      throw error;
    }
  }

  private async writeModelToCoordination(model: CausalModel): Promise<void> {
    try {
      const coordDir = pathConfig.getFarmCoordinationPath(model.farmId);
      await fs.mkdir(coordDir, { recursive: true });

      // Write full model
      const modelPath = path.join(coordDir, 'causal_model.json');
      await fs.writeFile(modelPath, JSON.stringify(model, null, 2));

      // Write task ordering for easy access by orchestrator
      const orderPath = path.join(coordDir, 'task_ordering.json');
      await fs.writeFile(orderPath, JSON.stringify({
        order: model.topologicalOrder,
        isDAG: model.graph.isDAG,
        dependencies: model.graph.edges.map(e => ({
          from: e.source,
          to: e.target,
          relationship: e.relationship,
        })),
      }, null, 2));

      logger.debug(LogCategory.FARM, `Wrote causal model to ${modelPath}`);
    } catch (error) {
      logger.error(LogCategory.FARM, `Failed to write causal model to coordination: ${error}`);
    }
  }

  // ==========================================================================
  // Model Retrieval
  // ==========================================================================

  async getModel(farmId: string): Promise<CausalModel | null> {
    const cached = this.activeModels.get(farmId);
    if (cached) return cached;

    try {
      const result = await db.query(
        `SELECT * FROM causal_models WHERE farm_id = $1 ORDER BY version DESC LIMIT 1`,
        [farmId]
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      const model: CausalModel = {
        id: row.id,
        farmId: row.farm_id,
        problemModelId: row.problem_model_id,
        version: row.version,
        triples: row.triples,
        graph: {
          nodes: row.graph_nodes,
          edges: row.graph_edges,
          topologicalOrder: row.topological_order,
          isDAG: row.is_dag,
          cycles: row.cycles,
          criticalPath: row.critical_path,
          stats: row.graph_stats,
        },
        conflicts: row.conflicts,
        conflictResolutionStatus: row.conflict_resolution_status,
        topologicalOrder: row.topological_order,
        sourcePrompt: row.source_prompt,
        extractedBy: row.extracted_by,
        extractedAt: row.extracted_at,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };

      this.activeModels.set(farmId, model);
      return model;

    } catch (error) {
      logger.error(LogCategory.DATABASE, `Failed to load causal model: ${error}`);
      return null;
    }
  }

  getModelSummary(model: CausalModel): CausalModelSummary {
    return {
      id: model.id,
      farmId: model.farmId,
      tripleCount: model.triples.length,
      nodeCount: model.graph.nodes.length,
      edgeCount: model.graph.edges.length,
      conflictCount: model.conflicts.length,
      unresolvedConflicts: model.conflicts.filter(c => !c.resolved).length,
      isDAG: model.graph.isDAG,
      conflictResolutionStatus: model.conflictResolutionStatus,
      createdAt: model.createdAt,
    };
  }

  // ==========================================================================
  // Agent Context
  // ==========================================================================

  getAgentContext(model: CausalModel, agentTasks: string[]): AgentCausalModelContext {
    // Find dependencies for agent's tasks
    const dependencies: AgentCausalModelContext['dependencies'] = [];

    for (const task of agentTasks) {
      const incoming = model.graph.edges.filter(e => e.target === task);
      if (incoming.length > 0) {
        dependencies.push({
          task,
          dependsOn: incoming.map(e => e.source),
          relationship: incoming[0].relationship,
        });
      }
    }

    // Extract causal constraints
    const causalConstraints = model.conflicts
      .filter(c => !c.resolved)
      .map(c => ({
        description: c.description,
        type: c.type,
      }));

    // Check if agent's tasks are on critical path
    const criticalPathTasks = model.graph.criticalPath
      ? agentTasks.filter(t => model.graph.criticalPath!.includes(t))
      : undefined;

    return {
      taskOrder: model.topologicalOrder,
      dependencies,
      causalConstraints,
      criticalPathTasks,
    };
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private calculateOverallConfidence(triples: CausalTriple[]): number {
    if (triples.length === 0) return 0;
    return triples.reduce((sum, t) => sum + t.confidence, 0) / triples.length;
  }

  private determineResolutionStatus(conflicts: CausalConflict[]): ConflictResolutionStatus {
    if (conflicts.length === 0) return 'pending';

    const unresolved = conflicts.filter(c => !c.resolved);
    if (unresolved.length === 0) return 'resolved';

    const hasManualRequired = unresolved.some(c => c.type === 'contradiction');
    return hasManualRequired ? 'manual_review' : 'in_progress';
  }

  private createFallbackModel(request: CausalModelExtractionRequest): CausalModel {
    return {
      id: uuidv4(),
      farmId: request.farmId,
      version: 1,
      triples: [],
      graph: {
        nodes: [],
        edges: [],
        topologicalOrder: [],
        isDAG: true,
        stats: {
          nodeCount: 0,
          edgeCount: 0,
          rootCount: 0,
          leafCount: 0,
          maxDepth: 0,
          avgConfidence: 0,
          componentCount: 0,
        },
      },
      conflicts: [],
      conflictResolutionStatus: 'pending',
      topologicalOrder: [],
      sourcePrompt: request.prompt,
      extractedBy: 'fallback' as 'claude',
      extractedAt: new Date(),
      metadata: { fallback: true },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private emitEvent(
    type: CausalModelEvent['type'],
    farmId: string,
    modelId?: string,
    data?: Record<string, unknown>
  ): void {
    const event: CausalModelEvent = {
      type,
      farmId,
      modelId,
      data,
      timestamp: new Date(),
    };

    this.emit(type, event);

    // Broadcast via WebSocket
    websocketManager.broadcast(`causal:${type}`, {
      farmId,
      modelId,
      ...data,
    });
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  async cleanup(farmId: string): Promise<void> {
    this.activeModels.delete(farmId);
    logger.debug(LogCategory.FARM, `Cleaned up causal model for farm ${farmId}`);
  }

  /**
   * Clear cached model for a farm
   */
  clearCache(farmId: string): void {
    this.activeModels.delete(farmId);
    logger.debug(LogCategory.FARM, `Cleared causal model cache for farm ${farmId}`);
  }
}

// Export singleton instance
export const causalModelingService = CausalModelingService.getInstance();
