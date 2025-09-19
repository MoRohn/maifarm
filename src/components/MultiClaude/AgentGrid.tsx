import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AgentCard } from './AgentCard';
import { MultiClaudeAgent } from '@/types/multiClaude';
import { Plus, Grid3x3, Grid, LayoutGrid } from 'lucide-react';

interface AgentGridProps {
  agents: MultiClaudeAgent[];
  onAgentCommand: (_agentId: string, _command: string) => void;
  onAgentPrompt: (_agentId: string, _prompt: string) => void;
  onAddAgent: () => void;
  onRemoveAgent: (agentId: string) => void;
  maxAgents?: number;
}

export const AgentGrid: React.FC<AgentGridProps> = ({
  agents,
  onAgentCommand,
  onAgentPrompt,
  onAddAgent,
  onRemoveAgent,
  maxAgents = 12
}) => {
  // Enhanced responsive grid layout that better adjusts to agent count and screen size
  const gridCols = useMemo(() => {
    const count = agents.length;
    // Optimize grid layout for different agent counts
    if (count <= 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-1 md:grid-cols-2';
    if (count === 3) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
    if (count === 4) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2';
    if (count === 5 || count === 6) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
    if (count >= 7 && count <= 9) return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-3';
    if (count >= 10 && count <= 12) return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4';
    // For more than 12 agents, use a 4-column max layout
    return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5';
  }, [agents.length]);

  const getGridIcon = () => {
    const count = agents.length;
    if (count <= 4) return <Grid className="w-4 h-4" />;
    if (count <= 9) return <Grid3x3 className="w-4 h-4" />;
    return <LayoutGrid className="w-4 h-4" />;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {getGridIcon()}
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Multi-Claude Agents
          </h2>
          <span className="px-3 py-1 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-full">
            {agents.length} / {maxAgents}
          </span>
        </div>
        
        {agents.length < maxAgents && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onAddAgent}
            className="flex items-center gap-2 px-4 py-2 text-white bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl"
          >
            <Plus className="w-5 h-5" />
            <span className="font-medium">Add Agent</span>
          </motion.button>
        )}
      </div>

      {/* Agent Grid */}
      <div className={`grid ${gridCols} gap-4 auto-rows-fr`}>
        <AnimatePresence mode="popLayout">
          {agents.map((agent) => (
            <motion.div
              key={agent.id}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{
                opacity: { duration: 0.2 },
                scale: { duration: 0.3, type: "spring", stiffness: 300 }
              }}
              className="h-full"
            >
              <AgentCard
                agent={agent}
                onCommand={(command) => onAgentCommand(agent.id, command)}
                onPrompt={(prompt) => onAgentPrompt(agent.id, prompt)}
                onRemove={() => onRemoveAgent(agent.id)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Empty State */}
      {agents.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-16 text-center"
        >
          <div className="p-4 mb-4 bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/20 dark:to-purple-900/20 rounded-full">
            <LayoutGrid className="w-12 h-12 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            No Agents Running
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md">
            Start your first Claude agent to begin collaborative problem-solving.
          </p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onAddAgent}
            className="flex items-center gap-2 px-6 py-3 text-white bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl"
          >
            <Plus className="w-5 h-5" />
            <span className="font-medium">Start First Agent</span>
          </motion.button>
        </motion.div>
      )}
    </div>
  );
};