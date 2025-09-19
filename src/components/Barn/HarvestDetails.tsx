import React from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Download,
  Play,
  GitBranch,
  Clock,
  Users,
  Cpu,
  HardDrive,
  FileText,
  Folder,
  File,
  Code,
  Package,
  Wrench,
  Star,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { clsx } from 'clsx';
import { Harvest } from '@/types/barn';

interface HarvestDetailsProps {
  harvest: Harvest;
  onClose: () => void;
  onUse: () => void;
}

export const HarvestDetails: React.FC<HarvestDetailsProps> = ({ harvest, onClose, onUse }) => {
  const [selectedArtifact, setSelectedArtifact] = React.useState<string | null>(null);
  
  const handleDownloadItem = async (yieldId: string, fileName: string) => {
    try {
      const response = await fetch(`/api/barn/items/${harvest.id}/yield/${yieldId}/download`);
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to download yield item:', error);
    }
  };
  
  const handleDownloadAll = async () => {
    try {
      const response = await fetch(`/api/barn/items/${harvest.id}/download-all`);
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${harvest.name.replace(/[^a-z0-9]/gi, '_')}_yield.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to download all yield items:', error);
    }
  };
  
  const typeConfig = {
    app: { icon: Package, color: 'blue' },
    tool: { icon: Wrench, color: 'green' },
    script: { icon: Code, color: 'purple' },
    workflow: { icon: FileText, color: 'orange' },
    other: { icon: FileText, color: 'gray' }
  };

  // Ensure we have a valid type, fallback to 'other' if undefined or invalid
  const harvestType = (harvest.type && harvest.type in typeConfig) ? harvest.type : 'other';
  const config = typeConfig[harvestType];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-white dark:bg-gray-900 rounded-apple-lg shadow-apple-xl"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className={clsx(
              'p-3 rounded-apple',
              `bg-${config.color}-100 dark:bg-${config.color}-900/30`
            )}>
              <Icon className={clsx('w-6 h-6', `text-${config.color}-600 dark:text-${config.color}-400`)} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {harvest.name}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {harvest.type.charAt(0).toUpperCase() + harvest.type.slice(1)} • v{harvest.version}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6 p-6">
        {/* Left Column - Details */}
        <div className="col-span-2 space-y-6">
          {/* Description */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Description
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              {harvest.description}
            </p>
          </div>

          {/* Metadata */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Metadata
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-apple p-4">
                <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-400 mb-1">
                  <Users className="w-4 h-4" />
                  <span className="text-sm">Agents</span>
                </div>
                <p className="text-xl font-semibold text-gray-900 dark:text-white">
                  {harvest.metadata.agentCount}
                </p>
              </div>
              
              <div className="bg-gray-50 dark:bg-gray-800 rounded-apple p-4">
                <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-400 mb-1">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm">Duration</span>
                </div>
                <p className="text-xl font-semibold text-gray-900 dark:text-white">
                  {Math.round(harvest.metadata.duration / 60)}m
                </p>
              </div>
              
              <div className="bg-gray-50 dark:bg-gray-800 rounded-apple p-4">
                <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-400 mb-1">
                  <Star className="w-4 h-4" />
                  <span className="text-sm">Success Rate</span>
                </div>
                <p className="text-xl font-semibold text-gray-900 dark:text-white">
                  {harvest.metadata.successRate}%
                </p>
              </div>
              
              <div className="bg-gray-50 dark:bg-gray-800 rounded-apple p-4">
                <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-400 mb-1">
                  <Cpu className="w-4 h-4" />
                  <span className="text-sm">CPU Usage</span>
                </div>
                <p className="text-xl font-semibold text-gray-900 dark:text-white">
                  {harvest.metadata.resourceUsage?.cpu || 0}%
                </p>
              </div>
            </div>
          </div>

          {/* Artifacts */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Yield ({harvest.yield?.length || 0})
              </h3>
              {harvest.yield && harvest.yield.length > 0 && (
                <button
                  onClick={handleDownloadAll}
                  className="flex items-center space-x-1 text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                >
                  <Download className="w-3 h-3" />
                  <span>Download All</span>
                </button>
              )}
            </div>
            <div className="space-y-2">
              {harvest.yield && harvest.yield.length > 0 ? (
                harvest.yield.map((yieldItem) => (
                  <div
                    key={yieldItem.id}
                    className={clsx(
                      'flex items-center justify-between p-3 rounded-apple',
                      'border transition-colors',
                      selectedArtifact === yieldItem.id
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    )}
                  >
                    <button
                      onClick={() => setSelectedArtifact(yieldItem.id)}
                      className="flex-1 flex items-center space-x-3"
                    >
                      {yieldItem.type === 'directory' ? (
                        <Folder className="w-4 h-4 text-gray-500" />
                      ) : (
                        <File className="w-4 h-4 text-gray-500" />
                      )}
                      <div className="text-left">
                        <p className="font-medium text-gray-900 dark:text-white">
                          {yieldItem.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {yieldItem.location || yieldItem.path} • {formatFileSize(yieldItem.size)}
                        </p>
                      </div>
                    </button>
                    <button
                      onClick={() => handleDownloadItem(yieldItem.id, yieldItem.name)}
                      className="p-2 text-gray-500 hover:text-primary-600 dark:hover:text-primary-400"
                      title="Download"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="p-4 text-center text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-apple">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No yield items collected</p>
                  <p className="text-xs mt-1">Yield items will appear here when collected</p>
                </div>
              )}
            </div>
          </div>

          {/* Configuration */}
          {harvest.config.yaml && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                YAML Configuration
              </h3>
              <pre className="bg-gray-50 dark:bg-gray-800 rounded-apple p-4 text-xs text-gray-600 dark:text-gray-400 overflow-x-auto">
                {harvest.config.yaml}
              </pre>
            </div>
          )}
        </div>

        {/* Right Column - Actions & Info */}
        <div className="space-y-6">
          {/* Actions */}
          <div className="space-y-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onUse}
              className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-primary-600 text-white rounded-apple hover:bg-primary-700 transition-colors"
            >
              <Play className="w-5 h-5" />
              <span>Use This Harvest</span>
            </motion.button>
            
            <button className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-apple hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
              <Download className="w-5 h-5" />
              <span>Download</span>
            </button>
          </div>

          {/* Tags */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Tags
            </h3>
            <div className="flex flex-wrap gap-2">
              {harvest.tags && Array.isArray(harvest.tags) && harvest.tags
                .filter(tag => typeof tag === 'string')
                .map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-sm rounded-full"
                  >
                    {tag}
                  </span>
                ))}
            </div>
          </div>

          {/* Usage Stats */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Usage Statistics
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Times Used</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {harvest.useCount}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Created</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {new Date(harvest.createdAt).toLocaleDateString()}
                </span>
              </div>
              {harvest.lastUsedAt && (
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Last Used</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {new Date(harvest.lastUsedAt).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Dependencies */}
          {harvest.config.dependencies && harvest.config.dependencies.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Dependencies
              </h3>
              <div className="space-y-1">
                {harvest.config.dependencies.map((dep) => (
                  <div
                    key={dep}
                    className="text-sm text-gray-600 dark:text-gray-400 font-mono"
                  >
                    {dep}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}