import React from 'react';
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
  Copy,
  GitBranch
} from 'lucide-react';
import { clsx } from 'clsx';
import { Harvest } from '../../types/barn';

interface HarvestCardProps {
  harvest: Harvest;
  onClick: () => void;
  onDelete: () => void;
}

export const HarvestCard: React.FC<HarvestCardProps> = ({ harvest, onClick, onDelete }) => {
  const [showMenu, setShowMenu] = React.useState(false);
  
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

  const config = typeConfig[harvest.type];
  const Icon = config.icon;

  const handleAction = (e: React.MouseEvent, action: string) => {
    e.stopPropagation();
    setShowMenu(false);
    
    switch (action) {
      case 'download':
        // Implement download
        break;
      case 'duplicate':
        // Implement duplicate
        break;
      case 'delete':
        onDelete();
        break;
    }
  };

  return (
    <motion.div
      whileHover={{ y: -4 }}
      onClick={onClick}
      className={clsx(
        'relative bg-white dark:bg-gray-900 rounded-apple-lg p-6',
        'border border-gray-200 dark:border-gray-800',
        'shadow-sm hover:shadow-apple-md transition-all duration-300',
        'cursor-pointer group'
      )}
    >
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
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          
          {showMenu && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-apple shadow-apple-lg border border-gray-200 dark:border-gray-700 z-10"
            >
              <button
                onClick={(e) => handleAction(e, 'download')}
                className="w-full flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Download className="w-4 h-4" />
                <span>Download</span>
              </button>
              <button
                onClick={(e) => handleAction(e, 'duplicate')}
                className="w-full flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Copy className="w-4 h-4" />
                <span>Duplicate</span>
              </button>
              <hr className="my-1 border-gray-200 dark:border-gray-700" />
              <button
                onClick={(e) => handleAction(e, 'delete')}
                className="w-full flex items-center space-x-2 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
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
              <span>{new Date(harvest.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center space-x-1">
              <Star className="w-3.5 h-3.5" />
              <span>{harvest.useCount}</span>
            </div>
          </div>
        </div>

        {/* Tags */}
        {harvest.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {harvest.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs rounded-full"
              >
                {tag}
              </span>
            ))}
            {harvest.tags.length > 3 && (
              <span className="px-2 py-1 text-gray-500 text-xs">
                +{harvest.tags.length - 3} more
              </span>
            )}
          </div>
        )}

        {/* Metadata */}
        <div className="pt-3 border-t border-gray-200 dark:border-gray-800">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-gray-500 dark:text-gray-500">Artifacts</span>
              <p className="font-medium text-gray-900 dark:text-white">
                {harvest.artifacts.length} files
              </p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-500">Success Rate</span>
              <p className="font-medium text-gray-900 dark:text-white">
                {harvest.metadata.successRate}%
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