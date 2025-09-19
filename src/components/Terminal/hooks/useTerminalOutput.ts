import { useState, useEffect, useCallback, useRef } from 'react';
import { TerminalOutput } from '@/types/terminal';
import { useWebSocket } from '@/hooks/useWebSocket';

interface UseTerminalOutputProps {
  sessionId: string | null;
  agentId: number | null;
  maxLines?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export const useTerminalOutput = ({ 
  sessionId, 
  agentId, 
  maxLines = 1000,
  autoRefresh = true,
  refreshInterval = 2000
}: UseTerminalOutputProps) => {
  const [outputs, setOutputs] = useState<Record<string, TerminalOutput>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const terminalRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const { socket, isConnected } = useWebSocket({
    url: import.meta.env.VITE_WS_URL || 'ws://localhost:4567',
    reconnect: true
  });

  // Generate output key for storing/retrieving output
  const getOutputKey = useCallback((sessionId: string, agentId: number) => {
    return `${sessionId}-${agentId}`;
  }, []);

  // Clean terminal output by removing redundant prompts and empty lines
  const cleanTerminalOutput = useCallback((rawLines: string[]): string[] => {
    if (!rawLines || rawLines.length === 0) return [];
    
    const cleaned = rawLines.filter((line, index) => {
      // Skip empty lines at the beginning
      if (index === 0 && !line.trim()) return false;
      
      // Skip duplicate consecutive prompts
      if (index > 0 && line === rawLines[index - 1] && line.includes('@') && line.includes('%')) {
        return false;
      }
      
      return true;
    });
    
    // If we only have prompt lines and no actual content, show a single clean prompt
    const hasRealContent = cleaned.some(line => 
      line.trim() && 
      !line.match(/^[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+ .* [%$#]$/)
    );
    
    if (!hasRealContent && cleaned.length > 0) {
      const promptLine = cleaned.find(line => line.includes('@') && (line.includes('%') || line.includes('$')));
      return promptLine ? [promptLine] : ['Ready for commands...'];
    }
    
    // Limit lines to maxLines
    return cleaned.slice(-maxLines);
  }, [maxLines]);

  // Fetch terminal output for specific agent
  const fetchOutput = useCallback(async (sessionId: string, agentId: number) => {
    if (!sessionId || agentId === null) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/terminal/agents/${sessionId}-${agentId}/output?lines=${maxLines}`);
      
      if (response.ok) {
        const data = await response.json();
        const rawOutput = data.data?.terminal || data.data?.lines || [];
        const cleanedOutput = cleanTerminalOutput(rawOutput);
        
        const output: TerminalOutput = {
          agentId,
          sessionId,
          lines: cleanedOutput,
          timestamp: new Date(),
          type: 'stdout'
        };
        
        const key = getOutputKey(sessionId, agentId);
        setOutputs(prev => ({ ...prev, [key]: output }));
      } else {
        throw new Error(`Failed to fetch output: ${response.status}`);
      }
    } catch (error) {
      console.error('Error fetching terminal output:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch output');
    } finally {
      setIsLoading(false);
    }
  }, [maxLines, cleanTerminalOutput, getOutputKey]);

  // Fetch outputs for multiple agents
  const fetchMultipleOutputs = useCallback(async (sessionId: string, agentIds: number[]) => {
    if (!sessionId || agentIds.length === 0) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const promises = agentIds.map(agentId => 
        fetch(`/api/terminal/agents/${sessionId}-${agentId}/output?lines=${maxLines}`)
          .then(res => res.ok ? res.json() : null)
          .then(data => ({
            agentId,
            data: data?.data?.terminal || data?.data?.lines || []
          }))
          .catch(() => ({ agentId, data: [] }))
      );
      
      const results = await Promise.all(promises);
      const newOutputs: Record<string, TerminalOutput> = {};
      
      results.forEach(({ agentId, data }) => {
        const cleanedOutput = cleanTerminalOutput(data);
        const key = getOutputKey(sessionId, agentId);
        newOutputs[key] = {
          agentId,
          sessionId,
          lines: cleanedOutput,
          timestamp: new Date(),
          type: 'stdout'
        };
      });
      
      setOutputs(prev => ({ ...prev, ...newOutputs }));
    } catch (error) {
      console.error('Error fetching multiple outputs:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch outputs');
    } finally {
      setIsLoading(false);
    }
  }, [maxLines, cleanTerminalOutput, getOutputKey]);

  // Get output for specific agent
  const getOutput = useCallback((sessionId: string, agentId: number): string[] => {
    const key = getOutputKey(sessionId, agentId);
    return outputs[key]?.lines || [];
  }, [outputs, getOutputKey]);

  // Add new output line
  const addOutputLine = useCallback((sessionId: string, agentId: number, line: string, type: TerminalOutput['type'] = 'stdout') => {
    const key = getOutputKey(sessionId, agentId);
    setOutputs(prev => {
      const existing = prev[key];
      const newLines = existing ? [...existing.lines, line] : [line];
      
      return {
        ...prev,
        [key]: {
          agentId,
          sessionId,
          lines: newLines.slice(-maxLines), // Keep within limits
          timestamp: new Date(),
          type
        }
      };
    });
  }, [getOutputKey, maxLines]);

  // Clear output for specific agent
  const clearOutput = useCallback((sessionId: string, agentId: number) => {
    const key = getOutputKey(sessionId, agentId);
    setOutputs(prev => {
      const newOutputs = { ...prev };
      delete newOutputs[key];
      return newOutputs;
    });
  }, [getOutputKey]);

  // Auto-scroll terminal to bottom
  const scrollToBottom = useCallback((sessionId: string, agentId: number) => {
    const key = getOutputKey(sessionId, agentId);
    const terminalElement = terminalRefs.current[key];
    
    if (terminalElement) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          terminalElement.scrollTop = terminalElement.scrollHeight;
        });
      });
    }
  }, [getOutputKey]);

  // Register terminal element ref
  const registerTerminalRef = useCallback((sessionId: string, agentId: number, element: HTMLDivElement | null) => {
    const key = getOutputKey(sessionId, agentId);
    terminalRefs.current[key] = element;
  }, [getOutputKey]);

  // WebSocket event handlers
  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleTerminalOutput = (data: any) => {
      if (data.sessionId && typeof data.agentId === 'number' && data.content) {
        const lines = Array.isArray(data.content) ? data.content : data.content.split('\n');
        lines.forEach((line: string) => {
          addOutputLine(data.sessionId, data.agentId, line, data.type || 'stdout');
        });
        
        // Auto-scroll to bottom
        setTimeout(() => {
          scrollToBottom(data.sessionId, data.agentId);
        }, 100);
      }
    };

    const handleCommandSent = (data: any) => {
      if (data.sessionId && typeof data.agentId === 'number' && data.command) {
        addOutputLine(data.sessionId, data.agentId, `> ${data.command}`, 'command');
        scrollToBottom(data.sessionId, data.agentId);
      }
    };

    socket.on('terminal:output', handleTerminalOutput);
    socket.on('terminal:command', handleCommandSent);

    return () => {
      socket.off('terminal:output', handleTerminalOutput);
      socket.off('terminal:command', handleCommandSent);
    };
  }, [socket, isConnected, addOutputLine, scrollToBottom]);

  // Auto-refresh for current session/agent
  useEffect(() => {
    if (autoRefresh && sessionId && agentId !== null) {
      refreshIntervalRef.current = setInterval(() => {
        fetchOutput(sessionId, agentId);
      }, refreshInterval);
    } else if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [autoRefresh, sessionId, agentId, refreshInterval, fetchOutput]);

  // Initial fetch when session/agent changes
  useEffect(() => {
    if (sessionId && agentId !== null) {
      fetchOutput(sessionId, agentId);
    }
  }, [sessionId, agentId, fetchOutput]);

  return {
    outputs,
    isLoading,
    error,
    isConnected,
    // Actions
    fetchOutput,
    fetchMultipleOutputs,
    getOutput,
    addOutputLine,
    clearOutput,
    scrollToBottom,
    registerTerminalRef,
    // Computed
    hasOutput: (sessionId: string, agentId: number) => {
      const key = getOutputKey(sessionId, agentId);
      return (outputs[key]?.lines?.length || 0) > 0;
    },
    getLastActivity: (sessionId: string, agentId: number) => {
      const key = getOutputKey(sessionId, agentId);
      return outputs[key]?.timestamp;
    }
  };
};