import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { Layers, Star, Clock, Sparkles } from 'lucide-react';
import { FarmerGroup } from '@/types/farmers';
import { useFarmerGroupStore } from '@/store/farmerGroupStore';

interface FarmerGroupsNavProps {
  selectedGroupId: string | null;
  onSelectGroup: (groupId: string | null) => void;
  showFavorites?: boolean;
  showRecent?: boolean;
}

const groupGradients: Record<string, string> = {
  'creative-content': 'from-purple-500 to-pink-500',
  'technical-development': 'from-blue-500 to-cyan-500',
  'business-strategy': 'from-amber-500 to-orange-500',
  'operations-analysis': 'from-green-500 to-emerald-500',
};

export const FarmerGroupsNav: React.FC<FarmerGroupsNavProps> = ({
  selectedGroupId,
  onSelectGroup,
  showFavorites = true,
  showRecent = true,
}) => {
  const {
    groups,
    favorites,
    recentFarmers,
    loading,
    fetchGroups,
    fetchFavorites,
    fetchRecentFarmers,
  } = useFarmerGroupStore();

  useEffect(() => {
    fetchGroups();
    if (showFavorites) fetchFavorites();
    if (showRecent) fetchRecentFarmers();
  }, [fetchGroups, fetchFavorites, fetchRecentFarmers, showFavorites, showRecent]);

  const getGradient = (group: FarmerGroup) => {
    return group.color || groupGradients[group.slug] || 'from-gray-500 to-gray-600';
  };

  return (
    <div className="space-y-4">
      {/* Main Groups Row */}
      <div className="flex flex-wrap gap-2">
        {/* All Farmers Button */}
        <motion.button
          onClick={() => onSelectGroup(null)}
          className={clsx(
            'flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
            selectedGroupId === null
              ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/30'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
          )}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Layers className="w-4 h-4" />
          <span>All Farmers</span>
        </motion.button>

        {/* Group Buttons */}
        {groups.map((group) => (
          <motion.button
            key={group.id}
            onClick={() => onSelectGroup(group.id)}
            className={clsx(
              'flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
              selectedGroupId === group.id
                ? `bg-gradient-to-r ${getGradient(group)} text-white shadow-lg`
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            )}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <span className="text-base">{group.icon}</span>
            <span>{group.name}</span>
            <span
              className={clsx(
                'ml-1 px-1.5 py-0.5 rounded text-xs',
                selectedGroupId === group.id
                  ? 'bg-white/20'
                  : 'bg-gray-200 dark:bg-gray-700'
              )}
            >
              {group.farmerCount}
            </span>
          </motion.button>
        ))}

        {/* Favorites Button */}
        {showFavorites && favorites.length > 0 && (
          <motion.button
            onClick={() => onSelectGroup('favorites')}
            className={clsx(
              'flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
              selectedGroupId === 'favorites'
                ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white shadow-lg shadow-yellow-500/30'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            )}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Star className="w-4 h-4" />
            <span>Favorites</span>
            <span
              className={clsx(
                'ml-1 px-1.5 py-0.5 rounded text-xs',
                selectedGroupId === 'favorites'
                  ? 'bg-white/20'
                  : 'bg-gray-200 dark:bg-gray-700'
              )}
            >
              {favorites.length}
            </span>
          </motion.button>
        )}

        {/* Recent Button */}
        {showRecent && recentFarmers.length > 0 && (
          <motion.button
            onClick={() => onSelectGroup('recent')}
            className={clsx(
              'flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
              selectedGroupId === 'recent'
                ? 'bg-gradient-to-r from-indigo-400 to-violet-500 text-white shadow-lg shadow-indigo-500/30'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            )}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Clock className="w-4 h-4" />
            <span>Recent</span>
            <span
              className={clsx(
                'ml-1 px-1.5 py-0.5 rounded text-xs',
                selectedGroupId === 'recent'
                  ? 'bg-white/20'
                  : 'bg-gray-200 dark:bg-gray-700'
              )}
            >
              {recentFarmers.length}
            </span>
          </motion.button>
        )}
      </div>

      {/* Selected Group Description */}
      {selectedGroupId && selectedGroupId !== 'favorites' && selectedGroupId !== 'recent' && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl"
        >
          {(() => {
            const selectedGroup = groups.find(g => g.id === selectedGroupId);
            if (!selectedGroup) return null;
            return (
              <>
                <div
                  className={clsx(
                    'p-2 rounded-lg bg-gradient-to-br',
                    getGradient(selectedGroup)
                  )}
                >
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {selectedGroup.name}
                  </p>
                  {selectedGroup.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {selectedGroup.description}
                    </p>
                  )}
                </div>
              </>
            );
          })()}
        </motion.div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center space-x-2 text-gray-500">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-500 border-t-transparent" />
          <span className="text-sm">Loading groups...</span>
        </div>
      )}
    </div>
  );
};

export default FarmerGroupsNav;
