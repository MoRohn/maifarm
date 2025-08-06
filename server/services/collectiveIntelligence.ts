import { EventEmitter } from 'events';
import {
  CollectiveIntelligenceState,
  EmergentBehavior,
  CollectiveMemory,
  KnowledgeNode,
  KnowledgeEdge,
  CollectiveInsight,
  SwarmTopology,
  SwarmNode,
  CollectiveDecision,
  DecisionOption,
  AgentVote,
  EmergentPattern,
  PatternOccurrence,
  CollectiveMetrics,
  SwarmMessage,
  Vector3D
} from '../types/superintelligence';
import { websocketManager } from '../websocket/websocketManager';
import { agentCoordinator } from './agentCoordinator';

/**
 * Collective Intelligence Orchestrator
 * Coordinates multiple AI agents to achieve emergent intelligence beyond individual capabilities
 */
class CollectiveIntelligenceOrchestrator extends EventEmitter {
  private state: CollectiveIntelligenceState;
  private knowledgeGraph: Map<string, KnowledgeNode>;
  private patternDetector: PatternDetector;
  private consensusEngine: ConsensusEngine;
  private emergentBehaviors: Map<string, EmergentBehavior>;
  private messageQueue: SwarmMessage[];
  private metricsCalculator: MetricsCalculator;

  constructor() {
    super();
    this.knowledgeGraph = new Map();
    this.emergentBehaviors = new Map();
    this.messageQueue = [];
    this.patternDetector = new PatternDetector();
    this.consensusEngine = new ConsensusEngine();
    this.metricsCalculator = new MetricsCalculator();
    
    this.state = this.initializeState();
    this.startCollectiveProcessing();
  }

  private initializeState(): CollectiveIntelligenceState {
    return {
      id: `collective-${Date.now()}`,
      activeAgents: 0,
      consensusThreshold: 0.7,
      emergentBehaviors: [],
      collectiveMemory: {
        knowledgeBase: [],
        connections: [],
        insights: [],
        totalNodes: 0,
        memoryUtilization: 0
      },
      swarmTopology: {
        type: 'small-world',
        nodes: [],
        edges: [],
        centralityMetrics: {
          betweenness: new Map(),
          closeness: new Map(),
          eigenvector: new Map(),
          pageRank: new Map()
        }
      },
      timestamp: new Date()
    };
  }

  /**
   * Process collective intelligence tasks
   */
  private startCollectiveProcessing() {
    // Monitor agent outputs for emergent patterns
    setInterval(() => this.detectEmergentPatterns(), 5000);
    
    // Update swarm topology
    setInterval(() => this.updateSwarmTopology(), 10000);
    
    // Process collective memory
    setInterval(() => this.consolidateCollectiveMemory(), 15000);
    
    // Calculate collective metrics
    setInterval(() => this.calculateCollectiveMetrics(), 20000);
  }

  /**
   * Add knowledge to collective memory
   */
  async addKnowledge(node: KnowledgeNode): Promise<void> {
    this.knowledgeGraph.set(node.id, node);
    
    // Find connections to existing knowledge
    const connections = await this.findKnowledgeConnections(node);
    
    // Update collective memory
    this.state.collectiveMemory.knowledgeBase.push(node);
    this.state.collectiveMemory.connections.push(...connections);
    this.state.collectiveMemory.totalNodes++;
    
    // Check for insights
    const insights = await this.deriveInsights(node, connections);
    if (insights.length > 0) {
      this.state.collectiveMemory.insights.push(...insights);
      this.emit('insights:discovered', insights);
    }
    
    // Broadcast to swarm
    this.broadcastToSwarm({
      from: 'orchestrator',
      to: 'broadcast',
      type: 'info',
      content: { type: 'knowledge:added', node, connections },
      timestamp: new Date()
    });
  }

  /**
   * Find connections between knowledge nodes
   */
  private async findKnowledgeConnections(node: KnowledgeNode): Promise<KnowledgeEdge[]> {
    const connections: KnowledgeEdge[] = [];
    
    for (const [id, existingNode] of this.knowledgeGraph) {
      if (id === node.id) continue;
      
      const similarity = this.calculateSimilarity(node, existingNode);
      if (similarity > 0.3) {
        connections.push({
          from: node.id,
          to: id,
          weight: similarity,
          type: this.determineConnectionType(node, existingNode)
        });
      }
    }
    
    return connections;
  }

  /**
   * Calculate similarity between knowledge nodes
   */
  private calculateSimilarity(node1: KnowledgeNode, node2: KnowledgeNode): number {
    // Simplified similarity calculation
    if (node1.type === node2.type) {
      return 0.5 + (node1.confidence * node2.confidence) / 2;
    }
    return Math.random() * 0.3; // Placeholder for more sophisticated calculation
  }

  /**
   * Determine connection type between nodes
   */
  private determineConnectionType(node1: KnowledgeNode, node2: KnowledgeNode): 'causal' | 'correlation' | 'similarity' | 'temporal' {
    // Simple heuristic for connection type
    if (node1.created < node2.created && node1.type === 'fact' && node2.type === 'insight') {
      return 'causal';
    } else if (Math.abs(node1.created.getTime() - node2.created.getTime()) < 1000) {
      return 'temporal';
    } else if (node1.type === node2.type) {
      return 'similarity';
    }
    return 'correlation';
  }

  /**
   * Derive insights from knowledge connections
   */
  private async deriveInsights(node: KnowledgeNode, connections: KnowledgeEdge[]): Promise<CollectiveInsight[]> {
    const insights: CollectiveInsight[] = [];
    
    // Look for strongly connected components
    const strongConnections = connections.filter(c => c.weight > 0.7);
    
    if (strongConnections.length >= 3) {
      const connectedNodes = strongConnections.map(c => 
        this.knowledgeGraph.get(c.to)
      ).filter(n => n !== undefined) as KnowledgeNode[];
      
      const insight: CollectiveInsight = {
        id: `insight-${Date.now()}`,
        insight: `Pattern detected: ${node.type} "${node.content}" strongly correlates with ${connectedNodes.length} other nodes`,
        derivedFrom: [node.id, ...strongConnections.map(c => c.to)],
        novelty: this.calculateNovelty(node, connectedNodes),
        utility: this.calculateUtility(node, connectedNodes),
        validated: false
      };
      
      insights.push(insight);
    }
    
    return insights;
  }

  /**
   * Calculate novelty of an insight
   */
  private calculateNovelty(node: KnowledgeNode, related: KnowledgeNode[]): number {
    const uniqueTypes = new Set([node.type, ...related.map(n => n.type)]);
    const diversityCombining of different node types
    const diversity = uniqueTypes.size / (related.length + 1);
    
    // Higher novelty for insights derived from diverse sources
    return Math.min(1, diversity * 1.5);
  }

  /**
   * Calculate utility of an insight
   */
  private calculateUtility(node: KnowledgeNode, related: KnowledgeNode[]): number {
    // Average confidence of contributing nodes
    const avgConfidence = (node.confidence + related.reduce((sum, n) => sum + n.confidence, 0)) / (related.length + 1);
    
    // Boost utility for frequently accessed nodes
    const avgAccessCount = (node.accessCount + related.reduce((sum, n) => sum + n.accessCount, 0)) / (related.length + 1);
    const accessBoost = Math.min(1, avgAccessCount / 10);
    
    return (avgConfidence + accessBoost) / 2;
  }

  /**
   * Detect emergent patterns across agent behaviors
   */
  private async detectEmergentPatterns(): Promise<void> {
    const patterns = await this.patternDetector.detectPatterns(this.state);
    
    for (const pattern of patterns) {
      if (!this.emergentBehaviors.has(pattern.id)) {
        this.emergentBehaviors.set(pattern.id, {
          id: pattern.id,
          pattern: pattern.pattern,
          frequency: 1,
          agentContributors: pattern.agents,
          confidence: pattern.significance,
          impact: this.assessImpact(pattern),
          discovered: new Date()
        });
        
        this.emit('emergent:behavior', pattern);
        websocketManager.broadcast('collective:emergent', { pattern });
      } else {
        // Update existing pattern
        const existing = this.emergentBehaviors.get(pattern.id)!;
        existing.frequency++;
        existing.confidence = (existing.confidence + pattern.significance) / 2;
        existing.agentContributors = [...new Set([...existing.agentContributors, ...pattern.agents])];
      }
    }
    
    this.state.emergentBehaviors = Array.from(this.emergentBehaviors.values());
  }

  /**
   * Assess impact of emergent pattern
   */
  private assessImpact(pattern: EmergentPattern): 'low' | 'medium' | 'high' | 'breakthrough' {
    if (pattern.significance > 0.9 && pattern.predictivePower > 0.8) {
      return 'breakthrough';
    } else if (pattern.significance > 0.7) {
      return 'high';
    } else if (pattern.significance > 0.5) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Update swarm topology based on agent interactions
   */
  private async updateSwarmTopology(): Promise<void> {
    const agents = await agentCoordinator.getActiveAgents();
    
    // Create or update swarm nodes
    const nodes: SwarmNode[] = agents.map(agent => ({
      agentId: agent.agent_id,
      position: this.calculatePosition(agent.agent_id),
      velocity: this.calculateVelocity(agent.agent_id),
      fitness: this.calculateFitness(agent.agent_id),
      personalBest: this.getPersonalBest(agent.agent_id),
      neighbors: this.findNeighbors(agent.agent_id, agents)
    }));
    
    this.state.swarmTopology.nodes = nodes;
    
    // Update centrality metrics
    this.updateCentralityMetrics(nodes);
    
    // Emit topology update
    this.emit('topology:updated', this.state.swarmTopology);
  }

  /**
   * Calculate 3D position for agent in swarm space
   */
  private calculatePosition(agentId: string): Vector3D {
    // Position based on agent's knowledge contribution and interactions
    const hash = this.hashString(agentId);
    return {
      x: (hash % 100) / 10,
      y: ((hash >> 8) % 100) / 10,
      z: ((hash >> 16) % 100) / 10
    };
  }

  /**
   * Calculate velocity vector for agent
   */
  private calculateVelocity(agentId: string): Vector3D {
    // Velocity represents agent's exploration direction
    return {
      x: (Math.random() - 0.5) * 2,
      y: (Math.random() - 0.5) * 2,
      z: (Math.random() - 0.5) * 2
    };
  }

  /**
   * Calculate fitness score for agent
   */
  private calculateFitness(agentId: string): number {
    // Fitness based on agent's contribution to collective intelligence
    const knowledgeContribution = Array.from(this.knowledgeGraph.values())
      .filter(n => n.source.includes(agentId)).length;
    
    const emergentContribution = Array.from(this.emergentBehaviors.values())
      .filter(b => b.agentContributors.includes(agentId)).length;
    
    return Math.min(1, (knowledgeContribution * 0.1 + emergentContribution * 0.3));
  }

  /**
   * Get personal best fitness for agent
   */
  private getPersonalBest(agentId: string): number {
    // Track historical best performance
    return this.calculateFitness(agentId); // Simplified - should track history
  }

  /**
   * Find neighboring agents in swarm
   */
  private findNeighbors(agentId: string, agents: any[]): string[] {
    // Small-world topology: mostly local connections with some long-range
    const neighbors: string[] = [];
    const maxNeighbors = Math.min(5, agents.length - 1);
    
    for (let i = 0; i < maxNeighbors; i++) {
      const randomAgent = agents[Math.floor(Math.random() * agents.length)];
      if (randomAgent.agent_id !== agentId && !neighbors.includes(randomAgent.agent_id)) {
        neighbors.push(randomAgent.agent_id);
      }
    }
    
    return neighbors;
  }

  /**
   * Update centrality metrics for swarm topology
   */
  private updateCentralityMetrics(nodes: SwarmNode[]): void {
    // Calculate various centrality measures
    nodes.forEach(node => {
      // Simplified centrality calculations
      const degree = node.neighbors.length;
      const betweenness = this.calculateBetweenness(node, nodes);
      const closeness = this.calculateCloseness(node, nodes);
      const eigenvector = this.calculateEigenvector(node, nodes);
      const pageRank = this.calculatePageRank(node, nodes);
      
      this.state.swarmTopology.centralityMetrics.betweenness.set(node.agentId, betweenness);
      this.state.swarmTopology.centralityMetrics.closeness.set(node.agentId, closeness);
      this.state.swarmTopology.centralityMetrics.eigenvector.set(node.agentId, eigenvector);
      this.state.swarmTopology.centralityMetrics.pageRank.set(node.agentId, pageRank);
    });
  }

  private calculateBetweenness(node: SwarmNode, allNodes: SwarmNode[]): number {
    // Simplified betweenness centrality
    return node.neighbors.length / Math.max(1, allNodes.length - 1);
  }

  private calculateCloseness(node: SwarmNode, allNodes: SwarmNode[]): number {
    // Simplified closeness centrality
    return 1 / Math.max(1, allNodes.length - node.neighbors.length);
  }

  private calculateEigenvector(node: SwarmNode, allNodes: SwarmNode[]): number {
    // Simplified eigenvector centrality
    const neighborImportance = node.neighbors
      .map(n => allNodes.find(an => an.agentId === n)?.fitness || 0)
      .reduce((sum, f) => sum + f, 0);
    return neighborImportance / Math.max(1, node.neighbors.length);
  }

  private calculatePageRank(node: SwarmNode, allNodes: SwarmNode[]): number {
    // Simplified PageRank
    const dampingFactor = 0.85;
    const baseRank = (1 - dampingFactor) / allNodes.length;
    const incomingRank = node.neighbors.length * dampingFactor / allNodes.length;
    return baseRank + incomingRank;
  }

  /**
   * Consolidate collective memory
   */
  private async consolidateCollectiveMemory(): Promise<void> {
    // Remove low-confidence, rarely accessed knowledge
    const threshold = Date.now() - 24 * 60 * 60 * 1000; // 24 hours
    
    this.state.collectiveMemory.knowledgeBase = this.state.collectiveMemory.knowledgeBase
      .filter(node => 
        node.confidence > 0.3 || 
        node.accessCount > 5 || 
        node.lastAccessed.getTime() > threshold
      );
    
    // Update memory utilization
    this.state.collectiveMemory.memoryUtilization = 
      this.state.collectiveMemory.knowledgeBase.length / 10000; // Assume 10k node capacity
    
    // Strengthen frequently accessed connections
    this.state.collectiveMemory.connections.forEach(edge => {
      const sourceNode = this.knowledgeGraph.get(edge.from);
      const targetNode = this.knowledgeGraph.get(edge.to);
      
      if (sourceNode && targetNode) {
        const accessBoost = (sourceNode.accessCount + targetNode.accessCount) / 100;
        edge.weight = Math.min(1, edge.weight + accessBoost * 0.01);
      }
    });
  }

  /**
   * Calculate collective metrics
   */
  private async calculateCollectiveMetrics(): Promise<void> {
    const metrics = await this.metricsCalculator.calculate(this.state);
    
    this.emit('metrics:updated', metrics);
    websocketManager.broadcast('collective:metrics', metrics);
  }

  /**
   * Make collective decision through consensus
   */
  async makeCollectiveDecision(decision: CollectiveDecision): Promise<DecisionOption | null> {
    const result = await this.consensusEngine.process(decision);
    
    if (result) {
      this.emit('decision:made', { decision, result });
      
      // Add decision to collective memory
      await this.addKnowledge({
        id: `decision-${decision.id}`,
        content: `Decision: ${decision.question} -> ${result.description}`,
        type: 'strategy',
        source: decision.votes.map(v => v.agentId),
        confidence: decision.confidence,
        created: new Date(),
        lastAccessed: new Date(),
        accessCount: 1
      });
    }
    
    return result;
  }

  /**
   * Broadcast message to swarm
   */
  private broadcastToSwarm(message: SwarmMessage): void {
    this.messageQueue.push(message);
    
    // Process message queue
    if (this.messageQueue.length > 100) {
      this.messageQueue = this.messageQueue.slice(-50); // Keep last 50 messages
    }
    
    // Send via websocket
    websocketManager.broadcast('swarm:message', message);
  }

  /**
   * Get current collective state
   */
  getState(): CollectiveIntelligenceState {
    return this.state;
  }

  /**
   * Get collective metrics
   */
  async getMetrics(): Promise<CollectiveMetrics> {
    return this.metricsCalculator.calculate(this.state);
  }

  /**
   * Simple string hashing for deterministic randomization
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}

/**
 * Pattern detection for emergent behaviors
 */
class PatternDetector {
  async detectPatterns(state: CollectiveIntelligenceState): Promise<EmergentPattern[]> {
    const patterns: EmergentPattern[] = [];
    
    // Analyze agent interactions for patterns
    if (state.activeAgents >= 3) {
      // Look for synchronized behaviors
      const syncPattern: EmergentPattern = {
        id: `pattern-sync-${Date.now()}`,
        pattern: 'Synchronized agent activity detected',
        type: 'behavioral',
        occurrences: [{
          timestamp: new Date(),
          context: 'collective-processing',
          agents: state.swarmTopology.nodes.map(n => n.agentId),
          strength: 0.7
        }],
        significance: 0.6,
        predictivePower: 0.5,
        validated: false
      };
      patterns.push(syncPattern);
    }
    
    return patterns;
  }
}

/**
 * Consensus engine for collective decision making
 */
class ConsensusEngine {
  async process(decision: CollectiveDecision): Promise<DecisionOption | null> {
    if (decision.votes.length === 0) return null;
    
    const voteCounts = new Map<string, number>();
    const voteWeights = new Map<string, number>();
    
    // Count votes based on consensus method
    decision.votes.forEach(vote => {
      const currentCount = voteCounts.get(vote.optionId) || 0;
      const currentWeight = voteWeights.get(vote.optionId) || 0;
      
      voteCounts.set(vote.optionId, currentCount + 1);
      voteWeights.set(vote.optionId, currentWeight + vote.weight * vote.confidence);
    });
    
    // Determine winner based on method
    let winnerId: string | null = null;
    let maxScore = 0;
    
    switch (decision.consensusMethod) {
      case 'majority':
        voteCounts.forEach((count, optionId) => {
          if (count > maxScore) {
            maxScore = count;
            winnerId = optionId;
          }
        });
        break;
        
      case 'weighted':
        voteWeights.forEach((weight, optionId) => {
          if (weight > maxScore) {
            maxScore = weight;
            winnerId = optionId;
          }
        });
        break;
        
      default:
        // Use weighted by default
        voteWeights.forEach((weight, optionId) => {
          if (weight > maxScore) {
            maxScore = weight;
            winnerId = optionId;
          }
        });
    }
    
    if (winnerId) {
      const totalVotes = decision.votes.length;
      const winnerVotes = voteCounts.get(winnerId) || 0;
      decision.confidence = winnerVotes / totalVotes;
      
      return decision.options.find(o => o.id === winnerId) || null;
    }
    
    return null;
  }
}

/**
 * Metrics calculator for collective intelligence
 */
class MetricsCalculator {
  async calculate(state: CollectiveIntelligenceState): Promise<CollectiveMetrics> {
    const nodes = state.swarmTopology.nodes;
    
    // Calculate diversity (variance in agent positions/behaviors)
    const diversity = this.calculateDiversity(nodes);
    
    // Calculate coherence (how well agents work together)
    const coherence = this.calculateCoherence(state);
    
    // Calculate efficiency (task completion rate)
    const efficiency = this.calculateEfficiency(state);
    
    // Calculate adaptability (response to changes)
    const adaptability = this.calculateAdaptability(state);
    
    // Calculate emergence index (novel behaviors)
    const emergenceIndex = state.emergentBehaviors.length / Math.max(1, state.activeAgents);
    
    // Calculate swarm intelligence (collective problem-solving)
    const swarmIntelligence = (coherence + efficiency + emergenceIndex) / 3;
    
    // Calculate collective IQ (overall intelligence measure)
    const collectiveIQ = (diversity * 0.2 + coherence * 0.2 + efficiency * 0.2 + 
                          adaptability * 0.2 + emergenceIndex * 0.1 + swarmIntelligence * 0.1);
    
    return {
      diversity,
      coherence,
      efficiency,
      adaptability,
      emergenceIndex,
      swarmIntelligence,
      collectiveIQ
    };
  }
  
  private calculateDiversity(nodes: SwarmNode[]): number {
    if (nodes.length === 0) return 0;
    
    // Calculate variance in fitness scores
    const fitnesses = nodes.map(n => n.fitness);
    const mean = fitnesses.reduce((sum, f) => sum + f, 0) / fitnesses.length;
    const variance = fitnesses.reduce((sum, f) => sum + Math.pow(f - mean, 2), 0) / fitnesses.length;
    
    return Math.min(1, Math.sqrt(variance) * 2);
  }
  
  private calculateCoherence(state: CollectiveIntelligenceState): number {
    // Measure how connected the swarm is
    const nodes = state.swarmTopology.nodes;
    if (nodes.length === 0) return 0;
    
    const avgNeighbors = nodes.reduce((sum, n) => sum + n.neighbors.length, 0) / nodes.length;
    const maxPossibleNeighbors = nodes.length - 1;
    
    return Math.min(1, avgNeighbors / Math.max(1, maxPossibleNeighbors));
  }
  
  private calculateEfficiency(state: CollectiveIntelligenceState): number {
    // Measure knowledge creation rate
    const knowledgeRate = state.collectiveMemory.totalNodes / Math.max(1, state.activeAgents);
    const insightRate = state.collectiveMemory.insights.length / Math.max(1, state.collectiveMemory.totalNodes);
    
    return Math.min(1, (knowledgeRate * 0.01 + insightRate));
  }
  
  private calculateAdaptability(state: CollectiveIntelligenceState): number {
    // Measure how quickly the system responds to new patterns
    const recentBehaviors = state.emergentBehaviors
      .filter(b => Date.now() - b.discovered.getTime() < 60000); // Last minute
    
    return Math.min(1, recentBehaviors.length / 5);
  }
}

// Export singleton instance
export const collectiveIntelligence = new CollectiveIntelligenceOrchestrator();