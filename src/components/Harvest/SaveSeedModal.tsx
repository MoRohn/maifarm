import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Save, 
  Sparkles,
  Hash,
  FileText,
  Tag,
  Calendar,
  Info
} from 'lucide-react';
import { clsx } from 'clsx';
import { Harvest } from '../../types/harvest';
import { seedService } from '../../services/seedService';
import { format } from 'date-fns';

interface SaveSeedModalProps {
  harvest: Harvest;
  onClose: () => void;
  onSave: () => void;
}

export const SaveSeedModal: React.FC<SaveSeedModalProps> = ({
  harvest,
  onClose,
  onSave
}) => {
  const [seedData, setSeedData] = useState({
    name: `${harvest.farmName} Seed - ${format(new Date(), 'MMM d, yyyy')}`,
    description: '',
    tags: [] as string[],
    category: 'general',
    visibility: 'private' as 'private' | 'team' | 'public'
  });
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      if (!seedData.tags.includes(tagInput.trim())) {
        setSeedData({
          ...seedData,
          tags: [...seedData.tags, tagInput.trim()]
        });
      }
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setSeedData({
      ...seedData,
      tags: seedData.tags.filter(t => t !== tag)
    });
  };

  const handleSave = async () => {
    if (!seedData.name.trim()) {
      setError('Please provide a name for the seed');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await seedService.createFromHarvest(harvest.id, {
        name: seedData.name,
        description: seedData.description,
        tags: seedData.tags,
        category: seedData.category,
        visibility: seedData.visibility,
        config: {
          farmConfig: harvest.farmConfig,
          agents: harvest.summary.agents,
          results: harvest.results.map(r => ({
            taskType: r.taskType,
            success: r.success,
            processingTime: r.processingTime
          }))
        }
      });
      
      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save seed');
    } finally {
      setSaving(false);
    }
  };

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
          transition={{ type: "spring", damping: 20 }}
          className="bg-white dark:bg-gray-900 rounded-apple-2xl shadow-apple-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-primary-50 to-primary-100 dark:from-primary-900/20 dark:to-primary-800/20 p-6 border-b border-primary-200 dark:border-primary-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-white dark:bg-gray-800 rounded-apple-lg shadow-apple">
                  <Sparkles className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    Save as Seed
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                    Preserve this harvest configuration for future use
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
          <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-200px)]">
            {/* Harvest Summary */}
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-apple-xl p-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Harvest Summary
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Farm:</span>
                  <span className="ml-2 font-medium text-gray-900 dark:text-white">
                    {harvest.farmName}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Agents:</span>
                  <span className="ml-2 font-medium text-gray-900 dark:text-white">
                    {harvest.summary.agents}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Tasks:</span>
                  <span className="ml-2 font-medium text-gray-900 dark:text-white">
                    {harvest.summary.completedTasks}/{harvest.summary.totalTasks}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Efficiency:</span>
                  <span className="ml-2 font-medium text-gray-900 dark:text-white">
                    {harvest.summary.efficiency}%
                  </span>
                </div>
              </div>
            </div>

            {/* Seed Details */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Seed Name
                </label>
                <input
                  type="text"
                  value={seedData.name}
                  onChange={e => setSeedData({ ...seedData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-apple-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
                  placeholder="Enter a descriptive name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description
                </label>
                <textarea
                  value={seedData.description}
                  onChange={e => setSeedData({ ...seedData, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-apple-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 resize-none"
                  placeholder="Describe what this seed configuration does..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Tags
                </label>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={handleAddTag}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-apple-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
                    placeholder="Press Enter to add tags"
                  />
                  {seedData.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {seedData.tags.map(tag => (
                        <span
                          key={tag}
                          className="inline-flex items-center px-3 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-apple text-sm"
                        >
                          <Tag className="w-3 h-3 mr-1" />
                          {tag}
                          <button
                            onClick={() => handleRemoveTag(tag)}
                            className="ml-2 hover:text-primary-900 dark:hover:text-primary-100"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Category
                  </label>
                  <select
                    value={seedData.category}
                    onChange={e => setSeedData({ ...seedData, category: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-apple-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
                  >
                    <option value="general">General</option>
                    <option value="development">Development</option>
                    <option value="testing">Testing</option>
                    <option value="analysis">Analysis</option>
                    <option value="documentation">Documentation</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Visibility
                  </label>
                  <select
                    value={seedData.visibility}
                    onChange={e => setSeedData({ ...seedData, visibility: e.target.value as 'private' | 'team' | 'public' })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-apple-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
                  >
                    <option value="private">Private</option>
                    <option value="team">Team</option>
                    <option value="public">Public</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Info Note */}
            <div className="flex items-start space-x-2 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-apple-lg">
              <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Seeds allow you to reuse successful farm configurations. The original YAML config, 
                agent settings, and performance metrics will be preserved for future reference.
              </p>
            </div>

            {/* Error Display */}
            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-apple-lg">
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 dark:bg-gray-800/50 px-6 py-4 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-end space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-apple-lg transition-colors"
              >
                Cancel
              </button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSave}
                disabled={saving}
                className={clsx(
                  "flex items-center space-x-2 px-4 py-2 rounded-apple-lg transition-colors",
                  saving 
                    ? "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                    : "bg-primary-600 hover:bg-primary-700 text-white shadow-apple"
                )}
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Saving...' : 'Save Seed'}</span>
              </motion.button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};