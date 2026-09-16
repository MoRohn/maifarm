import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Package,
  Code,
  Wrench,
  FileText,
  Clock,
  Star,
  MoreVertical,
  Download,
  Trash2,
  GitBranch,
  Sparkles,
  Loader2
} from 'lucide-react';
import { clsx } from 'clsx';
import { Harvest } from '@/types/barn';
import { harvestService } from '@/services/harvestService';

interface HarvestCardProps {
  harvest: Harvest;
  onClick: () => void;
  onDelete: () => void;
  onCreateSeed?: () => void;
  isSelected?: boolean;
  onSelect?: (selected: boolean) => void;
  selectionMode?: boolean;
  isDeleting?: boolean;  // UX FIX: Loading state for delete operation
}

export const HarvestCard: React.FC<HarvestCardProps> = ({
  harvest,
  onClick,
  onDelete,
  onCreateSeed,
  isSelected = false,
  onSelect,
  selectionMode = false,
  isDeleting = false  // UX FIX: Accept loading state prop
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  
  const typeConfig = {
    app: {
      icon: Package,
      color: 'blue',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
      iconColor: 'text-blue-600 dark:text-blue-400'
    },
    tool: {
      icon: Wrench,
      color: 'green',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
      iconColor: 'text-green-600 dark:text-green-400'
    },
    script: {
      icon: Code,
      color: 'purple',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30',
      iconColor: 'text-purple-600 dark:text-purple-400'
    },
    workflow: {
      icon: FileText,
      color: 'orange',
      bgColor: 'bg-orange-100 dark:bg-orange-900/30',
      iconColor: 'text-orange-600 dark:text-orange-400'
    },
    other: {
      icon: FileText,
      color: 'gray',
      bgColor: 'bg-gray-100 dark:bg-gray-800',
      iconColor: 'text-gray-600 dark:text-gray-400'
    }
  };

  // Ensure we have a valid type, fallback to 'other' if undefined or invalid
  const harvestType = (harvest.type && harvest.type in typeConfig) ? harvest.type : 'other';
  const config = typeConfig[harvestType];
  const Icon = config.icon;

  const handleDownload = useCallback(async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      await harvestService.downloadExport(harvest.id, 'json');
    } catch (error) {
      console.error('Failed to download harvest:', error);
      // Could add toast notification here for user feedback
    } finally {
      setIsDownloading(false);
    }
  }, [harvest.id, isDownloading]);

  const handleAction = (e: React.MouseEvent, action: string) => {
    e.stopPropagation();
    setShowMenu(false);

    switch (action) {
      case 'download':
        handleDownload();
        break;
      case 'createSeed':
        onCreateSeed?.();
        break;
      case 'delete':
        onDelete();
        break;
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // Always open details when clicking the card
    // Selection should only happen via checkbox
    onClick();
  };

  return (
    <motion.div
      whileHover={{ y: -4 }}
      onClick={handleCardClick}
      className={clsx(
        'relative bg-white dark:bg-gray-900 rounded-apple-lg p-6',
        'border transition-all duration-300',
        isSelected 
          ? 'border-primary-500 dark:border-primary-400 shadow-apple-lg' 
          : 'border-gray-200 dark:border-gray-800',
        'shadow-sm hover:shadow-apple-md',
        'cursor-pointer group'
      )}
    >
      {/* Selection Checkbox */}
      {selectionMode && (
        <div className="absolute top-4 left-4 z-10">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation();
              onSelect?.(!isSelected);
            }}
            className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
        </div>
      )}
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className={clsx('p-3 rounded-apple', config.bgColor)}>
          <Icon className={clsx('w-6 h-6', config.iconColor)} />
        </div>
        
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center
                       text-gray-400 hover:text-gray-600 dark:hover:text-gray-300
                       opacity-100 sm:opacity-0 sm:group-hover:opacity-100
                       transition-opacity touch-manipulation"
            aria-label="More options"
          >
            <MoreVertical className="w-5 h-5" />
          </button>
          
          {showMenu && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-apple shadow-apple-lg border border-gray-200 dark:border-gray-700 z-10"
            >
              <button
                onClick={(e) => handleAction(e, 'createSeed')}
                className="w-full min-h-[44px] flex items-center space-x-3 px-4 text-sm text-green-700 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/20"
              >
                <Sparkles className="w-5 h-5" />
                <span>Create Seed</span>
              </button>
              <hr className="my-1 border-gray-200 dark:border-gray-700" />
              <button
                onClick={(e) => handleAction(e, 'download')}
                disabled={isDownloading}
                className={clsx(
                  "w-full min-h-[44px] flex items-center space-x-3 px-4 text-sm",
                  isDownloading
                    ? "text-gray-400 dark:text-gray-500 cursor-not-allowed"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                )}
              >
                {isDownloading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Download className="w-5 h-5" />
                )}
                <span>{isDownloading ? 'Downloading...' : 'Download'}</span>
              </button>
              <hr className="my-1 border-gray-200 dark:border-gray-700" />
              <button
                onClick={(e) => handleAction(e, 'delete')}
                disabled={isDeleting}
                className={clsx(
                  "w-full min-h-[44px] flex items-center space-x-3 px-4 text-sm",
                  isDeleting
                    ? "text-gray-400 dark:text-gray-500 cursor-not-allowed"
                    : "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                )}
              >
                {isDeleting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Trash2 className="w-5 h-5" />
                )}
                <span>{isDeleting ? 'Deleting...' : 'Delete'}</span>
              </button>
            </motion.div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="space-y-3">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-1">
            {harvest.name}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mt-1">
            {harvest.description}
          </p>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-500">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1">
              <Clock className="w-3.5 h-3.5" />
              <span>{(() => {
                if (!harvest.createdAt) return 'Unknown';
                try {
                  const date = new Date(harvest.createdAt);
                  return isNaN(date.getTime()) ? 'Unknown' : date.toLocaleDateString();
                } catch {
                  // Safari/iOS may throw on invalid date formats
                  return 'Unknown';
                }
              })()}</span>
            </div>
            <div className="flex items-center space-x-1">
              <Star className="w-3.5 h-3.5" />
              <span>{harvest.useCount}</span>
            </div>
            {harvest.farmerTemplateName && (
              <div className="flex items-center space-x-1 px-2 py-0.5 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-full border border-green-200/50 dark:border-green-700/30">
                <span className="text-xs">🌾</span>
                <span className="text-green-700 dark:text-green-400 font-medium max-w-16 truncate">
                  {harvest.farmerTemplateName}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Tags */}
        {harvest.tags && Array.isArray(harvest.tags) && harvest.tags.filter(tag => typeof tag === 'string').length > 0 && (
          <div className="flex flex-wrap gap-2">
            {harvest.tags
              .filter(tag => typeof tag === 'string')
              .slice(0, 3)
              .map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs rounded-full"
                >
                  {tag}
                </span>
              ))}
            {harvest.tags.filter(tag => typeof tag === 'string').length > 3 && (
              <span className="px-2 py-1 text-gray-500 text-xs">
                +{harvest.tags.filter(tag => typeof tag === 'string').length - 3} more
              </span>
            )}
          </div>
        )}

        {/* Metadata */}
        <div className="pt-3 border-t border-gray-200 dark:border-gray-800">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-gray-500 dark:text-gray-500">Yield</span>
              <p className="font-medium text-gray-900 dark:text-white">
                {harvest.yield?.length || 0} files
              </p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-500">Success Rate</span>
              <p className="font-medium text-gray-900 dark:text-white">
                {typeof harvest.metadata?.successRate === 'number' ? harvest.metadata.successRate : 0}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Version badge */}
      {harvest.version !== '1.0.0' && (
        <div className="absolute top-4 right-12 flex items-center space-x-1 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-full text-xs text-gray-600 dark:text-gray-400">
          <GitBranch className="w-3 h-3" />
          <span>v{harvest.version}</span>
        </div>
      )}
    </motion.div>
  );
};