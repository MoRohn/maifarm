import { useThemeStore } from '@/store/themeStore';

/**
 * Hook to get dynamic theme color classes
 */
export const useThemeColors = () => {
  const colorScheme = useThemeStore((state) => state.colorScheme);
  
  return {
    // Gradient classes using CSS variables
    gradientPrimary: 'bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)]',
    gradientPrimaryReverse: 'bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-primary)]',
    gradientPrimaryDiagonal: 'bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)]',
    
    // Background classes
    bgPrimary: 'bg-[var(--color-primary)]',
    bgPrimaryDark: 'bg-[var(--color-primary-dark)]',
    bgPrimaryLight: 'bg-[var(--color-primary-light)]',
    bgAccent: 'bg-[var(--color-accent)]',
    bgAccentDark: 'bg-[var(--color-accent-dark)]',
    bgAccentLight: 'bg-[var(--color-accent-light)]',
    
    // Text classes
    textPrimary: 'text-[var(--color-primary)]',
    textPrimaryDark: 'text-[var(--color-primary-dark)]',
    textPrimaryLight: 'text-[var(--color-primary-light)]',
    textAccent: 'text-[var(--color-accent)]',
    textAccentDark: 'text-[var(--color-accent-dark)]',
    textAccentLight: 'text-[var(--color-accent-light)]',
    
    // Border classes
    borderPrimary: 'border-[var(--color-primary)]',
    borderAccent: 'border-[var(--color-accent)]',
    
    // Ring classes
    ringPrimary: 'ring-[var(--color-primary)]',
    ringAccent: 'ring-[var(--color-accent)]',
    focusRingPrimary: 'focus:ring-[var(--color-primary)]',
    focusRingAccent: 'focus:ring-[var(--color-accent)]',
    
    // Shadow classes with transparency
    shadowPrimary: 'shadow-[0_10px_25px_-5px_rgba(var(--color-primary-rgb),0.25)]',
    shadowAccent: 'shadow-[0_10px_25px_-5px_rgba(var(--color-accent-rgb),0.25)]',
    
    // Hover classes
    hoverBgPrimary: 'hover:bg-[var(--color-primary)]',
    hoverBgPrimaryDark: 'hover:bg-[var(--color-primary-dark)]',
    hoverTextPrimary: 'hover:text-[var(--color-primary)]',
    hoverBorderPrimary: 'hover:border-[var(--color-primary)]',
    
    // Glass morphism with theme colors
    glassPrimary: 'bg-[rgba(var(--color-primary-rgb),0.1)] backdrop-blur-md border border-[rgba(var(--color-primary-rgb),0.2)]',
    glassAccent: 'bg-[rgba(var(--color-accent-rgb),0.1)] backdrop-blur-md border border-[rgba(var(--color-accent-rgb),0.2)]',
  };
};

/**
 * Get a CSS variable value
 */
export const getCSSVariable = (variable: string): string => {
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
};

/**
 * Apply inline styles with theme colors
 */
export const getThemeStyles = () => {
  return {
    primary: getCSSVariable('--color-primary'),
    primaryDark: getCSSVariable('--color-primary-dark'),
    primaryLight: getCSSVariable('--color-primary-light'),
    accent: getCSSVariable('--color-accent'),
    accentDark: getCSSVariable('--color-accent-dark'),
    accentLight: getCSSVariable('--color-accent-light'),
  };
};