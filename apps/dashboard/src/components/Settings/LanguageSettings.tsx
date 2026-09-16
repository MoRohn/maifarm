import React from 'react';
import { motion } from 'framer-motion';
import {
  GlobeAmericasIcon,
  ClockIcon,
  LanguageIcon,
  CalendarIcon,
} from '@heroicons/react/24/outline';
import { useSettingsStore } from '@/store/settingsStore';

const languages = [
  { code: 'en', name: 'English', native: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', native: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'French', native: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'German', native: 'Deutsch', flag: '🇩🇪' },
  { code: 'ja', name: 'Japanese', native: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', native: '한국어', flag: '🇰🇷' },
  { code: 'zh', name: 'Chinese', native: '中文', flag: '🇨🇳' },
  { code: 'pt', name: 'Portuguese', native: 'Português', flag: '🇵🇹' },
];

const timezones = [
  { value: 'UTC', label: 'UTC — Coordinated Universal Time' },
  { value: 'America/New_York', label: 'Eastern Time (US)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (US)' },
  { value: 'Europe/London', label: 'London (UK)' },
  { value: 'Europe/Paris', label: 'Paris (France)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (Japan)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (China)' },
  { value: 'Australia/Sydney', label: 'Sydney (Australia)' },
];

const dateFormats = ['MM/dd/yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd'];
const timeFormats: Array<'12h' | '24h'> = ['12h', '24h'];

const LanguageSettings: React.FC = () => {
  const { settings, setLanguage, updateSettings } = useSettingsStore();
  const languageSettings = settings.user?.language ?? {
    current: 'en',
    autoDetect: true,
    dateFormat: 'MM/dd/yyyy',
    timeFormat: '12h',
    timezone: 'UTC'
  };

  const handleLanguageChange = (code: string) => {
    setLanguage(code);
  };

  const updateLanguageSettings = (updates: Partial<typeof languageSettings>) => {
    updateSettings({
      user: {
        language: {
          ...languageSettings,
          ...updates
        }
      }
    });
  };

  const selectedLanguage = languages.find((lang) => lang.code === languageSettings.current) ?? languages[0];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Language & Region</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Choose the language, date, and time formats MaiFarm should use across the dashboard.
        </p>
      </div>

      <div className="space-y-6">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <LanguageIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-white">Display Language</h3>
                <p className="text-xs text-gray-600 dark:text-gray-400">Interface labels and default formatting</p>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {languages.map((language) => {
              const isActive = language.code === languageSettings.current;
              return (
                <motion.button
                  key={language.code}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleLanguageChange(language.code)}
                  className={`flex items-center justify-between rounded-lg border px-4 py-3 transition-all ${
                    isActive
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 shadow-sm'
                      : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{language.flag}</span>
                    <div className="text-left">
                      <div className="text-sm font-medium">{language.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{language.native}</div>
                    </div>
                  </div>
                  {isActive && (
                    <motion.span
                      layoutId="language-selector"
                      className="inline-flex h-2 w-2 rounded-full bg-blue-500"
                      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    />
                  )}
                </motion.button>
              );
            })}
          </div>

          <label className="mt-4 flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-900/40 px-4 py-3 text-sm">
            <span className="text-gray-700 dark:text-gray-300">Auto-detect from browser</span>
            <input
              type="checkbox"
              checked={languageSettings.autoDetect}
              onChange={(event) => updateLanguageSettings({ autoDetect: event.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
          </label>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 space-y-3">
            <div className="flex items-center gap-3">
              <CalendarIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <div>
                <h4 className="text-sm font-medium text-gray-900 dark:text-white">Date format</h4>
                <p className="text-xs text-gray-600 dark:text-gray-400">Choose how dates appear</p>
              </div>
            </div>
            <div className="grid gap-2">
              {dateFormats.map((format) => (
                <button
                  key={format}
                  onClick={() => updateLanguageSettings({ dateFormat: format })}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    languageSettings.dateFormat === format
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300'
                      : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  {format}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 space-y-3">
            <div className="flex items-center gap-3">
              <ClockIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <div>
                <h4 className="text-sm font-medium text-gray-900 dark:text-white">Time format</h4>
                <p className="text-xs text-gray-600 dark:text-gray-400">12-hour or 24-hour clock</p>
              </div>
            </div>
            <div className="grid gap-2">
              {timeFormats.map((format) => (
                <button
                  key={format}
                  onClick={() => updateLanguageSettings({ timeFormat: format })}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    languageSettings.timeFormat === format
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300'
                      : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  {format === '12h' ? '12-hour (AM/PM)' : '24-hour'}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 space-y-3">
            <div className="flex items-center gap-3">
              <GlobeAmericasIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <div>
                <h4 className="text-sm font-medium text-gray-900 dark:text-white">Timezone</h4>
                <p className="text-xs text-gray-600 dark:text-gray-400">Current default timezone</p>
              </div>
            </div>
            <select
              value={languageSettings.timezone}
              onChange={(event) => updateLanguageSettings({ timezone: event.target.value })}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {timezones.map((timezone) => (
                <option key={timezone.value} value={timezone.value}>
                  {timezone.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LanguageSettings;
