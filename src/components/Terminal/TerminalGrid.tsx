import React from 'react';
import { motion } from 'framer-motion';
import { TerminalPane } from './TerminalPane';
import { TerminalSession, TerminalAgent } from '@/types/terminal';

interface TerminalGridProps {
  session: TerminalSession;
  agents: TerminalAgent[];
  getOutput: (_sessionId: string, _agentId: number) => string[];
  onSendCommand: (command: string, agentId?: number) => Promise<any>;
  registerTerminalRef: (_sessionId: string, _agentId: number, element: HTMLDivElement | null) => void;
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
    if (agentCount <= 2) return 'grid-cols-1 md:grid-cols-2';
    if (agentCount <= 4) return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-2';
    if (agentCount <= 6) return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3';
    if (agentCount <= 9) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
    return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
  };

  // Calculate optimal height based on grid size
  const getItemHeight = (agentCount: number) => {
    // Use responsive heights that adapt to available space
    if (agentCount <= 2) return 'h-[calc(50vh-8rem)] min-h-[300px] max-h-[500px]';
    if (agentCount <= 4) return 'h-[calc(40vh-6rem)] min-h-[250px] max-h-[400px]';
    if (agentCount <= 6) return 'h-[calc(35vh-5rem)] min-h-[200px] max-h-[350px]';
    return 'h-[calc(30vh-4rem)] min-h-[180px] max-h-[300px]';
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
    <div className={`flex flex-col h-full ${className}`}>
      <div className="flex-1 p-2 sm:p-3 md:p-4 overflow-auto min-h-0">
        <div className={`grid gap-2 sm:gap-3 md:gap-4 ${gridLayout} auto-rows-fr`}>
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
            className={`${itemHeight} flex`}
          >
            <TerminalPane
              session={session}
              agent={agent}
              output={getOutput(session.id, agent.id)}
              onSendCommand={(command) => onSendCommand(command, agent.id)}
              registerTerminalRef={(element) => registerTerminalRef(session.id, agent.id, element)}
              className="flex-1 w-full"
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