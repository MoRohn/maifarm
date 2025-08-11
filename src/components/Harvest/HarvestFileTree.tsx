import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  File,
  FileCode,
  FileText,
  FileJson,
  Database,
  Image,
  Download,
  Eye,
  Search,
  Filter,
  Copy,
  CheckCircle
} from 'lucide-react';
import { formatBytes } from '../../utils/format';

export interface FileTreeNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  mimeType?: string;
  children?: FileTreeNode[];
  metadata?: Record<string, any>;
  createdAt: Date;
}

interface HarvestFileTreeProps {
  fileTree: FileTreeNode;
  onFileSelect?: (file: FileTreeNode) => void;
  onFileDownload?: (file: FileTreeNode) => void;
  onFilePreview?: (file: FileTreeNode) => void;
  searchQuery?: string;
  className?: string;
}

const FileIcon: React.FC<{ mimeType?: string; name: string }> = ({ mimeType, name }) => {
  const getIcon = () => {
    if (mimeType?.includes('json')) return <FileJson className="w-4 h-4" />;
    if (mimeType?.includes('yaml')) return <FileCode className="w-4 h-4 text-yellow-600" />;
    if (mimeType?.includes('javascript') || mimeType?.includes('typescript')) {
      return <FileCode className="w-4 h-4 text-blue-600" />;
    }
    if (mimeType?.includes('python')) return <FileCode className="w-4 h-4 text-green-600" />;
    if (mimeType?.includes('markdown')) return <FileText className="w-4 h-4 text-gray-600" />;
    if (mimeType?.includes('image')) return <Image className="w-4 h-4 text-purple-600" />;
    if (mimeType?.includes('database') || name.includes('.sql')) {
      return <Database className="w-4 h-4 text-orange-600" />;
    }
    if (name.includes('.log')) return <FileText className="w-4 h-4 text-gray-500" />;
    return <File className="w-4 h-4" />;
  };

  return <>{getIcon()}</>;
};

const TreeNode: React.FC<{
  node: FileTreeNode;
  level: number;
  onFileSelect?: (file: FileTreeNode) => void;
  onFileDownload?: (file: FileTreeNode) => void;
  onFilePreview?: (file: FileTreeNode) => void;
  searchQuery?: string;
  defaultExpanded?: boolean;
}> = ({
  node,
  level,
  onFileSelect,
  onFileDownload,
  onFilePreview,
  searchQuery,
  defaultExpanded = false
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded || level < 2);
  const [hovering, setHovering] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleToggle = useCallback(() => {
    if (node.type === 'directory') {
      setIsExpanded(!isExpanded);
    } else {
      onFileSelect?.(node);
    }
  }, [isExpanded, node, onFileSelect]);

  const handleCopyPath = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(node.path);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy path:', error);
    }
  }, [node.path]);

  const handleDownload = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onFileDownload?.(node);
  }, [node, onFileDownload]);

  const handlePreview = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onFilePreview?.(node);
  }, [node, onFilePreview]);

  // Highlight search matches
  const highlightMatch = (text: string) => {
    if (!searchQuery) return text;
    const regex = new RegExp(`(${searchQuery})`, 'gi');
    const parts = text.split(regex);
    return (
      <>
        {parts.map((part, i) =>
          regex.test(part) ? (
            <span key={i} className="bg-yellow-200 dark:bg-yellow-900 font-semibold">
              {part}
            </span>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </>
    );
  };

  // Filter nodes based on search
  const matchesSearch = !searchQuery || 
    node.name.toLowerCase().includes(searchQuery.toLowerCase());

  if (!matchesSearch && node.type === 'file') {
    return null;
  }

  return (
    <div>
      <motion.div
        className={`
          flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer
          hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors
          ${hovering ? 'bg-gray-50 dark:bg-gray-800/50' : ''}
        `}
        style={{ paddingLeft: `${level * 20 + 8}px` }}
        onClick={handleToggle}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        whileHover={{ x: 2 }}
      >
        {/* Expand/Collapse Icon */}
        {node.type === 'directory' && (
          <motion.div
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronRight className="w-4 h-4 text-gray-500" />
          </motion.div>
        )}

        {/* File/Folder Icon */}
        {node.type === 'directory' ? (
          isExpanded ? (
            <FolderOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          ) : (
            <Folder className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          )
        ) : (
          <FileIcon mimeType={node.mimeType} name={node.name} />
        )}

        {/* Name */}
        <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">
          {highlightMatch(node.name)}
        </span>

        {/* Size (for files) */}
        {node.type === 'file' && node.size !== undefined && (
          <span className="text-xs text-gray-500 dark:text-gray-500">
            {formatBytes(node.size)}
          </span>
        )}

        {/* Actions (shown on hover) */}
        <AnimatePresence>
          {hovering && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              {node.type === 'file' && (
                <>
                  <button
                    onClick={handlePreview}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                    title="Preview"
                  >
                    <Eye className="w-3 h-3 text-gray-600 dark:text-gray-400" />
                  </button>
                  <button
                    onClick={handleDownload}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                    title="Download"
                  >
                    <Download className="w-3 h-3 text-gray-600 dark:text-gray-400" />
                  </button>
                </>
              )}
              <button
                onClick={handleCopyPath}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                title="Copy path"
              >
                {copied ? (
                  <CheckCircle className="w-3 h-3 text-green-600 dark:text-green-400" />
                ) : (
                  <Copy className="w-3 h-3 text-gray-600 dark:text-gray-400" />
                )}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Children */}
      <AnimatePresence>
        {node.type === 'directory' && isExpanded && node.children && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {node.children.map((child) => (
              <TreeNode
                key={child.id}
                node={child}
                level={level + 1}
                onFileSelect={onFileSelect}
                onFileDownload={onFileDownload}
                onFilePreview={onFilePreview}
                searchQuery={searchQuery}
                defaultExpanded={defaultExpanded}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const HarvestFileTree: React.FC<HarvestFileTreeProps> = ({
  fileTree,
  onFileSelect,
  onFileDownload,
  onFilePreview,
  searchQuery: externalSearchQuery,
  className
}) => {
  const [searchQuery, setSearchQuery] = useState(externalSearchQuery || '');
  const [filterType, setFilterType] = useState<'all' | 'code' | 'docs' | 'data'>('all');
  const [expandAll, setExpandAll] = useState(false);

  // Calculate statistics
  const calculateStats = useCallback(() => {
    let fileCount = 0;
    let totalSize = 0;
    const types = new Set<string>();

    const traverse = (node: FileTreeNode) => {
      if (node.type === 'file') {
        fileCount++;
        totalSize += node.size || 0;
        if (node.mimeType) types.add(node.mimeType.split('/')[0]);
      }
      if (node.children) {
        node.children.forEach(traverse);
      }
    };

    traverse(fileTree);
    return { fileCount, totalSize, types: Array.from(types) };
  }, [fileTree]);

  const stats = calculateStats();

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-xl ${className}`}>
      {/* Header with Search and Stats */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            File Explorer
          </h3>
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <span>{stats.fileCount} files</span>
            <span>•</span>
            <span>{formatBytes(stats.totalSize)}</span>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files..."
            className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        {/* Filter Buttons */}
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              filterType === 'all'
                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            All Files
          </button>
          <button
            onClick={() => setFilterType('code')}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              filterType === 'code'
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            Code
          </button>
          <button
            onClick={() => setFilterType('docs')}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              filterType === 'docs'
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            Docs
          </button>
          <button
            onClick={() => setFilterType('data')}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              filterType === 'data'
                ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            Data
          </button>
          <div className="ml-auto">
            <button
              onClick={() => setExpandAll(!expandAll)}
              className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
            >
              {expandAll ? 'Collapse All' : 'Expand All'}
            </button>
          </div>
        </div>
      </div>

      {/* File Tree */}
      <div className="p-2 max-h-[600px] overflow-y-auto">
        {fileTree.children ? (
          fileTree.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={0}
              onFileSelect={onFileSelect}
              onFileDownload={onFileDownload}
              onFilePreview={onFilePreview}
              searchQuery={searchQuery}
              defaultExpanded={expandAll}
            />
          ))
        ) : (
          <div className="text-center py-8 text-gray-500 dark:text-gray-500">
            <Folder className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No files collected yet</p>
          </div>
        )}
      </div>
    </div>
  );
};