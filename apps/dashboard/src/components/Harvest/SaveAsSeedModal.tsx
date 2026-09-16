import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Flower2,
  Save,
  X,
  Info,
  Tag,
  FileText,
  Zap,
  Users,
  Clock
} from 'lucide-react';
import { clsx } from 'clsx';
import { Harvest } from '@/types/harvest';
import { SeedCreateInput } from '@/types/seed';
import { harvestService } from '@/services/harvestService';

interface SaveAsSeedModalProps {
  harvest: Harvest;
  isOpen: boolean;
  onClose: () => void;
  onSave: (seed: SeedCreateInput) => Promise<void>;
}

export const SaveAsSeedModal: React.FC<SaveAsSeedModalProps> = ({
  harvest,
  isOpen,
  onClose,
  onSave
}) => {
  const [seedData, setSeedData] = useState<SeedCreateInput>({
    name: `${harvest.farmName} Seed`,
    description: '',
    yaml: '', // Will be generated from harvest data
    farmType: 'collaborative',
    category: 'custom',
    tags: ['harvest-generated', ...harvest.tags],
    isPublic: false
  });
  const [saving, setSaving] = useState(false);
  const [savedSuccessfully, setSavedSuccessfully] = useState(false);

  // Generate YAML from harvest data
  const generateYamlFromHarvest = (): string => {
    const agentTypes = new Set(harvest.results.map(r => r.agentType));
    const taskTypes = new Set(harvest.results.map(r => r.taskType));
    
    // Create a simplified YAML structure based on harvest patterns
    const yaml = `# Generated from ${harvest.farmName} harvest
# Success rate: ${harvest.summary.totalTasks > 0 ? Math.round((harvest.summary.completedTasks / harvest.summary.totalTasks) * 100) : 0}%
# Duration: ${harvest.summary.duration ? Math.floor(harvest.summary.duration / 60) : 0}m

name: "${seedData.name}"
type: ${seedData.farmType}
description: "${seedData.description}"

agents:
${Array.from(agentTypes).map((type, index) => `  - id: agent_${index + 1}
    type: ${type}
    capabilities:
      - ${Array.from(taskTypes).join('\n      - ')}
    config:
      max_iterations: 50
      temperature: 0.7`).join('\n')}

workflow:
  - phase: "initialization"
    agents: all
    tasks:
      - "Setup and prepare environment"
      - "Analyze requirements"
  
  - phase: "execution"
    agents: all
    parallel: true
    tasks:
${harvest.insights
  .filter(i => i.type === 'pattern' || i.type === 'discovery')
  .slice(0, 5)
  .map(i => `      - "${i.title}"`)
  .join('\n')}
  
  - phase: "completion"
    agents: all
    tasks:
      - "Validate results"
      - "Generate summary report"

monitoring:
  metrics_enabled: true
  log_level: info
  checkpoint_interval: 300

optimization:
  efficiency_target: ${harvest.summary.efficiency}
  quality_threshold: ${harvest.quality.overallScore}
`;
    
    return yaml;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const yaml = generateYamlFromHarvest();
      await onSave({
        ...seedData,
        yaml
      });
      setSavedSuccessfully(true);
      setTimeout(() => {
        onClose();
        setSavedSuccessfully(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to save seed:', error);
    } finally {
      setSaving(false);
    }
  };

  // Extract key metrics for display
  const metrics = [
    {
      icon: Users,
      label: 'Agents Used',
      value: new Set(harvest.results.map(r => r.agentId)).size
    },
    {
      icon: Zap,
      label: 'Efficiency',
      value: `${harvest.summary.efficiency}%`
    },
    {
      icon: Clock,
      label: 'Duration',
      value: `${harvest.summary.duration ? Math.floor(harvest.summary.duration / 60) : 0}m`
    }
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", damping: 20 }}
            className="bg-white dark:bg-gray-900 rounded-apple-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-apple">
                    <Flower2 className="w-6 h-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                      Save Harvest as Seed
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Create a reusable template from this successful harvest
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Harvest Summary */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-apple-lg p-4">
                <h3 className="font-medium text-gray-900 dark:text-white mb-3">
                  Harvest Summary
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  {metrics.map((metric) => (
                    <div key={metric.label} className="text-center">
                      <metric.icon className="w-5 h-5 text-gray-600 dark:text-gray-400 mx-auto mb-1" />
                      <p className="text-lg font-semibold text-gray-900 dark:text-white">
                        {metric.value}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {metric.label}
                      </p>
                    </div>
                  ))}
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
                    onChange={(e) => setSeedData({ ...seedData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-apple bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    placeholder="Enter a descriptive name for this seed"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Description
                  </label>
                  <textarea
                    value={seedData.description}
                    onChange={(e) => setSeedData({ ...seedData, description: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-apple bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    rows={3}
                    placeholder="Describe what this seed does and when to use it"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Farm Type
                  </label>
                  <select
                    value={seedData.farmType}
                    onChange={(e) => setSeedData({ ...seedData, farmType: e.target.value as any })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-apple bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    <option value="sequential">Sequential</option>
                    <option value="collaborative">Collaborative</option>
                    <option value="autonomous">Autonomous</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Tags
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {seedData.tags?.map((tag, index) => (
                      <span
                        key={index}
                        className="px-3 py-1 bg-gray-100 dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 rounded-full flex items-center space-x-1"
                      >
                        <Tag className="w-3 h-3" />
                        <span>{tag}</span>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="isPublic"
                    checked={seedData.isPublic}
                    onChange={(e) => setSeedData({ ...seedData, isPublic: e.target.checked })}
                    className="rounded"
                  />
                  <label htmlFor="isPublic" className="text-sm text-gray-700 dark:text-gray-300">
                    Make this seed public for other users
                  </label>
                </div>
              </div>

              {/* Info Box */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-apple-lg p-4">
                <div className="flex items-start space-x-3">
                  <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                  <div className="text-sm text-blue-800 dark:text-blue-300">
                    <p className="font-medium mb-1">What happens next?</p>
                    <p>
                      This seed will capture the successful patterns from your harvest,
                      including agent configurations, task workflows, and optimization settings.
                      You can use it to quickly start similar farms in the future.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200 dark:border-gray-800">
              <div className="flex items-center justify-end space-x-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSave}
                  disabled={saving || !seedData.name || !seedData.description}
                  className={clsx(
                    'flex items-center space-x-2 px-4 py-2 rounded-apple font-medium transition-all',
                    savedSuccessfully
                      ? 'bg-green-600 text-white'
                      : saving
                      ? 'bg-gray-400 text-white cursor-not-allowed'
                      : 'bg-primary-600 text-white hover:bg-primary-700'
                  )}
                >
                  {savedSuccessfully ? (
                    <>
                      <Flower2 className="w-4 h-4" />
                      <span>Saved!</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>{saving ? 'Saving...' : 'Save as Seed'}</span>
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};