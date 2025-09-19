import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Save, 
  X, 
  Sparkles,
  Package,
  FileText,
  Tag,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  Code,
  Lightbulb
} from 'lucide-react';
import { clsx } from 'clsx';
import { Harvest } from '@/types/harvest';
import { SeedFromHarvestInput } from '@/types/seed';
import { api } from '@/services/apiClient';
import { format } from 'date-fns';

interface SeedQuickActionProps {
  harvest: Harvest;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (seed: any) => void;
  context: 'harvest_completion' | 'barn';
}

export const SeedQuickAction: React.FC<SeedQuickActionProps> = ({
  harvest,
  isOpen,
  onClose,
  onSuccess,
  context
}) => {
  const [seedData, setSeedData] = useState<SeedFromHarvestInput>({
    name: `${harvest.farmName || harvest.name} Seed - ${format(new Date(), 'MMM d')}`,
    description: `Seed created from ${harvest.name} harvest`,
    additionalPrompt: '',
    category: 'harvest-derived', // Remove harvest.category reference since it doesn't exist
    tags: ['harvest-derived', harvest.farmName || 'unknown-farm'],
    isPublic: false
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showYamlPreview, setShowYamlPreview] = useState(false);
  const [tagInput, setTagInput] = useState('');

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      if (!(seedData.tags || []).includes(tagInput.trim())) {
        setSeedData(prev => ({
          ...prev,
          tags: [...(prev.tags || []), tagInput.trim()]
        }));
      }
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setSeedData(prev => ({
      ...prev,
      tags: (prev.tags || []).filter(t => t !== tag)
    }));
  };

  const handleSave = useCallback(async () => {
    if (!seedData.name.trim()) {
      setError('Please provide a name for the seed');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const endpoint = context === 'harvest_completion' 
        ? api.seeds.createFromHarvest 
        : api.seeds.createFromBarnHarvest;

      const response = await endpoint(harvest.id, seedData);
      
      if (response.data.success) {
        setSuccess(true);
        setTimeout(() => {
          onSuccess(response.data.data);
          onClose();
        }, 1500);
      } else {
        throw new Error(response.data.error || 'Failed to create seed');
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to create seed';
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  }, [seedData, harvest.id, context, onSuccess, onClose]);

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
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
          className="bg-white dark:bg-gray-900 rounded-apple-2xl shadow-apple-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 p-6 border-b border-green-200 dark:border-green-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 0.2, type: "spring" }}
                  className="p-3 bg-white dark:bg-gray-800 rounded-apple-lg shadow-apple"
                >
                  <Sparkles className="w-6 h-6 text-green-600 dark:text-green-400" />
                </motion.div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    Create Seed from Harvest
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                    {context === 'harvest_completion' 
                      ? 'Save this harvest configuration for future farms'
                      : 'Create a reusable seed from this barn harvest'}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/50 dark:hover:bg-gray-800/50 rounded-apple transition-colors"
              >
                <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-280px)]">
            {/* Success Message */}
            <AnimatePresence>
              {success && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center space-x-2 p-4 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-apple-lg border border-green-200 dark:border-green-800"
                >
                  <CheckCircle className="w-5 h-5" />
                  <span className="text-sm font-medium">Seed created successfully!</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Harvest Summary */}
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-apple-xl p-4">
              <div className="flex items-center space-x-2 mb-3">
                <Package className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Source Harvest
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Name:</span>
                  <div className="font-medium text-gray-900 dark:text-white mt-1">
                    {harvest.name}
                  </div>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Farm:</span>
                  <div className="font-medium text-gray-900 dark:text-white mt-1">
                    {harvest.farmName}
                  </div>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Agents:</span>
                  <div className="font-medium text-gray-900 dark:text-white mt-1">
                    {harvest.summary?.agents?.length || 'Unknown'}
                  </div>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Efficiency:</span>
                  <div className="font-medium text-gray-900 dark:text-white mt-1">
                    {harvest.summary?.efficiency || 'Unknown'}%
                  </div>
                </div>
              </div>
            </div>

            {/* Seed Configuration */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Seed Name
                </label>
                <input
                  type="text"
                  value={seedData.name}
                  onChange={(e) => setSeedData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-apple-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 transition-colors"
                  placeholder="Enter a descriptive name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description
                </label>
                <textarea
                  value={seedData.description}
                  onChange={(e) => setSeedData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-apple-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 resize-none transition-colors"
                  placeholder="Describe what this seed configuration does..."
                />
              </div>

              {/* Additional Prompt - The key new feature */}
              <div>
                <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Lightbulb className="w-4 h-4 text-amber-500" />
                  <span>Add to the Seed prompt (optional)</span>
                </label>
                <textarea
                  value={seedData.additionalPrompt}
                  onChange={(e) => setSeedData(prev => ({ ...prev, additionalPrompt: e.target.value }))}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-apple-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 resize-none transition-colors font-mono text-sm"
                  placeholder="Add additional instructions that will be appended to the original farm prompt..."
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex items-center space-x-1">
                  <FileText className="w-3 h-3" />
                  <span>This text will be added after the original prompt in the YAML configuration</span>
                </p>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Tags
                </label>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleAddTag}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-apple-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 transition-colors"
                    placeholder="Press Enter to add tags"
                  />
                  {(seedData.tags || []).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {(seedData.tags || []).map(tag => (
                        <span
                          key={tag}
                          className="inline-flex items-center px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-apple text-sm"
                        >
                          <Tag className="w-3 h-3 mr-1" />
                          {tag}
                          <button
                            onClick={() => handleRemoveTag(tag)}
                            className="ml-2 hover:text-green-900 dark:hover:text-green-100"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Category and Privacy */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Category
                  </label>
                  <select
                    value={seedData.category}
                    onChange={(e) => setSeedData(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-apple-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 transition-colors"
                  >
                    <option value="harvest-derived">Harvest Derived</option>
                    <option value="development">Development</option>
                    <option value="testing">Testing</option>
                    <option value="analysis">Analysis</option>
                    <option value="documentation">Documentation</option>
                    <option value="automation">Automation</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Visibility
                  </label>
                  <div className="flex items-center space-x-4">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={!seedData.isPublic}
                        onChange={() => setSeedData(prev => ({ ...prev, isPublic: false }))}
                        className="w-4 h-4 text-green-600 focus:ring-green-500 border-gray-300"
                      />
                      <EyeOff className="w-4 h-4 text-gray-500" />
                      <span className="text-sm">Private</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={seedData.isPublic}
                        onChange={() => setSeedData(prev => ({ ...prev, isPublic: true }))}
                        className="w-4 h-4 text-green-600 focus:ring-green-500 border-gray-300"
                      />
                      <Eye className="w-4 h-4 text-gray-500" />
                      <span className="text-sm">Public</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Error Display */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-start space-x-2 p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-apple-lg border border-red-200 dark:border-red-800"
                >
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Error creating seed</p>
                    <p className="text-xs mt-1">{error}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 dark:bg-gray-800/50 px-6 py-4 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center space-x-1">
                <Code className="w-3 h-3" />
                <span>Will generate YAML with integrated prompts and harvest data</span>
              </div>
              
              <div className="flex items-center space-x-3">
                <button
                  onClick={onClose}
                  disabled={saving}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-apple-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <motion.button
                  whileHover={{ scale: saving ? 1 : 1.02 }}
                  whileTap={{ scale: saving ? 1 : 0.98 }}
                  onClick={handleSave}
                  disabled={saving || success}
                  className={clsx(
                    "flex items-center space-x-2 px-6 py-2 rounded-apple-lg transition-all shadow-apple",
                    saving || success
                      ? "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                      : "bg-green-600 hover:bg-green-700 text-white"
                  )}
                >
                  {saving ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      >
                        <Sparkles className="w-4 h-4" />
                      </motion.div>
                      <span>Creating Seed...</span>
                    </>
                  ) : success ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      <span>Created!</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Create Seed</span>
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};