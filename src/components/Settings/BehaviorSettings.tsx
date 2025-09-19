import React from 'react';
import { motion } from 'framer-motion';
import { PauseIcon, PlayIcon, DevicePhoneMobileIcon } from '@heroicons/react/24/outline';
import { useSettingsStore } from '@/store/settingsStore';

const BehaviorSettings: React.FC = () => {
  const { settings, updateSettings } = useSettingsStore();
  const behaviorSettings = settings.system?.behavior || {
    autoPauseOnClose: true,
    runInBackground: false,
    showBackgroundIndicator: true,
  };

  const handleToggle = (key: keyof typeof behaviorSettings) => {
    updateSettings({
      ...settings,
      system: {
        ...settings.system,
        behavior: {
          ...behaviorSettings,
          [key]: !behaviorSettings[key],
        },
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Auto-Pause on Close */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <PauseIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Auto-Pause on Close
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Automatically pause all running farms when the application is closed
              </p>
            </div>
          </div>
          <button
            onClick={() => handleToggle('autoPauseOnClose')}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              behaviorSettings.autoPauseOnClose
                ? 'bg-blue-600'
                : 'bg-gray-200 dark:bg-gray-700'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                behaviorSettings.autoPauseOnClose ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            <strong>Default: ON</strong> - When enabled, farms will automatically pause when you close MaiFarm, 
            saving resources and preventing unattended operations. Farms will resume when you reopen the app.
          </p>
        </div>
      </motion.div>

      {/* Run in Background */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <PlayIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Run in Background
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Allow farms to continue running when the app is in the background
              </p>
            </div>
          </div>
          <button
            onClick={() => handleToggle('runInBackground')}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              behaviorSettings.runInBackground
                ? 'bg-blue-600'
                : 'bg-gray-200 dark:bg-gray-700'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                behaviorSettings.runInBackground ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        
        {behaviorSettings.runInBackground && (
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              <strong>Warning:</strong> Running farms in the background may consume system resources 
              and affect battery life on mobile devices.
            </p>
          </div>
        )}
      </motion.div>

      {/* iOS Toolbar Indicator */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <DevicePhoneMobileIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Background Indicator
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Show an indicator in the iOS toolbar when farms are running in the background
              </p>
            </div>
          </div>
          <button
            onClick={() => handleToggle('showBackgroundIndicator')}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              behaviorSettings.showBackgroundIndicator
                ? 'bg-blue-600'
                : 'bg-gray-200 dark:bg-gray-700'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                behaviorSettings.showBackgroundIndicator ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            When enabled, you'll see a notification badge in the iOS status bar indicating how many 
            farms are actively running in the background.
          </p>
        </div>
      </motion.div>

      {/* Per-Farm Override Info */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800"
      >
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
          Per-Farm Settings
        </h4>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Individual farms can override the global Auto-Pause setting. When creating or editing a farm, 
          you can choose whether that specific farm should pause on close or continue running in the background.
        </p>
      </motion.div>
    </div>
  );
};

export default BehaviorSettings;