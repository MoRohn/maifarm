import { clsx, type ClassValue } from 'clsx';

/**
 * Terminal sizing utilities for responsive design
 */
export const terminalSizing = {
  // Height calculations based on viewport and content
  getHeight: (agentCount: number, isExpanded: boolean, isMobile: boolean): string => {
    if (isExpanded) {
      return isMobile ? 'calc(100vh - 6rem)' : 'calc(100vh - 4rem)';
    }
    
    // Dynamic height based on agent count
    if (agentCount <= 2) {
      return 'clamp(300px, 45vh, 500px)';
    } else if (agentCount <= 4) {
      return 'clamp(250px, 40vh, 400px)';
    } else if (agentCount <= 6) {
      return 'clamp(200px, 35vh, 350px)';
    } else {
      return 'clamp(180px, 30vh, 300px)';
    }
  },
  
  // Grid columns based on viewport and agent count
  getGridColumns: (agentCount: number, viewportWidth: number): string => {
    if (viewportWidth < 640) {
      return '1fr';
    } else if (viewportWidth < 768) {
      return agentCount <= 2 ? '1fr' : 'repeat(2, 1fr)';
    } else if (viewportWidth < 1024) {
      if (agentCount <= 2) return 'repeat(2, 1fr)';
      if (agentCount <= 4) return 'repeat(2, 1fr)';
      return 'repeat(3, 1fr)';
    } else if (viewportWidth < 1440) {
      if (agentCount <= 2) return 'repeat(2, 1fr)';
      if (agentCount <= 4) return 'repeat(2, 1fr)';
      if (agentCount <= 6) return 'repeat(3, 1fr)';
      return 'repeat(3, 1fr)';
    } else {
      if (agentCount <= 2) return 'repeat(2, 1fr)';
      if (agentCount <= 4) return 'repeat(2, 1fr)';
      if (agentCount <= 6) return 'repeat(3, 1fr)';
      if (agentCount <= 9) return 'repeat(3, 1fr)';
      return 'repeat(4, 1fr)';
    }
  },
  
  // Font size based on viewport
  getFontSize: (viewportWidth: number): string => {
    if (viewportWidth < 640) return '0.625rem'; // 10px
    if (viewportWidth < 768) return '0.6875rem'; // 11px
    if (viewportWidth < 1024) return '0.75rem'; // 12px
    if (viewportWidth < 1440) return '0.8125rem'; // 13px
    return '0.875rem'; // 14px
  },
  
  // Padding based on viewport
  getPadding: (viewportWidth: number): string => {
    if (viewportWidth < 640) return '0.5rem';
    if (viewportWidth < 768) return '0.75rem';
    if (viewportWidth < 1024) return '1rem';
    return '1.25rem';
  },
};

/**
 * Terminal class name builders
 */
export const terminalClasses = {
  container: (isFullscreen: boolean, isCompact: boolean, className?: string) => 
    clsx(
      'terminal-container-responsive',
      'flex flex-col h-full min-h-0',
      'bg-gray-900 rounded-lg shadow-xl',
      isFullscreen && 'fixed inset-0 z-50',
      isCompact && 'terminal-compact',
      className
    ),
  
  grid: (columns: number, isCompact: boolean) =>
    clsx(
      'terminal-grid-responsive',
      'grid gap-2 sm:gap-3 md:gap-4',
      'p-2 sm:p-3 md:p-4',
      'overflow-auto min-h-0',
      'auto-rows-fr',
      columns === 1 && 'grid-cols-1',
      columns === 2 && 'grid-cols-1 md:grid-cols-2',
      columns === 3 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
      columns === 4 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
      isCompact && 'gap-2 p-2'
    ),
  
  pane: (isExpanded: boolean, isActive: boolean) =>
    clsx(
      'terminal-pane-responsive',
      'flex flex-col',
      'bg-gray-900 rounded-lg border overflow-hidden',
      'transition-all duration-300',
      isActive ? 'border-blue-500' : 'border-gray-700',
      isExpanded && 'terminal-pane-expanded'
    ),
  
  output: (theme: string = 'dark', isCompact: boolean = false) =>
    clsx(
      'terminal-output-responsive',
      'flex-1 overflow-y-auto overflow-x-hidden',
      'font-mono scroll-smooth',
      'p-2 sm:p-3 md:p-4',
      'min-h-0',
      theme === 'dark' && 'bg-black text-gray-300',
      theme === 'light' && 'bg-white text-gray-700',
      theme === 'matrix' && 'bg-black text-green-400',
      isCompact && 'text-xs p-2'
    ),
  
  line: (type?: 'error' | 'warning' | 'success' | 'info' | 'command') =>
    clsx(
      'terminal-line',
      'whitespace-pre-wrap break-words leading-relaxed',
      'overflow-hidden px-1 -mx-1 rounded',
      'transition-colors hover:bg-white/5',
      type === 'error' && 'text-red-400',
      type === 'warning' && 'text-yellow-400',
      type === 'success' && 'text-green-400',
      type === 'info' && 'text-blue-400',
      type === 'command' && 'text-purple-400 font-semibold'
    ),
};

/**
 * Terminal style utilities
 */
export const terminalStyles = {
  // Get responsive container styles
  containerStyle: (isFullscreen: boolean, height?: string) => ({
    height: isFullscreen ? '100vh' : (height || '100%'),
    maxHeight: isFullscreen ? 'none' : '100%',
    minHeight: isFullscreen ? '100vh' : '400px',
  }),
  
  // Get responsive output styles
  outputStyle: (isExpanded: boolean, agentCount: number) => ({
    minHeight: isExpanded ? 'calc(100vh - 12rem)' : '200px',
    maxHeight: isExpanded ? 'calc(100vh - 8rem)' : terminalSizing.getHeight(agentCount, false, false),
    wordBreak: 'break-word' as const,
    overflowWrap: 'anywhere' as const,
    scrollBehavior: 'smooth' as const,
    fontFamily: "'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', 'Consolas', monospace",
  }),
  
  // Get scrollbar styles for different themes
  scrollbarStyle: (theme: string = 'dark') => {
    const styles: Record<string, { track: string; thumb: string }> = {
      dark: {
        track: '#1f2937',
        thumb: '#4b5563',
      },
      light: {
        track: '#f3f4f6',
        thumb: '#d1d5db',
      },
      matrix: {
        track: '#001100',
        thumb: '#00ff00',
      },
    };
    
    return {
      scrollbarWidth: 'thin' as const,
      scrollbarColor: `${styles[theme]?.thumb || styles.dark.thumb} ${styles[theme]?.track || styles.dark.track}`,
    };
  },
};

/**
 * Get viewport info for responsive calculations
 */
export const getViewportInfo = () => {
  if (typeof window === 'undefined') {
    return {
      width: 1024,
      height: 768,
      isMobile: false,
      isTablet: false,
      isDesktop: true,
      isCompact: false,
    };
  }
  
  const width = window.innerWidth;
  const height = window.innerHeight;
  
  return {
    width,
    height,
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1024,
    isDesktop: width >= 1024,
    isCompact: width < 640,
  };
};

/**
 * Calculate optimal terminal layout
 */
export const calculateTerminalLayout = (
  agentCount: number,
  containerWidth: number,
  containerHeight: number
) => {
  const viewport = getViewportInfo();
  
  // Calculate grid dimensions
  let columns = 1;
  let rows = agentCount;
  
  if (viewport.isDesktop) {
    if (agentCount <= 2) {
      columns = 2;
      rows = 1;
    } else if (agentCount <= 4) {
      columns = 2;
      rows = 2;
    } else if (agentCount <= 6) {
      columns = 3;
      rows = 2;
    } else if (agentCount <= 9) {
      columns = 3;
      rows = 3;
    } else {
      columns = 4;
      rows = Math.ceil(agentCount / 4);
    }
  } else if (viewport.isTablet) {
    if (agentCount <= 2) {
      columns = 2;
      rows = 1;
    } else if (agentCount <= 4) {
      columns = 2;
      rows = 2;
    } else {
      columns = 2;
      rows = Math.ceil(agentCount / 2);
    }
  } else {
    columns = 1;
    rows = agentCount;
  }
  
  // Calculate individual terminal dimensions
  const gap = viewport.isCompact ? 8 : viewport.isMobile ? 12 : 16;
  const padding = viewport.isCompact ? 8 : viewport.isMobile ? 12 : 16;
  
  const availableWidth = containerWidth - (padding * 2) - (gap * (columns - 1));
  const availableHeight = containerHeight - (padding * 2) - (gap * (rows - 1));
  
  const terminalWidth = Math.floor(availableWidth / columns);
  const terminalHeight = Math.floor(availableHeight / rows);
  
  return {
    columns,
    rows,
    terminalWidth,
    terminalHeight,
    gap,
    padding,
    gridTemplateColumns: terminalSizing.getGridColumns(agentCount, viewport.width),
    fontSize: terminalSizing.getFontSize(viewport.width),
  };
};