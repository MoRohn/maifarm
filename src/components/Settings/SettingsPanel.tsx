import React, { useState } from 'react';
import { X, Palette, Bell, Globe, Key, Shield, Brain, Archive } from 'lucide-react';
import { ThemeCustomizer } from './ThemeCustomizer';
import { NotificationSettings } from './NotificationSettings';
import { ApiKeyManager } from './ApiKeyManager';
import { FarmTemplates } from './FarmTemplates';
import { LanguageSelector } from './LanguageSelector';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore } from '../../store/settingsStore';
import { useAISettings } from '../../hooks/useAISettings';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = 'theme' | 'notifications' | 'language' | 'api' | 'templates' | 'security' | 'ai';

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('theme');
  const { settings, updateSettings } = useSettingsStore();
  const { suggestions, applyAISuggestion } = useAISettings();

  const tabs = [
    { id: 'theme' as const, label: 'Theme', icon: Palette },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell },
    { id: 'language' as const, label: 'Language', icon: Globe },
    { id: 'api' as const, label: 'API Keys', icon: Key },
    { id: 'templates' as const, label: 'Templates', icon: Archive },
    { id: 'security' as const, label: 'Security', icon: Shield },
    { id: 'ai' as const, label: 'AI Assistant', icon: Brain },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'theme':
        return <ThemeCustomizer />;
      case 'notifications':
        return <NotificationSettings />;
      case 'language':
        return <LanguageSelector />;
      case 'api':
        return <ApiKeyManager />;
      case 'templates':
        return <FarmTemplates />;
      case 'security':
        return <SecuritySettings />;
      case 'ai':
        return <AIAssistantSettings />;
      default:
        return null;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
          />

          {/* Settings Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-full max-w-4xl bg-white dark:bg-gray-900 shadow-2xl z-50"
          >
            <div className="flex h-full">
              {/* Sidebar */}
              <div className="w-64 bg-gray-50 dark:bg-gray-800 p-6 border-r border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Settings</h2>
                  <button
                    onClick={onClose}
                    className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                  </button>
                </div>

                {/* Navigation Tabs */}
                <nav className="space-y-1">
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                          activeTab === tab.id
                            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="font-medium">{tab.label}</span>
                      </button>
                    );
                  })}
                </nav>

                {/* AI Suggestions */}
                {suggestions.length > 0 && (
                  <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                      AI Suggestions
                    </h3>
                    <div className="space-y-2">
                      {suggestions.slice(0, 3).map((suggestion) => (
                        <button
                          key={suggestion.id}
                          onClick={() => applyAISuggestion(suggestion.id)}
                          className="w-full text-left text-xs text-blue-700 dark:text-blue-300 hover:underline"
                        >
                          {suggestion.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Content Area */}
              <div className="flex-1 p-8 overflow-y-auto">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.2 }}
                  >
                    {renderContent()}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// Security Settings Component
const SecuritySettings: React.FC = () => {
  const { settings, updateSettings } = useSettingsStore();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Security Settings
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Configure security features to protect your farms and data.
        </p>
      </div>

      {/* Two-Factor Authentication */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white">
              Two-Factor Authentication
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Add an extra layer of security to your account
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={settings.security?.mfaEnabled || false}
              onChange={(e) => updateSettings({
                security: { ...settings.security, mfaEnabled: e.target.checked }
              })}
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
          </label>
        </div>
      </div>

      {/* Session Management */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
        <h4 className="font-medium text-gray-900 dark:text-white mb-4">
          Session Management
        </h4>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Session Timeout (minutes)
            </label>
            <input
              type="number"
              min="5"
              max="1440"
              value={settings.security?.sessionTimeout || 30}
              onChange={(e) => updateSettings({
                security: { ...settings.security, sessionTimeout: parseInt(e.target.value) }
              })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Audit Logging */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white">
              Audit Logging
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Track all actions performed in your account
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={settings.security?.auditLogging || true}
              onChange={(e) => updateSettings({
                security: { ...settings.security, auditLogging: e.target.checked }
              })}
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
          </label>
        </div>
      </div>
    </div>
  );
};

// AI Assistant Settings Component
const AIAssistantSettings: React.FC = () => {
  const { settings, updateSettings } = useSettingsStore();
  const aiSettings = settings.user?.aiAssistant;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          AI Assistant Settings
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Configure how the AI assistant helps you manage your farms.
        </p>
      </div>

      {/* AI Features */}
      <div className="space-y-4">
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white">
                AI Suggestions
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Get intelligent recommendations for settings and configurations
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={aiSettings?.suggestions || true}
                onChange={(e) => updateSettings({
                  user: {
                    ...settings.user,
                    aiAssistant: { ...aiSettings, suggestions: e.target.checked }
                  }
                })}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>

        {/* Creativity Level */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
          <h4 className="font-medium text-gray-900 dark:text-white mb-4">
            AI Creativity Level
          </h4>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Conservative</span>
              <span className="text-sm text-gray-600 dark:text-gray-400">Creative</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={aiSettings?.creativityLevel || 50}
              onChange={(e) => updateSettings({
                user: {
                  ...settings.user,
                  aiAssistant: { ...aiSettings, creativityLevel: parseInt(e.target.value) }
                }
              })}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
            />
            <div className="text-center text-sm text-gray-600 dark:text-gray-400">
              {aiSettings?.creativityLevel || 50}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};