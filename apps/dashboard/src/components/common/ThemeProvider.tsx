import React, { useEffect } from 'react';
import { useThemeStore } from '@/store/themeStore';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme, colorScheme, applyTheme } = useThemeStore();

  useEffect(() => {
    // Apply theme on mount and when colorScheme changes
    if (colorScheme) {
      applyTheme();
    }
  }, [colorScheme, applyTheme]);

  useEffect(() => {
    // Update data-theme attribute for CSS targeting
    if (colorScheme) {
      document.documentElement.setAttribute('data-theme', colorScheme.id);
    }
  }, [colorScheme]);

  return <>{children}</>;
};