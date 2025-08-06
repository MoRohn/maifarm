import React from 'react';
import { motion } from 'framer-motion';
import { TerminalPane } from './TerminalPane';
import { TerminalSession, TerminalAgent } from '../../types/terminal';

interface TerminalGridProps {
  session: TerminalSession;
  agents: TerminalAgent[];
  getOutput: (sessionId: string, agentId: number) => string[];
  onSendCommand: (command: string, agentId?: number) => Promise<any>;
  registerTerminalRef: (sessionId: string, agentId: number, element: HTMLDivElement | null) => void;
  className?: string;
}

export const TerminalGrid: React.FC<TerminalGridProps> = ({
  session,
  agents,
  getOutput,
  onSendCommand,
  registerTerminalRef,
  className = ''
}) => {
  // Calculate grid layout based on number of agents
  const getGridLayout = (agentCount: number) => {
    if (agentCount <= 1) return 'grid-cols-1';
    if (agentCount <= 2) return 'grid-cols-1 lg:grid-cols-2';
    if (agentCount <= 4) return 'grid-cols-2';
    if (agentCount <= 6) return 'grid-cols-2 lg:grid-cols-3';
    if (agentCount <= 9) return 'grid-cols-3';
    return 'grid-cols-3 xl:grid-cols-4';
  };

  // Calculate optimal height based on grid size
  const getItemHeight = (agentCount: number) => {
    if (agentCount <= 2) return 'min-h-[20rem]';
    if (agentCount <= 4) return 'min-h-[18rem]';
    if (agentCount <= 6) return 'min-h-[16rem]';
    return 'min-h-[14rem]';
  };

  const gridLayout = getGridLayout(agents.length);
  const itemHeight = getItemHeight(agents.length);

  if (agents.length === 0) {
    return (
      <div className={`flex items-center justify-center h-64 ${className}`}>
        <div className="text-center text-gray-400">
          <p>No agents available in this session</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${className}`}>
      <div className="flex-1 p-4 overflow-auto">
        <div className={`grid gap-4 ${gridLayout}`}>
        {agents.map((agent, index) => (
          <motion.div
            key={agent.id}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ 
              duration: 0.3,
              delay: index * 0.1,
              ease: "easeOut"
            }}
            className={itemHeight}
          >
            <TerminalPane
              session={session}
              agent={agent}
              output={getOutput(session.id, agent.id)}
              onSendCommand={(command) => onSendCommand(command, agent.id)}
              registerTerminalRef={(element) => registerTerminalRef(session.id, agent.id, element)}
              className="h-full"
              showCommandInput={true}
              expanded={false}
            />
          </motion.div>
        ))}
        </div>
      </div>

      {/* Grid info footer */}
      <div className="px-4 py-2 border-t border-gray-700 flex items-center justify-between text-xs text-gray-500 bg-gray-800">
        <div className="flex items-center space-x-4">
          <span>Session: {session.sessionName}</span>
          <span>Agents: {agents.length}</span>
          <span>Layout: {gridLayout.replace('grid-cols-', '').replace(' lg:grid-cols-', '×').replace(' xl:grid-cols-', '×')}</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
            <span>Ready: {agents.filter(a => a.status === 'ready').length}</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
            <span>Working: {agents.filter(a => a.status === 'working').length}</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-red-400 rounded-full"></div>
            <span>Error: {agents.filter(a => a.status === 'error').length}</span>
          </div>
        </div>
      </div>
    </div>
  );
};