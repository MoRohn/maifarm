import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  LanguageIcon,
  CheckIcon,
  SparklesIcon,
  GlobeAltIcon
} from '@heroicons/react/24/outline';
import { useUserStore } from '../../store/userStore';

interface Language {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  supported: boolean;
  aiTranslated?: boolean;
}

const languages: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸', supported: true },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', supported: true },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷', supported: true },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪', supported: true },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹', supported: true },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹', supported: true },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵', supported: true },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷', supported: true },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳', supported: true },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺', supported: true, aiTranslated: true },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', supported: false },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳', supported: false }
];

const LanguageSelector: React.FC = () => {
  const { preferences, updatePreferences } = useUserStore();
  const [selectedLanguage, setSelectedLanguage] = useState(preferences?.language?.current || 'en');
  const [autoDetect, setAutoDetect] = useState(preferences?.language?.autoDetect ?? true);
  const [translationQuality, setTranslationQuality] = useState(preferences?.language?.translationQuality || 'advanced');

  const handleLanguageChange = (langCode: string) => {
    setSelectedLanguage(langCode);
    updatePreferences({
      language: {
        ...preferences?.language,
        current: langCode,
        autoDetect,
        translationQuality
      }
    });
  };

  const handleAutoDetectChange = (enabled: boolean) => {
    setAutoDetect(enabled);
    updatePreferences({
      language: {
        ...preferences?.language,
        current: selectedLanguage,
        autoDetect: enabled,
        translationQuality
      }
    });
  };

  const handleTranslationQualityChange = (quality: string) => {
    setTranslationQuality(quality);
    updatePreferences({
      language: {
        ...preferences?.language,
        current: selectedLanguage,
        autoDetect,
        translationQuality: quality
      }
    });
  };

  const selectedLang = languages.find(lang => lang.code === selectedLanguage);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
          Language & Region
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Choose your preferred language and translation settings
        </p>
      </div>

      {/* Auto-detect Option */}
      <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
        <label className="flex items-center justify-between cursor-pointer">
          <div className="flex items-center space-x-3">
            <GlobeAltIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Auto-detect Language
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Automatically detect and switch based on your system language
              </p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={autoDetect}
            onChange={(e) => handleAutoDetectChange(e.target.checked)}
            className="w-5 h-5 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 dark:focus:ring-purple-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
          />
        </label>
      </div>

      {/* Current Language Display */}
      {selectedLang && (
        <div className="p-6 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl">
          <div className="flex items-center space-x-4">
            <span className="text-4xl">{selectedLang.flag}</span>
            <div>
              <h4 className="text-lg font-medium text-gray-900 dark:text-white">
                {selectedLang.name}
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {selectedLang.nativeName}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Language Grid */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Available Languages
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {languages.map((lang) => (
            <motion.button
              key={lang.code}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => lang.supported && handleLanguageChange(lang.code)}
              disabled={!lang.supported}
              className={`relative p-4 rounded-lg border transition-all duration-200 ${
                selectedLanguage === lang.code
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                  : lang.supported
                  ? 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  : 'border-gray-200 dark:border-gray-700 opacity-50 cursor-not-allowed'
              }`}
            >
              {selectedLanguage === lang.code && (
                <CheckIcon className="absolute top-2 right-2 w-4 h-4 text-purple-600 dark:text-purple-400" />
              )}
              
              <div className="flex items-center space-x-3">
                <span className="text-2xl">{lang.flag}</span>
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {lang.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {lang.nativeName}
                  </p>
                </div>
              </div>

              {lang.aiTranslated && (
                <div className="absolute bottom-2 right-2">
                  <SparklesIcon className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                </div>
              )}

              {!lang.supported && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-800/80 rounded-lg">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Coming Soon
                  </span>
                </div>
              )}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Translation Quality */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Translation Quality
        </h4>
        <div className="space-y-2">
          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="radio"
              value="basic"
              checked={translationQuality === 'basic'}
              onChange={(e) => handleTranslationQualityChange(e.target.value)}
              className="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 focus:ring-purple-500 dark:focus:ring-purple-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            />
            <div className="flex-1">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Basic Translation
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Fast, machine-translated text for quick understanding
              </p>
            </div>
          </label>

          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="radio"
              value="advanced"
              checked={translationQuality === 'advanced'}
              onChange={(e) => handleTranslationQualityChange(e.target.value)}
              className="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 focus:ring-purple-500 dark:focus:ring-purple-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            />
            <div className="flex-1">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Advanced Translation
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                AI-enhanced translation with context awareness
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Language Contribution */}
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
        <div className="flex items-start space-x-3">
          <LanguageIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Help Us Improve
            </h4>
            <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
              Want to help translate MaiFarm to your language? Join our community translation effort.
            </p>
            <button className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
              Learn More →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LanguageSelector;