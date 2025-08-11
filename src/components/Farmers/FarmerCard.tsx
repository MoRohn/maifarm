import React from 'react';
import { motion } from 'framer-motion';
import { 
  Users, 
  Zap
} from 'lucide-react';
import { FarmerTemplate } from '../../types/farmers';

interface FarmerCardProps {
  farmer: FarmerTemplate;
  onClick: () => void;
  onUse: () => void;
}

export const FarmerCard: React.FC<FarmerCardProps> = ({ farmer, onClick, onUse }) => {
  const getCategoryInfo = (category: string) => {
    const categoryData = {
      startup: { 
        icon: '🚀', 
        color: 'from-purple-400 to-purple-600',
        bgColor: 'from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20'
      },
      technical: { 
        icon: '💻', 
        color: 'from-blue-400 to-blue-600',
        bgColor: 'from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20'
      },
      creative: { 
        icon: '🎨', 
        color: 'from-pink-400 to-pink-600',
        bgColor: 'from-pink-50 to-pink-100 dark:from-pink-900/20 dark:to-pink-800/20'
      },
      research: { 
        icon: '🔬', 
        color: 'from-green-400 to-green-600',
        bgColor: 'from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20'
      },
      operations: { 
        icon: '⚙️', 
        color: 'from-gray-400 to-gray-600',
        bgColor: 'from-gray-50 to-gray-100 dark:from-gray-900/20 dark:to-gray-800/20'
      }
    };
    return categoryData[category as keyof typeof categoryData] || categoryData.operations;
  };

  const getComplexityInfo = (complexity: string) => {
    const complexityData = {
      beginner: { icon: '🌱', label: 'Beginner', color: 'text-green-600' },
      moderate: { icon: '🌿', label: 'Moderate', color: 'text-yellow-600' },
      advanced: { icon: '🌳', label: 'Advanced', color: 'text-orange-600' },
      expert: { icon: '🦅', label: 'Expert', color: 'text-red-600' }
    };
    return complexityData[complexity as keyof typeof complexityData] || complexityData.moderate;
  };

  const categoryInfo = getCategoryInfo(farmer.category);
  const complexityInfo = getComplexityInfo(farmer.metadata.complexity);

  // Get the main agent for display (first one)
  const mainAgent = farmer.agents[0];
  const agentAvatar = mainAgent?.emoji || categoryInfo.icon;

  return (
    <motion.div
      whileHover={{ 
        scale: 1.02,
        boxShadow: "0 20px 40px rgba(0, 0, 0, 0.1)"
      }}
      whileTap={{ scale: 0.98 }}
      className={`relative bg-gradient-to-br ${categoryInfo.bgColor} rounded-apple-lg p-6 border border-gray-200 dark:border-gray-700 cursor-pointer overflow-hidden group min-h-[420px] flex flex-col w-full`}
      onClick={onClick}
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5 dark:opacity-10">
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-white to-transparent transform rotate-12 translate-x-1/2 translate-y-1/2" />
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-4 relative z-10">
        <div className="flex items-center space-x-3">
          <motion.div
            whileHover={{ scale: 1.1, rotate: 5 }}
            className={`p-3 bg-gradient-to-br ${categoryInfo.color} rounded-apple shadow-lg`}
          >
            <span className="text-2xl">{agentAvatar}</span>
          </motion.div>
          <div>
            <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-1">
              {farmer.title}
            </h3>
            <div className="flex items-center space-x-2">
              <span className={`text-sm font-medium ${complexityInfo.color}`}>
                {complexityInfo.icon} {complexityInfo.label}
              </span>
              <span className="text-xs text-gray-500">•</span>
              <span className="text-xs text-gray-600 dark:text-gray-400 capitalize">
                {farmer.category}
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Description */}
      <p className="text-sm text-gray-700 dark:text-gray-300 mb-4 line-clamp-2 relative z-10">
        {farmer.description}
      </p>

      {/* Agent Team Info */}
      <div className="mb-6 relative z-10">
        <div className="flex items-center space-x-2 mb-3">
          <Users className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Agent Team ({farmer.agents.length})
          </span>
        </div>
        
        {/* Display all agents */}
        <div className="space-y-3">
          {farmer.agents.map((agent, index) => (
            <div key={index} className="flex items-start space-x-3">
              <div className="text-lg flex-shrink-0">{agent.emoji || '🤖'}</div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {agent.name}
                </h4>
                <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1">
                  {agent.role}
                </p>
                
                {/* Show capabilities for the main agent or if only one agent */}
                {(index === 0 || farmer.agents.length === 1) && agent.capabilities && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {agent.capabilities.slice(0, 3).map((capability, capIndex) => (
                      <span
                        key={capIndex}
                        className="px-2 py-1 bg-white/60 dark:bg-gray-800/60 text-xs rounded-full text-gray-700 dark:text-gray-300"
                      >
                        {capability}
                      </span>
                    ))}
                    {agent.capabilities.length > 3 && (
                      <span className="px-2 py-1 bg-white/60 dark:bg-gray-800/60 text-xs rounded-full text-gray-500">
                        +{agent.capabilities.length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>


      {/* Spacer to push actions to bottom */}
      <div className="flex-grow"></div>

      {/* View Profile text in center */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-5">
        <span className="text-gray-600 dark:text-gray-400 text-sm font-medium opacity-30">
          View Profile
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end relative z-10">
        <motion.button
          whileHover={{ scale: 1.05, backgroundColor: 'rgba(0, 0, 0, 0.05)' }}
          whileTap={{ scale: 0.95 }}
          onClick={(e) => {
            e.stopPropagation();
            onUse();
          }}
          className="px-3 py-1.5 bg-white/80 dark:bg-gray-800/80 text-sm font-medium rounded-apple border border-gray-200 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-700 transition-colors flex items-center space-x-1"
        >
          <Zap className="w-3 h-3" />
          <span>Use</span>
        </motion.button>
      </div>

      {/* Hover Effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
    </motion.div>
  );
};