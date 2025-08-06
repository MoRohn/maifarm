import { Socket } from 'socket.io';
import { InfogSocketServer } from './infogSocketServer';
import { stateManager } from './stateManager';

export class AgentEventHandlers {
  registerHandlers(socket: Socket, server: InfogSocketServer): void {
    const agentId = socket.data.agentId;
    
    // Agent lifecycle events
    this.registerLifecycleHandlers(socket, server, agentId);
    
    // Data collection specific handlers (Agent 0)
    this.registerDataCollectionHandlers(socket, server, agentId);
    
    // Content analysis specific handlers (Agent 1)
    this.registerContentAnalysisHandlers(socket, server, agentId);
    
    // Design generation specific handlers (Agent 2)
    this.registerDesignGenerationHandlers(socket, server, agentId);
    
    // Output assembly specific handlers (Agent 3)
    this.registerOutputAssemblyHandlers(socket, server, agentId);
    
    // Shared coordination handlers
    this.registerCoordinationHandlers(socket, server, agentId);
  }

  private registerLifecycleHandlers(socket: Socket, server: InfogSocketServer, agentId: string): void {
    // Agent initialization
    socket.on('agent:initialize', (data: { agentType: string; capabilities: string[] }) => {
      console.log(`[AgentHandler] Agent ${agentId} initialized as ${data.agentType}`);
      
      stateManager.updateAgentState(agentId, {
        status: 'idle',
        currentTask: 'initialized',
        lastUpdate: new Date().toISOString()
      });
      
      server.broadcast('agent:initialized', {
        agentId,
        agentType: data.agentType,
        capabilities: data.capabilities,
        timestamp: new Date().toISOString()
      });
    });

    // Agent ready
    socket.on('agent:ready', () => {
      stateManager.updateAgentState(agentId, {
        status: 'ready',
        currentTask: 'waiting for task',
        lastUpdate: new Date().toISOString()
      });
      
      server.broadcast('agent:ready', { agentId });
    });

    // Agent shutdown
    socket.on('agent:shutdown', (reason: string) => {
      console.log(`[AgentHandler] Agent ${agentId} shutting down: ${reason}`);
      
      stateManager.updateAgentState(agentId, {
        status: 'shutdown',
        currentTask: 'offline',
        lastUpdate: new Date().toISOString()
      });
      
      server.broadcast('agent:shutdown', { agentId, reason });
    });
  }

  private registerDataCollectionHandlers(socket: Socket, server: InfogSocketServer, agentId: string): void {
    // News API fetch started
    socket.on('data:fetch_started', (data: { sources: string[]; keywords: string[] }) => {
      console.log(`[DataCollection] Fetch started by ${agentId}`, data);
      
      server.broadcast('data:collection_started', {
        agentId,
        sources: data.sources,
        keywords: data.keywords,
        timestamp: new Date().toISOString()
      });
    });

    // Article found
    socket.on('data:article_found', (data: { source: string; title: string; url: string }) => {
      server.broadcast('data:article_discovered', {
        agentId,
        article: data,
        timestamp: new Date().toISOString()
      });
    });

    // RSS feed parsed
    socket.on('data:rss_parsed', (data: { feedUrl: string; itemCount: number }) => {
      server.broadcast('data:feed_processed', {
        agentId,
        feedUrl: data.feedUrl,
        itemCount: data.itemCount,
        timestamp: new Date().toISOString()
      });
    });

    // Duplicate detected
    socket.on('data:duplicate_detected', (count: number) => {
      server.broadcast('data:duplicates_found', {
        agentId,
        duplicateCount: count,
        timestamp: new Date().toISOString()
      });
    });

    // Data validation progress
    socket.on('data:validation_progress', (data: { validated: number; total: number }) => {
      const progress = (data.validated / data.total) * 100;
      
      stateManager.updatePipelineStage('data_collection', {
        progress,
        status: 'in_progress'
      });
      
      server.broadcast('data:validation_update', {
        agentId,
        progress,
        validated: data.validated,
        total: data.total
      });
    });
  }

  private registerContentAnalysisHandlers(socket: Socket, server: InfogSocketServer, agentId: string): void {
    // Analysis started
    socket.on('analysis:started', (data: { articleCount: number; techniques: string[] }) => {
      console.log(`[ContentAnalysis] Analysis started by ${agentId}`, data);
      
      server.broadcast('analysis:initiated', {
        agentId,
        articleCount: data.articleCount,
        techniques: data.techniques,
        timestamp: new Date().toISOString()
      });
    });

    // Theme extracted
    socket.on('analysis:theme_found', (data: { theme: string; frequency: number; sentiment: number }) => {
      server.broadcast('analysis:theme_extracted', {
        agentId,
        theme: data.theme,
        frequency: data.frequency,
        sentiment: data.sentiment,
        timestamp: new Date().toISOString()
      });
    });

    // Entity recognized
    socket.on('analysis:entity_found', (data: { entity: string; type: string; mentions: number }) => {
      server.broadcast('analysis:entity_recognized', {
        agentId,
        entity: data.entity,
        entityType: data.type,
        mentionCount: data.mentions,
        timestamp: new Date().toISOString()
      });
    });

    // Sentiment analysis complete
    socket.on('analysis:sentiment_complete', (data: { overall: number; positive: number; negative: number; neutral: number }) => {
      server.broadcast('analysis:sentiment_analyzed', {
        agentId,
        sentimentData: data,
        timestamp: new Date().toISOString()
      });
    });

    // Analysis progress
    socket.on('analysis:progress', (data: { analyzed: number; total: number; currentPhase: string }) => {
      const progress = (data.analyzed / data.total) * 100;
      
      stateManager.updatePipelineStage('content_analysis', {
        progress,
        status: 'in_progress'
      });
      
      server.broadcast('analysis:progress_update', {
        agentId,
        progress,
        currentPhase: data.currentPhase,
        analyzed: data.analyzed,
        total: data.total
      });
    });
  }

  private registerDesignGenerationHandlers(socket: Socket, server: InfogSocketServer, agentId: string): void {
    // Design started
    socket.on('design:started', (data: { templateType: string; dataPoints: number }) => {
      console.log(`[DesignGeneration] Design started by ${agentId}`, data);
      
      server.broadcast('design:initiated', {
        agentId,
        templateType: data.templateType,
        dataPoints: data.dataPoints,
        timestamp: new Date().toISOString()
      });
    });

    // Template selected
    socket.on('design:template_selected', (data: { templateId: string; templateName: string }) => {
      server.broadcast('design:template_chosen', {
        agentId,
        templateId: data.templateId,
        templateName: data.templateName,
        timestamp: new Date().toISOString()
      });
    });

    // Chart created
    socket.on('design:chart_created', (data: { chartType: string; dataSeriesCount: number }) => {
      server.broadcast('design:visualization_created', {
        agentId,
        chartType: data.chartType,
        dataSeriesCount: data.dataSeriesCount,
        timestamp: new Date().toISOString()
      });
    });

    // Color scheme applied
    socket.on('design:colors_applied', (data: { primary: string; secondary: string; accent: string }) => {
      server.broadcast('design:styling_applied', {
        agentId,
        colorScheme: data,
        timestamp: new Date().toISOString()
      });
    });

    // Design progress
    socket.on('design:progress', (data: { elementsCreated: number; totalElements: number }) => {
      const progress = (data.elementsCreated / data.totalElements) * 100;
      
      stateManager.updatePipelineStage('design_generation', {
        progress,
        status: 'in_progress'
      });
      
      server.broadcast('design:progress_update', {
        agentId,
        progress,
        elementsCreated: data.elementsCreated,
        totalElements: data.totalElements
      });
    });
  }

  private registerOutputAssemblyHandlers(socket: Socket, server: InfogSocketServer, agentId: string): void {
    // Assembly started
    socket.on('assembly:started', (data: { formats: string[]; resolution: string }) => {
      console.log(`[OutputAssembly] Assembly started by ${agentId}`, data);
      
      server.broadcast('assembly:initiated', {
        agentId,
        targetFormats: data.formats,
        resolution: data.resolution,
        timestamp: new Date().toISOString()
      });
    });

    // Rendering progress
    socket.on('assembly:rendering', (data: { format: string; progress: number }) => {
      server.broadcast('assembly:render_progress', {
        agentId,
        format: data.format,
        renderProgress: data.progress,
        timestamp: new Date().toISOString()
      });
    });

    // Format completed
    socket.on('assembly:format_complete', (data: { format: string; fileSize: number; filePath: string }) => {
      server.broadcast('assembly:format_ready', {
        agentId,
        format: data.format,
        fileSize: data.fileSize,
        filePath: data.filePath,
        timestamp: new Date().toISOString()
      });
    });

    // Quality check
    socket.on('assembly:quality_check', (data: { format: string; passed: boolean; issues?: string[] }) => {
      server.broadcast('assembly:quality_validated', {
        agentId,
        format: data.format,
        qualityPassed: data.passed,
        issues: data.issues || [],
        timestamp: new Date().toISOString()
      });
    });

    // Assembly progress
    socket.on('assembly:progress', (data: { completed: number; total: number; currentFormat: string }) => {
      const progress = (data.completed / data.total) * 100;
      
      stateManager.updatePipelineStage('output_assembly', {
        progress,
        status: 'in_progress'
      });
      
      server.broadcast('assembly:progress_update', {
        agentId,
        progress,
        currentFormat: data.currentFormat,
        completed: data.completed,
        total: data.total
      });
    });
  }

  private registerCoordinationHandlers(socket: Socket, server: InfogSocketServer, agentId: string): void {
    // Request data from another agent
    socket.on('coord:request_data', (data: { targetAgent: string; dataType: string }) => {
      console.log(`[Coordination] Agent ${agentId} requesting ${data.dataType} from ${data.targetAgent}`);
      
      server.broadcastToAgent(data.targetAgent, 'coord:data_requested', {
        requestingAgent: agentId,
        dataType: data.dataType,
        timestamp: new Date().toISOString()
      });
    });

    // Send data to another agent
    socket.on('coord:send_data', (data: { targetAgent: string; dataType: string; payload: any }) => {
      console.log(`[Coordination] Agent ${agentId} sending ${data.dataType} to ${data.targetAgent}`);
      
      server.broadcastToAgent(data.targetAgent, 'coord:data_received', {
        fromAgent: agentId,
        dataType: data.dataType,
        payload: data.payload,
        timestamp: new Date().toISOString()
      });
    });

    // Signal readiness for next stage
    socket.on('coord:stage_ready', (data: { stage: string; ready: boolean }) => {
      server.broadcast('coord:agent_stage_ready', {
        agentId,
        stage: data.stage,
        ready: data.ready,
        timestamp: new Date().toISOString()
      });
    });

    // Request help or clarification
    socket.on('coord:help_request', (data: { issue: string; severity: 'low' | 'medium' | 'high' }) => {
      server.broadcast('coord:help_needed', {
        agentId,
        issue: data.issue,
        severity: data.severity,
        timestamp: new Date().toISOString()
      });
    });
  }
}

export const agentEventHandlers = new AgentEventHandlers();