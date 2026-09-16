import React, { useEffect, useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useThemeStore } from '@/store/themeStore';

interface LogoProps {
  variant?: 'full' | 'icon';
  className?: string;
  width?: number;
  height?: number;
  forceDefault?: boolean; // Force primary dark green logo (forest-walk)
}

export const Logo: React.FC<LogoProps> = ({
  variant = 'full',
  className = '',
  width,
  height,
  forceDefault = false
}) => {
  const { theme } = useTheme();
  const { colorScheme } = useThemeStore();
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    if (theme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setResolvedTheme(isDark ? 'dark' : 'light');
    } else {
      setResolvedTheme(theme as 'light' | 'dark');
    }
  }, [theme]);

  const isDark = resolvedTheme === 'dark';

  // Map color scheme to logo file - always use full logo (never icon)
  const getLogoFile = () => {
    // Force default primary logo (forest-walk) for onboarding/welcome pages
    if (forceDefault) {
      return '/maifarm-logo-forest-walk-dark.svg';
    }

    const schemeId = colorScheme.id || 'forest-walk';
    const themeVariant = isDark ? 'dark' : 'light';

    // Always use the full logo image file
    return `/maifarm-logo-${schemeId}-${themeVariant}.svg`;
  };

  const logoSrc = getLogoFile();

  // Set dimensions based on variant prop for styling purposes
  // but always load the full logo image
  const defaultWidth = variant === 'icon' ? 120 : 200;
  const defaultHeight = variant === 'icon' ? 48 : 48;

  return (
    <img
      src={logoSrc}
      alt="MaiFarm Logo"
      width={width || defaultWidth}
      height={height || defaultHeight}
      className={className}
      style={{ objectFit: 'contain' }}
      onError={(e) => {
        // Fallback to forest-walk if the requested color scheme logo doesn't exist
        const fallback = `/maifarm-logo-forest-walk-${isDark ? 'dark' : 'light'}.svg`;
        (e.target as HTMLImageElement).src = fallback;
      }}
    />
  );
};