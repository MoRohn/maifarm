import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ThemeSettings } from '@/types/settings';

interface ThemeContextType {
  theme: ThemeSettings;
  setTheme: (theme: Partial<ThemeSettings>) => void;
  toggleTheme: () => void;
  isSystemTheme: boolean;
  currentMode: 'light' | 'dark';
}

const defaultTheme: ThemeSettings = {
  mode: 'system',
  primaryColor: '#007AFF', // Apple blue
  accentColor: '#FF9500', // Apple orange
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSize: 'medium',
  reducedMotion: false,
  highContrast: false
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeSettings>(() => {
    const saved = localStorage.getItem('theme_settings');
    return saved ? JSON.parse(saved) : defaultTheme;
  });

  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>('light');

  // Detect system theme preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const updateSystemTheme = (e: MediaQueryListEvent | MediaQueryList) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };

    updateSystemTheme(mediaQuery);
    mediaQuery.addEventListener('change', updateSystemTheme);

    return () => {
      mediaQuery.removeEventListener('change', updateSystemTheme);
    };
  }, []);

  // Detect reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    
    const updateReducedMotion = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches && !theme.reducedMotion) {
        setTheme({ reducedMotion: true });
      }
    };

    updateReducedMotion(mediaQuery);
    mediaQuery.addEventListener('change', updateReducedMotion);

    return () => {
      mediaQuery.removeEventListener('change', updateReducedMotion);
    };
  }, [theme.reducedMotion]);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    const currentMode = theme.mode === 'system' ? systemTheme : theme.mode;

    // Apply color scheme
    root.classList.remove('light', 'dark');
    root.classList.add(currentMode);
    root.style.colorScheme = currentMode;

    // Apply CSS variables
    root.style.setProperty('--color-primary', theme.primaryColor);
    root.style.setProperty('--color-accent', theme.accentColor);
    root.style.setProperty('--font-family', theme.fontFamily);

    // Apply font size
    const fontSizeMap = {
      small: '14px',
      medium: '16px',
      large: '18px'
    };
    root.style.setProperty('--font-size-base', fontSizeMap[theme.fontSize]);

    // Apply accessibility settings
    if (theme.reducedMotion) {
      root.classList.add('reduce-motion');
    } else {
      root.classList.remove('reduce-motion');
    }

    if (theme.highContrast) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }

    // Save to localStorage
    localStorage.setItem('theme_settings', JSON.stringify(theme));
  }, [theme, systemTheme]);

  const setTheme = useCallback((updates: Partial<ThemeSettings>) => {
    setThemeState(prev => ({ ...prev, ...updates }));
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState(prev => ({
      ...prev,
      mode: prev.mode === 'light' ? 'dark' : prev.mode === 'dark' ? 'system' : 'light'
    }));
  }, []);

  const currentMode = theme.mode === 'system' ? systemTheme : theme.mode;
  const isSystemTheme = theme.mode === 'system';

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme,
        isSystemTheme,
        currentMode
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};