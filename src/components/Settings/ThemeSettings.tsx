import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  SunIcon, 
  MoonIcon, 
  ComputerDesktopIcon,
  SwatchIcon,
  AdjustmentsHorizontalIcon
} from '@heroicons/react/24/outline';
import { useThemeStore } from '../../store/themeStore';
import { useTheme } from '../../hooks/useTheme';

interface ColorPreset {
  name: string;
  primary: string;
  accent: string;
}

const colorPresets: ColorPreset[] = [
  { name: 'Purple Dreams', primary: '#8B5CF6', accent: '#EC4899' },
  { name: 'Ocean Breeze', primary: '#0EA5E9', accent: '#14B8A6' },
  { name: 'Forest Walk', primary: '#10B981', accent: '#84CC16' },
  { name: 'Sunset Glow', primary: '#F97316', accent: '#F59E0B' },
  { name: 'Cherry Blossom', primary: '#EC4899', accent: '#F472B6' },
  { name: 'Midnight Blue', primary: '#3730A3', accent: '#6366F1' }
];

const ThemeSettings: React.FC = () => {
  const { theme, setTheme, setPrimaryColor, setAccentColor } = useThemeStore();
  const { applyTheme } = useTheme();
  const [customColors, setCustomColors] = useState({
    primary: theme.primaryColor,
    accent: theme.accentColor
  });

  const themeModes = [
    { id: 'light', label: 'Light', icon: SunIcon },
    { id: 'dark', label: 'Dark', icon: MoonIcon },
    { id: 'system', label: 'System', icon: ComputerDesktopIcon }
  ];

  const handleThemeModeChange = (mode: 'light' | 'dark' | 'system') => {
    setTheme({ ...theme, mode });
    applyTheme({ ...theme, mode });
  };

  const handleColorPresetSelect = (preset: ColorPreset) => {
    setPrimaryColor(preset.primary);
    setAccentColor(preset.accent);
    setCustomColors({ primary: preset.primary, accent: preset.accent });
    applyTheme({ ...theme, primaryColor: preset.primary, accentColor: preset.accent });
  };

  const handleCustomColorChange = (type: 'primary' | 'accent', color: string) => {
    setCustomColors({ ...customColors, [type]: color });
    if (type === 'primary') {
      setPrimaryColor(color);
    } else {
      setAccentColor(color);
    }
    applyTheme({ 
      ...theme, 
      primaryColor: type === 'primary' ? color : customColors.primary,
      accentColor: type === 'accent' ? color : customColors.accent
    });
  };

  return (
    <div className="space-y-8">
      {/* Theme Mode */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Theme Mode
        </h3>
        <div className="grid grid-cols-3 gap-4">
          {themeModes.map((mode) => {
            const Icon = mode.icon;
            const isActive = theme.mode === mode.id;
            return (
              <motion.button
                key={mode.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleThemeModeChange(mode.id as any)}
                className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                  isActive
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <Icon className={`w-6 h-6 mx-auto mb-2 ${
                  isActive ? 'text-purple-600 dark:text-purple-400' : 'text-gray-600 dark:text-gray-400'
                }`} />
                <span className={`text-sm font-medium ${
                  isActive ? 'text-purple-700 dark:text-purple-300' : 'text-gray-700 dark:text-gray-300'
                }`}>
                  {mode.label}
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Color Presets */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Color Scheme
        </h3>
        <div className="grid grid-cols-3 gap-3 mb-6">
          {colorPresets.map((preset) => (
            <motion.button
              key={preset.name}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleColorPresetSelect(preset)}
              className="group relative p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200"
            >
              <div className="flex items-center space-x-2 mb-2">
                <div 
                  className="w-6 h-6 rounded-full shadow-sm"
                  style={{ backgroundColor: preset.primary }}
                />
                <div 
                  className="w-6 h-6 rounded-full shadow-sm"
                  style={{ backgroundColor: preset.accent }}
                />
              </div>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                {preset.name}
              </span>
            </motion.button>
          ))}
        </div>

        {/* Custom Colors */}
        <div className="space-y-4">
          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Primary Color
              </label>
              <div className="flex items-center space-x-3">
                <input
                  type="color"
                  value={customColors.primary}
                  onChange={(e) => handleCustomColorChange('primary', e.target.value)}
                  className="w-12 h-12 rounded-lg border border-gray-300 dark:border-gray-600 cursor-pointer"
                />
                <input
                  type="text"
                  value={customColors.primary}
                  onChange={(e) => handleCustomColorChange('primary', e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="#8B5CF6"
                />
              </div>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Accent Color
              </label>
              <div className="flex items-center space-x-3">
                <input
                  type="color"
                  value={customColors.accent}
                  onChange={(e) => handleCustomColorChange('accent', e.target.value)}
                  className="w-12 h-12 rounded-lg border border-gray-300 dark:border-gray-600 cursor-pointer"
                />
                <input
                  type="text"
                  value={customColors.accent}
                  onChange={(e) => handleCustomColorChange('accent', e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="#EC4899"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Advanced Settings */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Advanced
        </h3>
        <div className="space-y-4">
          <label className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Animations
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Enable smooth transitions and animations
              </p>
            </div>
            <input
              type="checkbox"
              checked={theme.animations !== false}
              onChange={(e) => setTheme({ ...theme, animations: e.target.checked })}
              className="w-5 h-5 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 dark:focus:ring-purple-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            />
          </label>

          <label className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Reduce Motion
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Minimize animations for accessibility
              </p>
            </div>
            <input
              type="checkbox"
              checked={theme.reducedMotion}
              onChange={(e) => setTheme({ ...theme, reducedMotion: e.target.checked })}
              className="w-5 h-5 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 dark:focus:ring-purple-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            />
          </label>

          <label className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                High Contrast
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Increase contrast for better visibility
              </p>
            </div>
            <input
              type="checkbox"
              checked={theme.highContrast}
              onChange={(e) => setTheme({ ...theme, highContrast: e.target.checked })}
              className="w-5 h-5 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 dark:focus:ring-purple-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            />
          </label>
        </div>
      </div>

      {/* Preview */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Preview
        </h3>
        <div className="p-6 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
          <div className="space-y-4">
            <div 
              className="h-12 rounded-lg shadow-sm"
              style={{ backgroundColor: customColors.primary }}
            />
            <div className="flex space-x-3">
              <div 
                className="h-8 w-24 rounded-md shadow-sm"
                style={{ backgroundColor: customColors.accent }}
              />
              <div className="h-8 flex-1 rounded-md bg-white dark:bg-gray-700 shadow-sm" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <div 
                  key={i}
                  className="h-20 rounded-lg bg-white dark:bg-gray-700 shadow-sm"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThemeSettings;