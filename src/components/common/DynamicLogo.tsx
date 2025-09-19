import React, { useEffect, useState, useMemo } from 'react';
import { useThemeStore } from '@/store/themeStore';

interface DynamicLogoProps {
  className?: string;
  variant?: 'icon' | 'logo' | 'wordmark';
  mode?: 'light' | 'dark' | 'auto';
}

export const DynamicLogo: React.FC<DynamicLogoProps> = ({ 
  className = "w-7 h-7", 
  variant = 'icon',
  mode = 'auto'
}) => {
  const { theme, colorScheme } = useThemeStore();
  const [hasError, setHasError] = useState(false);

  const isDark = useMemo(() => {
    if (mode !== 'auto') return mode === 'dark';
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }, [theme, mode]);

  const logoPath = useMemo(() => {
    const colorId = colorScheme.id;
    const themeMode = isDark ? 'dark' : 'light';
    
    // Check if custom logo exists for this color scheme
    // If not, fallback to default logos
    if (colorId === 'forest-walk' || colorId === 'custom') {
      // Use default logos
      if (variant === 'icon') {
        return `/maifarm-icon-${themeMode}-bkgd.svg`;
      } else if (variant === 'wordmark') {
        return `/maifarm-logo-${themeMode}.svg`;
      } else {
        return `/maifarm-logo-${themeMode}-bkgd.svg`;
      }
    } else {
      // Use color-specific logos (to be created manually)
      if (variant === 'icon') {
        return `/maifarm-icon-${colorId}-${themeMode}.svg`;
      } else if (variant === 'wordmark') {
        return `/maifarm-wordmark-${colorId}-${themeMode}.svg`;
      } else {
        return `/maifarm-logo-${colorId}-${themeMode}.svg`;
      }
    }
  }, [colorScheme, isDark, variant]);

  if (hasError) {
    // Fallback to SVG generated on the fly with current theme colors
    return (
      <div 
        className={`${className} rounded flex items-center justify-center`}
        style={{ 
          backgroundColor: colorScheme.primary,
          color: 'white'
        }}
        aria-label="MaiFarm Logo"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full p-2">
          <text 
            x="50" 
            y="60" 
            textAnchor="middle" 
            className="font-bold"
            style={{ fontSize: '48px', fill: 'currentColor' }}
          >
            M
          </text>
        </svg>
      </div>
    );
  }

  return (
    <img 
      src={logoPath}
      alt="MaiFarm" 
      className={`maifarm-logo ${className}`}
      onError={() => {
        console.warn(`Logo not found: ${logoPath}, using fallback`);
        setHasError(true);
      }}
    />
  );
};