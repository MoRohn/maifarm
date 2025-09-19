import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Farm } from '@/types';
import { FarmCard } from './FarmCard';
import { Plus, Filter, Grid, List } from 'lucide-react';

interface FarmGridProps {
  farms: Farm[];
  onFarmClick?: (farm: Farm) => void;
  onCreateNew?: () => void;
  onPauseFarm?: (farmId: string) => void;
  onResumeFarm?: (farmId: string) => void;
  onDeleteFarm?: (farmId: string) => void;
}

export function FarmGrid({
  farms,
  onFarmClick,
  onCreateNew,
  onPauseFarm,
  onResumeFarm,
  onDeleteFarm,
}: FarmGridProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterType, setFilterType] = useState<'all' | 'active' | 'paused' | 'completed'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'efficiency'>('recent');

  // Filter farms
  const filteredFarms = farms.filter(farm => {
    if (filterType === 'all') return true;
    return farm.status === filterType;
  });

  // Sort farms
  const sortedFarms = [...filteredFarms].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'efficiency':
        return (b.metrics?.efficiency || 0) - (a.metrics?.efficiency || 0);
      case 'recent':
      default:
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    }
  });

  const filterOptions = [
    { value: 'all', label: 'All Farms' },
    { value: 'active', label: 'Active' },
    { value: 'paused', label: 'Paused' },
    { value: 'completed', label: 'Completed' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold">Your Farms</h2>
        
        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-gray-700 shadow-sm'
                  : 'hover:bg-gray-200 dark:hover:bg-gray-700'
              } transition-all`}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-gray-700 shadow-sm'
                  : 'hover:bg-gray-200 dark:hover:bg-gray-700'
              } transition-all`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {/* Filter dropdown */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {filterOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {/* Sort dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="recent">Recent</option>
            <option value="name">Name</option>
            <option value="efficiency">Efficiency</option>
          </select>

          {/* Create new button */}
          <button
            onClick={onCreateNew}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Farm</span>
          </button>
        </div>
      </div>

      {/* Farms grid/list */}
      <AnimatePresence mode="wait">
        {sortedFarms.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center py-12"
          >
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <Plus className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium mb-2">No farms yet</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Create your first farm to start orchestrating AI agents
            </p>
            <button onClick={onCreateNew} className="btn-primary">
              Create Your First Farm
            </button>
          </motion.div>
        ) : (
          <motion.div
            key={viewMode}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
                : 'space-y-4'
            }
          >
            {sortedFarms.map((farm, index) => (
              <motion.div
                key={farm.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <FarmCard
                  farm={farm}
                  onClick={() => onFarmClick?.(farm)}
                  onPause={() => onPauseFarm?.(farm.id)}
                  onResume={() => onResumeFarm?.(farm.id)}
                  onDelete={() => onDeleteFarm?.(farm.id)}
                />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}