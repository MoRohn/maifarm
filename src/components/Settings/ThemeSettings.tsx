import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  SunIcon, 
  MoonIcon, 
  ComputerDesktopIcon,
  SwatchIcon,
  CheckIcon,
  XMarkIcon,
  ArrowPathIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import { useThemeStore } from '../../store/themeStore';
import { COLOR_SCHEMES } from '@/types/theme';
import { cn } from '@/utils/cn';

interface ThemeSettingsProps {
  onChange?: (key: string, value: any) => void;
}

const ThemeSettings: React.FC<ThemeSettingsProps> = ({ onChange }) => {
  const { 
    theme, 
    colorScheme,
    primaryColor,
    accentColor,
    animations,
    reduceMotion,
    hasUnsavedChanges,
    setTheme,
    setPendingColorScheme,
    setPrimaryColor,
    setAccentColor,
    setAnimations,
    setReduceMotion,
    saveChanges,
    discardChanges,
    resetToDefault
  } = useThemeStore();

  const [selectedScheme, setSelectedScheme] = useState(colorScheme);
  const [tempPrimary, setTempPrimary] = useState(primaryColor);
  const [tempAccent, setTempAccent] = useState(accentColor);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);

  useEffect(() => {
    setSelectedScheme(colorScheme);
    setTempPrimary(primaryColor);
    setTempAccent(accentColor);
  }, [colorScheme, primaryColor, accentColor]);

  const themeModes = [
    { id: 'light', label: 'Light', icon: SunIcon },
    { id: 'dark', label: 'Dark', icon: MoonIcon },
    { id: 'system', label: 'System', icon: ComputerDesktopIcon }
  ];

  const handleColorSchemeSelect = (scheme: typeof COLOR_SCHEMES[0]) => {
    setSelectedScheme(scheme);
    setTempPrimary(scheme.primary);
    setTempAccent(scheme.accent);
    setPendingColorScheme(scheme);
    setPrimaryColor(scheme.primary);
    setAccentColor(scheme.accent);
    onChange?.('colorScheme', scheme);
  };

  const handleSaveChanges = () => {
    saveChanges();
    setShowSaveConfirm(true);
    setTimeout(() => setShowSaveConfirm(false), 3000);
  };

  const handleDiscardChanges = () => {
    discardChanges();
    setTempPrimary(colorScheme.primary);
    setTempAccent(colorScheme.accent);
    setSelectedScheme(colorScheme);
  };

  const handleResetToDefault = () => {
    resetToDefault();
    const defaultScheme = COLOR_SCHEMES.find(s => s.id === 'forest-walk') || COLOR_SCHEMES[0];
    setSelectedScheme(defaultScheme);
    setTempPrimary(defaultScheme.primary);
    setTempAccent(defaultScheme.accent);
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
            const isActive = theme === mode.id;
            return (
              <motion.button
                key={mode.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setTheme(mode.id as any);
                  onChange?.('theme', mode.id);
                }}
                className={cn(
                  "p-4 rounded-xl border-2 transition-all duration-200",
                  isActive
                    ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                )}
              >
                <Icon className={cn(
                  "w-6 h-6 mx-auto mb-2",
                  isActive ? "text-purple-600 dark:text-purple-400" : "text-gray-600 dark:text-gray-400"
                )} />
                <span className={cn(
                  "text-sm font-medium",
                  isActive ? "text-purple-700 dark:text-purple-300" : "text-gray-700 dark:text-gray-300"
                )}>
                  {mode.label}
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Color Scheme */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Color Scheme
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
          {COLOR_SCHEMES.map((scheme) => {
            const isSelected = selectedScheme.id === scheme.id;
            return (
              <motion.button
                key={scheme.id}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleColorSchemeSelect(scheme)}
                className={cn(
                  "group relative p-4 rounded-lg border-2 transition-all duration-200",
                  isSelected
                    ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20 shadow-lg"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                )}
              >
                <div className="flex items-center justify-center space-x-2 mb-2">
                  <div 
                    className="w-8 h-8 rounded-full shadow-sm ring-2 ring-white dark:ring-gray-800"
                    style={{ backgroundColor: scheme.primary }}
                  />
                  <div 
                    className="w-8 h-8 rounded-full shadow-sm ring-2 ring-white dark:ring-gray-800"
                    style={{ backgroundColor: scheme.accent }}
                  />
                </div>
                <span className={cn(
                  "text-xs font-medium",
                  isSelected 
                    ? "text-purple-700 dark:text-purple-300" 
                    : "text-gray-700 dark:text-gray-300"
                )}>
                  {scheme.name}
                </span>
                {isSelected && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute top-2 right-2"
                  >
                    <CheckIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  </motion.div>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Advanced Settings */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Advanced
        </h3>
        <div className="space-y-4">
          <label className="flex items-center justify-between p-4 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer">
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
              checked={animations}
              onChange={(e) => {
                setAnimations(e.target.checked);
                onChange?.('animations', e.target.checked);
              }}
              className="w-5 h-5 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 dark:focus:ring-purple-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            />
          </label>

          <label className="flex items-center justify-between p-4 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer">
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
              checked={reduceMotion}
              onChange={(e) => {
                setReduceMotion(e.target.checked);
                onChange?.('reduceMotion', e.target.checked);
              }}
              className="w-5 h-5 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 dark:focus:ring-purple-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            />
          </label>
        </div>
      </div>

    </div>
  );
};

export default ThemeSettings;