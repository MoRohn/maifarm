import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  MultiClaudeAgent, 
  MultiClaudeConfig, 
  MultiClaudeCommand,
  MultiClaudeEvent,
  CoordinationData 
} from '@/types/multiClaude';
import { multiClaudeService } from '@/services/multiClaudeService';
import { useWebSocket } from './useWebSocket';

const DEFAULT_CONFIG: MultiClaudeConfig = {
  maxAgents: 6,
  staggerDelay: 2,
  sessionName: 'claude_agents',
  coordintionDir: '/tmp/claude_coordination',
  enableLogging: true,
  autoRestart: true
};

export const useMultiClaude = () => {
  const [agents, setAgents] = useState<MultiClaudeAgent[]>([]);
  const [config, setConfig] = useState<MultiClaudeConfig>(() => {
    const saved = localStorage.getItem('multiClaudeConfig');
    return saved ? JSON.parse(saved) : DEFAULT_CONFIG;
  });
  const [isConnected, setIsConnected] = useState(false);
  const [coordinationData, setCoordinationData] = useState<CoordinationData | null>(null);
  
  const { socket, connected } = useWebSocket();
  const pollingInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize service
  useEffect(() => {
    multiClaudeService.initialize(config);
  }, [config]);

  // WebSocket event handlers
  useEffect(() => {
    if (!socket) return;

    const handleAgentUpdate = (event: MultiClaudeEvent) => {
      setAgents(prev => {
        const index = prev.findIndex(a => a.id === event.agentId);
        if (index === -1) return prev;

        const updated = [...prev];
        const agent = updated[index];

        switch (event.type) {
          case 'agent:status':
            agent.status = event.data.status;
            agent.lastActivity = event.data.activity;
            break;
          case 'agent:output':
            agent.output = [...agent.output, ...event.data.lines];
            break;
          case 'agent:error':
            agent.status = 'error';
            agent.lastActivity = event.data.error;
            break;
        }

        return updated;
      });
    };

    const handleCoordinationUpdate = (data: CoordinationData) => {
      setCoordinationData(data);
      
      // Update agent statuses based on coordination data
      if (data.activeAgents) {
        setAgents(prev => prev.map(agent => {
          const coordAgent = Object.entries(data.activeAgents).find(
            ([key, value]) => value.agent_id === agent.agentNumber - 1
          );
          
          if (coordAgent) {
            return {
              ...agent,
              status: coordAgent[1].status as any || agent.status
            };
          }
          return agent;
        }));
      }
    };

    socket.on('multiclaude:agent:update', handleAgentUpdate);
    socket.on('multiclaude:coordination:update', handleCoordinationUpdate);
    socket.on('multiclaude:connected', () => setIsConnected(true));
    socket.on('multiclaude:disconnected', () => setIsConnected(false));

    return () => {
      socket.off('multiclaude:agent:update', handleAgentUpdate);
      socket.off('multiclaude:coordination:update', handleCoordinationUpdate);
      socket.off('multiclaude:connected');
      socket.off('multiclaude:disconnected');
    };
  }, [socket]);

  // Poll coordination file
  useEffect(() => {
    const pollCoordination = async () => {
      try {
        const data = await multiClaudeService.getCoordinationData();
        setCoordinationData(data);
      } catch (error) {
        console.error('Failed to poll coordination data:', error);
      }
    };

    if (isConnected) {
      pollCoordination();
      pollingInterval.current = setInterval(pollCoordination, 2000);
    }

    return () => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
      }
    };
  }, [isConnected]);

  // Agent management functions
  const startSession = useCallback(async (sessionName?: string) => {
    const name = sessionName || config.sessionName;
    await multiClaudeService.startSession(name, config.maxAgents);
    setIsConnected(true);
    
    // Initialize agents array
    const initialAgents: MultiClaudeAgent[] = [];
    for (let i = 0; i < config.maxAgents; i++) {
      initialAgents.push({
        id: `agent_${Date.now()}_${i}`,
        agentNumber: i + 1,
        status: 'starting',
        currentStep: 0,
        output: [],
        startTime: new Date(),
        taskHistory: []
      });
    }
    setAgents(initialAgents);
  }, [config]);

  const stopSession = useCallback(async () => {
    await multiClaudeService.stopSession();
    setIsConnected(false);
    setAgents([]);
  }, []);

  const addAgent = useCallback(async () => {
    if (agents.length >= config.maxAgents) {
      throw new Error(`Maximum of ${config.maxAgents} agents reached`);
    }

    const newAgent: MultiClaudeAgent = {
      id: `agent_${Date.now()}_${agents.length}`,
      agentNumber: agents.length + 1,
      status: 'starting',
      currentStep: 0,
      output: [],
      startTime: new Date(),
      taskHistory: []
    };

    await multiClaudeService.addAgent(newAgent.agentNumber);
    setAgents(prev => [...prev, newAgent]);
    
    // Simulate agent becoming ready after delay
    setTimeout(() => {
      setAgents(prev => prev.map(a => 
        a.id === newAgent.id ? { ...a, status: 'ready' } : a
      ));
    }, config.staggerDelay * 1000);
  }, [agents, config]);

  const removeAgent = useCallback(async (agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return;

    await multiClaudeService.removeAgent(agent.agentNumber);
    setAgents(prev => prev.filter(a => a.id !== agentId));
  }, [agents]);

  const sendCommand = useCallback(async (agentId: string, command: string) => {
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return;

    const cmd: MultiClaudeCommand = {
      type: command as any,
      agentId,
      payload: {}
    };

    await multiClaudeService.sendCommand(agent.agentNumber, cmd);
    
    // Update local state
    setAgents(prev => prev.map(a => {
      if (a.id !== agentId) return a;
      
      switch (command) {
        case 'start':
          return { ...a, status: 'working' };
        case 'pause':
          return { ...a, status: 'idle' };
        case 'reset':
          return { ...a, status: 'ready', output: [], currentStep: 0 };
        default:
          return a;
      }
    }));
  }, [agents]);

  const sendPrompt = useCallback(async (agentId: string, prompt: string) => {
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return;

    await multiClaudeService.sendPrompt(agent.agentNumber, prompt);
    
    // Update agent state
    setAgents(prev => prev.map(a => {
      if (a.id !== agentId) return a;
      
      return {
        ...a,
        status: 'working',
        currentPrompt: prompt,
        output: [...a.output, `> ${prompt}`],
        taskHistory: [
          ...a.taskHistory,
          {
            id: `task_${Date.now()}`,
            prompt,
            startTime: new Date(),
            status: 'active',
            output: []
          }
        ]
      };
    }));
  }, [agents]);

  const updateConfig = useCallback((updates: Partial<MultiClaudeConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    localStorage.setItem('multiClaudeConfig', JSON.stringify(newConfig));
    multiClaudeService.updateConfig(newConfig);
  }, [config]);

  return {
    agents,
    config,
    isConnected: isConnected && connected,
    coordinationData,
    addAgent,
    removeAgent,
    sendCommand,
    sendPrompt,
    updateConfig,
    startSession,
    stopSession
  };
};