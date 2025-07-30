import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore } from '../../store/settingsStore';
import { ThemeConfig } from '../../types/settings';

interface ThemeEngineProps {
  onThemeChange?: (theme: ThemeConfig) => void;
}

export const ThemeEngine: React.FC<ThemeEngineProps> = ({ onThemeChange }) => {
  const { theme, setTheme, customThemes, saveCustomTheme } = useSettingsStore();
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [customTheme, setCustomTheme] = useState<Partial<ThemeConfig>>({});

  const predefinedThemes: ThemeConfig[] = [
    {
      id: 'light',
      name: 'Light',
      mode: 'light',
      colors: {
        primary: '#3B82F6',
        secondary: '#10B981',
        background: '#FFFFFF',
        surface: '#F3F4F6',
        text: '#1F2937',
        textSecondary: '#6B7280',
      },
    },
    {
      id: 'dark',
      name: 'Dark',
      mode: 'dark',
      colors: {
        primary: '#60A5FA',
        secondary: '#34D399',
        background: '#111827',
        surface: '#1F2937',
        text: '#F9FAFB',
        textSecondary: '#9CA3AF',
      },
    },
    {
      id: 'midnight',
      name: 'Midnight',
      mode: 'dark',
      colors: {
        primary: '#818CF8',
        secondary: '#F472B6',
        background: '#0F172A',
        surface: '#1E293B',
        text: '#F8FAFC',
        textSecondary: '#94A3B8',
      },
    },
  ];

  useEffect(() => {
    // Apply theme to document root
    const root = document.documentElement;
    const currentTheme = [...predefinedThemes, ...customThemes].find(t => t.id === theme.id) || theme;
    
    Object.entries(currentTheme.colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value);
    });
    
    root.setAttribute('data-theme', currentTheme.mode);
    
    if (onThemeChange) {
      onThemeChange(currentTheme);
    }
  }, [theme, customThemes]);

  const handleThemeSelect = (selectedTheme: ThemeConfig) => {
    setTheme(selectedTheme);
  };

  const handleColorChange = (colorKey: keyof ThemeConfig['colors'], value: string) => {
    setCustomTheme(prev => ({
      ...prev,
      colors: {
        ...prev.colors,
        [colorKey]: value,
      },
    }));
  };

  const saveCustomThemeHandler = () => {
    const newTheme: ThemeConfig = {
      id: `custom-${Date.now()}`,
      name: customTheme.name || 'Custom Theme',
      mode: customTheme.mode || 'light',
      colors: {
        ...theme.colors,
        ...customTheme.colors,
      },
    };
    
    saveCustomTheme(newTheme);
    setTheme(newTheme);
    setIsCustomizing(false);
    setCustomTheme({});
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Theme Selection
        </h3>
        
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[...predefinedThemes, ...customThemes].map((themeOption) => (
            <motion.button
              key={themeOption.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleThemeSelect(themeOption)}
              className={`relative p-4 rounded-xl border-2 transition-all ${
                theme.id === themeOption.id
                  ? 'border-primary shadow-lg'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{themeOption.name}</span>
                {theme.id === themeOption.id && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-5 h-5 bg-primary rounded-full flex items-center justify-center"
                  >
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </motion.div>
                )}
              </div>
              
              <div className="flex space-x-1">
                {Object.values(themeOption.colors).slice(0, 4).map((color, idx) => (
                  <div
                    key={idx}
                    className="w-6 h-6 rounded"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </motion.button>
          ))}
          
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setIsCustomizing(true)}
            className="p-4 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-primary transition-colors"
          >
            <div className="flex flex-col items-center space-y-2">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-sm text-gray-600 dark:text-gray-400">Create Custom</span>
            </div>
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {isCustomizing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
          >
            <h4 className="font-medium text-gray-900 dark:text-white">Customize Theme</h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Theme Name
                </label>
                <input
                  type="text"
                  value={customTheme.name || ''}
                  onChange={(e) => setCustomTheme(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary"
                  placeholder="My Theme"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Mode
                </label>
                <select
                  value={customTheme.mode || 'light'}
                  onChange={(e) => setCustomTheme(prev => ({ ...prev, mode: e.target.value as 'light' | 'dark' }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary"
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {Object.entries(theme.colors).map(([key, value]) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="color"
                      value={customTheme.colors?.[key as keyof ThemeConfig['colors']] || value}
                      onChange={(e) => handleColorChange(key as keyof ThemeConfig['colors'], e.target.value)}
                      className="w-12 h-8 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={customTheme.colors?.[key as keyof ThemeConfig['colors']] || value}
                      onChange={(e) => handleColorChange(key as keyof ThemeConfig['colors'], e.target.value)}
                      className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded"
                    />
                  </div>
                </div>
              ))}
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setIsCustomizing(false);
                  setCustomTheme({});
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveCustomThemeHandler}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
              >
                Save Theme
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};