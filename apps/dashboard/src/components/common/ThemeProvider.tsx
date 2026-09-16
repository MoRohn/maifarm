import React, { useEffect, useRef } from 'react';
import { useThemeStore } from '@/store/themeStore';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme, colorScheme, applyTheme } = useThemeStore();
  const initializedRef = useRef(false);
  const lastThemeRef = useRef<string | null>(null);

  useEffect(() => {
    // On initial mount, verify theme is applied (index.html should have already done this)
    // Only re-apply if there's actually a mismatch
    if (!initializedRef.current) {
      initializedRef.current = true;

      const currentThemeClass = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
      // ALWAYS default to dark - never use system theme
      const expectedTheme = theme === 'light' ? 'light' : 'dark';

      // Only apply if there's a mismatch (prevents flash)
      if (currentThemeClass !== expectedTheme && colorScheme) {
        applyTheme();
      }

      lastThemeRef.current = theme;
      return;
    }

    // Only apply theme when it actually changes (not on every colorScheme update)
    if (theme !== lastThemeRef.current && colorScheme) {
      lastThemeRef.current = theme;
      applyTheme();
    }
  }, [theme, colorScheme, applyTheme]);

  // System theme handling - respect user's system preference on iOS/macOS
  useEffect(() => {
    if (theme === 'system') {
      // Use system preference (important for iOS Settings > Display & Brightness)
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(prefersDark ? 'dark' : 'light');

      // Listen for system theme changes
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(e.matches ? 'dark' : 'light');
        if (colorScheme) {
          applyTheme();
        }
      };
      mediaQuery.addEventListener('change', handleChange);

      if (colorScheme) {
        applyTheme();
      }

      return () => {
        mediaQuery.removeEventListener('change', handleChange);
      };
    }
  }, [theme, colorScheme, applyTheme]);

  useEffect(() => {
    // Update data-theme attribute for CSS targeting
    if (colorScheme) {
      document.documentElement.setAttribute('data-theme', colorScheme.id);
    }
  }, [colorScheme]);

  return <>{children}</>;
};