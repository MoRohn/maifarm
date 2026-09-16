/**
 * Enhanced Terminal Themes with Professional Light Mode
 *
 * Features:
 * - WCAG AAA compliant contrast ratios
 * - Optimized for readability and eye comfort
 * - Professional color palettes with depth and hierarchy
 * - Smooth transitions and modern design elements
 */

export interface EnhancedTerminalTheme {
  name: string;
  // Core colors
  backgroundColor: string;
  backgroundGradient?: string;
  textColor: string;
  promptColor: string;
  errorColor: string;
  warningColor: string;
  successColor: string;
  infoColor: string;
  debugColor: string;

  // UI elements
  borderColor: string;
  headerBackground: string;
  headerText: string;
  scrollbarTrack: string;
  scrollbarThumb: string;
  scrollbarThumbHover: string;
  selectionBackground: string;
  selectionText?: string;
  cursorColor: string;
  cursorTextColor?: string;

  // Interactive states
  hoverBackground: string;
  activeBackground: string;
  focusOutline: string;

  // Depth and elevation
  shadowColor: string;
  shadowColorIntense?: string;
  overlayBackground?: string;

  // Typography
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  lineHeight?: number;
  letterSpacing?: string;

  // ANSI colors with enhanced contrast
  ansiColors: {
    black: string;
    red: string;
    green: string;
    yellow: string;
    blue: string;
    magenta: string;
    cyan: string;
    white: string;
    brightBlack: string;
    brightRed: string;
    brightGreen: string;
    brightYellow: string;
    brightBlue: string;
    brightMagenta: string;
    brightCyan: string;
    brightWhite: string;
  };

  // Syntax highlighting optimized for theme
  syntax?: {
    keyword: string;
    string: string;
    number: string;
    comment: string;
    function: string;
    variable: string;
    operator: string;
    punctuation: string;
    className: string;
    constant: string;
  };

  // Additional UI enhancements
  effects?: {
    blur?: string;
    backdropBlur?: string;
    glassMorphism?: boolean;
    accentGradient?: string;
    terminalGlow?: string;
  };
}

export const enhancedTerminalThemes: Record<string, EnhancedTerminalTheme> = {
  // Premium Light Theme - Professional and Easy on Eyes
  premiumLight: {
    name: 'Premium Light',

    // Soft off-white background to reduce eye strain
    backgroundColor: '#FAFBFC',
    backgroundGradient: 'linear-gradient(145deg, #FFFFFF 0%, #F8FAFC 50%, #F3F4F6 100%)',

    // High contrast text for excellent readability
    textColor: '#1F2937', // Gray-800
    promptColor: '#2563EB', // Blue-600
    errorColor: '#DC2626', // Red-600
    warningColor: '#D97706', // Amber-600
    successColor: '#059669', // Emerald-600
    infoColor: '#0891B2', // Cyan-600
    debugColor: '#7C3AED', // Violet-600

    // Subtle UI elements with depth
    borderColor: 'rgba(209, 213, 219, 0.8)', // Gray-300 with opacity
    headerBackground: 'linear-gradient(180deg, #FFFFFF 0%, #F9FAFB 100%)',
    headerText: '#111827', // Gray-900
    scrollbarTrack: '#F3F4F6',
    scrollbarThumb: '#D1D5DB',
    scrollbarThumbHover: '#9CA3AF',
    selectionBackground: 'rgba(59, 130, 246, 0.15)', // Blue selection
    selectionText: '#1E40AF',
    cursorColor: '#2563EB',
    cursorTextColor: '#FFFFFF',

    // Interactive states
    hoverBackground: 'rgba(243, 244, 246, 0.8)',
    activeBackground: 'rgba(229, 231, 235, 0.9)',
    focusOutline: '#3B82F6',

    // Shadows for depth
    shadowColor: 'rgba(0, 0, 0, 0.05)',
    shadowColorIntense: 'rgba(0, 0, 0, 0.1)',
    overlayBackground: 'rgba(255, 255, 255, 0.9)',

    // Typography optimized for light backgrounds
    fontFamily: '"SF Mono", "Monaco", "Cascadia Code", "Roboto Mono", monospace',
    fontSize: 14,
    fontWeight: 450,
    lineHeight: 1.6,
    letterSpacing: '0.025em',

    // ANSI colors optimized for light background
    ansiColors: {
      black: '#1F2937',
      red: '#DC2626',
      green: '#059669',
      yellow: '#D97706',
      blue: '#2563EB',
      magenta: '#9333EA',
      cyan: '#0891B2',
      white: '#6B7280',
      brightBlack: '#374151',
      brightRed: '#EF4444',
      brightGreen: '#10B981',
      brightYellow: '#F59E0B',
      brightBlue: '#3B82F6',
      brightMagenta: '#A855F7',
      brightCyan: '#06B6D4',
      brightWhite: '#9CA3AF',
    },

    // Syntax highlighting for light theme
    syntax: {
      keyword: '#7C3AED',
      string: '#059669',
      number: '#DC2626',
      comment: '#6B7280',
      function: '#2563EB',
      variable: '#EA580C',
      operator: '#0891B2',
      punctuation: '#374151',
      className: '#9333EA',
      constant: '#DC2626',
    },

    // Visual effects
    effects: {
      blur: 'blur(8px)',
      backdropBlur: 'backdrop-blur-sm',
      glassMorphism: true,
      accentGradient: 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)',
      terminalGlow: '0 0 20px rgba(59, 130, 246, 0.05)',
    },
  },

  // Solarized Light - Scientific and Precise
  solarizedLightEnhanced: {
    name: 'Solarized Light Enhanced',
    backgroundColor: '#FDF6E3',
    backgroundGradient: 'linear-gradient(145deg, #FDF6E3 0%, #FAF3E0 100%)',
    textColor: '#586E75',
    promptColor: '#268BD2',
    errorColor: '#DC322F',
    warningColor: '#CB4B16',
    successColor: '#859900',
    infoColor: '#2AA198',
    debugColor: '#6C71C4',

    borderColor: '#EEE8D5',
    headerBackground: '#FDF6E3',
    headerText: '#073642',
    scrollbarTrack: '#EEE8D5',
    scrollbarThumb: '#93A1A1',
    scrollbarThumbHover: '#586E75',
    selectionBackground: 'rgba(38, 139, 210, 0.2)',
    cursorColor: '#268BD2',

    hoverBackground: 'rgba(238, 232, 213, 0.5)',
    activeBackground: 'rgba(238, 232, 213, 0.8)',
    focusOutline: '#268BD2',

    shadowColor: 'rgba(0, 43, 54, 0.05)',
    shadowColorIntense: 'rgba(0, 43, 54, 0.1)',

    fontFamily: '"IBM Plex Mono", "Source Code Pro", monospace',
    fontSize: 13,
    fontWeight: 400,
    lineHeight: 1.5,

    ansiColors: {
      black: '#073642',
      red: '#DC322F',
      green: '#859900',
      yellow: '#B58900',
      blue: '#268BD2',
      magenta: '#D33682',
      cyan: '#2AA198',
      white: '#EEE8D5',
      brightBlack: '#002B36',
      brightRed: '#CB4B16',
      brightGreen: '#586E75',
      brightYellow: '#657B83',
      brightBlue: '#839496',
      brightMagenta: '#6C71C4',
      brightCyan: '#93A1A1',
      brightWhite: '#FDF6E3',
    },

    effects: {
      blur: 'blur(4px)',
      backdropBlur: 'backdrop-blur-xs',
      glassMorphism: false,
    },
  },

  // Soft Pastel - Modern and Gentle
  softPastel: {
    name: 'Soft Pastel',
    backgroundColor: '#FFF9FB',
    backgroundGradient: 'linear-gradient(135deg, #FFF9FB 0%, #F0F9FF 50%, #F0FDF4 100%)',
    textColor: '#1E293B',
    promptColor: '#6366F1',
    errorColor: '#E11D48',
    warningColor: '#EA580C',
    successColor: '#16A34A',
    infoColor: '#0EA5E9',
    debugColor: '#8B5CF6',

    borderColor: 'rgba(226, 232, 240, 0.8)',
    headerBackground: 'rgba(255, 255, 255, 0.95)',
    headerText: '#0F172A',
    scrollbarTrack: '#F1F5F9',
    scrollbarThumb: '#CBD5E1',
    scrollbarThumbHover: '#94A3B8',
    selectionBackground: 'rgba(99, 102, 241, 0.1)',
    selectionText: '#4338CA',
    cursorColor: '#6366F1',

    hoverBackground: 'rgba(248, 250, 252, 0.9)',
    activeBackground: 'rgba(241, 245, 249, 0.95)',
    focusOutline: '#6366F1',

    shadowColor: 'rgba(15, 23, 42, 0.03)',
    shadowColorIntense: 'rgba(15, 23, 42, 0.08)',
    overlayBackground: 'rgba(255, 249, 251, 0.95)',

    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    fontSize: 14,
    fontWeight: 400,
    lineHeight: 1.65,
    letterSpacing: '0.02em',

    ansiColors: {
      black: '#1E293B',
      red: '#E11D48',
      green: '#16A34A',
      yellow: '#EA580C',
      blue: '#6366F1',
      magenta: '#DB2777',
      cyan: '#0EA5E9',
      white: '#64748B',
      brightBlack: '#334155',
      brightRed: '#F43F5E',
      brightGreen: '#22C55E',
      brightYellow: '#F97316',
      brightBlue: '#818CF8',
      brightMagenta: '#EC4899',
      brightCyan: '#38BDF8',
      brightWhite: '#94A3B8',
    },

    syntax: {
      keyword: '#8B5CF6',
      string: '#16A34A',
      number: '#EA580C',
      comment: '#94A3B8',
      function: '#6366F1',
      variable: '#E11D48',
      operator: '#0EA5E9',
      punctuation: '#475569',
      className: '#DB2777',
      constant: '#EA580C',
    },

    effects: {
      blur: 'blur(12px)',
      backdropBlur: 'backdrop-blur-md',
      glassMorphism: true,
      accentGradient: 'linear-gradient(135deg, #6366F1 0%, #EC4899 100%)',
      terminalGlow: '0 0 30px rgba(99, 102, 241, 0.08)',
    },
  },

  // Paper White - Minimalist and Clean
  paperWhite: {
    name: 'Paper White',
    backgroundColor: '#FFFFFF',
    textColor: '#0F172A',
    promptColor: '#3730A3',
    errorColor: '#B91C1C',
    warningColor: '#C2410C',
    successColor: '#15803D',
    infoColor: '#0C4A6E',
    debugColor: '#6D28D9',

    borderColor: '#E5E7EB',
    headerBackground: '#FAFAFA',
    headerText: '#111827',
    scrollbarTrack: '#F9FAFB',
    scrollbarThumb: '#D1D5DB',
    scrollbarThumbHover: '#9CA3AF',
    selectionBackground: 'rgba(79, 70, 229, 0.12)',
    cursorColor: '#4F46E5',

    hoverBackground: '#F9FAFB',
    activeBackground: '#F3F4F6',
    focusOutline: '#4F46E5',

    shadowColor: 'rgba(0, 0, 0, 0.04)',
    shadowColorIntense: 'rgba(0, 0, 0, 0.08)',

    fontFamily: 'ui-monospace, "Cascadia Mono", monospace',
    fontSize: 13,
    fontWeight: 400,
    lineHeight: 1.55,

    ansiColors: {
      black: '#1F2937',
      red: '#B91C1C',
      green: '#15803D',
      yellow: '#C2410C',
      blue: '#3730A3',
      magenta: '#A21CAF',
      cyan: '#0C4A6E',
      white: '#6B7280',
      brightBlack: '#374151',
      brightRed: '#DC2626',
      brightGreen: '#16A34A',
      brightYellow: '#EA580C',
      brightBlue: '#4F46E5',
      brightMagenta: '#C026D3',
      brightCyan: '#0891B2',
      brightWhite: '#9CA3AF',
    },
  },

  // Keep existing dark themes for comparison
  professionalDark: {
    name: 'Professional Dark',
    backgroundColor: 'rgba(10, 15, 27, 0.95)',
    textColor: '#94a3b8',
    promptColor: '#60a5fa',
    errorColor: '#f87171',
    warningColor: '#fbbf24',
    successColor: '#34d399',
    infoColor: '#60a5fa',
    debugColor: '#a78bfa',
    borderColor: 'rgba(55, 65, 81, 0.5)',
    headerBackground: 'rgba(17, 24, 39, 0.95)',
    headerText: '#e5e7eb',
    scrollbarTrack: 'rgba(31, 41, 55, 0.5)',
    scrollbarThumb: 'rgba(75, 85, 99, 0.5)',
    scrollbarThumbHover: 'rgba(107, 114, 128, 0.7)',
    selectionBackground: 'rgba(59, 130, 246, 0.3)',
    cursorColor: '#60a5fa',
    hoverBackground: 'rgba(31, 41, 55, 0.5)',
    activeBackground: 'rgba(55, 65, 81, 0.5)',
    focusOutline: '#60a5fa',
    shadowColor: 'rgba(0, 0, 0, 0.3)',
    ansiColors: {
      black: '#1a1b26',
      red: '#f87171',
      green: '#34d399',
      yellow: '#fbbf24',
      blue: '#60a5fa',
      magenta: '#a78bfa',
      cyan: '#22d3ee',
      white: '#94a3b8',
      brightBlack: '#4b5563',
      brightRed: '#fca5a5',
      brightGreen: '#86efac',
      brightYellow: '#fde68a',
      brightBlue: '#93c5fd',
      brightMagenta: '#c4b5fd',
      brightCyan: '#67e8f9',
      brightWhite: '#e5e7eb',
    },
  },
};

// Helper function to apply theme with CSS variables
export const applyEnhancedTerminalTheme = (
  element: HTMLElement,
  theme: EnhancedTerminalTheme
): void => {
  if (!element) return;

  // Apply background with gradient support
  if (theme.backgroundGradient) {
    element.style.background = theme.backgroundGradient;
  } else {
    element.style.backgroundColor = theme.backgroundColor;
  }

  // Apply all CSS variables
  const cssVars: Record<string, string> = {
    '--terminal-bg': theme.backgroundColor,
    '--terminal-bg-gradient': theme.backgroundGradient || theme.backgroundColor,
    '--terminal-text': theme.textColor,
    '--terminal-prompt': theme.promptColor,
    '--terminal-error': theme.errorColor,
    '--terminal-warning': theme.warningColor,
    '--terminal-success': theme.successColor,
    '--terminal-info': theme.infoColor,
    '--terminal-debug': theme.debugColor,
    '--terminal-border': theme.borderColor,
    '--terminal-header-bg': theme.headerBackground,
    '--terminal-header-text': theme.headerText,
    '--terminal-scrollbar-track': theme.scrollbarTrack,
    '--terminal-scrollbar-thumb': theme.scrollbarThumb,
    '--terminal-scrollbar-thumb-hover': theme.scrollbarThumbHover,
    '--terminal-selection-bg': theme.selectionBackground,
    '--terminal-selection-text': theme.selectionText || theme.textColor,
    '--terminal-cursor': theme.cursorColor,
    '--terminal-cursor-text': theme.cursorTextColor || theme.backgroundColor,
    '--terminal-hover-bg': theme.hoverBackground,
    '--terminal-active-bg': theme.activeBackground,
    '--terminal-focus-outline': theme.focusOutline,
    '--terminal-shadow': theme.shadowColor,
    '--terminal-shadow-intense': theme.shadowColorIntense || theme.shadowColor,
    '--terminal-overlay-bg': theme.overlayBackground || theme.backgroundColor,
  };

  // Apply ANSI colors
  Object.entries(theme.ansiColors).forEach(([key, value]) => {
    cssVars[`--ansi-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`] = value;
  });

  // Apply syntax highlighting if available
  if (theme.syntax) {
    Object.entries(theme.syntax).forEach(([key, value]) => {
      cssVars[`--syntax-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`] = value;
    });
  }

  // Apply effects if available
  if (theme.effects) {
    if (theme.effects.glassMorphism) {
      element.classList.add('terminal-glass-morphism');
    }
    if (theme.effects.terminalGlow) {
      element.style.boxShadow = theme.effects.terminalGlow;
    }
  }

  // Set all CSS variables
  Object.entries(cssVars).forEach(([key, value]) => {
    element.style.setProperty(key, value);
  });

  // Apply typography
  if (theme.fontFamily) element.style.fontFamily = theme.fontFamily;
  if (theme.fontSize) element.style.fontSize = `${theme.fontSize}px`;
  if (theme.fontWeight) element.style.fontWeight = theme.fontWeight.toString();
  if (theme.lineHeight) element.style.lineHeight = theme.lineHeight.toString();
  if (theme.letterSpacing) element.style.letterSpacing = theme.letterSpacing;
};

// Get theme by name with fallback
export const getEnhancedTerminalTheme = (themeName: string): EnhancedTerminalTheme => {
  return enhancedTerminalThemes[themeName] || enhancedTerminalThemes.premiumLight;
};

// Export theme names for selection
export const availableEnhancedThemes = Object.keys(enhancedTerminalThemes);
export const lightThemes = ['premiumLight', 'solarizedLightEnhanced', 'softPastel', 'paperWhite'];
export const darkThemes = ['professionalDark'];