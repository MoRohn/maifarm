import { EventEmitter } from 'events';
import { WebSocket } from 'ws';
import { createClient } from 'redis';
import { highAvailability } from '../../src/services/highAvailability';

interface HANode {
  id: string;
  host: string;
  port: number;
  role: 'leader' | 'follower';
  status: 'active' | 'standby' | 'failed';
  lastSeen: number;
  metadata: {
    version: string;
    capabilities: string[];
    load: number;
    memory: number;
    cpu: number;
  };
}

interface HeartbeatMessage {
  nodeId: string;
  timestamp: number;
  status: 'active' | 'standby' | 'failed';
  metrics: {
    cpu: number;
    memory: number;
    connections: number;
    requestsPerSecond: number;
  };
}

interface ElectionState {
  term: number;
  votedFor: string | null;
  votes: Set<string>;
  electionTimeout: NodeJS.Timeout | null;
}

export class HACoordinator extends EventEmitter {
  private nodeId: string;
  private nodes: Map<string, HANode> = new Map();
  private redis: ReturnType<typeof createClient> | null = null;
  private wsConnections: Map<string, WebSocket> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private electionState: ElectionState = {
    term: 0,
    votedFor: null,
    votes: new Set(),
    electionTimeout: null
  };
  private isLeader: boolean = false;
  private currentLeader: string | null = null;

  constructor(nodeId: string) {
    super();
    this.nodeId = nodeId;
  }

  async initialize(config: {
    redisUrl?: string;
    heartbeatInterval?: number;
    electionTimeout?: number;
  }): Promise<void> {
    // Initialize Redis for distributed coordination
    if (config.redisUrl) {
      this.redis = createClient({ url: config.redisUrl });
      
      this.redis.on('error', (err) => {
        console.error('Redis error:', err);
        this.emit('redis:error', err);
      });

      await this.redis.connect();
      
      // Subscribe to coordination channels
      await this.subscribeToChannels();
    }

    // Register this node
    await this.registerSelf();

    // Start heartbeat
    this.startHeartbeat(config.heartbeatInterval || 5000);

    // Start election timeout
    this.resetElectionTimeout(config.electionTimeout || 15000);

    // Register with high availability service
    await this.registerWithHAService();
  }

  private async registerSelf(): Promise<void> {
    const node: HANode = {
      id: this.nodeId,
      host: process.env.HOST || 'localhost',
      port: parseInt(process.env.PORT || '3000'),
      role: 'follower',
      status: 'active',
      lastSeen: Date.now(),
      metadata: {
        version: process.env.npm_package_version || '1.0.0',
        capabilities: ['api', 'websocket', 'monitoring'],
        load: 0,
        memory: process.memoryUsage().heapUsed / 1024 / 1024,
        cpu: 0
      }
    };

    this.nodes.set(this.nodeId, node);
    
    // Announce presence
    await this.broadcastMessage('node:join', {
      node,
      timestamp: Date.now()
    });
  }

  private async registerWithHAService(): Promise<void> {
    await highAvailability.registerNode({
      id: this.nodeId,
      host: process.env.HOST || 'localhost',
      port: parseInt(process.env.PORT || '3000'),
      status: 'active',
      role: this.isLeader ? 'primary' : 'secondary',
      load: 0,
      capacity: 100,
      version: process.env.npm_package_version || '1.0.0'
    });
  }

  private async subscribeToChannels(): Promise<void> {
    if (!this.redis) return;

    const subscriber = this.redis.duplicate();
    await subscriber.connect();

    // Subscribe to coordination channels
    await subscriber.subscribe('ha:heartbeat', (message) => {
      this.handleHeartbeat(JSON.parse(message));
    });

    await subscriber.subscribe('ha:election', (message) => {
      this.handleElectionMessage(JSON.parse(message));
    });

    await subscriber.subscribe('ha:coordination', (message) => {
      this.handleCoordinationMessage(JSON.parse(message));
    });
  }

  private startHeartbeat(interval: number): void {
    this.heartbeatInterval = setInterval(async () => {
      const metrics = await this.collectMetrics();
      
      const heartbeat: HeartbeatMessage = {
        nodeId: this.nodeId,
        timestamp: Date.now(),
        status: 'active',
        metrics
      };

      // Update own node info
      const node = this.nodes.get(this.nodeId);
      if (node) {
        node.lastSeen = Date.now();
        node.metadata.cpu = metrics.cpu;
        node.metadata.memory = metrics.memory;
        node.metadata.load = metrics.connections;
      }

      // Broadcast heartbeat
      await this.broadcastMessage('ha:heartbeat', heartbeat);

      // Check for failed nodes
      this.checkNodeHealth();
    }, interval);
  }

  private async collectMetrics(): Promise<HeartbeatMessage['metrics']> {
    const usage = process.cpuUsage();
    const memory = process.memoryUsage();
    
    return {
      cpu: (usage.user + usage.system) / 1000000, // Convert to seconds
      memory: memory.heapUsed / 1024 / 1024, // Convert to MB
      connections: this.wsConnections.size,
      requestsPerSecond: 0 // This would be tracked separately
    };
  }

  private handleHeartbeat(heartbeat: HeartbeatMessage): void {
    const node = this.nodes.get(heartbeat.nodeId);
    
    if (!node) {
      // New node discovered
      this.emit('node:discovered', heartbeat.nodeId);
      return;
    }

    // Update node status
    node.lastSeen = heartbeat.timestamp;
    node.status = heartbeat.status;
    node.metadata.cpu = heartbeat.metrics.cpu;
    node.metadata.memory = heartbeat.metrics.memory;
    node.metadata.load = heartbeat.metrics.connections;

    // Update HA service
    highAvailability.updateNodeStatus(
      heartbeat.nodeId,
      heartbeat.status,
      heartbeat.metrics.connections
    );
  }

  private checkNodeHealth(): void {
    const now = Date.now();
    const timeout = 30000; // 30 seconds

    for (const [nodeId, node] of this.nodes) {
      if (nodeId === this.nodeId) continue;

      if (now - node.lastSeen > timeout && node.status !== 'failed') {
        node.status = 'failed';
        this.emit('node:failed', nodeId);

        // If failed node was leader, start election
        if (nodeId === this.currentLeader) {
          this.startElection();
        }
      }
    }
  }

  // Raft-inspired leader election
  private resetElectionTimeout(timeout: number): void {
    if (this.electionState.electionTimeout) {
      clearTimeout(this.electionState.electionTimeout);
    }

    // Randomize timeout to prevent split votes
    const randomTimeout = timeout + Math.random() * timeout;

    this.electionState.electionTimeout = setTimeout(() => {
      if (!this.isLeader) {
        this.startElection();
      }
    }, randomTimeout);
  }

  private async startElection(): Promise<void> {
    console.log(`[${this.nodeId}] Starting election for term ${this.electionState.term + 1}`);

    // Increment term
    this.electionState.term++;
    this.electionState.votedFor = this.nodeId;
    this.electionState.votes.clear();
    this.electionState.votes.add(this.nodeId);

    // Request votes from other nodes
    await this.broadcastMessage('ha:election', {
      type: 'requestVote',
      candidateId: this.nodeId,
      term: this.electionState.term,
      lastLogIndex: 0, // Simplified - would track log in production
      lastLogTerm: 0
    });

    // Wait for votes
    setTimeout(() => {
      this.checkElectionResult();
    }, 5000);
  }

  private async handleElectionMessage(message: any): Promise<void> {
    switch (message.type) {
      case 'requestVote':
        await this.handleVoteRequest(message);
        break;
      case 'vote':
        this.handleVote(message);
        break;
      case 'leaderAnnouncement':
        this.handleLeaderAnnouncement(message);
        break;
    }
  }

  private async handleVoteRequest(request: any): Promise<void> {
    // If we've already voted in this term, reject
    if (request.term < this.electionState.term ||
        (request.term === this.electionState.term && 
         this.electionState.votedFor !== null &&
         this.electionState.votedFor !== request.candidateId)) {
      return;
    }

    // Vote for the candidate
    this.electionState.term = request.term;
    this.electionState.votedFor = request.candidateId;

    await this.broadcastMessage('ha:election', {
      type: 'vote',
      voterId: this.nodeId,
      candidateId: request.candidateId,
      term: request.term,
      granted: true
    });
  }

  private handleVote(vote: any): void {
    if (vote.candidateId === this.nodeId && 
        vote.term === this.electionState.term &&
        vote.granted) {
      this.electionState.votes.add(vote.voterId);
    }
  }

  private checkElectionResult(): void {
    const totalNodes = this.nodes.size;
    const votesReceived = this.electionState.votes.size;
    const majority = Math.floor(totalNodes / 2) + 1;

    console.log(`[${this.nodeId}] Election result: ${votesReceived}/${totalNodes} votes (need ${majority})`);

    if (votesReceived >= majority) {
      this.becomeLeader();
    } else {
      // Election failed, reset timeout
      this.resetElectionTimeout(15000);
    }
  }

  private async becomeLeader(): Promise<void> {
    console.log(`[${this.nodeId}] Became leader for term ${this.electionState.term}`);

    this.isLeader = true;
    this.currentLeader = this.nodeId;

    // Update own role
    const node = this.nodes.get(this.nodeId);
    if (node) {
      node.role = 'leader';
    }

    // Announce leadership
    await this.broadcastMessage('ha:election', {
      type: 'leaderAnnouncement',
      leaderId: this.nodeId,
      term: this.electionState.term
    });

    // Update HA service
    await highAvailability.updateNodeStatus(this.nodeId, 'active');

    this.emit('leader:elected', this.nodeId);
  }

  private handleLeaderAnnouncement(announcement: any): void {
    if (announcement.term >= this.electionState.term) {
      this.isLeader = false;
      this.currentLeader = announcement.leaderId;
      this.electionState.term = announcement.term;
      
      // Update leader node role
      const leaderNode = this.nodes.get(announcement.leaderId);
      if (leaderNode) {
        leaderNode.role = 'leader';
      }

      // Reset election timeout
      this.resetElectionTimeout(15000);

      this.emit('leader:changed', announcement.leaderId);
    }
  }

  private async handleCoordinationMessage(message: any): Promise<void> {
    // Handle various coordination messages
    switch (message.type) {
      case 'node:join':
        await this.handleNodeJoin(message.data);
        break;
      case 'node:leave':
        this.handleNodeLeave(message.data);
        break;
      case 'state:sync':
        await this.handleStateSync(message.data);
        break;
    }
  }

  private async handleNodeJoin(data: any): Promise<void> {
    const { node } = data;
    
    if (node.id !== this.nodeId) {
      this.nodes.set(node.id, node);
      this.emit('node:joined', node);

      // If we're the leader, send state sync
      if (this.isLeader) {
        await this.sendStateSync(node.id);
      }
    }
  }

  private handleNodeLeave(data: any): void {
    const { nodeId } = data;
    
    this.nodes.delete(nodeId);
    this.wsConnections.delete(nodeId);
    
    this.emit('node:left', nodeId);

    // If leader left, start election
    if (nodeId === this.currentLeader) {
      this.startElection();
    }
  }

  private async sendStateSync(targetNodeId: string): Promise<void> {
    const state = {
      nodes: Array.from(this.nodes.values()),
      leader: this.currentLeader,
      term: this.electionState.term
    };

    await this.sendMessage(targetNodeId, 'state:sync', state);
  }

  private async handleStateSync(state: any): Promise<void> {
    // Update local state with received state
    this.nodes.clear();
    for (const node of state.nodes) {
      this.nodes.set(node.id, node);
    }

    this.currentLeader = state.leader;
    this.electionState.term = state.term;

    this.emit('state:synced');
  }

  private async broadcastMessage(channel: string, data: any): Promise<void> {
    if (this.redis) {
      await this.redis.publish(channel, JSON.stringify(data));
    }

    // Also send via WebSocket to connected nodes
    const message = JSON.stringify({ channel, data });
    for (const ws of this.wsConnections.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  private async sendMessage(nodeId: string, type: string, data: any): Promise<void> {
    const ws = this.wsConnections.get(nodeId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, data }));
    }
  }

  // WebSocket connection management
  public handleWebSocketConnection(ws: WebSocket, nodeId: string): void {
    this.wsConnections.set(nodeId, ws);

    ws.on('close', () => {
      this.wsConnections.delete(nodeId);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for node ${nodeId}:`, error);
      this.wsConnections.delete(nodeId);
    });
  }

  // Public API
  public getClusterState(): {
    nodeId: string;
    isLeader: boolean;
    currentLeader: string | null;
    term: number;
    nodes: HANode[];
  } {
    return {
      nodeId: this.nodeId,
      isLeader: this.isLeader,
      currentLeader: this.currentLeader,
      term: this.electionState.term,
      nodes: Array.from(this.nodes.values())
    };
  }

  public async shutdown(): Promise<void> {
    // Announce departure
    await this.broadcastMessage('ha:coordination', {
      type: 'node:leave',
      data: { nodeId: this.nodeId }
    });

    // Clean up
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.electionState.electionTimeout) {
      clearTimeout(this.electionState.electionTimeout);
    }

    if (this.redis) {
      await this.redis.quit();
    }

    for (const ws of this.wsConnections.values()) {
      ws.close();
    }

    // Unregister from HA service
    await highAvailability.unregisterNode(this.nodeId);

    this.emit('shutdown');
  }
}

// Singleton instance
let coordinatorInstance: HACoordinator | null = null;

export function getHACoordinator(nodeId?: string): HACoordinator {
  if (!coordinatorInstance) {
    coordinatorInstance = new HACoordinator(
      nodeId || process.env.NODE_ID || `node_${Date.now()}`
    );
  }
  return coordinatorInstance;
}