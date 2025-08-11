import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  FileText, 
  Code, 
  FileCode,
  Database,
  BookOpen,
  Download,
  Eye,
  Copy,
  Check,
  Package,
  HardDrive
} from 'lucide-react';
import { clsx } from 'clsx';
import { Harvest, HarvestYield as HarvestYieldType } from '../../types/harvest';
import { format } from 'date-fns';

interface HarvestYieldProps {
  harvest: Harvest;
  view: 'grid' | 'list';
}

export const HarvestYield: React.FC<HarvestYieldProps> = ({ harvest, view }) => {
  const [copiedIds, setCopiedIds] = useState<Set<string>>(new Set());
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());

  const getYieldIcon = (type: HarvestYieldType['type']) => {
    switch (type) {
      case 'file': return FileText;
      case 'code': return Code;
      case 'documentation': return BookOpen;
      case 'data': return Database;
      case 'model': return HardDrive;
      case 'report': return FileCode;
      default: return FileText;
    }
  };

  const getYieldColor = (type: HarvestYieldType['type']) => {
    switch (type) {
      case 'code': return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20';
      case 'documentation': return 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20';
      case 'data': return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20';
      case 'model': return 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20';
      case 'report': return 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20';
      default: return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const handleCopyPath = async (yieldItem: HarvestYieldType) => {
    try {
      await navigator.clipboard.writeText(yieldItem.location);
      setCopiedIds(new Set([...copiedIds, yieldItem.id]));
      setTimeout(() => {
        setCopiedIds(prev => {
          const next = new Set(prev);
          next.delete(yieldItem.id);
          return next;
        });
      }, 2000);
    } catch (error) {
      console.error('Failed to copy path:', error);
    }
  };

  const handleDownload = async (yieldItem: HarvestYieldType) => {
    setDownloadingIds(new Set([...downloadingIds, yieldItem.id]));
    try {
      // Simulate download - in real implementation, this would trigger actual download
      await new Promise(resolve => setTimeout(resolve, 1000));
      // Here you would typically call a service method to download the yieldItem
      console.log('Downloading yieldItem:', yieldItem.name);
    } catch (error) {
      console.error('Failed to download yieldItem:', error);
    } finally {
      setDownloadingIds(prev => {
        const next = new Set(prev);
        next.delete(yieldItem.id);
        return next;
      });
    }
  };

  const YieldCard = ({ yieldItem }: { yieldItem: HarvestYieldType }) => {
    const Icon = getYieldIcon(yieldItem.type);
    const colorClass = getYieldColor(yieldItem.type);
    const isCopied = copiedIds.has(yieldItem.id);
    const isDownloading = downloadingIds.has(yieldItem.id);

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -2 }}
        className={clsx(
          'bg-white dark:bg-gray-900 rounded-apple-lg p-5',
          'border border-gray-200 dark:border-gray-800',
          'hover:shadow-apple-sm transition-all duration-200',
          'cursor-pointer group'
        )}
      >
        <div className="flex items-start space-x-3">
          <div className={clsx('p-2 rounded-apple', colorClass)}>
            <Icon className="w-5 h-5" />
          </div>
          
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-gray-900 dark:text-white truncate">
              {yieldItem.name}
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mt-1">
              {yieldItem.description}
            </p>
            
            <div className="flex items-center space-x-4 mt-3 text-xs text-gray-500">
              <span>{formatFileSize(yieldItem.size)}</span>
              <span>•</span>
              <span>{yieldItem.createdBy.agentName}</span>
              <span>•</span>
              <span>{format(new Date(yieldItem.createdAt), 'MMM d')}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleDownload(yieldItem)}
            disabled={isDownloading}
            className={clsx(
              'flex items-center space-x-1 px-3 py-1.5 rounded-apple text-sm',
              'bg-primary-600 text-white hover:bg-primary-700',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'transition-colors'
            )}
          >
            {isDownloading ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-3 h-3 border-2 border-white border-t-transparent rounded-full"
                />
                <span>Downloading...</span>
              </>
            ) : (
              <>
                <Download className="w-3 h-3" />
                <span>Download</span>
              </>
            )}
          </motion.button>
          
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleCopyPath(yieldItem)}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-apple text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            {isCopied ? (
              <>
                <Check className="w-3 h-3 text-green-600" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>Copy Path</span>
              </>
            )}
          </motion.button>
          
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-1.5 rounded-apple hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ml-auto"
          >
            <Eye className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </motion.button>
        </div>
      </motion.div>
    );
  };

  const groupedYields = harvest.yield.reduce((acc, yieldItem) => {
    const key = yieldItem.type;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(yieldItem);
    return acc;
  }, {} as Record<string, HarvestYieldType[]>);

  if (harvest.yield.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 dark:bg-gray-900/50 rounded-apple-xl">
        <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <p className="text-gray-600 dark:text-gray-400">No yield generated in this harvest</p>
      </div>
    );
  }

  if (view === 'list') {
    return (
      <div className="space-y-3">
        {harvest.yield.map(yieldItem => (
          <YieldCard key={yieldItem.id} yieldItem={yieldItem} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {Object.entries(groupedYields).map(([type, yieldItems]) => {
        const Icon = getYieldIcon(type as HarvestYieldType['type']);
        const colorClass = getYieldColor(type as HarvestYieldType['type']);
        
        return (
          <div key={type}>
            <div className="flex items-center space-x-2 mb-4">
              <div className={clsx('p-1.5 rounded-apple', colorClass)}>
                <Icon className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                {type}
              </h3>
              <span className="text-xs text-gray-500">
                ({yieldItems.length})
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {yieldItems.map(yieldItem => (
                <YieldCard key={yieldItem.id} yieldItem={yieldItem} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};