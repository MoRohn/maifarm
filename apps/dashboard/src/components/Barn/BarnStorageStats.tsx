import React from 'react';
import { motion } from 'framer-motion';
import { HardDrive, Folder, File, Clock, TrendingUp, Database } from 'lucide-react';
import { clsx } from 'clsx';

interface StorageStats {
  totalSize: number;
  totalFiles: number;
  totalDirectories: number;
  sizeByType: Record<string, number>;
  activeItems: number;
  archivedItems: number;
  orphanedItems: number;
  oldestItem: Date | null;
  newestItem: Date | null;
  largestItems: Array<{
    id: string;
    name: string;
    size: number;
    type: string;
  }>;
}

interface BarnStorageStatsProps {
  stats: StorageStats | null;
  loading?: boolean;
  onRefresh?: () => void;
}

export const BarnStorageStats: React.FC<BarnStorageStatsProps> = ({
  stats,
  loading = false,
  onRefresh
}) => {
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (date: Date | string | null): string => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString();
  };

  const getStoragePercentage = (): number => {
    if (!stats) return 0;
    const maxStorage = 10 * 1024 * 1024 * 1024; // 10GB limit
    return Math.min((stats.totalSize / maxStorage) * 100, 100);
  };

  const getStorageColor = (percentage: number): string => {
    if (percentage < 50) return 'bg-green-500';
    if (percentage < 75) return 'bg-yellow-500';
    if (percentage < 90) return 'bg-orange-500';
    return 'bg-red-500';
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-apple-lg p-6 border border-gray-200 dark:border-gray-800">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 dark:bg-gray-800 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-5/6"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-4/6"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const storagePercentage = getStoragePercentage();
  const storageColor = getStorageColor(storagePercentage);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-gray-900 rounded-apple-lg p-6 border border-gray-200 dark:border-gray-800"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <Database className="w-6 h-6 text-primary-600 dark:text-primary-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Storage Overview
          </h3>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
          >
            Refresh
          </button>
        )}
      </div>

      {/* Storage Usage Bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">Storage Used</span>
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {formatBytes(stats.totalSize)} / 10 GB
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-3 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${storagePercentage}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className={clsx(storageColor, 'h-full rounded-full')}
          />
        </div>
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {storagePercentage.toFixed(1)}% used
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-50 dark:bg-gray-800 rounded-apple p-3">
          <div className="flex items-center space-x-2 mb-1">
            <File className="w-4 h-4 text-gray-500" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Files</span>
          </div>
          <div className="text-lg font-semibold text-gray-900 dark:text-white">
            {stats.totalFiles.toLocaleString()}
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800 rounded-apple p-3">
          <div className="flex items-center space-x-2 mb-1">
            <Folder className="w-4 h-4 text-gray-500" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Folders</span>
          </div>
          <div className="text-lg font-semibold text-gray-900 dark:text-white">
            {stats.totalDirectories.toLocaleString()}
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800 rounded-apple p-3">
          <div className="flex items-center space-x-2 mb-1">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Active</span>
          </div>
          <div className="text-lg font-semibold text-gray-900 dark:text-white">
            {stats.activeItems}
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800 rounded-apple p-3">
          <div className="flex items-center space-x-2 mb-1">
            <Clock className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Archived</span>
          </div>
          <div className="text-lg font-semibold text-gray-900 dark:text-white">
            {stats.archivedItems}
          </div>
        </div>
      </div>

      {/* Storage by Type */}
      {Object.keys(stats.sizeByType).length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Storage by Type
          </h4>
          <div className="space-y-2">
            {Object.entries(stats.sizeByType).map(([type, size]) => (
              <div key={type} className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400 capitalize">
                  {type}
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {formatBytes(size)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Largest Items */}
      {stats.largestItems.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Largest Items
          </h4>
          <div className="space-y-2">
            {stats.largestItems.slice(0, 5).map((item) => (
              <div key={item.id} className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400 truncate flex-1 mr-2">
                  {item.name}
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {formatBytes(item.size)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Date Range */}
      <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>Oldest: {formatDate(stats.oldestItem)}</span>
          <span>Newest: {formatDate(stats.newestItem)}</span>
        </div>
      </div>

      {/* Orphaned Items Warning */}
      {stats.orphanedItems > 0 && (
        <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-apple">
          <div className="flex items-center space-x-2">
            <HardDrive className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
            <span className="text-sm text-yellow-800 dark:text-yellow-200">
              {stats.orphanedItems} orphaned items found. Consider running cleanup.
            </span>
          </div>
        </div>
      )}
    </motion.div>
  );
};