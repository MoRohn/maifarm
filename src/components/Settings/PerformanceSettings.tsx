import React, { useState } from 'react';
import { Zap, Cpu, HardDrive, Wifi, Battery, Monitor, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import { PerformanceSettings as IPerformanceSettings, StorageSettings, NetworkSettings } from '@/types/settings';

const PerformanceSettings: React.FC = () => {
  const [performance, setPerformance] = useState<IPerformanceSettings>({
    maxConcurrentAgents: 3,
    animationsEnabled: true,
    hardwareAcceleration: true,
    lowPowerMode: false
  });

  const [storage, setStorage] = useState<StorageSettings>({
    cacheEnabled: true,
    maxCacheSize: 500,
    offlineMode: true,
    autoCleanup: true,
    retentionDays: 30
  });

  const [network, setNetwork] = useState<NetworkSettings>({
    proxyEnabled: false,
    timeout: 30,
    retryAttempts: 3,
    offlineQueueEnabled: true
  });

  const updatePerformance = (updates: Partial<IPerformanceSettings>) => {
    setPerformance(prev => ({ ...prev, ...updates }));
  };

  const updateStorage = (updates: Partial<StorageSettings>) => {
    setStorage(prev => ({ ...prev, ...updates }));
  };

  const updateNetwork = (updates: Partial<NetworkSettings>) => {
    setNetwork(prev => ({ ...prev, ...updates }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Performance Settings
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Optimize MaiFarm's performance based on your system capabilities.
        </p>
      </div>

      {/* Agent Performance */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <Cpu className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h4 className="font-medium text-gray-900 dark:text-white">Agent Configuration</h4>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Maximum Concurrent Agents
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="1"
                max="10"
                value={performance.maxConcurrentAgents}
                onChange={(e) => updatePerformance({ maxConcurrentAgents: parseInt(e.target.value) })}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
              />
              <span className="w-12 text-center font-medium text-gray-900 dark:text-white">
                {performance.maxConcurrentAgents}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Higher values allow more agents to run simultaneously but require more system resources
            </p>
          </div>
        </div>
      </div>

      {/* Visual Performance */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <Monitor className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h4 className="font-medium text-gray-900 dark:text-white">Visual Performance</h4>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h5 className="font-medium text-gray-900 dark:text-white">Animations</h5>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Smooth transitions and animations throughout the interface
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={performance.animationsEnabled}
                onChange={(e) => updatePerformance({ animationsEnabled: e.target.checked })}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h5 className="font-medium text-gray-900 dark:text-white">Hardware Acceleration</h5>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Use GPU for rendering when available
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={performance.hardwareAcceleration}
                onChange={(e) => updatePerformance({ hardwareAcceleration: e.target.checked })}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Storage Settings */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <HardDrive className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h4 className="font-medium text-gray-900 dark:text-white">Storage & Cache</h4>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h5 className="font-medium text-gray-900 dark:text-white">Enable Cache</h5>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Store frequently accessed data for faster loading
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={storage.cacheEnabled}
                onChange={(e) => updateStorage({ cacheEnabled: e.target.checked })}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Maximum Cache Size (MB)
            </label>
            <input
              type="number"
              min="100"
              max="2000"
              step="100"
              value={storage.maxCacheSize}
              onChange={(e) => updateStorage({ maxCacheSize: parseInt(e.target.value) })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h5 className="font-medium text-gray-900 dark:text-white">Offline Mode</h5>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Enable offline access to farms and settings
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={storage.offlineMode}
                onChange={(e) => updateStorage({ offlineMode: e.target.checked })}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Power Settings */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <Battery className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h4 className="font-medium text-gray-900 dark:text-white">Power Management</h4>
        </div>
        
        <div className="flex items-center justify-between">
          <div>
            <h5 className="font-medium text-gray-900 dark:text-white">Low Power Mode</h5>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Reduce performance to save battery on mobile devices
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={performance.lowPowerMode}
              onChange={(e) => updatePerformance({ lowPowerMode: e.target.checked })}
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
          </label>
        </div>
      </div>

      {/* Performance Tips */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Zap className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-1">
              Performance Tips
            </h4>
            <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
              <li>• Reduce concurrent agents if experiencing slowdowns</li>
              <li>• Disable animations on older devices</li>
              <li>• Clear cache regularly to free up storage space</li>
              <li>• Enable low power mode when on battery</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Clear Cache Button */}
      <div className="flex justify-end">
        <button className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
          Clear All Cache
        </button>
      </div>
    </div>
  );
};

export default PerformanceSettings;