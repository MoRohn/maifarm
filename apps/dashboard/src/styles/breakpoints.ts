export const breakpoints = {
  xs: 320,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,  // FIXED: Match Tailwind config (was 1200)
  '2xl': 1536,
  '3xl': 1920,  // Full HD / standard desktop
  '4xl': 2560,  // WQHD / 27" iMac Retina
  '5xl': 3840,  // 4K displays
  '6xl': 5120,  // 5K iMac / UltraWide displays
} as const;

export type Breakpoint = keyof typeof breakpoints;

export const mediaQueries = {
  xs: `(min-width: ${breakpoints.xs}px)`,
  sm: `(min-width: ${breakpoints.sm}px)`,
  md: `(min-width: ${breakpoints.md}px)`,
  lg: `(min-width: ${breakpoints.lg}px)`,
  xl: `(min-width: ${breakpoints.xl}px)`,
  '2xl': `(min-width: ${breakpoints['2xl']}px)`,
  '3xl': `(min-width: ${breakpoints['3xl']}px)`,
  '4xl': `(min-width: ${breakpoints['4xl']}px)`,
  '5xl': `(min-width: ${breakpoints['5xl']}px)`,
  '6xl': `(min-width: ${breakpoints['6xl']}px)`,

  // Special queries
  mobile: `(max-width: ${breakpoints.md - 1}px)`,
  tablet: `(min-width: ${breakpoints.md}px) and (max-width: ${breakpoints.lg - 1}px)`,
  desktop: `(min-width: ${breakpoints.lg}px)`,
  largeDesktop: `(min-width: ${breakpoints['3xl']}px)`,
  ultraWide: `(min-width: ${breakpoints['4xl']}px)`,

  // Feature queries
  hover: '(hover: hover)',
  touch: '(hover: none) and (pointer: coarse)',
  reducedMotion: '(prefers-reduced-motion: reduce)',
  highContrast: '(prefers-contrast: high)',
  darkMode: '(prefers-color-scheme: dark)',
} as const;

export type MediaQuery = keyof typeof mediaQueries;

export const getBreakpointValue = (breakpoint: Breakpoint): number => {
  return breakpoints[breakpoint];
};

export const getCurrentBreakpoint = (width: number): Breakpoint => {
  const entries = Object.entries(breakpoints).reverse();
  
  for (const [key, value] of entries) {
    if (width >= value) {
      return key as Breakpoint;
    }
  }
  
  return 'xs';
};