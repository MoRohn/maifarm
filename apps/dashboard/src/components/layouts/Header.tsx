import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { User, Settings, Menu, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { GlassPanel } from '../common/GlassPanel';
import { StatusIndicator } from '../common/StatusIndicator';
import { useResponsive } from '@/hooks/useResponsive';
import { useAuth } from '@/hooks/useAuth';
import { useThemeStore } from '@/store/themeStore';

interface HeaderProps {
  onMenuClick?: () => void;
  isMenuOpen?: boolean;
  className?: string;
}

export const Header: React.FC<HeaderProps> = ({
  onMenuClick,
  isMenuOpen = false,
  className
}) => {
  const { isMobile } = useResponsive();
  const { user } = useAuth();
  const theme = useThemeStore((state) => state.theme);
  const colorScheme = useThemeStore((state) => state.colorScheme);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const checkDarkMode = () => {
      if (theme === 'dark') {
        setIsDarkMode(true);
      } else if (theme === 'light') {
        setIsDarkMode(false);
      } else {
        // System theme
        setIsDarkMode(window.matchMedia('(prefers-color-scheme: dark)').matches);
      }
    };

    checkDarkMode();

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => checkDarkMode();
    mediaQuery.addEventListener('change', handleChange);

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  // Generate logo path based on color scheme and mode
  const logoPath = useMemo(() => {
    const mode = isDarkMode ? 'dark' : 'light';
    const schemeId = colorScheme?.id || 'forest-walk';
    // Default (forest-walk) uses files without scheme suffix for backwards compatibility
    if (schemeId === 'forest-walk') {
      return `/maifarm-icon-forest-walk-${mode}.svg`;
    }
    return `/maifarm-icon-${schemeId}-${mode}.svg`;
  }, [isDarkMode, colorScheme?.id]);

  return (
    <GlassPanel
      variant="subtle"
      className={cn(
        'fixed top-0 left-0 right-0 z-50',
        'px-4 sm:px-6 lg:px-8 py-4',
        'border-b border-gray-200/20 dark:border-gray-700/20',
        className
      )}
    >
      <div className="flex items-center justify-between">
        {/* Left section */}
        <div className="flex items-center gap-4">
          {isMobile && (
            <motion.button
              onClick={onMenuClick}
              className="p-2 rounded-lg hover:bg-gray-100/50 dark:hover:bg-gray-800/50 transition-colors"
              whileTap={{ scale: 0.95 }}
            >
              {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </motion.button>
          )}
          
          <div className="flex items-center gap-3">
            <img
              src={logoPath}
              alt="MaiFarm"
              className="w-8 h-8"
            />
            {!isMobile && (
              <div>
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                  MaiFarm
                </h1>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  AI Orchestration Platform
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Center section - System Status */}
        {!isMobile && (
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <StatusIndicator status="active" size="sm" showLabel label="System" />
              <span className="text-sm text-gray-500">|</span>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                5 agents active
              </span>
            </div>
          </div>
        )}

        {/* Right section */}
        <div className="flex items-center gap-2 sm:gap-3">
          <motion.button
            className="p-2 rounded-lg hover:bg-gray-100/50 dark:hover:bg-gray-800/50 transition-colors touch-target"
            whileTap={{ scale: 0.95 }}
          >
            <Settings className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </motion.button>
          
          <div className="ml-2 flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {user?.name || 'Guest'}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {user?.roles?.[0]?.name || 'User'}
              </p>
            </div>
            <motion.button
              className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors touch-target"
              whileTap={{ scale: 0.95 }}
            >
              <User className="w-5 h-5 text-gray-700 dark:text-gray-300" />
            </motion.button>
          </div>
        </div>
      </div>
    </GlassPanel>
  );
};