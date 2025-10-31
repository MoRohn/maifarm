import React, { useState, useEffect } from 'react';
import { Globe, ChevronDown, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { LanguageSettings as ILanguageSettings } from '@/types/settings';

interface Language {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}

const languages: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' }
];

const timezones = [
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'Europe/London', label: 'London (GMT)' },
  { value: 'Europe/Paris', label: 'Paris (CET)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEDT)' }
];

const LanguageSettings: React.FC = () => {
  const [settings, setSettings] = useState<ILanguageSettings>({
    current: 'en',
    autoDetect: true,
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12h',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  });

  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [showTimezoneDropdown, setShowTimezoneDropdown] = useState(false);

  useEffect(() => {
    // Load settings from localStorage
    const savedSettings = localStorage.getItem('language_settings');
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }
  }, []);

  const updateSettings = (updates: Partial<ILanguageSettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    localStorage.setItem('language_settings', JSON.stringify(newSettings));
    
    // Apply language change
    if (updates.current) {
      document.documentElement.lang = updates.current;
    }
  };

  const currentLanguage = languages.find(l => l.code === settings.current) || languages[0];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Language & Region
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Customize language, date, time, and regional preferences.
        </p>
      </div>

      {/* Language Selection */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Display Language
          </label>
          <div className="relative">
            <button
              onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
              className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg flex items-center justify-between hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{currentLanguage.flag}</span>
                <div className="text-left">
                  <div className="font-medium text-gray-900 dark:text-white">
                    {currentLanguage.name}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {currentLanguage.nativeName}
                  </div>
                </div>
              </div>
              <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${
                showLanguageDropdown ? 'rotate-180' : ''
              }`} />
            </button>

            {showLanguageDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute z-10 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-96 overflow-y-auto"
              >
                {languages.map((language) => (
                  <button
                    key={language.code}
                    onClick={() => {
                      updateSettings({ current: language.code });
                      setShowLanguageDropdown(false);
                    }}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{language.flag}</span>
                      <div className="text-left">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {language.name}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {language.nativeName}
                        </div>
                      </div>
                    </div>
                    {settings.current === language.code && (
                      <Check className="w-5 h-5 text-blue-600" />
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </div>
        </div>

        {/* Auto-detect Language */}
        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white">
              Auto-detect Language
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Automatically detect and switch to your browser's language
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={settings.autoDetect}
              onChange={(e) => updateSettings({ autoDetect: e.target.checked })}
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
          </label>
        </div>
      </div>

      {/* Regional Settings */}
      <div className="space-y-4">
        <h4 className="font-medium text-gray-900 dark:text-white">Regional Preferences</h4>

        {/* Date Format */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Date Format
          </label>
          <div className="grid grid-cols-3 gap-2">
            {['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'].map((format) => (
              <button
                key={format}
                onClick={() => updateSettings({ dateFormat: format })}
                className={`px-4 py-2 rounded-lg border transition-colors ${
                  settings.dateFormat === format
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500'
                }`}
              >
                {format}
              </button>
            ))}
          </div>
        </div>

        {/* Time Format */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Time Format
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: '12h', label: '12-hour (AM/PM)' },
              { value: '24h', label: '24-hour' }
            ].map((format) => (
              <button
                key={format.value}
                onClick={() => updateSettings({ timeFormat: format.value as '12h' | '24h' })}
                className={`px-4 py-2 rounded-lg border transition-colors ${
                  settings.timeFormat === format.value
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500'
                }`}
              >
                {format.label}
              </button>
            ))}
          </div>
        </div>

        {/* Timezone */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Timezone
          </label>
          <div className="relative">
            <button
              onClick={() => setShowTimezoneDropdown(!showTimezoneDropdown)}
              className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg flex items-center justify-between hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-gray-400" />
                <span className="text-gray-900 dark:text-white">
                  {timezones.find(tz => tz.value === settings.timezone)?.label || settings.timezone}
                </span>
              </div>
              <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${
                showTimezoneDropdown ? 'rotate-180' : ''
              }`} />
            </button>

            {showTimezoneDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute z-10 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-64 overflow-y-auto"
              >
                {timezones.map((timezone) => (
                  <button
                    key={timezone.value}
                    onClick={() => {
                      updateSettings({ timezone: timezone.value });
                      setShowTimezoneDropdown(false);
                    }}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-between"
                  >
                    <span className="text-gray-900 dark:text-white">{timezone.label}</span>
                    {settings.timezone === timezone.value && (
                      <Check className="w-5 h-5 text-blue-600" />
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Translation Progress */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Globe className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-1">
              AI-Powered Translation
            </h4>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              MaiFarm uses AI to automatically translate the interface into your selected language. 
              Some translations may be in progress.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LanguageSettings;