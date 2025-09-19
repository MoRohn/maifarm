import { useState, useEffect, useCallback, useRef } from 'react';
import { debounce } from 'lodash';

interface ResponsiveTerminalConfig {
  minHeight?: string;
  maxHeight?: string;
  optimalHeight?: string;
  fontSize?: string;
  padding?: string;
  gap?: string;
}

interface ResponsiveTerminalState {
  containerHeight: string;
  fontSize: string;
  padding: string;
  gap: string;
  columns: number;
  isCompact: boolean;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  viewportHeight: number;
  viewportWidth: number;
}

export const useResponsiveTerminal = (config?: ResponsiveTerminalConfig) => {
  const [state, setState] = useState<ResponsiveTerminalState>(() => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
    
    return {
      containerHeight: calculateContainerHeight(vh),
      fontSize: calculateFontSize(vw),
      padding: calculatePadding(vw),
      gap: calculateGap(vw),
      columns: calculateColumns(vw),
      isCompact: vw < 640,
      isMobile: vw < 768,
      isTablet: vw >= 768 && vw < 1024,
      isDesktop: vw >= 1024,
      viewportHeight: vh,
      viewportWidth: vw,
    };
  });

  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate optimal container height based on viewport
  function calculateContainerHeight(vh: number): string {
    if (vh < 600) return 'clamp(150px, 30vh, 250px)';
    if (vh < 800) return 'clamp(200px, 35vh, 350px)';
    if (vh < 1000) return 'clamp(250px, 40vh, 450px)';
    return 'clamp(300px, 45vh, 550px)';
  }

  // Calculate responsive font size
  function calculateFontSize(vw: number): string {
    if (vw < 640) return '0.65rem';
    if (vw < 768) return '0.7rem';
    if (vw < 1024) return '0.75rem';
    if (vw < 1440) return '0.8rem';
    return '0.875rem';
  }

  // Calculate responsive padding
  function calculatePadding(vw: number): string {
    if (vw < 640) return '0.5rem';
    if (vw < 768) return '0.75rem';
    if (vw < 1024) return '1rem';
    return '1.25rem';
  }

  // Calculate responsive gap
  function calculateGap(vw: number): string {
    if (vw < 640) return '0.5rem';
    if (vw < 768) return '0.75rem';
    if (vw < 1024) return '1rem';
    return '1.5rem';
  }

  // Calculate grid columns based on viewport and agent count
  function calculateColumns(vw: number, agentCount?: number): number {
    if (vw < 640) return 1;
    if (vw < 768) return Math.min(2, agentCount || 2);
    if (vw < 1024) return Math.min(2, agentCount || 2);
    if (vw < 1440) return Math.min(3, agentCount || 3);
    return Math.min(4, agentCount || 4);
  }

  // Handle resize events
  const handleResize = useCallback(() => {
    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current);
    }

    resizeTimeoutRef.current = setTimeout(() => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      setState({
        containerHeight: config?.optimalHeight || calculateContainerHeight(vh),
        fontSize: config?.fontSize || calculateFontSize(vw),
        padding: config?.padding || calculatePadding(vw),
        gap: config?.gap || calculateGap(vw),
        columns: calculateColumns(vw),
        isCompact: vw < 640,
        isMobile: vw < 768,
        isTablet: vw >= 768 && vw < 1024,
        isDesktop: vw >= 1024,
        viewportHeight: vh,
        viewportWidth: vw,
      });
    }, 150); // Debounce resize events
  }, [config]);

  // Setup resize observer for container
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        // Adjust terminal layout based on container size
        if (width < 400) {
          setState(prev => ({ ...prev, isCompact: true }));
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Setup window resize listener
  useEffect(() => {
    const debouncedResize = debounce(handleResize, 150);
    
    window.addEventListener('resize', debouncedResize);
    // Initial calculation
    handleResize();

    return () => {
      window.removeEventListener('resize', debouncedResize);
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, [handleResize]);

  // Calculate optimal grid layout for agent count
  const getGridLayout = useCallback((agentCount: number) => {
    const { viewportWidth } = state;
    
    if (agentCount <= 1) return 'grid-cols-1';
    
    if (viewportWidth < 640) {
      return 'grid-cols-1';
    } else if (viewportWidth < 768) {
      return agentCount <= 2 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2';
    } else if (viewportWidth < 1024) {
      if (agentCount <= 2) return 'grid-cols-1 md:grid-cols-2';
      if (agentCount <= 4) return 'grid-cols-2';
      return 'grid-cols-2 md:grid-cols-3';
    } else if (viewportWidth < 1440) {
      if (agentCount <= 2) return 'grid-cols-1 lg:grid-cols-2';
      if (agentCount <= 4) return 'grid-cols-2 lg:grid-cols-2';
      if (agentCount <= 6) return 'grid-cols-2 lg:grid-cols-3';
      return 'grid-cols-3';
    } else {
      if (agentCount <= 2) return 'grid-cols-1 xl:grid-cols-2';
      if (agentCount <= 4) return 'grid-cols-2 xl:grid-cols-2';
      if (agentCount <= 6) return 'grid-cols-2 xl:grid-cols-3';
      if (agentCount <= 9) return 'grid-cols-3 xl:grid-cols-3';
      return 'grid-cols-3 xl:grid-cols-4';
    }
  }, [state.viewportWidth]);

  // Calculate terminal pane height based on grid layout
  const getTerminalHeight = useCallback((agentCount: number, isExpanded: boolean = false) => {
    const { viewportHeight, isMobile } = state;
    
    if (isExpanded) {
      return isMobile ? 'calc(80vh - 4rem)' : 'calc(90vh - 6rem)';
    }
    
    if (agentCount <= 2) {
      return `clamp(250px, ${40}vh, 500px)`;
    } else if (agentCount <= 4) {
      return `clamp(200px, ${35}vh, 400px)`;
    } else if (agentCount <= 6) {
      return `clamp(180px, ${30}vh, 350px)`;
    } else {
      return `clamp(150px, ${25}vh, 300px)`;
    }
  }, [state.viewportHeight, state.isMobile]);

  // Get responsive styles for terminal container
  const getContainerStyles = useCallback(() => ({
    height: state.containerHeight,
    fontSize: state.fontSize,
    padding: state.padding,
    gap: state.gap,
    '--terminal-font-size': state.fontSize,
    '--terminal-padding': state.padding,
    '--terminal-gap': state.gap,
  } as React.CSSProperties), [state]);

  // Get responsive classes for terminal elements
  const getResponsiveClasses = useCallback((element: 'container' | 'grid' | 'pane' | 'output') => {
    const classes: string[] = [];
    
    switch (element) {
      case 'container':
        classes.push('terminal-container-responsive');
        if (state.isCompact) classes.push('terminal-compact');
        if (state.isMobile) classes.push('terminal-mobile');
        if (state.isTablet) classes.push('terminal-tablet');
        if (state.isDesktop) classes.push('terminal-desktop');
        break;
      
      case 'grid':
        classes.push('terminal-grid-responsive');
        break;
      
      case 'pane':
        classes.push('terminal-pane-responsive');
        if (state.isCompact) classes.push('terminal-pane-compact');
        break;
      
      case 'output':
        classes.push('terminal-output-responsive');
        if (state.isCompact) classes.push('text-xs');
        else if (state.isMobile) classes.push('text-sm');
        else classes.push('text-base');
        break;
    }
    
    return classes.join(' ');
  }, [state]);

  return {
    state,
    containerRef,
    getGridLayout,
    getTerminalHeight,
    getContainerStyles,
    getResponsiveClasses,
    isCompact: state.isCompact,
    isMobile: state.isMobile,
    isTablet: state.isTablet,
    isDesktop: state.isDesktop,
  };
};