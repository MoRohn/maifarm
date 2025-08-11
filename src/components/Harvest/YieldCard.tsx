import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  FileCode, 
  FileText, 
  Database, 
  Package, 
  File,
  Download,
  Eye,
  Copy,
  CheckCircle,
  Code,
  FileJson,
  FileImage,
  Terminal
} from 'lucide-react';
import { HarvestYield } from '../../types/harvest';

interface YieldCardProps {
  yieldItem: HarvestYield;
  onView?: (yieldItem: HarvestYield) => void;
  onDownload?: (yieldItem: HarvestYield) => void;
  compact?: boolean;
}

export const YieldCard: React.FC<YieldCardProps> = ({ 
  yieldItem, 
  onView, 
  onDownload,
  compact = false 
}) => {
  const [copied, setCopied] = useState(false);
  const [hovering, setHovering] = useState(false);

  const getYieldIcon = () => {
    switch (yieldItem.type) {
      case 'code':
        return <Code className="w-5 h-5" />;
      case 'file':
        if (yieldItem.mimeType?.includes('json')) return <FileJson className="w-5 h-5" />;
        if (yieldItem.mimeType?.includes('image')) return <FileImage className="w-5 h-5" />;
        return <File className="w-5 h-5" />;
      case 'documentation':
        return <FileText className="w-5 h-5" />;
      case 'data':
        return <Database className="w-5 h-5" />;
      case 'model':
        return <Package className="w-5 h-5" />;
      case 'report':
        return <FileCode className="w-5 h-5" />;
      default:
        return <File className="w-5 h-5" />;
    }
  };

  const getTypeColor = () => {
    switch (yieldItem.type) {
      case 'code':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'documentation':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'data':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
      case 'model':
        return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
      case 'report':
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(yieldItem.location);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy path:', error);
    }
  };

  if (compact) {
    return (
      <motion.div
        whileHover={{ scale: 1.02 }}
        onHoverStart={() => setHovering(true)}
        onHoverEnd={() => setHovering(false)}
        className="group relative bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 hover:shadow-lg transition-all cursor-pointer"
        onClick={() => onView?.(yieldItem)}
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${getTypeColor()}`}>
            {getYieldIcon()}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-gray-900 dark:text-white truncate">
              {yieldItem.name}
            </h4>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-500">
              <span>{yieldItem.type}</span>
              <span>•</span>
              <span>{formatFileSize(yieldItem.size)}</span>
            </div>
          </div>
          {hovering && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute right-2 top-2 flex gap-1"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload?.(yieldItem);
                }}
                className="p-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                <Download className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              </button>
            </motion.div>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      className="group bg-white dark:bg-gray-900 rounded-2xl shadow-md hover:shadow-xl transition-all overflow-hidden"
    >
      {/* Header with gradient */}
      <div className={`h-2 bg-gradient-to-r ${
        yieldItem.type === 'code' ? 'from-blue-500 to-cyan-500' :
        yieldItem.type === 'documentation' ? 'from-green-500 to-emerald-500' :
        yieldItem.type === 'data' ? 'from-purple-500 to-pink-500' :
        yieldItem.type === 'model' ? 'from-orange-500 to-red-500' :
        'from-gray-500 to-gray-600'
      }`} />

      <div className="p-6">
        {/* Icon and Type Badge */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl ${getTypeColor()}`}>
              {getYieldIcon()}
            </div>
            <div>
              <span className={`text-xs px-2 py-1 rounded-full ${getTypeColor()}`}>
                {yieldItem.type}
              </span>
            </div>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-500">
            {formatFileSize(yieldItem.size)}
          </div>
        </div>

        {/* Title and Description */}
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          {yieldItem.name}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
          {yieldItem.description}
        </p>

        {/* Metadata */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-500">
            <Terminal className="w-3 h-3" />
            <span>Created by {yieldItem.createdBy.agentName}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-500">
            <FileCode className="w-3 h-3" />
            <span className="truncate" title={yieldItem.location}>
              {yieldItem.location}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onView?.(yieldItem)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors"
          >
            <Eye className="w-4 h-4" />
            <span className="text-sm font-medium">View</span>
          </motion.button>
          
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onDownload?.(yieldItem)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary-100 dark:bg-primary-900/30 hover:bg-primary-200 dark:hover:bg-primary-900/50 text-primary-700 dark:text-primary-400 rounded-xl transition-colors"
          >
            <Download className="w-4 h-4" />
            <span className="text-sm font-medium">Download</span>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleCopyPath}
            className="p-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors"
            title="Copy path"
          >
            {copied ? (
              <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
            ) : (
              <Copy className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            )}
          </motion.button>
        </div>

        {/* Additional Metadata (expandable) */}
        {yieldItem.metadata && Object.keys(yieldItem.metadata).length > 0 && (
          <details className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
            <summary className="text-xs text-gray-500 dark:text-gray-500 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
              Additional Information
            </summary>
            <div className="mt-2 space-y-1">
              {Object.entries(yieldItem.metadata).map(([key, value]) => (
                <div key={key} className="flex justify-between text-xs">
                  <span className="text-gray-600 dark:text-gray-400">{key}:</span>
                  <span className="text-gray-900 dark:text-white font-mono">
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </motion.div>
  );
};