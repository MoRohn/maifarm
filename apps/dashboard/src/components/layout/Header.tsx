import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, Menu, X, User, Settings, LogOut } from 'lucide-react';
import { User as UserType } from '@/types';
import { useThemeStore } from '@/store/themeStore';

interface HeaderProps {
  user: UserType;
  onMenuClick?: () => void;
}

export function Header({ user, onMenuClick }: HeaderProps) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const theme = useThemeStore((state) => state.theme);
  
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  useEffect(() => {
    const checkDarkMode = () => {
      if (theme === 'dark') {
        setIsDarkMode(true);
        console.log('Theme is dark, using dark favicon');
      } else if (theme === 'light') {
        setIsDarkMode(false);
        console.log('Theme is light, using light favicon');
      } else {
        // System theme
        const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setIsDarkMode(isSystemDark);
        console.log('Theme is system, detected:', isSystemDark ? 'dark' : 'light');
      }
    };
    
    checkDarkMode();
    
    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => checkDarkMode();
    mediaQuery.addEventListener('change', handleChange);
    
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  return (
    <header className="sticky top-0 z-[100] glass border-b border-gray-200/50 dark:border-gray-700/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left section */}
          <div className="flex items-center space-x-4">
            <button
              onClick={onMenuClick}
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-smooth"
            >
              <Menu className="w-5 h-5" />
            </button>
            
            <div className="flex items-center space-x-2">
              <img 
                src={isDarkMode ? "/favicon-dark.svg" : "/favicon-light.svg"} 
                alt="MaiFarm" 
                className="w-7 h-7"
                onError={(e) => {
                  console.error('Failed to load favicon:', e.currentTarget.src);
                  e.currentTarget.src = '/favicon-light.svg'; // Fallback
                }}
              />
              <h1 className="text-xl font-semibold hidden sm:block">MaiFarm</h1>
            </div>
          </div>

          {/* Right section */}
          <div className="flex items-center space-x-6">
            {/* Credits */}
            <div className="flex items-center space-x-2 px-3 py-1.5 bg-primary-50 dark:bg-primary-900/20 rounded-full">
              <CreditCard className="w-4 h-4 text-primary-600 dark:text-primary-400" />
              <span className="text-sm font-medium text-primary-700 dark:text-primary-300">
                {user.credits.toLocaleString()} credits
              </span>
            </div>

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-smooth"
              >
                {user.avatar ? (
                  <img 
                    src={user.avatar} 
                    alt={user.name} 
                    className="w-8 h-8 rounded-full"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center">
                    <span className="text-white text-sm font-medium">
                      {user.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <span className="hidden sm:block text-sm font-medium">{user.name}</span>
              </button>

              <AnimatePresence>
                {showUserMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute right-0 mt-2 w-56 card divide-y divide-gray-100 dark:divide-gray-800 z-[110]"
                  >
                    <div className="p-4">
                      <p className="text-sm font-medium">{user.name}</p>
                      <p className="text-xs text-gray-500 mt-1">{user.email}</p>
                      <div className="mt-2">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-200">
                          {user.tier} tier
                        </span>
                      </div>
                    </div>
                    <div className="p-2">
                      <button className="w-full flex items-center space-x-3 px-3 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-smooth">
                        <User className="w-4 h-4" />
                        <span>Profile</span>
                      </button>
                      <button className="w-full flex items-center space-x-3 px-3 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-smooth">
                        <Settings className="w-4 h-4" />
                        <span>Settings</span>
                      </button>
                    </div>
                    <div className="p-2">
                      <button className="w-full flex items-center space-x-3 px-3 py-2 text-sm text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-smooth">
                        <LogOut className="w-4 h-4" />
                        <span>Sign out</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}