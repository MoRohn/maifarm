import React from 'react';
import { motion } from 'framer-motion';
import {
  CpuChipIcon,
  WifiIcon,
  BoltIcon,
  Battery50Icon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { useSettingsStore } from '@/store/settingsStore';

const PerformanceSettings: React.FC = () => {
  const { settings, updateSettings } = useSettingsStore();

  const performance = settings.system?.performance ?? {
    maxConcurrentAgents: 4,
    animationsEnabled: true,
    hardwareAcceleration: true,
    lowPowerMode: false,
  };

  const storage = settings.system?.storage ?? {
    cacheEnabled: true,
    maxCacheSize: 500,
    offlineMode: true,
    autoCleanup: true,
    retentionDays: 30,
  };

  const network = settings.system?.network ?? {
    proxyEnabled: false,
    timeout: 30,
    retryAttempts: 3,
    offlineQueueEnabled: true,
  };

  const updatePerformance = (updates: Partial<typeof performance>) => {
    updateSettings({
      system: {
        performance: {
          ...performance,
          ...updates,
        },
      },
    });
  };

  const updateStorage = (updates: Partial<typeof storage>) => {
    updateSettings({
      system: {
        storage: {
          ...storage,
          ...updates,
        },
      },
    });
  };

  const updateNetwork = (updates: Partial<typeof network>) => {
    updateSettings({
      system: {
        network: {
          ...network,
          ...updates,
        },
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Performance</h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Tune MaiFarm for your workstation and connection profile.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <motion.div
          layout
          className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 space-y-4"
        >
          <div className="flex items-center gap-3">
            <CpuChipIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-white">Agent workload</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400">Control how many agents run in parallel.</p>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">Max concurrent agents</label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={1}
                max={16}
                value={performance.maxConcurrentAgents}
                onChange={(event) => updatePerformance({ maxConcurrentAgents: parseInt(event.target.value, 10) })}
                className="h-2 flex-1 rounded bg-gray-200 dark:bg-gray-700"
              />
              <span className="w-10 text-right text-sm font-medium text-gray-900 dark:text-white">
                {performance.maxConcurrentAgents}
              </span>
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <label className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3 dark:bg-gray-900/30">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Animations</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Smooth transitions across the UI.</p>
              </div>
              <input
                type="checkbox"
                checked={performance.animationsEnabled}
                onChange={(event) => updatePerformance({ animationsEnabled: event.target.checked })}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500"
              />
            </label>

            <label className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3 dark:bg-gray-900/30">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Hardware acceleration</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Use GPU for rendering when available.</p>
              </div>
              <input
                type="checkbox"
                checked={performance.hardwareAcceleration}
                onChange={(event) => updatePerformance({ hardwareAcceleration: event.target.checked })}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500"
              />
            </label>

            <label className="flex items-center justify-between rounded-lg bg-amber-50 px-4 py-3 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
              <div>
                <p className="font-medium">Low power mode</p>
                <p className="text-xs">Reduce concurrency to conserve battery.</p>
              </div>
              <input
                type="checkbox"
                checked={performance.lowPowerMode}
                onChange={(event) => updatePerformance({ lowPowerMode: event.target.checked })}
                className="h-4 w-4 text-amber-600 focus:ring-amber-500"
              />
            </label>
          </div>
        </motion.div>

        <motion.div
          layout
          className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 space-y-4"
        >
          <div className="flex items-center gap-3">
            <BoltIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-white">Cache & storage</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400">Configure offline cache and retention.</p>
            </div>
          </div>

          <label className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3 dark:bg-gray-900/30 text-sm">
            <span className="text-gray-700 dark:text-gray-300">Enable cache</span>
            <input
              type="checkbox"
              checked={storage.cacheEnabled}
              onChange={(event) => updateStorage({ cacheEnabled: event.target.checked })}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500"
            />
          </label>

          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">Cache size (MB)</label>
            <input
              type="number"
              min={100}
              max={2000}
              step={50}
              value={storage.maxCacheSize}
              onChange={(event) => updateStorage({ maxCacheSize: parseInt(event.target.value, 10) })}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
          </div>

          <label className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3 dark:bg-gray-900/30 text-sm">
            <div>
              <p className="text-gray-700 dark:text-gray-300">Offline mode</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Queue commands while offline.</p>
            </div>
            <input
              type="checkbox"
              checked={storage.offlineMode}
              onChange={(event) => updateStorage({ offlineMode: event.target.checked })}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500"
            />
          </label>

          <div className="text-xs text-gray-500 dark:text-gray-400">
            Retention: {storage.retentionDays} days — cached data older than this is cleaned automatically.
          </div>
        </motion.div>
      </div>

      <motion.div
        layout
        className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 space-y-4"
      >
        <div className="flex items-center gap-3">
          <WifiIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-white">Network behaviour</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400">Timeouts and retries for backend requests.</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">Timeout (seconds)</label>
            <input
              type="number"
              min={5}
              max={120}
              value={network.timeout}
              onChange={(event) => updateNetwork({ timeout: parseInt(event.target.value, 10) })}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">Retry attempts</label>
            <input
              type="number"
              min={0}
              max={10}
              value={network.retryAttempts}
              onChange={(event) => updateNetwork({ retryAttempts: parseInt(event.target.value, 10) })}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
          </div>

          <label className="text-xs text-gray-500 dark:text-gray-400">
            Offline queue
            <input
              type="checkbox"
              checked={network.offlineQueueEnabled}
              onChange={(event) => updateNetwork({ offlineQueueEnabled: event.target.checked })}
              className="ml-3 h-4 w-4 text-blue-600 focus:ring-blue-500"
            />
          </label>
        </div>

        {network.timeout < 10 && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            <ExclamationTriangleIcon className="w-4 h-4" />
            Low timeouts may cause operations to fail on slower connections.
          </div>
        )}
      </motion.div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
          <Battery50Icon className="w-4 h-4" />
          Tips
        </div>
        <ul className="ml-6 mt-3 list-disc space-y-1">
          <li>Use low power mode when running MaiFarm on battery for extended periods.</li>
          <li>Keep cache enabled for faster farm loading; reduce size if storage is limited.</li>
          <li>Increase retries if your network connection is unstable.</li>
        </ul>
      </div>
    </div>
  );
};

export default PerformanceSettings;
