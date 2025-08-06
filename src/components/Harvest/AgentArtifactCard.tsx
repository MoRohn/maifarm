import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileCode,
  FileText,
  Database,
  Image,
  Package,
  ExternalLink,
  Download,
  Eye,
  Copy,
  CheckCircle2,
  Bot,
  Clock,
  Hash,
  Sparkles
} from 'lucide-react';
import { clsx } from 'clsx';

interface Artifact {
  id: string;
  agentId: string;
  agentName: string;
  type: 'code' | 'document' | 'data' | 'image' | 'output' | 'log';
  name: string;
  description?: string;
  size?: number;
  language?: string;
  lines?: number;
  createdAt: Date;
  preview?: string;
  path?: string;
  status: 'pending' | 'processing' | 'ready' | 'error';
  quality?: number; // 0-100
}

interface AgentArtifactCardProps {
  artifact: Artifact;
  onView?: (artifact: Artifact) => void;
  onDownload?: (artifact: Artifact) => void;
  onCopy?: (artifact: Artifact) => void;
  className?: string;
}

export const AgentArtifactCard: React.FC<AgentArtifactCardProps> = ({
  artifact,
  onView,
  onDownload,
  onCopy,
  className
}) => {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const getArtifactIcon = (type: Artifact['type']) => {
    switch (type) {
      case 'code':
        return FileCode;
      case 'document':
        return FileText;
      case 'data':
        return Database;
      case 'image':
        return Image;
      case 'log':
        return Hash;
      default:
        return Package;
    }
  };

  const getTypeColor = (type: Artifact['type']) => {
    switch (type) {
      case 'code':
        return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20';
      case 'document':
        return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20';
      case 'data':
        return 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20';
      case 'image':
        return 'text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-900/20';
      case 'log':
        return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20';
      default:
        return 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20';
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return 'N/A';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatTimestamp = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return new Date(date).toLocaleDateString();
  };

  const handleCopy = async () => {
    if (onCopy) {
      onCopy(artifact);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const Icon = getArtifactIcon(artifact.type);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ scale: 1.02 }}
      className={clsx(
        'bg-white dark:bg-gray-900 rounded-lg',
        'border border-gray-200 dark:border-gray-800',
        'hover:shadow-lg hover:border-[var(--color-primary)]',
        'transition-all duration-200',
        'cursor-pointer',
        className
      )}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header */}
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          {/* Type Icon and Badge */}
          <div className="flex items-center gap-3">
            <div className={clsx(
              'p-2 rounded-lg',
              getTypeColor(artifact.type)
            )}>
              <Icon className="w-5 h-5" />
            </div>
            
            {/* Agent Info */}
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-[var(--color-primary)]" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {artifact.agentName}
              </span>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2">
            {artifact.status === 'ready' && artifact.quality && (
              <div className="flex items-center gap-1">
                <Sparkles className="w-4 h-4 text-yellow-500" />
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  {artifact.quality}%
                </span>
              </div>
            )}
            <span className={clsx(
              'px-2 py-1 rounded-full text-xs font-medium',
              artifact.status === 'ready' && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
              artifact.status === 'processing' && 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 animate-pulse',
              artifact.status === 'error' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
              artifact.status === 'pending' && 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'
            )}>
              {artifact.status}
            </span>
          </div>
        </div>

        {/* Title and Description */}
        <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
          {artifact.name}
        </h3>
        {artifact.description && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            {artifact.description}
          </p>
        )}

        {/* Metadata */}
        <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-500">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatTimestamp(artifact.createdAt)}
          </div>
          {artifact.size && (
            <div className="flex items-center gap-1">
              <Database className="w-3 h-3" />
              {formatSize(artifact.size)}
            </div>
          )}
          {artifact.lines && (
            <div className="flex items-center gap-1">
              <Hash className="w-3 h-3" />
              {artifact.lines} lines
            </div>
          )}
          {artifact.language && (
            <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px] font-mono">
              {artifact.language}
            </span>
          )}
        </div>

        {/* Preview (expandable) */}
        <AnimatePresence>
          {expanded && artifact.preview && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-4 overflow-hidden"
            >
              <pre className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-xs font-mono text-gray-700 dark:text-gray-300 overflow-x-auto">
                {artifact.preview}
              </pre>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
          {onView && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onView(artifact);
              }}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium',
                'bg-[rgba(var(--color-primary-rgb),0.1)] text-[var(--color-primary)]',
                'hover:bg-[rgba(var(--color-primary-rgb),0.2)]',
                'transition-colors duration-200'
              )}
            >
              <Eye className="w-4 h-4" />
              View
            </button>
          )}
          
          {onDownload && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDownload(artifact);
              }}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium',
                'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
                'hover:bg-gray-200 dark:hover:bg-gray-700',
                'transition-colors duration-200'
              )}
            >
              <Download className="w-4 h-4" />
              Download
            </button>
          )}

          {onCopy && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCopy();
              }}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium',
                'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
                'hover:bg-gray-200 dark:hover:bg-gray-700',
                'transition-colors duration-200'
              )}
            >
              {copied ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy
                </>
              )}
            </button>
          )}

          {artifact.path && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                // Open in file explorer or IDE
              }}
              className={clsx(
                'ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm',
                'text-gray-600 dark:text-gray-400',
                'hover:text-[var(--color-primary)]',
                'transition-colors duration-200'
              )}
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};