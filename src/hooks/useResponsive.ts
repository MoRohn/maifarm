import { useState, useEffect, useCallback } from 'react';
import { breakpoints, getCurrentBreakpoint, type Breakpoint } from '../styles/breakpoints';

interface ResponsiveState {
  width: number;
  height: number;
  breakpoint: Breakpoint;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTouch: boolean;
  orientation: 'portrait' | 'landscape';
}

export const useResponsive = (): ResponsiveState => {
  const [state, setState] = useState<ResponsiveState>(() => {
    if (typeof window === 'undefined') {
      return {
        width: 1200,
        height: 800,
        breakpoint: 'xl',
        isMobile: false,
        isTablet: false,
        isDesktop: true,
        isTouch: false,
        orientation: 'landscape',
      };
    }

    const width = window.innerWidth;
    const height = window.innerHeight;
    const breakpoint = getCurrentBreakpoint(width);

    return {
      width,
      height,
      breakpoint,
      isMobile: width < breakpoints.md,
      isTablet: width >= breakpoints.md && width < breakpoints.lg,
      isDesktop: width >= breakpoints.lg,
      isTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      orientation: width > height ? 'landscape' : 'portrait',
    };
  });

  const handleResize = useCallback(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const breakpoint = getCurrentBreakpoint(width);

    setState({
      width,
      height,
      breakpoint,
      isMobile: width < breakpoints.md,
      isTablet: width >= breakpoints.md && width < breakpoints.lg,
      isDesktop: width >= breakpoints.lg,
      isTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      orientation: width > height ? 'landscape' : 'portrait',
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Initial measurement
    handleResize();

    // Debounced resize handler
    let timeoutId: ReturnType<typeof setTimeout>;
    const debouncedResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(handleResize, 150);
    };

    window.addEventListener('resize', debouncedResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', debouncedResize);
      window.removeEventListener('orientationchange', handleResize);
      clearTimeout(timeoutId);
    };
  }, [handleResize]);

  return state;
};

// Hook for conditional rendering based on breakpoints
export const useBreakpoint = (breakpoint: Breakpoint): boolean => {
  const { width } = useResponsive();
  return width >= breakpoints[breakpoint];
};

// Hook for media query matching
export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handler);
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(handler);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handler);
      } else {
        mediaQuery.removeListener(handler);
      }
    };
  }, [query]);

  return matches;
};