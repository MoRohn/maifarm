import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useMonitoringStore } from '../store/monitoringStore';
import { 
  InfogSocketEvents, 
  AgentStatus, 
  PipelineStage,
  ConnectionState,
  LogEntry,
  Alert
} from '../types/monitoring';

export const useInfogWebSocket = () => {
  const socketRef = useRef<Socket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const {
    setConnectionState,
    updateAgentStatus,
    updatePipelineStage,
    setProjectStatus,
    addLog,
    addAlert,
    clearAlerts,
    updateMetrics,
    state
  } = useMonitoringStore();

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;

    const wsUrl = process.env.NODE_ENV === 'development' 
      ? 'http://localhost:4567' 
      : window.location.origin;

    setConnectionState({ 
      status: 'connecting',
      reconnectAttempts: reconnectAttemptsRef.current 
    });

    socketRef.current = io(wsUrl, {
      transports: ['websocket', 'polling'],
      auth: {
        token: localStorage.getItem('authToken') || ''
      },
      query: {
        agentId: 'monitoring_dashboard'
      }
    });

    const socket = socketRef.current;

    // Connection events
    socket.on('connect', () => {
      console.log('[InfogWebSocket] Connected');
      reconnectAttemptsRef.current = 0;
      setConnectionState({ 
        status: 'connected',
        reconnectAttempts: 0,
        lastConnected: new Date().toISOString()
      });
      
      addLog({
        level: 'info',
        source: 'WebSocket',
        message: 'Connected to infographic monitoring server'
      });
    });

    socket.on('disconnect', (reason) => {
      console.log('[InfogWebSocket] Disconnected:', reason);
      setConnectionState({ 
        status: 'disconnected',
        lastError: reason
      });
      
      addLog({
        level: 'warn',
        source: 'WebSocket',
        message: `Disconnected: ${reason}`
      });

      // Auto-reconnect logic
      if (reason === 'io server disconnect') {
        // Server disconnected us, don't auto-reconnect
        return;
      }

      reconnectAttemptsRef.current++;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
      
      reconnectTimeoutRef.current = setTimeout(() => {
        setConnectionState({ 
          status: 'reconnecting',
          reconnectAttempts: reconnectAttemptsRef.current
        });
        socket.connect();
      }, delay);
    });

    socket.on('connect_error', (error) => {
      console.error('[InfogWebSocket] Connection error:', error);
      setConnectionState({ 
        status: 'error',
        lastError: error.message,
        reconnectAttempts: reconnectAttemptsRef.current
      });
    });

    // State synchronization
    socket.on('state:sync', (state: any) => {
      console.log('[InfogWebSocket] State sync received');
      
      // Update project status
      if (state.projectMetadata) {
        setProjectStatus(state.projectMetadata.status);
      }
      
      // Update pipeline stages
      if (state.pipelineStages) {
        Object.entries(state.pipelineStages).forEach(([stage, data]) => {
          updatePipelineStage(stage, data as PipelineStage);
        });
      }
      
      // Update agent states
      if (state.agentStates) {
        Object.entries(state.agentStates).forEach(([agentId, status]) => {
          updateAgentStatus(agentId, status as AgentStatus);
        });
      }
    });

    // Agent events
    socket.on('agent:status', (data) => {
      updateAgentStatus(data.agentId, {
        agentId: data.agentId,
        status: data.status,
        lastUpdate: data.timestamp
      });
    });

    socket.on('agent:progress', (data) => {
      updateAgentStatus(data.agentId, {
        agentId: data.agentId,
        status: 'working',
        currentTask: data.stage,
        progress: data.progress,
        lastUpdate: new Date().toISOString()
      });
      
      if (data.message) {
        addLog({
          level: 'info',
          source: data.agentId,
          message: data.message
        });
      }
    });

    socket.on('agent:error', (data) => {
      updateAgentStatus(data.agentId, {
        agentId: data.agentId,
        status: 'error',
        lastUpdate: new Date().toISOString()
      });
      
      addAlert({
        severity: data.recoverable ? 'medium' : 'high',
        type: 'agent',
        title: `Agent Error: ${data.agentId}`,
        message: data.error
      });
    });

    // Pipeline events
    socket.on('pipeline:update', (data) => {
      updatePipelineStage(data.stage, {
        name: data.stage,
        status: data.status,
        progress: data.progress
      });
    });

    socket.on('pipeline:stage_complete', (data) => {
      updatePipelineStage(data.stage, {
        name: data.stage,
        status: 'complete',
        progress: 100,
        endTime: new Date().toISOString()
      });
      
      addLog({
        level: 'info',
        source: 'Pipeline',
        message: `Stage ${data.stage} completed, starting ${data.nextStage}`
      });
    });

    socket.on('pipeline:error', (data) => {
      updatePipelineStage(data.stage, {
        name: data.stage,
        status: 'error',
        error: data.error
      });
      
      addAlert({
        severity: 'high',
        type: 'pipeline',
        title: `Pipeline Error: ${data.stage}`,
        message: data.error
      });
    });

    // Data collection events
    socket.on('data:collection_started', (data) => {
      addLog({
        level: 'info',
        source: data.agentId,
        message: `Started data collection from ${data.sources.length} sources`
      });
    });

    socket.on('data:validation_update', (data) => {
      updateMetrics({
        qualityMetrics: {
          dataAccuracy: (data.validated / data.total) * 100
        }
      });
    });

    // Analysis events
    socket.on('analysis:theme_extracted', (data) => {
      addLog({
        level: 'info',
        source: data.agentId,
        message: `Extracted theme: ${data.theme} (sentiment: ${data.sentiment.toFixed(2)})`
      });
    });

    // Design events
    socket.on('design:template_chosen', (data) => {
      addLog({
        level: 'info',
        source: data.agentId,
        message: `Selected template: ${data.templateName}`
      });
    });

    // Assembly events
    socket.on('assembly:format_ready', (data) => {
      addLog({
        level: 'info',
        source: data.agentId,
        message: `Generated ${data.format} output (${(data.fileSize / 1024 / 1024).toFixed(2)} MB)`
      });
    });

    // Project completion
    socket.on('infograph:complete', (data) => {
      setProjectStatus('complete');
      
      addAlert({
        severity: 'low',
        type: 'system',
        title: 'Infographic Complete!',
        message: `Successfully generated ${data.outputs.length} outputs`
      });
      
      addLog({
        level: 'info',
        source: 'System',
        message: `Infographic generation complete. Total size: ${(data.totalSize / 1024 / 1024).toFixed(2)} MB`
      });
    });

    // Health monitoring
    socket.on('health:update', (data) => {
      updateMetrics({
        systemMetrics: {
          totalConnections: data.totalConnections,
          activeAgents: data.connectedAgents.length
        }
      });
    });

    // Latency measurement
    socket.on('ping', (timestamp: number) => {
      socket.emit('pong', timestamp);
    });

  }, [setConnectionState, updateAgentStatus, updatePipelineStage, setProjectStatus, 
      addLog, addAlert, updateMetrics]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    
    setConnectionState({ status: 'disconnected' });
  }, [setConnectionState]);

  const sendEvent = useCallback(<K extends keyof InfogSocketEvents>(
    event: K,
    data: InfogSocketEvents[K]
  ) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    } else {
      console.warn(`[InfogWebSocket] Cannot send event ${event}, not connected`);
    }
  }, []);

  const requestStateSync = useCallback(() => {
    sendEvent('agent:heartbeat', undefined);
  }, [sendEvent]);

  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Expose state and methods
  return {
    ...state,
    connectionState: state.connectionState,
    sendEvent,
    requestStateSync,
    reconnect: connect,
    disconnect,
    clearAlerts
  };
};