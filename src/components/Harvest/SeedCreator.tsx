import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Save, 
  Package, 
  Settings, 
  Code, 
  FileJson,
  Download,
  Share2,
  CheckCircle,
  X,
  Sparkles,
  AlertCircle,
  Copy,
  Edit2,
  ChevronDown,
  FileCode
} from 'lucide-react';
import { Harvest } from '../../types/harvest';

interface SeedCreatorProps {
  harvest: Harvest;
  isOpen: boolean;
  onClose: () => void;
  onSave: (seed: SeedConfig) => void;
}

export interface SeedConfig {
  name: string;
  description: string;
  type: 'farm' | 'gowild' | 'quicktask' | 'custom';
  configuration: {
    agents: number;
    prompt: string;
    steps?: string[];
    resources?: {
      cpu?: number;
      memory?: string;
      timeout?: number;
    };
    settings?: Record<string, any>;
  };
  artifacts: string[]; // IDs of artifacts to include
  insights: string[]; // IDs of insights to include
  tags: string[];
  exportFormat: 'yaml' | 'json';
}

export const SeedCreator: React.FC<SeedCreatorProps> = ({ 
  harvest, 
  isOpen, 
  onClose, 
  onSave 
}) => {
  const [seedConfig, setSeedConfig] = useState<SeedConfig>({
    name: `${harvest.farmName} Seed`,
    description: harvest.description || harvest.summary.description,
    type: 'farm',
    configuration: {
      agents: harvest.summary.agents?.length || 1,
      prompt: '',
      resources: {
        cpu: 2,
        memory: '4GB',
        timeout: 3600
      }
    },
    artifacts: [],
    insights: [],
    tags: harvest.tags || [],
    exportFormat: 'yaml'
  });

  const [selectedArtifacts, setSelectedArtifacts] = useState<Set<string>>(new Set());
  const [selectedInsights, setSelectedInsights] = useState<Set<string>>(new Set());
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSave = () => {
    const finalSeed = {
      ...seedConfig,
      artifacts: Array.from(selectedArtifacts),
      insights: Array.from(selectedInsights)
    };
    onSave(finalSeed);
  };

  const toggleArtifact = (artifactId: string) => {
    const newSelection = new Set(selectedArtifacts);
    if (newSelection.has(artifactId)) {
      newSelection.delete(artifactId);
    } else {
      newSelection.add(artifactId);
    }
    setSelectedArtifacts(newSelection);
  };

  const toggleInsight = (insightId: string) => {
    const newSelection = new Set(selectedInsights);
    if (newSelection.has(insightId)) {
      newSelection.delete(insightId);
    } else {
      newSelection.add(insightId);
    }
    setSelectedInsights(newSelection);
  };

  const generateYAML = () => {
    const yaml = `name: ${seedConfig.name}
description: ${seedConfig.description}
type: ${seedConfig.type}
configuration:
  agents: ${seedConfig.configuration.agents}
  prompt: |
    ${seedConfig.configuration.prompt.split('\n').join('\n    ')}
  resources:
    cpu: ${seedConfig.configuration.resources?.cpu}
    memory: ${seedConfig.configuration.resources?.memory}
    timeout: ${seedConfig.configuration.resources?.timeout}
artifacts:
${selectedArtifacts.size > 0 ? Array.from(selectedArtifacts).map(id => `  - ${id}`).join('\n') : '  []'}
insights:
${selectedInsights.size > 0 ? Array.from(selectedInsights).map(id => `  - ${id}`).join('\n') : '  []'}
tags:
${seedConfig.tags.length > 0 ? seedConfig.tags.map(tag => `  - ${tag}`).join('\n') : '  []'}
`;
    return yaml;
  };

  const copyToClipboard = async () => {
    const content = seedConfig.exportFormat === 'yaml' 
      ? generateYAML() 
      : JSON.stringify(seedConfig, null, 2);
    
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-6 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-white/20 backdrop-blur rounded-xl">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Create Seed from Harvest</h2>
                  <p className="text-white/90 mt-1">
                    Save this harvest configuration for future use
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 max-h-[calc(90vh-200px)] overflow-y-auto">
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Basic Configuration
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Seed Name
                    </label>
                    <input
                      type="text"
                      value={seedConfig.name}
                      onChange={(e) => setSeedConfig({ ...seedConfig, name: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-green-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Type
                    </label>
                    <select
                      value={seedConfig.type}
                      onChange={(e) => setSeedConfig({ ...seedConfig, type: e.target.value as any })}
                      className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-green-500"
                    >
                      <option value="farm">Farm</option>
                      <option value="gowild">Go Wild</option>
                      <option value="quicktask">Quick Task</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Description
                  </label>
                  <textarea
                    value={seedConfig.description}
                    onChange={(e) => setSeedConfig({ ...seedConfig, description: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Initial Prompt
                  </label>
                  <textarea
                    value={seedConfig.configuration.prompt}
                    onChange={(e) => setSeedConfig({ 
                      ...seedConfig, 
                      configuration: { ...seedConfig.configuration, prompt: e.target.value }
                    })}
                    rows={4}
                    placeholder="Enter the initial prompt for this seed configuration..."
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-green-500 font-mono text-sm"
                  />
                </div>
              </div>

              {/* Artifacts Selection */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Include Artifacts ({selectedArtifacts.size}/{harvest.artifacts.length})
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-48 overflow-y-auto p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  {harvest.artifacts.map(artifact => (
                    <label
                      key={artifact.id}
                      className="flex items-center gap-3 p-3 bg-white dark:bg-gray-900 rounded-lg cursor-pointer hover:shadow-md transition-shadow"
                    >
                      <input
                        type="checkbox"
                        checked={selectedArtifacts.has(artifact.id)}
                        onChange={() => toggleArtifact(artifact.id)}
                        className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {artifact.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-500">
                          {artifact.type} • {(artifact.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Advanced Settings */}
              <div className="space-y-4">
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                >
                  <Settings className="w-4 h-4" />
                  Advanced Settings
                  <motion.div
                    animate={{ rotate: showAdvanced ? 180 : 0 }}
                    className="ml-auto"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </motion.div>
                </button>

                <AnimatePresence>
                  {showAdvanced && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="space-y-4 overflow-hidden"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Number of Agents
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="10"
                            value={seedConfig.configuration.agents}
                            onChange={(e) => setSeedConfig({
                              ...seedConfig,
                              configuration: { 
                                ...seedConfig.configuration, 
                                agents: parseInt(e.target.value) 
                              }
                            })}
                            className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            CPU Cores
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="8"
                            value={seedConfig.configuration.resources?.cpu}
                            onChange={(e) => setSeedConfig({
                              ...seedConfig,
                              configuration: {
                                ...seedConfig.configuration,
                                resources: {
                                  ...seedConfig.configuration.resources,
                                  cpu: parseInt(e.target.value)
                                }
                              }
                            })}
                            className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Memory
                          </label>
                          <select
                            value={seedConfig.configuration.resources?.memory}
                            onChange={(e) => setSeedConfig({
                              ...seedConfig,
                              configuration: {
                                ...seedConfig.configuration,
                                resources: {
                                  ...seedConfig.configuration.resources,
                                  memory: e.target.value
                                }
                              }
                            })}
                            className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
                          >
                            <option value="2GB">2 GB</option>
                            <option value="4GB">4 GB</option>
                            <option value="8GB">8 GB</option>
                            <option value="16GB">16 GB</option>
                          </select>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Export Format */}
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Export Format:
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSeedConfig({ ...seedConfig, exportFormat: 'yaml' })}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      seedConfig.exportFormat === 'yaml'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                    }`}
                  >
                    <FileCode className="w-4 h-4 inline mr-1" />
                    YAML
                  </button>
                  <button
                    onClick={() => setSeedConfig({ ...seedConfig, exportFormat: 'json' })}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      seedConfig.exportFormat === 'json'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                    }`}
                  >
                    <FileJson className="w-4 h-4 inline mr-1" />
                    JSON
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 dark:border-gray-800 p-6">
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={copyToClipboard}
                  className="px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg flex items-center gap-2 transition-colors"
                >
                  {copied ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="text-sm">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span className="text-sm">Copy Config</span>
                    </>
                  )}
                </motion.button>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSave}
                  className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center gap-2 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  Save Seed
                </motion.button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};