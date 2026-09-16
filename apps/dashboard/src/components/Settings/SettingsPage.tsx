import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import {
  PaintBrushIcon,
  LockClosedIcon,
  ServerIcon,
  InformationCircleIcon,
  UserCircleIcon,
  SparklesIcon,
  BookOpenIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import ThemeSettings from './ThemeSettings';
import AIProviderSettings from './AIProviderSettings';
import UserProfile from './UserProfile';
import SecuritySettings from './SecuritySettings';
import AboutSettings from './AboutSettings';
import { MaiBarnReset } from './MaiBarnReset';
import AIEngineStatusIndicator from './AIEngineStatusIndicator';
import { useUserStore } from '@/store/userStore';
import { useAIPreferences } from '@/hooks/useAIPreferences';
import { useThemeStore } from '@/store/themeStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useToast } from '@/hooks/useToast';

interface SettingsTab {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  component: React.ComponentType;
  aiRecommended?: boolean;
}

const SettingsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('profile');
  const { preferences } = useUserStore();
  const { aiSuggestions, acceptSuggestion, dismissSuggestion } = useAIPreferences();
  const themeStore = useThemeStore();
  const toast = useToast();
  const {
    settings,
    loadSettings,
    saveSettings,
    resetSettings,
    loading,
    loaded,
    dirty,
    saving,
    error
  } = useSettingsStore();
  const hydratePreferences = useUserStore((state) => state.hydratePreferences);
  const hasHydratedRef = useRef(false);

  // Handle tab from URL query parameter
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam) {
      // Map 'ai' to 'aiProvider' for backwards compatibility
      const mappedTab = tabParam === 'ai' ? 'aiProvider' : tabParam;
      setActiveTab(mappedTab);
      // Remove the query parameter after reading it
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('tab');
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams.get('tab'), setSearchParams]);
  
  useEffect(() => {
    if (!loaded && !loading) {
      void loadSettings();
    }
  }, [loaded, loading, loadSettings]);

  useEffect(() => {
    if (loaded && !hasHydratedRef.current) {
      hasHydratedRef.current = true;
      hydratePreferences({
        notifications: settings.user?.notifications as any,
        language: settings.user?.language?.current ?? 'en'
      });
    }
  }, [loaded]);
  
  // Check for any unsaved changes (local or from theme store)
  const hasAnyUnsavedChanges = dirty || (activeTab === 'theme' && themeStore.hasUnsavedChanges);

  // Memoize tabs array to prevent recreation on every render
  const tabs: SettingsTab[] = useMemo(() => [
    {
      id: 'profile',
      label: 'Profile',
      icon: UserCircleIcon,
      component: UserProfile,
      aiRecommended: false
    },
    {
      id: 'theme',
      label: 'Appearance',
      icon: PaintBrushIcon,
      component: ThemeSettings,
      aiRecommended: aiSuggestions.some(s => s.category === 'theme')
    },
    {
      id: 'aiProvider',
      label: 'AI Engine Setup',
      icon: ServerIcon,
      component: AIProviderSettings,
      aiRecommended: aiSuggestions.some(s => s.category === 'ai')
    },
    {
      id: 'security',
      label: 'Security',
      icon: LockClosedIcon,
      component: SecuritySettings,
      aiRecommended: false
    },
    {
      id: 'dataReset',
      label: 'Data Reset',
      icon: TrashIcon,
      component: MaiBarnReset,
      aiRecommended: false
    },
    {
      id: 'about',
      label: 'About',
      icon: InformationCircleIcon,
      component: AboutSettings,
      aiRecommended: false
    }
  ], [aiSuggestions]);

  // Memoize active component to prevent recalculation
  const ActiveComponent = useMemo(() => {
    const activeTabData = tabs.find(tab => tab.id === activeTab);
    return activeTabData?.component || ThemeSettings;
  }, [activeTab, tabs]);

  const handleSave = async () => {
    if (activeTab === 'theme' && themeStore.hasUnsavedChanges) {
      await themeStore.saveChanges();
    }

    try {
      await saveSettings();
      toast.success('Settings saved');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save settings';
      toast.error(message);
    }
  };

  const handleCancel = () => {
    if (activeTab === 'theme' && themeStore.hasUnsavedChanges) {
      themeStore.discardChanges();
    }

    resetSettings();
    // Reset hydration flag to allow re-hydration on next settings load
    hasHydratedRef.current = false;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center space-x-3">
                <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white">
                  Settings
                </h1>
                {hasAnyUnsavedChanges && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="px-2 py-1 text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full"
                  >
                    Unsaved changes
                  </motion.span>
                )}
              </div>
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
        {/* AI Engine Status Indicator */}
        <AIEngineStatusIndicator
          className="mb-6"
          onChangeEngine={() => setActiveTab('aiProvider')}
        />

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <nav className="w-full lg:w-64 flex-shrink-0 space-y-1">
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
                  <div className="flex items-center space-x-3 min-w-0">
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span className="truncate">{tab.label}</span>
                  </div>
                  {tab.aiRecommended && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-2 h-2 bg-purple-600 dark:bg-purple-400 rounded-full flex-shrink-0 ml-2"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm"
            >
              <div className="p-6">
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

              {loading && !loaded ? (
                <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                  Loading settings…
                </div>
              ) : (
                <ActiveComponent />
              )}
              </div>
            </motion.div>

            {/* Save and Cancel Buttons - Always visible */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 flex items-center justify-end space-x-3"
            >
              {hasAnyUnsavedChanges && (
                <button
                  onClick={handleCancel}
                  className="px-6 py-2.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg transition-colors duration-200"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleSave}
                className={`px-6 py-2.5 font-medium rounded-lg transition-all duration-200 shadow-sm ${
                  hasAnyUnsavedChanges
                    ? 'bg-purple-600 hover:bg-purple-700 text-white hover:shadow-md'
                    : 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-default'
                }`}
                disabled={!hasAnyUnsavedChanges || saving}
              >
                {saving ? 'Saving…' : hasAnyUnsavedChanges ? 'Save Changes' : 'All Changes Saved'}
              </button>
            </motion.div>
          </main>
        </div>
      </div>
      {error && (
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
            {error}
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
