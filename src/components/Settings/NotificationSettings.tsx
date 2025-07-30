import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  BellIcon,
  BellAlertIcon,
  EnvelopeIcon,
  DevicePhoneMobileIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { useUserStore } from '../../store/userStore';

interface NotificationCategory {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const notificationCategories: NotificationCategory[] = [
  {
    id: 'farmComplete',
    label: 'Farm Completion',
    description: 'When a farm finishes all tasks',
    icon: CheckCircleIcon,
    color: 'text-green-600 dark:text-green-400'
  },
  {
    id: 'agentError',
    label: 'Agent Errors',
    description: 'When an agent encounters an error',
    icon: XCircleIcon,
    color: 'text-red-600 dark:text-red-400'
  },
  {
    id: 'systemUpdate',
    label: 'System Updates',
    description: 'Important system announcements',
    icon: ExclamationTriangleIcon,
    color: 'text-yellow-600 dark:text-yellow-400'
  },
  {
    id: 'aiDiscovery',
    label: 'AI Discoveries',
    description: 'When AI finds interesting patterns',
    icon: BellAlertIcon,
    color: 'text-purple-600 dark:text-purple-400'
  }
];

const NotificationSettings: React.FC = () => {
  const { preferences, updatePreferences } = useUserStore();
  const [notifications, setNotifications] = useState(preferences?.notifications || {
    enabled: true,
    sound: true,
    desktop: true,
    email: false,
    categories: {
      farmComplete: true,
      agentError: true,
      systemUpdate: true,
      aiDiscovery: false
    },
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '08:00'
    }
  });

  const handleToggle = (key: string, value: boolean) => {
    const updated = { ...notifications, [key]: value };
    setNotifications(updated);
    updatePreferences({ notifications: updated });
  };

  const handleCategoryToggle = (categoryId: string) => {
    const updated = {
      ...notifications,
      categories: {
        ...notifications.categories,
        [categoryId]: !notifications.categories[categoryId]
      }
    };
    setNotifications(updated);
    updatePreferences({ notifications: updated });
  };

  const handleQuietHoursChange = (field: string, value: any) => {
    const updated = {
      ...notifications,
      quietHours: {
        ...notifications.quietHours,
        [field]: value
      }
    };
    setNotifications(updated);
    updatePreferences({ notifications: updated });
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        handleToggle('desktop', true);
      }
    }
  };

  return (
    <div className="space-y-8">
      {/* Main Toggle */}
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 p-6 rounded-xl">
        <label className="flex items-center justify-between cursor-pointer">
          <div className="flex items-center space-x-3">
            <BellIcon className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            <div>
              <span className="text-lg font-medium text-gray-900 dark:text-white">
                Enable Notifications
              </span>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Stay updated with your farms and agents
              </p>
            </div>
          </div>
          <div className="relative">
            <input
              type="checkbox"
              checked={notifications.enabled}
              onChange={(e) => handleToggle('enabled', e.target.checked)}
              className="sr-only"
            />
            <div className={`w-14 h-8 rounded-full transition-colors duration-200 ${
              notifications.enabled ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
            }`}>
              <div className={`w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-200 ${
                notifications.enabled ? 'translate-x-7' : 'translate-x-1'
              } mt-1`} />
            </div>
          </div>
        </label>
      </div>

      {/* Notification Channels */}
      {notifications.enabled && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Notification Channels
            </h3>
            <div className="space-y-4">
              <label className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <DevicePhoneMobileIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  <div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Desktop Notifications
                    </span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Browser push notifications
                    </p>
                  </div>
                </div>
                {Notification.permission === 'default' ? (
                  <button
                    onClick={requestNotificationPermission}
                    className="px-3 py-1 text-sm font-medium text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
                  >
                    Enable
                  </button>
                ) : (
                  <input
                    type="checkbox"
                    checked={notifications.desktop}
                    onChange={(e) => handleToggle('desktop', e.target.checked)}
                    disabled={Notification.permission === 'denied'}
                    className="w-5 h-5 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 dark:focus:ring-purple-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                )}
              </label>

              <label className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <BellIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  <div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Sound Alerts
                    </span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Play sound for notifications
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.sound}
                  onChange={(e) => handleToggle('sound', e.target.checked)}
                  className="w-5 h-5 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 dark:focus:ring-purple-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
              </label>

              <label className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <EnvelopeIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  <div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Email Notifications
                    </span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Receive updates via email
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.email}
                  onChange={(e) => handleToggle('email', e.target.checked)}
                  className="w-5 h-5 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 dark:focus:ring-purple-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
              </label>
            </div>
          </div>

          {/* Notification Categories */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Notification Types
            </h3>
            <div className="space-y-3">
              {notificationCategories.map((category) => {
                const Icon = category.icon;
                return (
                  <motion.div
                    key={category.id}
                    whileHover={{ scale: 1.01 }}
                    className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors duration-200"
                  >
                    <label className="flex items-center justify-between cursor-pointer">
                      <div className="flex items-center space-x-3">
                        <Icon className={`w-5 h-5 ${category.color}`} />
                        <div>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {category.label}
                          </span>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {category.description}
                          </p>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifications.categories[category.id]}
                        onChange={() => handleCategoryToggle(category.id)}
                        className="w-5 h-5 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 dark:focus:ring-purple-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                      />
                    </label>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Quiet Hours */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Quiet Hours
            </h3>
            <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
              <label className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <ClockIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  <div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Enable Quiet Hours
                    </span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Mute notifications during specified hours
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.quietHours.enabled}
                  onChange={(e) => handleQuietHoursChange('enabled', e.target.checked)}
                  className="w-5 h-5 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 dark:focus:ring-purple-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
              </label>

              {notifications.quietHours.enabled && (
                <div className="flex items-center space-x-4 mt-4">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={notifications.quietHours.start}
                      onChange={(e) => handleQuietHoursChange('start', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      End Time
                    </label>
                    <input
                      type="time"
                      value={notifications.quietHours.end}
                      onChange={(e) => handleQuietHoursChange('end', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default NotificationSettings;