import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Warehouse,
  Folder,
  FolderOpen,
  Search,
  Filter,
  Grid3x3,
  List,
  Download,
  Upload,
  Trash2,
  Star,
  Clock,
  Package,
  Code,
  Wrench,
  FileText,
  MoreVertical,
  Plus,
  ChevronRight,
  Tag
} from 'lucide-react';
import { clsx } from 'clsx';
import { Harvest, BarnFolder, BarnStats } from '../../types/barn';
import { api } from '../../services/apiClient';
import apiClient from '../../services/apiClient';
import { HarvestCard } from './HarvestCard';
import { FolderView } from './FolderView';
import { HarvestDetails } from './HarvestDetails';

export const BarnPage: React.FC = () => {
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [selectedFolder, setSelectedFolder] = useState<BarnFolder | null>(null);
  const [selectedHarvest, setSelectedHarvest] = useState<Harvest | null>(null);
  const [harvests, setHarvests] = useState<Harvest[]>([]);
  const [folders, setFolders] = useState<BarnFolder[]>([]);
  const [stats, setStats] = useState<BarnStats | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [breadcrumbs, setBreadcrumbs] = useState<BarnFolder[]>([]);

  useEffect(() => {
    loadBarnData();
  }, []);

  const loadBarnData = async () => {
    setLoading(true);
    try {
      const [harvestsRes, statsRes] = await Promise.all([
        api.harvests.list(),
        api.barn.stats()
      ]);

      if (harvestsRes.data.success) {
        setHarvests(harvestsRes.data.data);
      }
      if (statsRes.data.success) {
        setStats(statsRes.data.data);
      }
    } catch (error) {
      console.error('Failed to load barn data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredHarvests = harvests.filter(harvest => {
    const matchesSearch = harvest.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         harvest.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || harvest.type === filterType;
    const matchesFolder = !selectedFolder || selectedFolder.harvestIds.includes(harvest.id);
    
    return matchesSearch && matchesType && matchesFolder;
  });

  const handleCreateFolder = async (name: string) => {
    try {
      const response = await api.barn.folders.create({
        name,
        parentId: selectedFolder?.id
      });
      
      if (response.data.success) {
        setFolders([...folders, response.data.data]);
      }
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  };

  const handleDeleteHarvest = async (id: string) => {
    try {
      await api.harvests.delete(id);
      setHarvests(harvests.filter(h => h.id !== id));
    } catch (error) {
      console.error('Failed to delete harvest:', error);
    }
  };

  const typeIcons = {
    app: Package,
    tool: Wrench,
    script: Code,
    workflow: FileText,
    other: FileText
  };

  return (
    <div>
      {/* Page Header */}
      <div className="mb-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex items-center space-x-3"
            >
              <div className="p-2 bg-gradient-to-br from-red-400 to-red-700 rounded-apple">
                <Warehouse className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                The Barn
              </h1>
            </motion.div>

            {/* Search and Actions */}
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search harvests..."
                  className="pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-apple focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {/* Open import modal */}}
                className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              >
                <Upload className="w-5 h-5" />
              </motion.button>

              <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-apple p-1">
                <button
                  onClick={() => setView('grid')}
                  className={clsx(
                    'p-1.5 rounded',
                    view === 'grid' 
                      ? 'bg-white dark:bg-gray-700 shadow-sm' 
                      : 'text-gray-600 dark:text-gray-400'
                  )}
                >
                  <Grid3x3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setView('list')}
                  className={clsx(
                    'p-1.5 rounded',
                    view === 'list' 
                      ? 'bg-white dark:bg-gray-700 shadow-sm' 
                      : 'text-gray-600 dark:text-gray-400'
                  )}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumbs */}
        {breadcrumbs.length > 0 && (
          <div className="flex items-center space-x-2 mb-6 text-sm">
            <button
              onClick={() => {
                setSelectedFolder(null);
                setBreadcrumbs([]);
              }}
              className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
            >
              Barn
            </button>
            {breadcrumbs.map((folder, index) => (
              <React.Fragment key={folder.id}>
                <ChevronRight className="w-4 h-4 text-gray-400" />
                <button
                  onClick={() => {
                    setSelectedFolder(folder);
                    setBreadcrumbs(breadcrumbs.slice(0, index + 1));
                  }}
                  className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                >
                  {folder.name}
                </button>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Stats Overview */}
        {stats && !selectedFolder && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8"
          >
            <div className="bg-white dark:bg-gray-900 rounded-apple-lg p-6 border border-gray-200 dark:border-gray-800">
              <div className="flex items-center justify-between mb-2">
                <Package className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                <span className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.totalHarvests}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Harvests</p>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-apple-lg p-6 border border-gray-200 dark:border-gray-800">
              <div className="flex items-center justify-between mb-2">
                <Star className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                <span className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.mostUsedHarvests[0]?.useCount || 0}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Most Used</p>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-apple-lg p-6 border border-gray-200 dark:border-gray-800">
              <div className="flex items-center justify-between mb-2">
                <Clock className="w-5 h-5 text-green-600 dark:text-green-400" />
                <span className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.recentHarvests.length}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Recent</p>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-apple-lg p-6 border border-gray-200 dark:border-gray-800">
              <div className="flex items-center justify-between mb-2">
                <Folder className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <span className="text-2xl font-bold text-gray-900 dark:text-white">
                  {folders.filter(f => !f.parentId).length}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Folders</p>
            </div>
          </motion.div>
        )}

        {/* Filter Tabs */}
        <div className="flex items-center space-x-2 mb-6 overflow-x-auto">
          <button
            onClick={() => setFilterType('all')}
            className={clsx(
              'px-4 py-2 rounded-apple text-sm font-medium transition-colors whitespace-nowrap',
              filterType === 'all'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            )}
          >
            All Harvests
          </button>
          {['app', 'tool', 'script', 'workflow'].map((type) => {
            const Icon = typeIcons[type as keyof typeof typeIcons];
            return (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={clsx(
                  'flex items-center space-x-2 px-4 py-2 rounded-apple text-sm font-medium transition-colors whitespace-nowrap',
                  filterType === type
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="capitalize">{type}s</span>
              </button>
            );
          })}
        </div>

        {/* Main Content */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent" />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {selectedHarvest ? (
              <HarvestDetails
                harvest={selectedHarvest}
                onClose={() => setSelectedHarvest(null)}
                onUse={() => {
                  // Navigate to farm creator with harvest
                  window.location.href = `/home?useHarvest=${selectedHarvest.id}`;
                }}
              />
            ) : view === 'grid' ? (
              <motion.div
                key="grid"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                {/* Folders */}
                {folders
                  .filter(f => f.parentId === selectedFolder?.id)
                  .map((folder) => (
                    <FolderView
                      key={folder.id}
                      folder={folder}
                      harvestCount={folder.harvestIds.length}
                      onClick={() => {
                        setSelectedFolder(folder);
                        setBreadcrumbs([...breadcrumbs, folder]);
                      }}
                    />
                  ))}

                {/* Harvests */}
                {filteredHarvests.map((harvest) => (
                  <HarvestCard
                    key={harvest.id}
                    harvest={harvest}
                    onClick={() => setSelectedHarvest(harvest)}
                    onDelete={() => handleDeleteHarvest(harvest.id)}
                  />
                ))}

                {/* Empty State */}
                {filteredHarvests.length === 0 && folders.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="col-span-full flex flex-col items-center justify-center py-16"
                  >
                    <Warehouse className="w-16 h-16 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                      No harvests yet
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 text-center max-w-md">
                      Your completed farms will appear here when you save them to the barn.
                      Start a new farm and harvest your creations!
                    </p>
                  </motion.div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {filteredHarvests.map((harvest) => (
                  <HarvestListItem
                    key={harvest.id}
                    harvest={harvest}
                    onClick={() => setSelectedHarvest(harvest)}
                    onDelete={() => handleDeleteHarvest(harvest.id)}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};

// List view component
const HarvestListItem: React.FC<{
  harvest: Harvest;
  onClick: () => void;
  onDelete: () => void;
}> = ({ harvest, onClick, onDelete }) => {
  const typeIconsLocal = {
    app: Package,
    tool: Wrench,
    script: Code,
    workflow: FileText,
    other: FileText
  };
  const Icon = typeIconsLocal[harvest.type as keyof typeof typeIconsLocal] || FileText;

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      className="bg-white dark:bg-gray-900 rounded-apple-lg p-4 border border-gray-200 dark:border-gray-800 cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-apple">
            <Icon className="w-6 h-6 text-gray-600 dark:text-gray-400" />
          </div>
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white">
              {harvest.name}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {harvest.description}
            </p>
            <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
              <span>{new Date(harvest.createdAt).toLocaleDateString()}</span>
              <span>•</span>
              <span>Used {harvest.useCount} times</span>
              <span>•</span>
              <span>{harvest.artifacts.length} artifacts</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {harvest.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs rounded-full"
            >
              {tag}
            </span>
          ))}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
};