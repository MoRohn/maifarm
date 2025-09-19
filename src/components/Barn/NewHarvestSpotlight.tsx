import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Package, 
  Star, 
  Sparkles, 
  Clock,
  Users,
  FileText,
  TrendingUp,
  Award,
  ArrowRight,
  Eye,
  Download,
  Share2,
  Zap,
  Code,
  Wrench
} from 'lucide-react';
import { Harvest } from '@/types/barn';

interface NewHarvestSpotlightProps {
  harvest: Harvest;
  isNew: boolean;
  onClick: () => void;
  onUse?: () => void;
  onShare?: () => void;
}

export const NewHarvestSpotlight: React.FC<NewHarvestSpotlightProps> = ({
  harvest,
  isNew,
  onClick,
  onUse,
  onShare
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [statsVisible, setStatsVisible] = useState(false);

  useEffect(() => {
    // Reveal stats after card appears
    if (isNew) {
      const timer = setTimeout(() => setStatsVisible(true), 500);
      return () => clearTimeout(timer);
    } else {
      setStatsVisible(true);
    }
  }, [isNew]);

  const getTypeIcon = () => {
    switch (harvest.type) {
      case 'app': return Package;
      case 'tool': return Wrench;
      case 'script': return Code;
      default: return FileText;
    }
  };

  const TypeIcon = getTypeIcon();

  // Calculate quality score (mock calculation)
  const qualityScore = harvest.metadata?.successRate || 95;
  const timeSaved = Math.floor((harvest.metadata?.duration || 10000) / 60000);

  return (
    <motion.div
      className="relative"
      initial={isNew ? { scale: 0, rotate: -10 } : { scale: 1 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ 
        type: "spring", 
        stiffness: 100, 
        damping: 15,
        delay: isNew ? 0.2 : 0
      }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      whileHover={{ y: -8 }}
      onClick={onClick}
    >
      {/* New badge */}
      {isNew && (
        <motion.div
          className="absolute -top-2 -right-2 z-20"
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
        >
          <div className="relative">
            <div className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
              NEW
            </div>
            <motion.div
              className="absolute inset-0 bg-yellow-400 rounded-full"
              animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </div>
        </motion.div>
      )}

      {/* Glow effect for new items */}
      {isNew && (
        <motion.div
          className="absolute inset-0 rounded-2xl"
          animate={{
            boxShadow: [
              '0 0 20px rgba(251, 191, 36, 0)',
              '0 0 40px rgba(251, 191, 36, 0.5)',
              '0 0 20px rgba(251, 191, 36, 0)'
            ]
          }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}

      {/* Main card */}
      <motion.div
        className={`
          relative overflow-hidden rounded-2xl border-2 transition-all duration-300
          ${isNew 
            ? 'bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:from-gray-900 dark:via-gray-800 dark:to-amber-900/20 border-yellow-400/50' 
            : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800'
          }
          ${isHovered ? 'shadow-2xl' : 'shadow-lg'}
        `}
      >
        {/* Animated background pattern */}
        {isNew && (
          <div className="absolute inset-0 opacity-10">
            {Array.from({ length: 6 }, (_, i) => (
              <motion.div
                key={i}
                className="absolute"
                initial={{
                  x: Math.random() * 100 + '%',
                  y: Math.random() * 100 + '%',
                }}
                animate={{
                  x: [
                    Math.random() * 100 + '%',
                    Math.random() * 100 + '%',
                    Math.random() * 100 + '%',
                  ],
                  y: [
                    Math.random() * 100 + '%',
                    Math.random() * 100 + '%',
                    Math.random() * 100 + '%',
                  ],
                }}
                transition={{
                  duration: 20 + Math.random() * 10,
                  repeat: Infinity,
                  ease: "linear"
                }}
              >
                <Sparkles className="w-4 h-4 text-yellow-400" />
              </motion.div>
            ))}
          </div>
        )}

        {/* Header section */}
        <div className="p-6 pb-4">
          <div className="flex items-start justify-between mb-4">
            <motion.div
              className="p-3 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 rounded-xl"
              animate={isNew ? {
                rotate: [0, 10, -10, 0],
              } : {}}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <TypeIcon className="w-8 h-8 text-gray-700 dark:text-gray-300" />
            </motion.div>

            {/* Quality badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6 }}
              className="flex items-center space-x-1 bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded-full"
            >
              <Award className="w-4 h-4 text-green-600 dark:text-green-400" />
              <span className="text-xs font-bold text-green-600 dark:text-green-400">
                {qualityScore}%
              </span>
            </motion.div>
          </div>

          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            {harvest.name}
          </h3>
          
          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
            {harvest.description}
          </p>
        </div>

        {/* Stats section */}
        <AnimatePresence>
          {statsVisible && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="px-6 pb-6"
            >
              <div className="grid grid-cols-3 gap-3">
                <motion.div
                  className="text-center"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <FileText className="w-5 h-5 mx-auto mb-1 text-blue-500" />
                  <div className="text-lg font-bold text-gray-900 dark:text-white">
                    {harvest.yield?.length || 0}
                  </div>
                  <div className="text-xs text-gray-500">Files</div>
                </motion.div>

                <motion.div
                  className="text-center"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <Clock className="w-5 h-5 mx-auto mb-1 text-green-500" />
                  <div className="text-lg font-bold text-gray-900 dark:text-white">
                    {timeSaved}m
                  </div>
                  <div className="text-xs text-gray-500">Saved</div>
                </motion.div>

                <motion.div
                  className="text-center"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <Star className="w-5 h-5 mx-auto mb-1 text-yellow-500" />
                  <div className="text-lg font-bold text-gray-900 dark:text-white">
                    {harvest.useCount}
                  </div>
                  <div className="text-xs text-gray-500">Uses</div>
                </motion.div>
              </div>

              {/* Agent contributors - Disabled: summary is a string, not an object */}
              {false && harvest.summary && (
                <motion.div
                  className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex -space-x-2">
                      {harvest.summary && typeof harvest.summary === 'object' && Array.isArray((harvest.summary as any).agents) ? 
                        (harvest.summary as any).agents.slice(0, 4).map((agent: any, i: number) => (
                        <motion.div
                          key={agent.id || agent.name || i}
                          className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center text-white text-xs font-bold border-2 border-white dark:border-gray-900"
                          initial={{ scale: 0, x: -20 }}
                          animate={{ scale: 1, x: 0 }}
                          transition={{ delay: 0.5 + i * 0.1 }}
                        >
                          {(agent.name || agent.id || `A${i+1}`).slice(0, 2).toUpperCase()}
                        </motion.div>
                      )) : []}
                      {harvest.summary && typeof harvest.summary === 'object' && Array.isArray((harvest.summary as any).agents) && (harvest.summary as any).agents.length > 4 && (
                        <motion.div
                          className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-400 text-xs font-bold border-2 border-white dark:border-gray-900"
                          initial={{ scale: 0, x: -20 }}
                          animate={{ scale: 1, x: 0 }}
                          transition={{ delay: 0.9 }}
                        >
                          +{(harvest.summary as any).agents.length - 4}
                        </motion.div>
                      )}
                    </div>
                    
                    <motion.div
                      className="flex items-center text-xs text-gray-500"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 1 }}
                    >
                      <Users className="w-4 h-4 mr-1" />
                      {harvest.metadata.agentCount} agents
                    </motion.div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hover overlay with actions */}
        <AnimatePresence>
          {isHovered && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-end justify-center pb-6 px-6"
            >
              <motion.div
                className="flex space-x-2 w-full justify-center"
                initial={{ y: 20 }}
                animate={{ y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <motion.button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClick();
                  }}
                  className="px-4 py-2 bg-white/20 backdrop-blur text-white rounded-lg flex items-center space-x-2 hover:bg-white/30 transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Eye className="w-4 h-4" />
                  <span className="text-sm font-medium">View</span>
                </motion.button>

                {onUse && (
                  <motion.button
                    onClick={(e) => {
                      e.stopPropagation();
                      onUse();
                    }}
                    className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg flex items-center space-x-2 hover:from-blue-600 hover:to-purple-700 transition-all"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Zap className="w-4 h-4" />
                    <span className="text-sm font-medium">Use</span>
                  </motion.button>
                )}

                {onShare && (
                  <motion.button
                    onClick={(e) => {
                      e.stopPropagation();
                      onShare();
                    }}
                    className="px-4 py-2 bg-white/20 backdrop-blur text-white rounded-lg flex items-center space-x-2 hover:bg-white/30 transition-colors"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Share2 className="w-4 h-4" />
                  </motion.button>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
};