import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronDown, 
  ChevronRight, 
  Terminal, 
  Activity, 
  Pause, 
  Copy,
  Send,
  Circle
} from 'lucide-react';
import { Tooltip } from '../common/Tooltip';

interface AgentBarProps {
  agentId: number;
  agentName: string;
  lastLine: string;
  fullOutput: string[];
  expanded: boolean;
  isActive: boolean;
  isPaused: boolean;
  onToggle: () => void;
  onPause: () => void;
  onResume: () => void;
  onCopy: () => void;
  onSendCommand: (command: string) => void;
}

export const AgentBar: React.FC<AgentBarProps> = ({
  agentId,
  agentName,
  lastLine,
  fullOutput,
  expanded,
  isActive,
  isPaused,
  onToggle,
  onPause,
  onResume,
  onCopy,
  onSendCommand
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [command, setCommand] = React.useState('');

  // Auto-scroll to bottom when output changes
  useEffect(() => {
    if (expanded && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [fullOutput, expanded]);

  // Extract clean last line (remove ANSI codes)
  const cleanLastLine = lastLine ? lastLine.replace(/\x1b\[[0-9;]*m/g, '') : 'Waiting for output...';

  // Get status color
  const getStatusColor = () => {
    if (isPaused) return 'bg-yellow-500';
    if (isActive) return 'bg-green-500 animate-pulse';
    return 'bg-gray-400';
  };

  const handleSendCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (command.trim()) {
      onSendCommand(command);
      setCommand('');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700 hover:border-gray-600 transition-all"
    >
      {/* Collapsed Bar */}
      <div 
        className="flex items-center p-3 cursor-pointer hover:bg-gray-750 transition-colors"
        onClick={onToggle}
      >
        {/* Expand/Collapse Icon */}
        <motion.div
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ duration: 0.2 }}
          className="mr-3"
        >
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </motion.div>

        {/* Agent Info */}
        <div className="flex items-center flex-1 min-w-0">
          {/* Status Indicator */}
          <div className={`w-2 h-2 rounded-full mr-3 flex-shrink-0 ${getStatusColor()}`} />
          
          {/* Agent Name */}
          <div className="flex items-center mr-4 flex-shrink-0">
            <Terminal className="w-4 h-4 text-gray-400 mr-2" />
            <span className="text-sm font-medium text-white">{agentName}</span>
          </div>

          {/* Last Line of Output */}
          <div className="flex-1 min-w-0 mx-4">
            <div className="text-xs font-mono text-gray-400 truncate">
              {cleanLastLine}
            </div>
          </div>

          {/* Activity Indicator */}
          {isActive && !isPaused && (
            <Activity className="w-4 h-4 text-green-400 animate-pulse mr-2 flex-shrink-0" />
          )}
        </div>

        {/* Quick Actions */}
        <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
          {isPaused ? (
            <Tooltip content="Resume output">
              <button
                onClick={onResume}
                className="p-1.5 bg-green-600 rounded hover:bg-green-700 transition-colors"
              >
                <Circle className="w-3 h-3 text-white" />
              </button>
            </Tooltip>
          ) : (
            <Tooltip content="Pause output">
              <button
                onClick={onPause}
                className="p-1.5 bg-yellow-600 rounded hover:bg-yellow-700 transition-colors"
              >
                <Pause className="w-3 h-3 text-white" />
              </button>
            </Tooltip>
          )}
          
          <Tooltip content="Copy output">
            <button
              onClick={onCopy}
              className="p-1.5 bg-gray-600 rounded hover:bg-gray-700 transition-colors"
            >
              <Copy className="w-3 h-3 text-white" />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Expanded Terminal */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="border-t border-gray-700"
          >
            {/* Terminal Output */}
            <div 
              ref={terminalRef}
              className="bg-black p-4 h-64 overflow-y-auto font-mono text-xs"
              style={{ 
                scrollbarWidth: 'thin',
                scrollbarColor: '#4B5563 #1F2937'
              }}
            >
              {fullOutput.length > 0 ? (
                fullOutput.map((line, idx) => (
                  <div key={idx} className="text-green-400 whitespace-pre-wrap break-all">
                    {line}
                  </div>
                ))
              ) : (
                <div className="text-gray-500">No output yet...</div>
              )}
            </div>

            {/* Command Input */}
            <form onSubmit={handleSendCommand} className="border-t border-gray-700 p-3">
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder={`Send command to ${agentName}...`}
                  className="flex-1 bg-gray-900 text-white px-3 py-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={!command.trim()}
                  className="p-2 bg-blue-600 rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4 text-white" />
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};