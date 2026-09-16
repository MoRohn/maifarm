import { 
  ExplorationNode, 
  ExplorationPath, 
  Discovery, 
  GoWildConfig,
  GoWildSession 
} from '@/types/goWild';

export interface AutonomousTask {
  id: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  estimatedTime: number; // minutes
  dependencies: string[];
  context: Record<string, any>;
  creativityRequired: number; // 0-100
}

export class AutonomousAgentService {
  private activeSession: GoWildSession | null = null;
  private taskQueue: AutonomousTask[] = [];
  private ws: WebSocket | null = null;
  
  constructor(private wsUrl: string) {}

  /**
   * Initialize the autonomous agent for a Go Wild session
   */
  async initializeSession(
    farmId: string, 
    config: GoWildConfig
  ): Promise<GoWildSession> {
    const session: GoWildSession = {
      id: `gowild_${Date.now()}`,
      farmId,
      config,
      status: 'idle',
      explorationPath: {
        nodes: [],
        edges: [],
        startTime: new Date(),
        currentNodeId: '',
        discoveries: []
      },
      stats: {
        nodesExplored: 0,
        discoveriesMade: 0,
        backtrackCount: 0,
        averageCreativity: config.creativityLevel
      }
    };
    
    this.activeSession = session;
    await this.connectToBuilder();
    
    return session;
  }

  /**
   * Connect to the Builder orchestrator via WebSocket
   */
  private async connectToBuilder(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${this.wsUrl}/go-wild`);
      
      this.ws.onopen = () => {
        console.log('Connected to Builder for Go Wild mode');
        resolve();
      };
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };
      
      this.ws.onmessage = (event) => {
        this.handleBuilderMessage(JSON.parse(event.data));
      };
    });
  }

  /**
   * Start autonomous exploration
   */
  async startExploration(): Promise<void> {
    if (!this.activeSession) throw new Error('No active session');
    
    this.activeSession.status = 'exploring';
    this.activeSession.startTime = new Date();
    
    // Create initial exploration node
    const rootNode = this.createNode('Start exploration', 'idea', null);
    this.activeSession.explorationPath.nodes.push(rootNode);
    this.activeSession.explorationPath.currentNodeId = rootNode.id;
    
    // Send start command to Builder
    this.sendToBuilder({
      type: 'start_exploration',
      sessionId: this.activeSession.id,
      config: this.activeSession.config
    });
    
    // Begin exploration loop
    this.exploreNext();
  }

  /**
   * Main exploration loop
   */
  private async exploreNext(): Promise<void> {
    if (!this.activeSession || this.activeSession.status !== 'exploring') {
      return;
    }
    
    const currentNode = this.getCurrentNode();
    if (!currentNode) return;
    
    // Determine next exploration direction based on creativity level
    const creativity = this.activeSession.config.creativityLevel;
    const shouldLeap = Math.random() * 100 < creativity;
    
    if (shouldLeap && this.canMakeCreativeLeap()) {
      await this.makeCreativeLeap(currentNode);
    } else {
      await this.exploreLogically(currentNode);
    }
    
    // Check for discoveries
    await this.checkForDiscoveries();
    
    // Update stats
    this.updateStats();
    
    // Continue exploration after a delay
    setTimeout(() => this.exploreNext(), 1000);
  }

  /**
   * Make a creative leap to explore unconventional solutions
   */
  private async makeCreativeLeap(currentNode: ExplorationNode): Promise<void> {
    const leapPrompt = this.generateCreativePrompt(currentNode);
    
    // Send creative exploration request to Builder
    this.sendToBuilder({
      type: 'creative_leap',
      sessionId: this.activeSession!.id,
      nodeId: currentNode.id,
      prompt: leapPrompt,
      constraints: this.activeSession!.config.boundaries
    });
    
    // Create a new branch node
    const leapNode = this.createNode(
      `Creative leap from: ${currentNode.label}`,
      'branch',
      currentNode.id
    );
    
    this.addNode(leapNode);
    this.addEdge(currentNode.id, leapNode.id, 'leap');
  }

  /**
   * Explore logically from current position
   */
  private async exploreLogically(currentNode: ExplorationNode): Promise<void> {
    // Generate next logical steps
    const nextSteps = await this.generateNextSteps(currentNode);
    
    if (nextSteps.length === 0) {
      // Backtrack if no valid next steps
      this.backtrack();
      return;
    }
    
    // Choose best next step based on confidence and creativity
    const nextStep = this.selectNextStep(nextSteps);
    
    // Send exploration request to Builder
    this.sendToBuilder({
      type: 'explore_step',
      sessionId: this.activeSession!.id,
      nodeId: currentNode.id,
      step: nextStep
    });
    
    // Create new node
    const newNode = this.createNode(
      nextStep.description,
      'solution',
      currentNode.id
    );
    
    this.addNode(newNode);
    this.addEdge(currentNode.id, newNode.id, 'explore');
  }

  /**
   * Check current exploration state for discoveries
   */
  private async checkForDiscoveries(): Promise<void> {
    const currentNode = this.getCurrentNode();
    if (!currentNode) return;
    
    // Analyze node content for potential discoveries
    const discoveryPotential = this.analyzeDiscoveryPotential(currentNode);
    
    if (discoveryPotential > 0.7) {
      const discovery: Discovery = {
        id: `discovery_${Date.now()}`,
        nodeId: currentNode.id,
        title: this.generateDiscoveryTitle(currentNode),
        description: this.generateDiscoveryDescription(currentNode),
        impact: this.assessImpact(discoveryPotential),
        category: this.categorizeDiscovery(currentNode),
        timestamp: new Date(),
        saved: false
      };
      
      this.activeSession!.explorationPath.discoveries.push(discovery);
      this.activeSession!.stats.discoveriesMade++;
      
      // Notify about discovery
      this.sendToBuilder({
        type: 'discovery_made',
        sessionId: this.activeSession!.id,
        discovery
      });
    }
  }

  /**
   * Backtrack when exploration reaches dead end
   */
  private backtrack(): void {
    const currentNode = this.getCurrentNode();
    if (!currentNode || !currentNode.parentId) return;
    
    const parentNode = this.activeSession!.explorationPath.nodes.find(
      n => n.id === currentNode.parentId
    );
    
    if (parentNode) {
      this.activeSession!.explorationPath.currentNodeId = parentNode.id;
      this.activeSession!.stats.backtrackCount++;
      
      this.addEdge(currentNode.id, parentNode.id, 'backtrack');
    }
  }

  /**
   * Helper methods
   */
  
  private createNode(
    label: string, 
    type: ExplorationNode['type'], 
    parentId: string | null
  ): ExplorationNode {
    const node: ExplorationNode = {
      id: `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      label,
      type,
      timestamp: new Date(),
      agentId: 'autonomous_agent',
      parentId: parentId || undefined,
      children: [],
      content: '',
      confidence: Math.random() * 0.5 + 0.5,
      creativity: this.activeSession!.config.creativityLevel / 100,
      position: this.calculateNodePosition(parentId)
    };
    
    return node;
  }

  private addNode(node: ExplorationNode): void {
    this.activeSession!.explorationPath.nodes.push(node);
    this.activeSession!.explorationPath.currentNodeId = node.id;
    this.activeSession!.stats.nodesExplored++;
    
    if (node.parentId) {
      const parent = this.activeSession!.explorationPath.nodes.find(
        n => n.id === node.parentId
      );
      if (parent) {
        parent.children.push(node.id);
      }
    }
  }

  private addEdge(source: string, target: string, type: 'explore' | 'backtrack' | 'leap'): void {
    this.activeSession!.explorationPath.edges.push({
      source,
      target,
      weight: type === 'leap' ? 2 : 1,
      type
    });
  }

  private getCurrentNode(): ExplorationNode | null {
    if (!this.activeSession) return null;
    
    return this.activeSession.explorationPath.nodes.find(
      n => n.id === this.activeSession!.explorationPath.currentNodeId
    ) || null;
  }

  private canMakeCreativeLeap(): boolean {
    // Implement logic to determine if creative leap is appropriate
    const stats = this.activeSession!.stats;
    const recentBacktracks = stats.backtrackCount > stats.nodesExplored * 0.3;
    const lowDiscoveryRate = stats.discoveriesMade < stats.nodesExplored * 0.1;
    
    return recentBacktracks || lowDiscoveryRate;
  }

  private generateCreativePrompt(node: ExplorationNode): string {
    const templates = [
      `What if we approached "${node.label}" from a completely different angle?`,
      `Imagine combining "${node.label}" with an unrelated concept. What emerges?`,
      `If constraints didn't exist, how would we solve "${node.label}"?`,
      `What would the opposite approach to "${node.label}" look like?`
    ];
    
    return templates[Math.floor(Math.random() * templates.length)];
  }

  private async generateNextSteps(node: ExplorationNode): Promise<AutonomousTask[]> {
    // This would integrate with the task generator service
    // For now, return mock tasks
    return [
      {
        id: `task_${Date.now()}_1`,
        description: `Analyze implications of ${node.label}`,
        priority: 'medium',
        estimatedTime: 5,
        dependencies: [],
        context: { parentNode: node.id },
        creativityRequired: 30
      },
      {
        id: `task_${Date.now()}_2`,
        description: `Optimize approach for ${node.label}`,
        priority: 'high',
        estimatedTime: 10,
        dependencies: [],
        context: { parentNode: node.id },
        creativityRequired: 50
      }
    ];
  }

  private selectNextStep(steps: AutonomousTask[]): AutonomousTask {
    // Select based on creativity level and task requirements
    const creativityThreshold = this.activeSession!.config.creativityLevel;
    
    const viableSteps = steps.filter(
      step => step.creativityRequired <= creativityThreshold
    );
    
    // Sort by priority and select
    viableSteps.sort((a, b) => {
      const priorityWeight = { high: 3, medium: 2, low: 1 };
      return priorityWeight[b.priority] - priorityWeight[a.priority];
    });
    
    return viableSteps[0] || steps[0];
  }

  private calculateNodePosition(parentId: string | null): { x: number; y: number; z: number } {
    if (!parentId) {
      return { x: 0, y: 0, z: 0 };
    }
    
    const parent = this.activeSession!.explorationPath.nodes.find(n => n.id === parentId);
    if (!parent || !parent.position) {
      return { x: 0, y: 0, z: 0 };
    }
    
    // Calculate position based on parent and siblings
    const siblings = this.activeSession!.explorationPath.nodes.filter(
      n => n.parentId === parentId
    );
    
    const angle = (siblings.length * Math.PI) / 4;
    const radius = 100;
    
    return {
      x: parent.position.x + Math.cos(angle) * radius,
      y: parent.position.y + Math.sin(angle) * radius,
      z: parent.position.z + 50
    };
  }

  private analyzeDiscoveryPotential(node: ExplorationNode): number {
    // Analyze node for discovery potential
    let potential = node.confidence * 0.5;
    
    // Higher creativity nodes more likely to yield discoveries
    potential += node.creativity * 0.3;
    
    // Nodes further from root more likely to be novel
    const depth = this.getNodeDepth(node);
    potential += Math.min(depth / 10, 0.2);
    
    return Math.min(potential, 1);
  }

  private getNodeDepth(node: ExplorationNode): number {
    let depth = 0;
    let current = node;
    
    while (current.parentId) {
      depth++;
      current = this.activeSession!.explorationPath.nodes.find(
        n => n.id === current.parentId
      )!;
      if (!current) break;
    }
    
    return depth;
  }

  private generateDiscoveryTitle(node: ExplorationNode): string {
    const prefixes = ['Novel approach to', 'Optimization for', 'Alternative solution for', 'Breakthrough in'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    return `${prefix} ${node.label}`;
  }

  private generateDiscoveryDescription(node: ExplorationNode): string {
    return `Through creative exploration, discovered a ${
      node.creativity > 0.7 ? 'highly innovative' : 'practical'
    } approach that ${
      node.confidence > 0.8 ? 'shows strong potential' : 'warrants further investigation'
    } for improving the current implementation.`;
  }

  private assessImpact(potential: number): 'low' | 'medium' | 'high' {
    if (potential > 0.9) return 'high';
    if (potential > 0.75) return 'medium';
    return 'low';
  }

  private categorizeDiscovery(node: ExplorationNode): string {
    const categories = [
      'Performance Optimization',
      'Architecture Enhancement',
      'User Experience',
      'Algorithm Improvement',
      'Security Enhancement',
      'Code Quality'
    ];
    
    // Simple categorization based on node content
    // In real implementation, this would analyze the actual content
    return categories[Math.floor(Math.random() * categories.length)];
  }

  private updateStats(): void {
    const nodes = this.activeSession!.explorationPath.nodes;
    const totalCreativity = nodes.reduce((sum, node) => sum + node.creativity, 0);
    this.activeSession!.stats.averageCreativity = (totalCreativity / nodes.length) * 100;
  }

  private sendToBuilder(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private handleBuilderMessage(message: any): void {
    switch (message.type) {
      case 'node_result':
        this.updateNodeContent(message.nodeId, message.content);
        break;
      case 'exploration_complete':
        this.completeExploration();
        break;
      case 'error':
        console.error('Builder error:', message.error);
        break;
    }
  }

  private updateNodeContent(nodeId: string, content: string): void {
    const node = this.activeSession!.explorationPath.nodes.find(n => n.id === nodeId);
    if (node) {
      node.content = content;
    }
  }

  private completeExploration(): void {
    if (this.activeSession) {
      this.activeSession.status = 'completed';
      this.activeSession.endTime = new Date();
    }
  }

  /**
   * Public methods for external control
   */
  
  pauseExploration(): void {
    if (this.activeSession) {
      this.activeSession.status = 'paused';
    }
  }

  resumeExploration(): void {
    if (this.activeSession && this.activeSession.status === 'paused') {
      this.activeSession.status = 'exploring';
      this.exploreNext();
    }
  }

  stopExploration(): void {
    this.completeExploration();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  getSession(): GoWildSession | null {
    return this.activeSession;
  }
}