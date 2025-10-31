/**
 * Premium Design System - Apple-inspired aesthetic
 * Professional, minimalist, and sophisticated design tokens
 */

export const premiumDesign = {
  // Typography - Using SF Pro or Inter fallbacks
  typography: {
    fontFamily: {
      sans: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, system-ui, sans-serif',
      mono: '"SF Mono", "Monaco", "Cascadia Code", "Roboto Mono", monospace',
    },
    fontSize: {
      '3xs': '0.625rem',  // 10px
      '2xs': '0.6875rem', // 11px
      xs: '0.75rem',      // 12px
      sm: '0.875rem',     // 14px
      base: '1rem',       // 16px
      lg: '1.125rem',     // 18px
      xl: '1.25rem',      // 20px
      '2xl': '1.5rem',    // 24px
      '3xl': '1.875rem',  // 30px
      '4xl': '2.25rem',   // 36px
      '5xl': '3rem',      // 48px
    },
    fontWeight: {
      thin: 100,
      light: 300,
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      heavy: 800,
    },
    letterSpacing: {
      tighter: '-0.03em',
      tight: '-0.01em',
      normal: '0',
      wide: '0.01em',
    },
  },

  // Color Palette - Sophisticated and minimal
  colors: {
    // Primary brand colors
    primary: {
      50: '#f0f9ff',
      100: '#e0f2fe',
      200: '#bae6fd',
      300: '#7dd3fc',
      400: '#38bdf8',
      500: '#0ea5e9', // Main brand color
      600: '#0284c7',
      700: '#0369a1',
      800: '#075985',
      900: '#0c4a6e',
      950: '#082f49',
    },

    // Neutral grays - the foundation
    gray: {
      0: '#ffffff',
      50: '#fafafa',
      100: '#f5f5f5',
      150: '#ededed',
      200: '#e5e5e5',
      250: '#d4d4d4',
      300: '#a3a3a3',
      400: '#858585',
      500: '#6b6b6b',
      600: '#525252',
      700: '#404040',
      800: '#262626',
      850: '#1a1a1a',
      900: '#0d0d0d',
      950: '#000000',
    },

    // Semantic colors
    success: {
      light: '#4ade80',
      DEFAULT: '#22c55e',
      dark: '#16a34a',
      subtle: '#dcfce7',
    },
    warning: {
      light: '#fbbf24',
      DEFAULT: '#f59e0b',
      dark: '#d97706',
      subtle: '#fef3c7',
    },
    error: {
      light: '#f87171',
      DEFAULT: '#ef4444',
      dark: '#dc2626',
      subtle: '#fee2e2',
    },
    info: {
      light: '#60a5fa',
      DEFAULT: '#3b82f6',
      dark: '#2563eb',
      subtle: '#dbeafe',
    },

    // Glass morphism colors
    glass: {
      white: 'rgba(255, 255, 255, 0.1)',
      whiteLight: 'rgba(255, 255, 255, 0.05)',
      whiteMedium: 'rgba(255, 255, 255, 0.15)',
      whiteHeavy: 'rgba(255, 255, 255, 0.25)',
      black: 'rgba(0, 0, 0, 0.1)',
      blackLight: 'rgba(0, 0, 0, 0.05)',
      blackMedium: 'rgba(0, 0, 0, 0.15)',
      blackHeavy: 'rgba(0, 0, 0, 0.25)',
    },
  },

  // Spacing - consistent and generous
  spacing: {
    px: '1px',
    0: '0',
    0.5: '0.125rem',  // 2px
    1: '0.25rem',     // 4px
    1.5: '0.375rem',  // 6px
    2: '0.5rem',      // 8px
    2.5: '0.625rem',  // 10px
    3: '0.75rem',     // 12px
    3.5: '0.875rem',  // 14px
    4: '1rem',        // 16px
    5: '1.25rem',     // 20px
    6: '1.5rem',      // 24px
    7: '1.75rem',     // 28px
    8: '2rem',        // 32px
    9: '2.25rem',     // 36px
    10: '2.5rem',     // 40px
    12: '3rem',       // 48px
    14: '3.5rem',     // 56px
    16: '4rem',       // 64px
    20: '5rem',       // 80px
  },

  // Border radius - smooth and elegant
  borderRadius: {
    none: '0',
    xs: '0.25rem',    // 4px
    sm: '0.375rem',   // 6px
    DEFAULT: '0.5rem', // 8px
    md: '0.625rem',   // 10px
    lg: '0.75rem',    // 12px
    xl: '1rem',       // 16px
    '2xl': '1.25rem', // 20px
    '3xl': '1.5rem',  // 24px
    full: '9999px',
  },

  // Shadows - subtle and layered
  shadows: {
    none: 'none',
    xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    sm: '0 2px 4px 0 rgba(0, 0, 0, 0.05)',
    DEFAULT: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
    md: '0 6px 10px -2px rgba(0, 0, 0, 0.05), 0 3px 6px -2px rgba(0, 0, 0, 0.03)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.03)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 10px 10px -5px rgba(0, 0, 0, 0.02)',
    '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.1)',
    inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)',
    
    // Glass morphism shadows
    glass: '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
    glassHover: '0 8px 32px 0 rgba(31, 38, 135, 0.25)',
  },

  // Blur values for glass effects
  blur: {
    none: '0',
    sm: '4px',
    DEFAULT: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
    '2xl': '40px',
  },

  // Animation durations
  animation: {
    duration: {
      instant: '0ms',
      fast: '150ms',
      normal: '250ms',
      slow: '350ms',
      slower: '500ms',
      slowest: '1000ms',
    },
    easing: {
      linear: 'linear',
      easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
      easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
      easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
      spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
    },
  },

  // Z-index layers
  zIndex: {
    base: 0,
    dropdown: 10,
    sticky: 20,
    fixed: 30,
    modalBackdrop: 40,
    modal: 50,
    popover: 60,
    tooltip: 70,
    notification: 80,
  },
};

// Utility classes for common patterns
export const premiumClasses = {
  // Glass morphism panels
  glassPanel: 'backdrop-blur-xl bg-white/80 dark:bg-gray-900/80 border border-gray-200/50 dark:border-gray-800/50',
  glassPanelHover: 'hover:bg-white/90 dark:hover:bg-gray-900/90 hover:border-gray-300/50 dark:hover:border-gray-700/50',
  
  // Buttons
  buttonPrimary: 'px-6 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-all duration-250 shadow-sm hover:shadow-md',
  buttonSecondary: 'px-6 py-3 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-250',
  buttonGhost: 'px-6 py-3 text-gray-600 dark:text-gray-400 font-medium rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-250',
  
  // Cards
  card: 'bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800',
  cardHover: 'hover:shadow-lg hover:border-gray-300 dark:hover:border-gray-700 transition-all duration-250',
  
  // Typography
  heading1: 'text-4xl font-bold tracking-tight text-gray-900 dark:text-white',
  heading2: 'text-3xl font-semibold tracking-tight text-gray-900 dark:text-white',
  heading3: 'text-2xl font-semibold tracking-tight text-gray-900 dark:text-white',
  heading4: 'text-xl font-medium tracking-tight text-gray-900 dark:text-white',
  bodyLarge: 'text-lg text-gray-600 dark:text-gray-400 leading-relaxed',
  body: 'text-base text-gray-600 dark:text-gray-400 leading-relaxed',
  bodySmall: 'text-sm text-gray-500 dark:text-gray-500 leading-relaxed',
  
  // Form elements
  input: 'w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-250',
  select: 'w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-250 appearance-none',
  
  // Badges
  badge: 'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium',
  badgeSuccess: 'bg-success-subtle text-success-dark dark:bg-success-dark/20 dark:text-success-light',
  badgeWarning: 'bg-warning-subtle text-warning-dark dark:bg-warning-dark/20 dark:text-warning-light',
  badgeError: 'bg-error-subtle text-error-dark dark:bg-error-dark/20 dark:text-error-light',
  badgeInfo: 'bg-info-subtle text-info-dark dark:bg-info-dark/20 dark:text-info-light',
  
  // Animations
  fadeIn: 'animate-fadeIn',
  slideUp: 'animate-slideUp',
  scaleIn: 'animate-scaleIn',
  
  // Terminal/Code
  terminal: 'font-mono text-sm bg-gray-950 text-gray-100 rounded-xl p-6 overflow-auto',
  codeBlock: 'font-mono text-sm bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 rounded-lg p-4',
};

// Export helper function for creating consistent class names
export const cn = (...classes: (string | undefined | null | false)[]) => {
  return classes.filter(Boolean).join(' ');
};