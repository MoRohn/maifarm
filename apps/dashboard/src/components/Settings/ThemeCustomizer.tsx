import React from 'react';
import { Moon, Sun, Monitor, Palette, Type, Sliders } from 'lucide-react';
import { motion } from 'framer-motion';
import { useThemeStore } from '@/store/themeStore';
import { useSettingsStore } from '@/store/settingsStore';

const colors = [
  { name: 'Blue', value: '#3B82F6', class: 'bg-blue-500' },
  { name: 'Purple', value: '#8B5CF6', class: 'bg-purple-500' },
  { name: 'Green', value: '#10B981', class: 'bg-green-500' },
  { name: 'Orange', value: '#F97316', class: 'bg-orange-500' },
  { name: 'Pink', value: '#EC4899', class: 'bg-pink-500' },
  { name: 'Cyan', value: '#06B6D4', class: 'bg-cyan-500' },
];

const fonts = [
  { name: 'System', value: 'system-ui' },
  { name: 'Inter', value: 'Inter' },
  { name: 'SF Pro', value: '-apple-system' },
  { name: 'Roboto', value: 'Roboto' },
];

export const ThemeCustomizer: React.FC = () => {
  const { theme, setTheme } = useThemeStore();
  const { settings, updateSettings } = useSettingsStore();
  const currentTheme = (settings as any).theme || theme;

  const themes = [
    { id: 'light' as const, label: 'Light', icon: Sun },
    { id: 'dark' as const, label: 'Dark', icon: Moon },
    { id: 'system' as const, label: 'System', icon: Monitor },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Theme Customization
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Personalize your MaiFarm experience with custom themes and colors.
        </p>
      </div>

      {/* Theme Mode Selection */}
      <div>
        <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-4">Appearance</h4>
        <div className="grid grid-cols-3 gap-4">
          {themes.map(({ id, label, icon: Icon }) => (
            <motion.button
              key={id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setTheme(id)}
              className={`relative p-4 rounded-xl border-2 transition-all ${
                theme === id
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <Icon className={`w-6 h-6 mx-auto mb-2 ${
                theme === id ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'
              }`} />
              <span className={`text-sm font-medium ${
                theme === id ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'
              }`}>
                {label}
              </span>
              {theme === id && (
                <motion.div
                  layoutId="theme-selector"
                  className="absolute inset-0 border-2 border-blue-500 rounded-xl pointer-events-none"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Primary Color Selection */}
      <div>
        <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Palette className="w-4 h-4" />
          Primary Color
        </h4>
        <div className="grid grid-cols-6 gap-3">
          {colors.map((color) => (
            <button
              key={color.value}
              onClick={() => updateSettings({
                theme: { 
                  ...(currentTheme as any),
                  colors: { ...(currentTheme as any)?.colors, primary: color.value }
                }
              } as any)}
              className={`relative w-full aspect-square rounded-lg ${color.class} hover:scale-110 transition-transform`}
              title={color.name}
            >
              {(currentTheme as any)?.colors?.primary === color.value && (
                <motion.div
                  layoutId="color-selector"
                  className="absolute inset-0 ring-2 ring-offset-2 ring-gray-900 dark:ring-white rounded-lg"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Font Selection */}
      <div>
        <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Type className="w-4 h-4" />
          Font Family
        </h4>
        <select
          value={'system-ui'}
          onChange={(e) => {
            // Font family would need to be stored separately from theme
            // For now, this is just UI
          }}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          {fonts.map((font) => (
            <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
              {font.name}
            </option>
          ))}
        </select>
      </div>

      {/* Advanced Options */}
      <div>
        <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Sliders className="w-4 h-4" />
          Advanced Options
        </h4>
        <div className="space-y-4">
          {/* Font Size */}
          <div>
            <label className="block text-sm text-gray-700 dark:text-gray-300 mb-2">
              Font Size
            </label>
            <div className="flex gap-2">
              {['small', 'medium', 'large'].map((size) => (
                <button
                  key={size}
                  onClick={() => {
                    // Font size would need to be stored separately
                    // For now, this is just UI
                  }}
                  className={`flex-1 px-4 py-2 rounded-lg border ${
                    size === 'medium'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                      : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                  } transition-colors`}
                >
                  {size.charAt(0).toUpperCase() + size.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Accessibility Options */}
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Reduce Motion
              </span>
              <input
                type="checkbox"
                checked={(settings as any).appearance?.reducedMotion || false}
                onChange={(e) => updateSettings({
                  appearance: { 
                    animations: (settings as any).appearance?.animations ?? true,
                    reducedMotion: e.target.checked 
                  }
                } as any)}
                className="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
              />
            </label>

            <label className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-300">
                High Contrast
              </span>
              <input
                type="checkbox"
                checked={false}
                onChange={(e) => {
                  // High contrast would need separate implementation
                }}
                className="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
        <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-4">Preview</h4>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-lg"
              style={{ backgroundColor: (currentTheme as any)?.colors?.primary }}
            />
            <div>
              <p className="font-medium text-gray-900 dark:text-white">
                Sample Text
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400" style={{ fontFamily: settings.theme?.colors ? 'system-ui' : 'system-ui' }}>
                This is how your chosen font looks
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};