import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Star, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';
import { Seed } from '../../types/seed';
import { useSeeds } from '../../hooks/useSeeds';
import { useNavigate } from 'react-router-dom';

interface SeedPillsProps {
  onSelectSeed: (seed: Seed) => void;
  selectedSeedId?: string;
  className?: string;
}

export const SeedPills: React.FC<SeedPillsProps> = ({ 
  onSelectSeed, 
  selectedSeedId,
  className 
}) => {
  const navigate = useNavigate();
  const { seeds, loading } = useSeeds({ limit: 4 }); // Get top 4 seeds
  const [hoveredSeed, setHoveredSeed] = useState<string | null>(null);

  const handleAddMore = () => {
    // Navigate to the Seeds page
    navigate('/farms/new');
  };

  if (loading) {
    return (
      <div className={clsx('flex items-center gap-2', className)}>
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="h-8 w-24 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className={clsx('flex items-center gap-2 flex-wrap', className)}>
      <AnimatePresence mode="popLayout">
        {seeds.slice(0, 4).map((seed) => (
          <motion.button
            key={seed.id}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onSelectSeed(seed)}
            onMouseEnter={() => setHoveredSeed(seed.id)}
            onMouseLeave={() => setHoveredSeed(null)}
            className={clsx(
              'relative px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200',
              'border flex items-center gap-1.5',
              selectedSeedId === seed.id
                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 border-primary-300 dark:border-primary-700'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            )}
          >
            {seed.isOfficial && (
              <Star className="w-3 h-3 text-yellow-500" />
            )}
            <span className="truncate max-w-[120px]">{seed.name}</span>
            
            {/* Tooltip on hover */}
            {hoveredSeed === seed.id && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 z-50"
              >
                <div className="bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg">
                  <p className="font-medium mb-1">{seed.name}</p>
                  <p className="text-gray-300 dark:text-gray-400">{seed.description}</p>
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-gray-900 dark:bg-gray-700"></div>
                </div>
              </motion.div>
            )}
          </motion.button>
        ))}
        
        {/* Add More Button */}
        <motion.button
          key="add-more"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleAddMore}
          className={clsx(
            'px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200',
            'border flex items-center gap-1.5',
            'bg-gray-50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400',
            'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
            'hover:bg-gray-100 dark:hover:bg-gray-800'
          )}
        >
          <Plus className="w-3 h-3" />
          <span>More</span>
        </motion.button>
      </AnimatePresence>
    </div>
  );
};