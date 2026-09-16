import React, { useMemo } from 'react';
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
  // Optimized for Apple devices: iPad Mini (744px), iPad (768px), iPad Pro 11" (834px)
  const getGridLayout = (agentCount: number) => {
    if (agentCount <= 1) return 'grid-cols-1';
    // 2 agents: 2 cols at iPad Mini (744px) and above
    if (agentCount <= 2) return 'grid-cols-1 sm:grid-cols-2';
    // 3-4 agents: 2 cols at tablet, 2 at large screens
    if (agentCount <= 4) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-2';
    // 5-6 agents: 2 cols at tablet, 3 at iPad Pro 11" (834px)
    if (agentCount <= 6) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
    // 7-9 agents: 2-3-3 progression
    if (agentCount <= 9) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
    // 10+ agents: 2-3-4 progression for large displays
    return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
  };

  // Calculate optimal height based on grid size
  // Optimized for iPhone SE (375px, 667px height) through iMac displays
  // Use smaller rem subtractions to prevent overflow on small screens
  const getItemHeight = (agentCount: number) => {
    // 1-2 agents: larger terminals for detailed viewing
    if (agentCount <= 2) return 'h-[calc(50dvh-4rem)] sm:h-[calc(50vh-6rem)] min-h-[200px] sm:min-h-[280px] max-h-[500px]';
    // 3-4 agents: medium terminals
    if (agentCount <= 4) return 'h-[calc(45dvh-3rem)] sm:h-[calc(40vh-5rem)] min-h-[180px] sm:min-h-[240px] max-h-[400px]';
    // 5-6 agents: compact terminals
    if (agentCount <= 6) return 'h-[calc(40dvh-3rem)] sm:h-[calc(35vh-4rem)] min-h-[160px] sm:min-h-[200px] max-h-[350px]';
    // 7+ agents: very compact for high-density views
    return 'h-[calc(35dvh-2rem)] sm:h-[calc(30vh-3rem)] min-h-[150px] sm:min-h-[180px] max-h-[300px]';
  };

  const gridLayout = getGridLayout(agents.length);
  const itemHeight = getItemHeight(agents.length);

  // PERFORMANCE FIX: Calculate all agent status counts in a single pass instead of 3 separate .filter() calls
  const statusCounts = useMemo(() => {
    return agents.reduce(
      (counts, agent) => {
        if (agent.status === 'ready') counts.ready++;
        else if (agent.status === 'working') counts.working++;
        else if (agent.status === 'error') counts.error++;
        return counts;
      },
      { ready: 0, working: 0, error: 0 }
    );
  }, [agents]);

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
            <div className="w-2 h-2 bg-green-400 rounded-full" aria-hidden="true"></div>
            <span>Ready: {statusCounts.ready}</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" aria-hidden="true"></div>
            <span>Working: {statusCounts.working}</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-red-400 rounded-full" aria-hidden="true"></div>
            <span>Error: {statusCounts.error}</span>
          </div>
        </div>
      </div>
    </div>
  );
};