import React, { useEffect, useState } from 'react';
import { useThemeStore } from '@/store/themeStore';
import maifarmIconDark from '../../assets/logos/maifarm-icon-forest-walk-dark.svg';
import maifarmIconLight from '../../assets/logos/maifarm-icon-forest-walk-light.svg';

interface DynamicLogoProps {
  className?: string;
  variant?: 'icon' | 'logo';
}

export const DynamicLogoIcon: React.FC<DynamicLogoProps> = ({ className = "w-7 h-7", variant = 'icon' }) => {
  const theme = useThemeStore((state) => state.theme);
  const [logoSrc, setLogoSrc] = useState<string>(maifarmIconLight);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const updateLogo = () => {
      let isDark = false;
      
      if (theme === 'dark') {
        isDark = true;
      } else if (theme === 'system') {
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
      
      if (variant === 'icon') {
        setLogoSrc(isDark ? maifarmIconDark : maifarmIconLight);
      } else {
        // For logo variant, import the full logos when needed
        import(isDark ? '../../assets/logos/maifarm-icon-forest-walk-dark.svg' : '../../assets/logos/maifarm-icon-forest-walk-light.svg')
          .then(module => setLogoSrc(module.default))
          .catch(() => setHasError(true));
      }
    };

    updateLogo();
    setHasError(false);

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => updateLogo();
    mediaQuery.addEventListener('change', handleChange);

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, variant]);

  if (hasError) {
    // Fallback to a colored div
    return (
      <div 
        className={`${className} bg-primary-500 rounded flex items-center justify-center`}
        aria-label="MaiFarm Icon"
      >
        <span className="text-white font-bold text-xs">M</span>
      </div>
    );
  }

  return (
    <img 
      src={logoSrc}
      alt="MaiFarm" 
      className={className}
      onError={() => setHasError(true)}
    />
  );
};