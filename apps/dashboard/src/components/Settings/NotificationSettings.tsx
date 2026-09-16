import React from 'react';
import { motion } from 'framer-motion';
import {
  BellIcon,
  EnvelopeIcon,
  ClockIcon,
  DevicePhoneMobileIcon,
  InformationCircleIcon,
  AdjustmentsHorizontalIcon,
} from '@heroicons/react/24/outline';
import { useSettingsStore } from '@/store/settingsStore';

const channelLabels = [
  { key: 'inApp', label: 'In App' },
  { key: 'push', label: 'Push' },
  { key: 'email', label: 'Email' }
] as const;

const NotificationSettings: React.FC = () => {
  const { notifications, setNotifications } = useSettingsStore();

  const updateNotifications = (updates: Partial<typeof notifications>) => {
    setNotifications({
      ...notifications,
      ...updates
    });
  };

  const updateQuietHours = (field: 'enabled' | 'start' | 'end', value: boolean | string) => {
    updateNotifications({
      quietHours: {
        ...notifications.quietHours,
        [field]: value
      }
    });
  };

  const updateChannel = (
    type: keyof typeof notifications.types,
    channel: keyof (typeof notifications.types)[typeof type]['channels'],
    value: boolean
  ) => {
    updateNotifications({
      types: {
        ...notifications.types,
        [type]: {
          ...notifications.types[type],
          channels: {
            ...notifications.types[type].channels,
            [channel]: value
          }
        }
      }
    });
  };

  const updateTypeEnabled = (type: keyof typeof notifications.types, value: boolean) => {
    updateNotifications({
      types: {
        ...notifications.types,
        [type]: {
          ...notifications.types[type],
          enabled: value
        }
      }
    });
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Notification Preferences</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Choose how MaiFarm keeps you informed about farm activity and agent health.
        </p>
      </div>

      <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BellIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-white">Enable Notifications</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Toggle all MaiFarm notifications on or off
              </p>
            </div>
          </div>
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only"
              checked={notifications.enabled}
              onChange={(event) => updateNotifications({ enabled: event.target.checked })}
            />
            <span className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              notifications.enabled ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
            }`}>
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  notifications.enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </span>
          </label>
        </div>
      </div>

      {notifications.enabled && (
        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid gap-6 lg:grid-cols-2"
          >
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
              <div className="flex items-center gap-3 mb-4">
                <DevicePhoneMobileIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <div>
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">Notification Channels</h4>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Choose where notifications should appear</p>
                </div>
              </div>

              <div className="space-y-4">
                {Object.entries(notifications.types).map(([key, config]) => (
                  <div key={key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">
                        {key.replace(/([A-Z])/g, ' $1')}
                      </span>
                      <label className="inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={config.enabled}
                          onChange={(event) => updateTypeEnabled(key as keyof typeof notifications.types, event.target.checked)}
                        />
                        <span className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${
                          config.enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                        }`}>
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                              config.enabled ? 'translate-x-5' : 'translate-x-1'
                            }`}
                          />
                        </span>
                      </label>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {channelLabels.map(({ key: channelKey, label }) => (
                        <label
                          key={channelKey}
                          className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                            config.channels[channelKey]
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                              : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                          }`}
                        >
                          {label}
                          <input
                            type="checkbox"
                            checked={config.channels[channelKey]}
                            onChange={(event) => updateChannel(
                              key as keyof typeof notifications.types,
                              channelKey,
                              event.target.checked
                            )}
                            className="ml-2 h-4 w-4 text-blue-600 focus:ring-blue-500"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <EnvelopeIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <div>
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">Email Notifications</h4>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Configure how MaiFarm emails are delivered</p>
                </div>
              </div>

              <label className="flex items-center justify-between text-sm">
                <span className="text-gray-700 dark:text-gray-300">Enable email notifications</span>
                <input
                  type="checkbox"
                  checked={notifications.email.enabled}
                  onChange={(event) =>
                    updateNotifications({
                      email: { ...notifications.email, enabled: event.target.checked }
                    })
                  }
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </label>

              <div className="space-y-2">
                <label className="text-xs text-gray-500 dark:text-gray-400">Email address</label>
                <input
                  type="email"
                  value={notifications.email.address}
                  onChange={(event) =>
                    updateNotifications({
                      email: { ...notifications.email, address: event.target.value }
                    })
                  }
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="you@example.com"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs text-gray-500 dark:text-gray-400">Frequency</label>
                <select
                  value={notifications.email.frequency}
                  onChange={(event) =>
                    updateNotifications({
                      email: { ...notifications.email, frequency: event.target.value as typeof notifications.email.frequency }
                    })
                  }
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="immediate">Immediately</option>
                  <option value="hourly">Hourly Digest</option>
                  <option value="daily">Daily Summary</option>
                  <option value="weekly">Weekly Summary</option>
                </select>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="text-sm font-medium text-gray-900 dark:text-white">Quiet Hours</h5>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Pause notifications during selected hours</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifications.quietHours.enabled}
                    onChange={(event) => updateQuietHours('enabled', event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </div>

                {notifications.quietHours.enabled && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-2 gap-3"
                  >
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400">Start</label>
                      <input
                        type="time"
                        value={notifications.quietHours.start}
                        onChange={(event) => updateQuietHours('start', event.target.value)}
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400">End</label>
                      <input
                        type="time"
                        value={notifications.quietHours.end}
                        onChange={(event) => updateQuietHours('end', event.target.value)}
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
            <div className="flex items-center gap-3 mb-4">
              <AdjustmentsHorizontalIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <h4 className="text-sm font-medium text-gray-900 dark:text-white">Notification Tips</h4>
            </div>
            <ul className="space-y-3 text-xs text-gray-600 dark:text-gray-400">
              <li className="flex items-start gap-2">
                <InformationCircleIcon className="w-4 h-4 mt-0.5 text-blue-500" />
                <span>Disable channels you don't use often to reduce noise without missing critical updates.</span>
              </li>
              <li className="flex items-start gap-2">
                <InformationCircleIcon className="w-4 h-4 mt-0.5 text-blue-500" />
                <span>Quiet hours pause notifications across all channels, including email digests.</span>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationSettings;
