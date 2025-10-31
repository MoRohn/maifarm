import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Archive,
  Search,
  Filter,
  Calendar,
  Tag,
  User,
  Clock,
  DollarSign,
  Brain,
  Eye,
  RotateCcw,
  Trash2,
  Download,
  Star,
  Pin,
  Grid3x3,
  List,
  ChevronDown,
  SortAsc,
  SortDesc,
  Loader2
} from 'lucide-react';
import { clsx } from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { useArchiveStore } from '@/store/archiveStore';
import { ArchivedFarmSummary } from '@/types/archive';
import { toast } from 'react-hot-toast';

interface ArchivedFarmsViewProps {
  onSelectArchive: (archiveId: string) => void;
}

export const ArchivedFarmsView: React.FC<ArchivedFarmsViewProps> = ({ onSelectArchive }) => {
  const {
    archivedFarms,
    loading,
    error,
    filter,
    currentPage,
    pageSize,
    totalArchives,
    fetchArchivedFarms,
    fetchArchiveStats,
    setFilter,
    setCurrentPage,
    restoreFarm,
    deleteArchive,
    clearError
  } = useArchiveStore();

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('archivedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    // Fetch archived farms on mount
    fetchArchivedFarms();
    fetchArchiveStats();
  }, []);

  useEffect(() => {
    // Clear error after 5 seconds
    if (error) {
      const timer = setTimeout(() => clearError(), 5000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilter({ search: searchQuery });
  };

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    setFilter({ category: category || undefined });
  };

  const handleSortChange = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setFilter({ sortBy: field, sortOrder: sortOrder === 'asc' ? 'desc' : 'asc' });
  };

  const handleRestoreFarm = async (e: React.MouseEvent, farmId: string, farmName: string) => {
    e.stopPropagation();

    if (confirm(`Are you sure you want to restore "${farmName}"?`)) {
      try {
        await restoreFarm({ farmId });
        toast.success(`Farm "${farmName}" restored successfully`);
      } catch (error) {
        toast.error(`Failed to restore farm "${farmName}"`);
      }
    }
  };

  const handleDeleteArchive = async (e: React.MouseEvent, archiveId: string, farmName: string) => {
    e.stopPropagation();

    if (confirm(`Are you sure you want to permanently delete the archive for "${farmName}"? This action cannot be undone.`)) {
      try {
        await deleteArchive(archiveId);
        toast.success(`Archive for "${farmName}" deleted permanently`);
      } catch (error) {
        toast.error(`Failed to delete archive for "${farmName}"`);
      }
    }
  };

  const categories = ['development', 'production', 'testing', 'experiment', 'demo'];

  const totalPages = Math.ceil(totalArchives / pageSize);

  return (
    <div className="space-y-6">
      {/* Header and Search */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Archive className="w-6 h-6 text-primary-600 dark:text-primary-400" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Archived Farms</h2>
          <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-full text-xs font-medium text-gray-600 dark:text-gray-400">
            {totalArchives} archives
          </span>
        </div>

        <div className="flex items-center space-x-3">
          {/* Search */}
          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search archives..."
              className="pl-9 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
            />
          </form>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={clsx(
              'p-2 rounded-lg transition-colors',
              showFilters
                ? 'bg-primary-100 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            )}
          >
            <Filter className="w-5 h-5" />
          </button>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={clsx(
                'p-1.5 rounded transition-colors',
                viewMode === 'grid'
                  ? 'bg-white dark:bg-gray-700 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400'
              )}
            >
              <Grid3x3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={clsx(
                'p-1.5 rounded transition-colors',
                viewMode === 'list'
                  ? 'bg-white dark:bg-gray-700 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400'
              )}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 space-y-4">
              {/* Categories */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Category
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleCategoryChange('')}
                    className={clsx(
                      'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                      !selectedCategory
                        ? 'bg-primary-100 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                    )}
                  >
                    All
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => handleCategoryChange(cat)}
                      className={clsx(
                        'px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors',
                        selectedCategory === cat
                          ? 'bg-primary-100 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sort Options */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Sort By
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { field: 'archivedAt', label: 'Date Archived' },
                    { field: 'farmName', label: 'Name' },
                    { field: 'executionTime', label: 'Execution Time' },
                    { field: 'cost', label: 'Cost' },
                    { field: 'viewCount', label: 'Views' }
                  ].map(({ field, label }) => (
                    <button
                      key={field}
                      onClick={() => handleSortChange(field)}
                      className={clsx(
                        'flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-medium transition-colors',
                        sortBy === field
                          ? 'bg-primary-100 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                      )}
                    >
                      <span>{label}</span>
                      {sortBy === field && (
                        sortOrder === 'asc' ? <SortAsc className="w-3 h-3" /> : <SortDesc className="w-3 h-3" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Archives Grid/List */}
      {!loading && !error && (
        <>
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {archivedFarms.map((archive) => (
                <ArchivedFarmCard
                  key={archive.id}
                  archive={archive}
                  onClick={() => onSelectArchive(archive.id)}
                  onRestore={(e) => handleRestoreFarm(e, archive.farmId, archive.farmName)}
                  onDelete={(e) => handleDeleteArchive(e, archive.id, archive.farmName)}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {archivedFarms.map((archive) => (
                <ArchivedFarmListItem
                  key={archive.id}
                  archive={archive}
                  onClick={() => onSelectArchive(archive.id)}
                  onRestore={(e) => handleRestoreFarm(e, archive.farmId, archive.farmName)}
                  onDelete={(e) => handleDeleteArchive(e, archive.id, archive.farmName)}
                />
              ))}
            </div>
          )}

          {/* Empty State */}
          {archivedFarms.length === 0 && (
            <div className="text-center py-12">
              <Archive className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No archived farms</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Farms you archive will appear here for future reference
              </p>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center space-x-2 mt-8">
              <button
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-3 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-3 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// Archive Card Component
const ArchivedFarmCard: React.FC<{
  archive: ArchivedFarmSummary;
  onClick: () => void;
  onRestore: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}> = ({ archive, onClick, onRestore, onDelete }) => {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="relative bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 cursor-pointer hover:shadow-lg transition-shadow"
    >
      {/* Pinned Badge */}
      {archive.isPinned && (
        <Pin className="absolute top-2 right-2 w-4 h-4 text-yellow-500" />
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-medium text-gray-900 dark:text-white line-clamp-1">
            {archive.farmName}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Archived {formatDistanceToNow(new Date(archive.archivedAt), { addSuffix: true })}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
        <div className="flex items-center space-x-1 text-gray-600 dark:text-gray-400">
          <Brain className="w-3 h-3" />
          <span>{archive.agentCount} agents</span>
        </div>
        <div className="flex items-center space-x-1 text-gray-600 dark:text-gray-400">
          <Clock className="w-3 h-3" />
          <span>{Math.round(archive.executionTimeSeconds / 60)}min</span>
        </div>
        <div className="flex items-center space-x-1 text-gray-600 dark:text-gray-400">
          <DollarSign className="w-3 h-3" />
          <span>${archive.totalCost.toFixed(2)}</span>
        </div>
        <div className="flex items-center space-x-1 text-gray-600 dark:text-gray-400">
          <Eye className="w-3 h-3" />
          <span>{archive.viewCount} views</span>
        </div>
      </div>

      {/* Tags */}
      {archive.tags && archive.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {archive.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs rounded-full"
            >
              {tag}
            </span>
          ))}
          {archive.tags.length > 3 && (
            <span className="text-xs text-gray-500">+{archive.tags.length - 3}</span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
        <div className="flex items-center space-x-2">
          <button
            onClick={onRestore}
            className="p-1.5 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/20 rounded transition-colors"
            title="Restore farm"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20 rounded transition-colors"
            title="Delete permanently"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {archive.qualityScore && (
          <div className="flex items-center space-x-1">
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                className={clsx(
                  'w-3 h-3',
                  i < Math.round(archive.qualityScore)
                    ? 'text-yellow-400 fill-current'
                    : 'text-gray-300 dark:text-gray-700'
                )}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};

// Archive List Item Component
const ArchivedFarmListItem: React.FC<{
  archive: ArchivedFarmSummary;
  onClick: () => void;
  onRestore: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}> = ({ archive, onClick, onRestore, onDelete }) => {
  return (
    <motion.div
      whileHover={{ x: 2 }}
      onClick={onClick}
      className="flex items-center justify-between bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="flex items-center space-x-4">
        <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
          <Archive className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </div>
        <div>
          <h3 className="font-medium text-gray-900 dark:text-white">
            {archive.farmName}
          </h3>
          <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
            <span>{archive.agentCount} agents</span>
            <span>•</span>
            <span>{Math.round(archive.executionTimeSeconds / 60)}min</span>
            <span>•</span>
            <span>${archive.totalCost.toFixed(2)}</span>
            <span>•</span>
            <span>{formatDistanceToNow(new Date(archive.archivedAt), { addSuffix: true })}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        {archive.isPinned && <Pin className="w-4 h-4 text-yellow-500" />}
        <button
          onClick={onRestore}
          className="p-1.5 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/20 rounded transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20 rounded transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
};