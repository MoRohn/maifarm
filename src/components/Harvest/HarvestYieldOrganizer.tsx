import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Code,
  FileJson,
  Image,
  Database,
  Package,
  Download,
  FolderOpen,
  Filter,
  Search,
  Sparkles,
  Archive,
  CheckCircle
} from 'lucide-react';
import { clsx } from 'clsx';
import { HarvestYield } from '../../types/harvest';

interface HarvestYieldOrganizerProps {
  yield: HarvestYield[];
  onDownload: (yieldId: string) => void;
  onOrganize?: (organization: YieldOrganization) => void;
}

interface YieldOrganization {
  folders: Record<string, HarvestYield[]>;
  tags: Record<string, string[]>;
}

export const HarvestYieldOrganizer: React.FC<HarvestYieldOrganizerProps> = ({
  yield: yieldItems,
  onDownload,
  onOrganize
}) => {
  const [selectedType, setSelectedType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYields, setSelectedYields] = useState<Set<string>>(new Set());
  const [autoOrganized, setAutoOrganized] = useState(false);

  // Auto-organize yield items by type and importance
  const organizeYields = () => {
    const organization: YieldOrganization = {
      folders: {},
      tags: {}
    };

    yieldItems.forEach(yieldItem => {
      // Organize by type
      if (!organization.folders[yieldItem.type]) {
        organization.folders[yieldItem.type] = [];
      }
      organization.folders[yieldItem.type].push(yieldItem);

      // Auto-tag based on content
      const tags: string[] = [];
      
      if (yieldItem.size > 1024 * 1024) tags.push('large');
      if (yieldItem.type === 'code') tags.push('implementation');
      if (yieldItem.type === 'documentation') tags.push('docs');
      if (yieldItem.name.includes('test')) tags.push('testing');
      if (yieldItem.name.includes('config')) tags.push('configuration');
      
      organization.tags[yieldItem.id] = tags;
    });

    setAutoOrganized(true);
    if (onOrganize) {
      onOrganize(organization);
    }

    // Show success animation
    setTimeout(() => {
      setAutoOrganized(false);
    }, 2000);
  };

  // Filter yieldItems
  const filteredYields = yieldItems.filter(yieldItem => {
    const matchesType = selectedType === 'all' || yieldItem.type === selectedType;
    const matchesSearch = searchQuery === '' || 
      yieldItem.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      yieldItem.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  // Group yieldItems by type
  const yieldItemsByType = filteredYields.reduce((acc, yieldItem) => {
    if (!acc[yieldItem.type]) {
      acc[yieldItem.type] = [];
    }
    acc[yieldItem.type].push(yieldItem);
    return acc;
  }, {} as Record<string, HarvestYield[]>);

  const getYieldIcon = (type: string) => {
    switch (type) {
      case 'file': return FileText;
      case 'code': return Code;
      case 'documentation': return FileText;
      case 'data': return Database;
      case 'model': return Package;
      case 'report': return FileJson;
      default: return FileText;
    }
  };

  const getYieldColor = (type: string) => {
    switch (type) {
      case 'code': return 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30';
      case 'documentation': return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30';
      case 'data': return 'text-purple-600 bg-purple-100 dark:text-purple-400 dark:bg-purple-900/30';
      case 'model': return 'text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30';
      case 'report': return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30';
      default: return 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-900/30';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const toggleSelection = (yieldItemId: string) => {
    const newSelection = new Set(selectedYields);
    if (newSelection.has(yieldItemId)) {
      newSelection.delete(yieldItemId);
    } else {
      newSelection.add(yieldItemId);
    }
    setSelectedYields(newSelection);
  };

  const downloadSelected = () => {
    selectedYields.forEach(yieldItemId => {
      onDownload(yieldItemId);
    });
    setSelectedYields(new Set());
  };

  return (
    <div className="space-y-6">
      {/* Header with auto-organize */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Digital Yields
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {yieldItems.length} yieldItems created during harvest
          </p>
        </div>
        
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={organizeYields}
          className={clsx(
            'flex items-center space-x-2 px-4 py-2 rounded-apple transition-all',
            autoOrganized
              ? 'bg-green-600 text-white'
              : 'bg-primary-600 text-white hover:bg-primary-700'
          )}
        >
          {autoOrganized ? (
            <>
              <CheckCircle className="w-4 h-4" />
              <span>Organized!</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Auto-Organize</span>
            </>
          )}
        </motion.button>
      </div>

      {/* Search and filters */}
      <div className="flex items-center space-x-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search yieldItems..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 rounded-apple bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>
        
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="pl-10 pr-8 py-2 border border-gray-300 dark:border-gray-700 rounded-apple bg-white dark:bg-gray-800 text-gray-900 dark:text-white appearance-none"
          >
            <option value="all">All Types</option>
            {Object.keys(yieldItemsByType).map(type => (
              <option key={type} value={type}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {selectedYields.size > 0 && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={downloadSelected}
            className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700"
          >
            <Download className="w-4 h-4" />
            <span>Download {selectedYields.size}</span>
          </motion.button>
        )}
      </div>

      {/* Yields grouped by type */}
      <AnimatePresence>
        {Object.entries(yieldItemsByType).map(([type, typeYields]) => (
          <motion.div
            key={type}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-3"
          >
            <div className="flex items-center space-x-2 mb-3">
              <FolderOpen className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <h4 className="font-medium text-gray-900 dark:text-white">
                {type.charAt(0).toUpperCase() + type.slice(1)} ({typeYields.length})
              </h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {typeYields.map((yieldItem) => {
                const Icon = getYieldIcon(yieldItem.type);
                const isSelected = selectedYields.has(yieldItem.id);
                
                return (
                  <motion.div
                    key={yieldItem.id}
                    whileHover={{ scale: 1.02 }}
                    className={clsx(
                      'relative p-4 border rounded-apple-lg transition-all cursor-pointer',
                      isSelected
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-700'
                    )}
                    onClick={() => toggleSelection(yieldItem.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        <div className={clsx('p-2 rounded-apple', getYieldColor(yieldItem.type))}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1">
                          <h5 className="font-medium text-gray-900 dark:text-white line-clamp-1">
                            {yieldItem.name}
                          </h5>
                          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                            {yieldItem.description}
                          </p>
                          <div className="mt-2 flex items-center space-x-3 text-xs text-gray-500">
                            <span>{formatFileSize(yieldItem.size)}</span>
                            <span>•</span>
                            <span>{yieldItem.createdBy.agentName}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {isSelected && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="w-5 h-5 bg-primary-600 rounded-full flex items-center justify-center"
                          >
                            <CheckCircle className="w-3 h-3 text-white" />
                          </motion.div>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDownload(yieldItem.id);
                          }}
                          className="p-1.5 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {filteredYields.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12"
        >
          <Archive className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 dark:text-gray-400">
            No yieldItems found matching your criteria
          </p>
        </motion.div>
      )}
    </div>
  );
};