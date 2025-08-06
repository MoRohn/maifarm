export const breakpoints = {
  xs: 320,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1200,
  '2xl': 1536,
} as const;

export type Breakpoint = keyof typeof breakpoints;

export const mediaQueries = {
  xs: `(min-width: ${breakpoints.xs}px)`,
  sm: `(min-width: ${breakpoints.sm}px)`,
  md: `(min-width: ${breakpoints.md}px)`,
  lg: `(min-width: ${breakpoints.lg}px)`,
  xl: `(min-width: ${breakpoints.xl}px)`,
  '2xl': `(min-width: ${breakpoints['2xl']}px)`,
  
  // Special queries
  mobile: `(max-width: ${breakpoints.md - 1}px)`,
  tablet: `(min-width: ${breakpoints.md}px) and (max-width: ${breakpoints.lg - 1}px)`,
  desktop: `(min-width: ${breakpoints.lg}px)`,
  
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