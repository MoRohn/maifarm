import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Cog6ToothIcon, 
  BellIcon, 
  KeyIcon, 
  LanguageIcon, 
  DocumentDuplicateIcon,
  ShieldCheckIcon,
  SparklesIcon,
  PaintBrushIcon
} from '@heroicons/react/24/outline';
import ThemeSettings from './ThemeSettings';
import NotificationSettings from './NotificationSettings';
import ApiKeyManager from './ApiKeyManager';
import FarmTemplates from './FarmTemplates';
import LanguageSelector from './LanguageSelector';
import SecuritySettings from './SecuritySettings';
import { useUserStore } from '../../store/userStore';
import { useAIPreferences } from '../../hooks/useAIPreferences';

interface SettingsTab {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  component: React.ComponentType;
  aiRecommended?: boolean;
}

const SettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('theme');
  const { preferences } = useUserStore();
  const { aiSuggestions, acceptSuggestion, dismissSuggestion } = useAIPreferences();

  const tabs: SettingsTab[] = [
    {
      id: 'theme',
      label: 'Appearance',
      icon: PaintBrushIcon,
      component: ThemeSettings,
      aiRecommended: aiSuggestions.some(s => s.category === 'theme')
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: BellIcon,
      component: NotificationSettings,
      aiRecommended: aiSuggestions.some(s => s.category === 'notifications')
    },
    {
      id: 'security',
      label: 'Security',
      icon: ShieldCheckIcon,
      component: SecuritySettings
    },
    {
      id: 'apiKeys',
      label: 'API Keys',
      icon: KeyIcon,
      component: ApiKeyManager
    },
    {
      id: 'templates',
      label: 'Farm Templates',
      icon: DocumentDuplicateIcon,
      component: FarmTemplates,
      aiRecommended: aiSuggestions.some(s => s.category === 'templates')
    },
    {
      id: 'language',
      label: 'Language',
      icon: LanguageIcon,
      component: LanguageSelector
    }
  ];

  const activeTabData = tabs.find(tab => tab.id === activeTab);
  const ActiveComponent = activeTabData?.component || ThemeSettings;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
                Settings
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Customize your MaiFarm experience with AI-powered recommendations
              </p>
            </div>
            {aiSuggestions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center space-x-2 px-3 py-1.5 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-full"
              >
                <SparklesIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                  {aiSuggestions.length} AI suggestions available
                </span>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Sidebar */}
          <nav className="w-64 space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 ${
                    activeTab === tab.id
                      ? 'bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 text-purple-700 dark:text-purple-300 shadow-sm'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Icon className="w-5 h-5" />
                    <span>{tab.label}</span>
                  </div>
                  {tab.aiRecommended && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-2 h-2 bg-purple-600 dark:bg-purple-400 rounded-full"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Main Content */}
          <main className="flex-1">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6"
            >
              {/* AI Suggestions Banner */}
              {aiSuggestions.some(s => s.category === activeTab) && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-6 p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg border border-purple-200 dark:border-purple-700"
                >
                  <div className="flex items-start space-x-3">
                    <SparklesIcon className="w-5 h-5 text-purple-600 dark:text-purple-400 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="text-sm font-medium text-purple-900 dark:text-purple-100">
                        AI Recommendations
                      </h3>
                      <div className="mt-2 space-y-2">
                        {aiSuggestions
                          .filter(s => s.category === activeTab)
                          .map(suggestion => (
                            <div
                              key={suggestion.id}
                              className="flex items-center justify-between py-2"
                            >
                              <p className="text-sm text-purple-700 dark:text-purple-300">
                                {suggestion.reason}
                              </p>
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => acceptSuggestion(suggestion.id)}
                                  className="text-xs font-medium text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
                                >
                                  Apply
                                </button>
                                <button
                                  onClick={() => dismissSuggestion(suggestion.id)}
                                  className="text-xs font-medium text-gray-500 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-300"
                                >
                                  Dismiss
                                </button>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              <ActiveComponent />
            </motion.div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;