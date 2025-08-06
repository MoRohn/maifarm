import { useState, useCallback, useRef } from 'react';
import { TerminalCommand } from '../../../types/terminal';

interface UseTerminalCommandProps {
  sessionId: string | null;
  agentId: number | null;
  onCommandSent?: (command: string) => void;
  onCommandComplete?: (command: string, success: boolean) => void;
}

export const useTerminalCommand = ({ 
  sessionId, 
  agentId, 
  onCommandSent,
  onCommandComplete 
}: UseTerminalCommandProps) => {
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [currentCommand, setCurrentCommand] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executingCommands, setExecutingCommands] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const commandQueueRef = useRef<TerminalCommand[]>([]);

  // Common commands for autocomplete
  const commonCommands = [
    'ls', 'cd', 'pwd', 'cat', 'grep', 'find', 'ps', 'top', 'htop',
    'git status', 'git log', 'git diff', 'git add', 'git commit',
    'npm install', 'npm run', 'npm start', 'npm test', 'npm run build',
    'python', 'node', 'docker', 'kubectl', 'make', 'chmod', 'chown',
    'tail -f', 'head', 'less', 'more', 'vi', 'vim', 'nano',
    'clear', 'history', 'which', 'whereis', 'man', 'help'
  ];

  // Send command to specific agent
  const sendCommand = useCallback(async (command: string, targetAgentId?: number) => {
    if (!sessionId || (!agentId && !targetAgentId) || !command.trim()) {
      return false;
    }

    const effectiveAgentId = targetAgentId ?? agentId!;
    const trimmedCommand = command.trim();
    setIsExecuting(true);
    setError(null);

    const commandId = `${sessionId}-${effectiveAgentId}-${Date.now()}`;
    setExecutingCommands(prev => new Set([...prev, commandId]));

    try {
      const response = await fetch(`/api/terminal/agents/${sessionId}-${effectiveAgentId}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: trimmedCommand })
      });

      if (response.ok) {
        // Add to command history
        setCommandHistory(prev => {
          const newHistory = [...prev, trimmedCommand];
          // Keep only last 100 commands
          return newHistory.slice(-100);
        });
        
        // Reset current command and history index
        setCurrentCommand('');
        setHistoryIndex(-1);
        
        // Callbacks
        onCommandSent?.(trimmedCommand);
        onCommandComplete?.(trimmedCommand, true);
        
        return true;
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Command failed: ${response.status}`);
      }
    } catch (error) {
      console.error('Error sending command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to send command';
      setError(errorMessage);
      onCommandComplete?.(trimmedCommand, false);
      return false;
    } finally {
      setIsExecuting(false);
      setExecutingCommands(prev => {
        const newSet = new Set(prev);
        newSet.delete(commandId);
        return newSet;
      });
    }
  }, [sessionId, agentId, onCommandSent, onCommandComplete]);

  // Send command to multiple agents
  const sendCommandToMultiple = useCallback(async (command: string, agentIds: number[]) => {
    if (!sessionId || agentIds.length === 0 || !command.trim()) {
      return [];
    }

    const trimmedCommand = command.trim();
    setIsExecuting(true);
    setError(null);

    const results = await Promise.allSettled(
      agentIds.map(async (targetAgentId) => {
        const commandId = `${sessionId}-${targetAgentId}-${Date.now()}`;
        setExecutingCommands(prev => new Set([...prev, commandId]));

        try {
          const response = await fetch(`/api/terminal/agents/${sessionId}-${targetAgentId}/command`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: trimmedCommand })
          });

          if (response.ok) {
            return { agentId: targetAgentId, success: true };
          } else {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Command failed: ${response.status}`);
          }
        } catch (error) {
          return { 
            agentId: targetAgentId, 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          };
        } finally {
          setExecutingCommands(prev => {
            const newSet = new Set(prev);
            newSet.delete(commandId);
            return newSet;
          });
        }
      })
    );

    // Process results
    const successfulCommands = results
      .filter(result => result.status === 'fulfilled' && result.value.success)
      .map(result => (result as any).value.agentId);

    const failedCommands = results
      .filter(result => result.status === 'rejected' || !(result as any).value.success)
      .map(result => ({
        agentId: result.status === 'fulfilled' ? (result as any).value.agentId : -1,
        error: result.status === 'rejected' ? result.reason : (result as any).value.error
      }));

    if (successfulCommands.length > 0) {
      // Add to command history
      setCommandHistory(prev => {
        const newHistory = [...prev, `[${successfulCommands.length} agents] ${trimmedCommand}`];
        return newHistory.slice(-100);
      });
      
      setCurrentCommand('');
      setHistoryIndex(-1);
      onCommandSent?.(trimmedCommand);
    }

    if (failedCommands.length > 0) {
      setError(`Command failed on ${failedCommands.length} agent(s)`);
    }

    setIsExecuting(false);
    return results.map((result, index) => ({
      agentId: agentIds[index],
      success: result.status === 'fulfilled' && (result.value as any).success,
      error: result.status === 'rejected' ? result.reason : 
             result.status === 'fulfilled' && !(result.value as any).success ? (result.value as any).error : undefined
    }));
  }, [sessionId, onCommandSent]);

  // Navigate command history
  const navigateHistory = useCallback((direction: 'up' | 'down') => {
    if (commandHistory.length === 0) return;

    if (direction === 'up') {
      if (historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setCurrentCommand(commandHistory[commandHistory.length - 1 - newIndex]);
      }
    } else {
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setCurrentCommand(commandHistory[commandHistory.length - 1 - newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCurrentCommand('');
      }
    }
  }, [commandHistory, historyIndex]);

  // Get command suggestions for autocomplete
  const getCommandSuggestions = useCallback((input: string): string[] => {
    if (!input.trim()) return [];
    
    const inputLower = input.toLowerCase();
    const suggestions: string[] = [];
    
    // Check common commands
    commonCommands.forEach(cmd => {
      if (cmd.toLowerCase().startsWith(inputLower)) {
        suggestions.push(cmd);
      }
    });
    
    // Check command history
    commandHistory.forEach(cmd => {
      if (cmd.toLowerCase().includes(inputLower) && !suggestions.includes(cmd)) {
        suggestions.push(cmd);
      }
    });
    
    return suggestions.slice(0, 10); // Limit to 10 suggestions
  }, [commandHistory]);

  // Clear command history
  const clearHistory = useCallback(() => {
    setCommandHistory([]);
    setHistoryIndex(-1);
  }, []);

  // Get command templates
  const getCommandTemplates = useCallback(() => {
    return {
      'System': [
        'ps aux | grep claude',
        'top -p $(pgrep claude)',
        'df -h',
        'free -h',
        'uptime'
      ],
      'Git': [
        'git status',
        'git log --oneline -10',
        'git diff',
        'git add .',
        'git commit -m "Update"'
      ],
      'Node.js': [
        'npm install',
        'npm run build',
        'npm run test',
        'npm run dev',
        'node --version'
      ],
      'File Operations': [
        'ls -la',
        'pwd',
        'find . -name "*.js"',
        'grep -r "TODO" .',
        'tail -f *.log'
      ]
    };
  }, []);

  // Execute command template
  const executeTemplate = useCallback(async (template: string, targetAgentId?: number) => {
    return await sendCommand(template, targetAgentId);
  }, [sendCommand]);

  return {
    commandHistory,
    currentCommand,
    isExecuting,
    executingCommands: Array.from(executingCommands),
    error,
    historyIndex,
    // Actions
    sendCommand,
    sendCommandToMultiple,
    setCurrentCommand,
    navigateHistory,
    clearHistory,
    executeTemplate,
    // Helpers
    getCommandSuggestions,
    getCommandTemplates,
    // Computed
    hasHistory: commandHistory.length > 0,
    canNavigateUp: historyIndex < commandHistory.length - 1,
    canNavigateDown: historyIndex >= 0,
    isCommandExecuting: (command: string) => executingCommands.has(command)
  };
};