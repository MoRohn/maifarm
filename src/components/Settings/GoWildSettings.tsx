import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Shield, Clock, AlertTriangle, Save, RotateCcw } from 'lucide-react';
import { GoWildConfig } from '@/types/goWild';
import { useUserStore } from '@/store/userStore';
import { goWildService } from '@/services/goWildService';

const GoWildSettings: React.FC = () => {
  const { user, updatePreferences } = useUserStore();
  const [config, setConfig] = useState<GoWildConfig>({
    creativityLevel: user?.preferences?.goWild?.creativityLevel || 70,
    explorationDepth: user?.preferences?.goWild?.explorationDepth || 5,
    maxDuration: user?.preferences?.goWild?.maxDuration || 30,
    boundaries: user?.preferences?.goWild?.boundaries || {
      allowExternalAPIs: true,
      allowFileSystem: true,
      allowNetworkRequests: true,
      restrictedDomains: []
    },
    focusAreas: user?.preferences?.goWild?.focusAreas || []
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save to user preferences
      await updatePreferences({
        goWild: config
      });
      
      // Save to service
      await goWildService.saveDefaultConfig(config);
      
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Failed to save Go Wild settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const defaultConfig: GoWildConfig = {
      creativityLevel: 70,
      explorationDepth: 5,
      maxDuration: 30,
      boundaries: {
        allowExternalAPIs: true,
        allowFileSystem: true,
        allowNetworkRequests: true,
        restrictedDomains: []
      },
      focusAreas: []
    };
    setConfig(defaultConfig);
  };

  const creativityDescriptions = [
    { min: 0, max: 20, label: 'Conservative', color: 'bg-blue-500' },
    { min: 20, max: 40, label: 'Balanced', color: 'bg-green-500' },
    { min: 40, max: 60, label: 'Creative', color: 'bg-yellow-500' },
    { min: 60, max: 80, label: 'Adventurous', color: 'bg-orange-500' },
    { min: 80, max: 100, label: 'Wild', color: 'bg-red-500' }
  ];

  const getCurrentCreativityLabel = () => {
    const level = config.creativityLevel;
    return creativityDescriptions.find(d => level >= d.min && level < d.max) || creativityDescriptions[4];
  };

  const creativityLabel = getCurrentCreativityLabel();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">
          Go Wild Configuration
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Configure default settings for AI agent exploration mode
        </p>
      </div>

      {/* Creativity Level */}
      <div className="bg-white dark:bg-gray-800 rounded-apple-lg p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-apple">
            <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white">
              Creativity Level
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              How creative agents should be when exploring
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {creativityLabel.label}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {config.creativityLevel}%
            </span>
          </div>
          
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-yellow-500 to-red-500 rounded-full opacity-20" />
            <input
              type="range"
              min={0}
              max={100}
              value={config.creativityLevel}
              onChange={(e) => setConfig({ ...config, creativityLevel: parseInt(e.target.value) })}
              className="w-full h-2 bg-transparent rounded-full appearance-none cursor-pointer relative z-10"
              style={{
                background: `linear-gradient(to right, #3b82f6 0%, #eab308 50%, #ef4444 100%)`
              }}
            />
          </div>
        </div>
      </div>

      {/* Exploration Settings */}
      <div className="bg-white dark:bg-gray-800 rounded-apple-lg p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-apple">
            <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white">
              Exploration Settings
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Control exploration depth and duration
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Exploration Depth
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={config.explorationDepth}
              onChange={(e) => setConfig({ ...config, explorationDepth: parseInt(e.target.value) })}
              className="w-full px-3 py-2 rounded-apple border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              How many levels deep agents can explore (1-10)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Max Duration
            </label>
            <div className="grid grid-cols-5 gap-2">
              {[
                { label: '5m', value: 5 },
                { label: '10m', value: 10 },
                { label: '20m', value: 20 },
                { label: '30m', value: 30 },
                { label: '1hr', value: 60 },
                { label: '2hr', value: 120 },
                { label: '4hr', value: 240 },
                { label: '6hr', value: 360 },
                { label: '12hr', value: 720 },
                { label: '24hr', value: 1440 }
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setConfig({ ...config, maxDuration: option.value })}
                  className={`relative px-3 py-2 rounded-apple text-sm font-medium transition-all flex items-center justify-center ${
                    config.maxDuration === option.value
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <div className={`absolute left-2 w-3 h-3 rounded-full border-2 transition-all ${
                    config.maxDuration === option.value
                      ? 'border-white bg-white'
                      : 'border-gray-400 dark:border-gray-500'
                  }`} />
                  <span className="ml-3">{option.label}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-purple-600 dark:text-purple-400 mt-2">
              {config.maxDuration < 60 
                ? `${config.maxDuration} minutes`
                : config.maxDuration === 60
                ? '1 hour'
                : `${config.maxDuration / 60} hours`}
              {config.maxDuration === 30 && ' (Default)'}
            </p>
          </div>
        </div>
      </div>

      {/* Safety Boundaries */}
      <div className="bg-white dark:bg-gray-800 rounded-apple-lg p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-apple">
            <Shield className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
          </div>
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white">
              Safety Boundaries
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Define what agents are allowed to access
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={config.boundaries.allowExternalAPIs}
              onChange={(e) => setConfig({
                ...config,
                boundaries: { ...config.boundaries, allowExternalAPIs: e.target.checked }
              })}
              className="rounded text-purple-600 focus:ring-purple-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Allow External APIs
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Agents can make requests to external services
              </p>
            </div>
          </label>

          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={config.boundaries.allowFileSystem}
              onChange={(e) => setConfig({
                ...config,
                boundaries: { ...config.boundaries, allowFileSystem: e.target.checked }
              })}
              className="rounded text-purple-600 focus:ring-purple-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Allow File System Access
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Agents can read and write local files
              </p>
            </div>
          </label>

          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={config.boundaries.allowNetworkRequests}
              onChange={(e) => setConfig({
                ...config,
                boundaries: { ...config.boundaries, allowNetworkRequests: e.target.checked }
              })}
              className="rounded text-purple-600 focus:ring-purple-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Allow Network Requests
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Agents can make network requests
              </p>
            </div>
          </label>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Restricted Domains
          </label>
          <textarea
            placeholder="Enter domains to block, one per line"
            value={config.boundaries.restrictedDomains.join('\n')}
            onChange={(e) => setConfig({
              ...config,
              boundaries: {
                ...config.boundaries,
                restrictedDomains: e.target.value.split('\n').filter(d => d.trim())
              }
            })}
            className="w-full px-3 py-2 rounded-apple border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white h-24 resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Focus Areas */}
      <div className="bg-white dark:bg-gray-800 rounded-apple-lg p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="font-medium text-gray-900 dark:text-white mb-4">
          Default Focus Areas
        </h3>
        <textarea
          placeholder="Enter focus areas for exploration, one per line (optional)"
          value={config.focusAreas.join('\n')}
          onChange={(e) => setConfig({
            ...config,
            focusAreas: e.target.value.split('\n').filter(a => a.trim())
          })}
          className="w-full px-3 py-2 rounded-apple border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white h-24 resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
      </div>

      {/* Warning */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-apple-lg p-4 border border-yellow-200 dark:border-yellow-800">
        <div className="flex items-start space-x-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
          <div className="text-sm text-yellow-700 dark:text-yellow-300">
            <p className="font-medium mb-1">Important Safety Notice</p>
            <p>These settings define the default boundaries for all Go Wild sessions. Individual sessions can override these defaults. All exploration activities are monitored and can be rolled back if needed.</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4">
        <button
          onClick={handleReset}
          className="flex items-center space-x-2 px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-apple transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Reset to Defaults</span>
        </button>

        <div className="flex items-center space-x-3">
          {saved && (
            <motion.span
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="text-sm text-green-600 dark:text-green-400"
            >
              Settings saved successfully!
            </motion.span>
          )}
          
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center space-x-2 px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-apple hover:from-purple-700 hover:to-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default GoWildSettings;