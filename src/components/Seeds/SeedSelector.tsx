import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, 
  Search, 
  Filter, 
  Clock, 
  TrendingUp,
  Users,
  Zap,
  Brain,
  Code,
  Shield,
  Beaker,
  CheckCircle,
  Star
} from 'lucide-react';
import { clsx } from 'clsx';
import { Seed, SeedFilter } from '@/types/seed';
import { useSeeds, useSeedCategories } from '@/hooks/useSeeds';

interface SeedSelectorProps {
  onSelectSeed: (seed: Seed) => void;
  selectedSeedId?: string;
  className?: string;
}

const categoryIcons: Record<string, React.ElementType> = {
  Development: Code,
  Quality: Shield,
  Research: Beaker,
  Custom: Sparkles,
  Automation: Zap,
  Analysis: Brain
};

export const SeedSelector: React.FC<SeedSelectorProps> = ({ 
  onSelectSeed, 
  selectedSeedId,
  className 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  // Use the new hooks
  const seedFilter: SeedFilter = {
    category: selectedCategory || undefined,
    search: searchTerm || undefined
  };
  
  const { seeds, loading, error } = useSeeds(seedFilter);
  const { categories } = useSeedCategories();

  // Filtering is already done by the hook through the filter parameter
  const filteredSeeds = seeds;

  const groupedSeeds = filteredSeeds.reduce((acc, seed) => {
    if (!acc[seed.category]) {
      acc[seed.category] = [];
    }
    acc[seed.category].push(seed);
    return acc;
  }, {} as Record<string, Seed[]>);

  const formatUsageCount = (count: number): string => {
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return count.toString();
  };

  return (
    <div className={clsx('space-y-4', className)}>
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Choose a Seed Template
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Select from previously saved configurations to quickly start your farm
        </p>
      </div>

      {/* Search and Filters */}
      <div className="space-y-3">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search seeds..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-apple text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {/* Category Filter */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-2">
          <button
            onClick={() => setSelectedCategory(null)}
            className={clsx(
              'px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
              !selectedCategory
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            )}
          >
            All
          </button>
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={clsx(
                'px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
                selectedCategory === category
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              )}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Seeds List */}
      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Loading seeds...</p>
        </div>
      ) : error ? (
        <div className="text-center py-8">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      ) : filteredSeeds.length === 0 ? (
        <div className="text-center py-8">
          <Sparkles className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 dark:text-gray-400">No seeds found</p>
        </div>
      ) : (
        <div className="space-y-6 max-h-[400px] overflow-y-auto pr-2">
          <AnimatePresence>
            {Object.entries(groupedSeeds).map(([category, categorySeeds]) => {
              const Icon = categoryIcons[category] || Sparkles;
              
              return (
                <motion.div
                  key={category}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-3"
                >
                  {/* Category Header */}
                  <div className="flex items-center space-x-2">
                    <Icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {category}
                    </h4>
                    <span className="text-xs text-gray-500">
                      ({categorySeeds.length})
                    </span>
                  </div>

                  {/* Seeds in Category */}
                  <div className="space-y-2">
                    {categorySeeds.map((seed) => (
                      <motion.button
                        key={seed.id}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => onSelectSeed(seed)}
                        className={clsx(
                          'w-full p-4 rounded-apple-lg border transition-all text-left',
                          selectedSeedId === seed.id
                            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
                        )}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2">
                              <h5 className="font-medium text-gray-900 dark:text-white">
                                {seed.name}
                              </h5>
                              {seed.isOfficial && (
                                <Star className="w-4 h-4 text-yellow-500" />
                              )}
                              {selectedSeedId === seed.id && (
                                <CheckCircle className="w-4 h-4 text-primary-600" />
                              )}
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              {seed.description}
                            </p>
                            
                            {/* Metadata */}
                            <div className="flex items-center space-x-4 mt-2">
                              <div className="flex items-center space-x-1">
                                <Users className="w-3 h-3 text-gray-400" />
                                <span className="text-xs text-gray-500">
                                  {seed.metadata.agentCount} agents
                                </span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <Clock className="w-3 h-3 text-gray-400" />
                                <span className="text-xs text-gray-500">
                                  Used {formatUsageCount(seed.usage.count)} times
                                </span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <TrendingUp className="w-3 h-3 text-gray-400" />
                                <span className="text-xs text-gray-500">
                                  {seed.usage.successRate}% success
                                </span>
                              </div>
                            </div>

                            {/* Tags */}
                            <div className="flex flex-wrap gap-1 mt-2">
                              {seed.tags.slice(0, 3).map((_tag, _index) => (
                                <span
                                  key={`tag-${_tag}-${_index}`}
                                  className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full"
                                >
                                  {_tag}
                                </span>
                              ))}
                              {seed.tags.length > 3 && (
                                <span className="px-2 py-0.5 text-xs text-gray-500">
                                  +{seed.tags.length - 3}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};