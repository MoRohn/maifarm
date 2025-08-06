import { v4 as uuidv4 } from 'uuid';
import { GoWildSession, Discovery } from '../../src/types/goWild';
import { Harvest, HarvestResult, HarvestInsight } from '../../src/types/harvest';
import { harvestService } from './harvestService';
import { TmuxHelper } from './tmuxHelper';
import { logger } from '../utils/logger';
import { WebSocketManager } from '../websocket/websocketManager';

export class GoWildHarvestIntegration {
  /**
   * Creates a harvest record when Go Wild exploration completes
   */
  async createHarvestFromExploration(session: GoWildSession): Promise<Harvest> {
    try {
      logger.info(`Creating harvest from Go Wild session ${session.id}`);
      
      // Start harvest with Go Wild specific metadata
      const harvest = await harvestService.startHarvest(
        session.farmId,
        `Go Wild - ${session.farmId}`,
        'go-wild-system'
      );

      // Convert discoveries to harvest results
      const results = await this.convertDiscoveriesToResults(session.explorationPath.discoveries);
      
      // Generate insights from exploration
      const insights = await this.generateInsightsFromExploration(session);
      
      // Add artifacts from exploration
      const artifacts = await this.collectExplorationArtifacts(session);

      // Update harvest with Go Wild data
      harvest.results.push(...results);
      harvest.insights.push(...insights);
      harvest.artifacts.push(...artifacts);
      
      // Calculate quality metrics
      harvest.quality = {
        completeness: this.calculateCompleteness(session),
        accuracy: this.calculateAccuracy(session),
        relevance: this.calculateRelevance(session),
        overallScore: 0
      };
      
      harvest.quality.overallScore = (
        harvest.quality.completeness +
        harvest.quality.accuracy +
        harvest.quality.relevance
      ) / 3;

      // Update summary
      harvest.summary = {
        description: `Exploration completed with ${session.stats.nodesExplored} nodes explored and ${session.stats.discoveriesMade} discoveries made`,
        totalTasks: session.stats.nodesExplored,
        completedTasks: session.stats.nodesExplored,
        failedTasks: 0,
        duration: Math.floor((Date.now() - session.startTime.getTime()) / 1000),
        efficiency: this.calculateEfficiency(session)
      };

      // Mark harvest as ready
      harvest.status = 'ready';
      harvest.completedAt = new Date();

      // Save harvest
      await harvestService.updateHarvest(harvest.id, harvest);

      // Emit WebSocket events
      WebSocketManager.broadcast('harvest:ready', {
        harvestId: harvest.id,
        farmId: session.farmId,
        sessionId: session.id,
        stats: session.stats,
        quality: harvest.quality
      });

      WebSocketManager.broadcast('gowild:harvest-created', {
        sessionId: session.id,
        harvestId: harvest.id,
        discoveries: session.explorationPath.discoveries.length,
        nodes: session.stats.nodesExplored
      });

      logger.info(`Harvest ${harvest.id} created from Go Wild session ${session.id}`);
      return harvest;
    } catch (error) {
      logger.error('Failed to create harvest from exploration:', error);
      throw error;
    }
  }

  /**
   * Auto-saves high impact discoveries
   */
  async autoSaveDiscoveries(session: GoWildSession): Promise<number> {
    let savedCount = 0;
    
    for (const discovery of session.explorationPath.discoveries) {
      if (discovery.impact === 'high' && !discovery.saved) {
        try {
          await this.saveDiscovery(session.id, discovery);
          discovery.saved = true;
          savedCount++;
        } catch (error) {
          logger.error(`Failed to save discovery ${discovery.id}:`, error);
        }
      }
    }

    if (savedCount > 0) {
      WebSocketManager.broadcast('gowild:discoveries-saved', {
        sessionId: session.id,
        count: savedCount
      });
    }

    return savedCount;
  }

  /**
   * Creates tmux session for Go Wild real agent support
   */
  async createTmuxSessionForExploration(sessionId: string, agentCount: number = 3): Promise<boolean> {
    try {
      const sessionName = `gowild-${sessionId.substring(0, 8)}`;
      
      // Create main tmux session
      const created = await TmuxHelper.createSession(sessionName, 'exploration');
      if (!created) {
        throw new Error('Failed to create tmux session');
      }

      // Create panes for each agent
      for (let i = 1; i < agentCount; i++) {
        await TmuxHelper.splitPaneHorizontal(sessionName);
        await TmuxHelper.setPaneTitle(sessionName, `Agent ${i + 1}`, i);
      }

      // Send initial commands to each pane
      for (let i = 0; i < agentCount; i++) {
        await TmuxHelper.sendCommand(
          sessionName,
          `echo "Go Wild Agent ${i + 1} initialized for session ${sessionId}"`,
          i
        );
      }

      logger.info(`Created tmux session ${sessionName} with ${agentCount} agents`);
      
      // Notify via WebSocket
      WebSocketManager.broadcast('gowild:tmux-created', {
        sessionId,
        sessionName,
        agentCount
      });

      return true;
    } catch (error) {
      logger.error('Failed to create tmux session for exploration:', error);
      return false;
    }
  }

  /**
   * Captures output from tmux session
   */
  async captureTmuxOutput(sessionId: string): Promise<string[]> {
    const sessionName = `gowild-${sessionId.substring(0, 8)}`;
    const outputs: string[] = [];
    
    try {
      const panes = await TmuxHelper.listPanes(sessionName);
      
      for (const pane of panes) {
        const output = await TmuxHelper.capturePane(sessionName, 1000, pane.paneIndex);
        outputs.push(output);
      }
    } catch (error) {
      logger.error('Failed to capture tmux output:', error);
    }

    return outputs;
  }

  /**
   * Cleans up tmux session after exploration
   */
  async cleanupTmuxSession(sessionId: string): Promise<void> {
    const sessionName = `gowild-${sessionId.substring(0, 8)}`;
    try {
      await TmuxHelper.killSession(sessionName);
      logger.info(`Cleaned up tmux session ${sessionName}`);
    } catch (error) {
      logger.error('Failed to cleanup tmux session:', error);
    }
  }

  private async convertDiscoveriesToResults(discoveries: Discovery[]): Promise<HarvestResult[]> {
    return discoveries.map(discovery => ({
      id: uuidv4(),
      agentId: discovery.metadata?.agentId || 'go-wild-system',
      timestamp: discovery.timestamp,
      content: discovery.description,
      type: 'discovery',
      metadata: {
        title: discovery.title,
        impact: discovery.impact,
        category: discovery.category,
        confidence: discovery.metadata?.confidence || 0,
        saved: discovery.saved
      }
    }));
  }

  private async generateInsightsFromExploration(session: GoWildSession): Promise<HarvestInsight[]> {
    const insights: HarvestInsight[] = [];

    // Creativity level insight
    insights.push({
      id: uuidv4(),
      type: 'pattern',
      title: 'Exploration Creativity Analysis',
      description: `The exploration used an average creativity level of ${session.stats.averageCreativity}%, which ${
        session.stats.averageCreativity > 70 ? 'encouraged diverse exploration paths' : 'maintained focused exploration'
      }`,
      confidence: 0.85,
      impact: session.stats.averageCreativity > 70 ? 'high' : 'medium',
      recommendations: [
        session.stats.averageCreativity > 70 
          ? 'High creativity led to diverse discoveries'
          : 'Consider increasing creativity for more innovative results'
      ]
    });

    // Discovery rate insight
    const discoveryRate = session.stats.discoveriesMade / Math.max(session.stats.nodesExplored, 1);
    insights.push({
      id: uuidv4(),
      type: 'performance',
      title: 'Discovery Efficiency',
      description: `Achieved ${(discoveryRate * 100).toFixed(1)}% discovery rate (${session.stats.discoveriesMade} discoveries from ${session.stats.nodesExplored} nodes)`,
      confidence: 0.9,
      impact: discoveryRate > 0.2 ? 'high' : 'medium',
      recommendations: [
        discoveryRate > 0.2
          ? 'Excellent discovery rate achieved'
          : 'Consider adjusting exploration parameters for better discovery rate'
      ]
    });

    // Backtracking insight
    if (session.stats.backtrackCount > 0) {
      insights.push({
        id: uuidv4(),
        type: 'anomaly',
        title: 'Exploration Backtracking',
        description: `The exploration backtracked ${session.stats.backtrackCount} times, indicating boundary constraints or dead ends`,
        confidence: 0.75,
        impact: 'low',
        recommendations: [
          'Review boundary settings to reduce unnecessary backtracking',
          'Consider expanding allowed exploration paths'
        ]
      });
    }

    return insights;
  }

  private async collectExplorationArtifacts(session: GoWildSession): Promise<any[]> {
    return [
      {
        id: uuidv4(),
        type: 'exploration-graph',
        name: 'Exploration Path Visualization',
        format: 'json',
        size: JSON.stringify(session.explorationPath).length,
        data: session.explorationPath
      },
      {
        id: uuidv4(),
        type: 'statistics',
        name: 'Exploration Statistics',
        format: 'json',
        size: JSON.stringify(session.stats).length,
        data: session.stats
      },
      {
        id: uuidv4(),
        type: 'configuration',
        name: 'Exploration Configuration',
        format: 'json',
        size: JSON.stringify(session.config).length,
        data: session.config
      }
    ];
  }

  private calculateCompleteness(session: GoWildSession): number {
    // Calculate based on exploration coverage
    const targetNodes = session.config.explorationDepth * 10;
    const completeness = Math.min(session.stats.nodesExplored / targetNodes, 1) * 100;
    return Math.round(completeness);
  }

  private calculateAccuracy(session: GoWildSession): number {
    // Calculate based on successful discoveries vs failed attempts
    const successRate = session.stats.discoveriesMade > 0
      ? (session.stats.discoveriesMade / session.stats.nodesExplored) * 100
      : 0;
    return Math.min(Math.round(successRate * 2), 100); // Scale up since discoveries are rare
  }

  private calculateRelevance(session: GoWildSession): number {
    // Calculate based on high-impact discoveries
    const highImpactCount = session.explorationPath.discoveries.filter(d => d.impact === 'high').length;
    const relevance = session.stats.discoveriesMade > 0
      ? (highImpactCount / session.stats.discoveriesMade) * 100
      : 0;
    return Math.round(relevance);
  }

  private calculateEfficiency(session: GoWildSession): number {
    // Calculate efficiency based on discoveries per minute
    const durationMinutes = Math.max((Date.now() - session.startTime.getTime()) / 60000, 1);
    const discoveriesPerMinute = session.stats.discoveriesMade / durationMinutes;
    return Math.min(Math.round(discoveriesPerMinute * 20), 100); // Scale to percentage
  }

  private async saveDiscovery(sessionId: string, discovery: Discovery): Promise<void> {
    // Implementation for saving discovery to database
    // This would typically save to a discoveries table
    logger.info(`Saving discovery ${discovery.id} from session ${sessionId}`);
    // Add database save logic here
  }
}

export const goWildHarvestIntegration = new GoWildHarvestIntegration();