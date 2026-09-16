/**
 * VirtualTerminal - High-performance virtual scrolling terminal component
 * Renders only visible lines for smooth 60fps performance even with thousands of lines
 */

import React, { useRef, useEffect, useMemo, useCallback, memo } from 'react';
import { FixedSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { motion } from 'framer-motion';
import { cn } from '@/utils/cn';
import { useCleanupManager } from '@/hooks/useCleanupManager';
import { getEnhancedTerminalTheme, applyEnhancedTerminalTheme } from '@/config/terminalThemesEnhanced';
import '@/styles/enhanced-terminal.css';

interface VirtualTerminalProps {
  lines: string[];
  className?: string;
  lineHeight?: number;
  fontFamily?: string;
  fontSize?: number;
  theme?: 'dark' | 'light' | 'matrix' | 'dracula' | 'ocean' | 'premiumLight' | 'softPastel' | 'paperWhite' | 'solarizedLightEnhanced';
  showLineNumbers?: boolean;
  wrapLines?: boolean;
  maxLines?: number;
  autoScroll?: boolean;
  searchTerm?: string;
  onLineClick?: (lineIndex: number, content: string) => void;
}

interface LineRendererProps {
  index: number;
  style: React.CSSProperties;
  data: {
    lines: string[];
    showLineNumbers: boolean;
    searchTerm?: string;
    theme: string;
    onLineClick?: (index: number, content: string) => void;
  };
}

// Memoized line renderer for optimal performance
const LineRenderer = memo<LineRendererProps>(({ index, style, data }) => {
  const { lines, showLineNumbers, searchTerm, theme, onLineClick } = data;
  const line = lines[index] || '';

  // Highlight search terms if present
  // PERFORMANCE FIX: Escape special regex characters to prevent errors and improve safety
  const highlightedLine = useMemo(() => {
    if (!searchTerm || !line) return line;

    // Escape special regex characters to prevent ReDoS and syntax errors
    const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedSearchTerm})`, 'gi');
    const parts = line.split(regex);

    return parts.map((part, i) => {
      if (part.toLowerCase() === searchTerm.toLowerCase()) {
        return (
          <mark key={i} className="bg-yellow-300 dark:bg-yellow-600 text-black dark:text-white">
            {part}
          </mark>
        );
      }
      return part;
    });
  }, [line, searchTerm]);

  const handleClick = useCallback(() => {
    if (onLineClick) {
      onLineClick(index, line);
    }
  }, [index, line, onLineClick]);

  return (
    <div
      style={style}
      className={cn(
        'flex items-center font-mono px-4 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-text',
        'transition-colors duration-75',
        theme === 'matrix' && 'text-green-400',
        theme === 'dracula' && 'text-purple-300',
        theme === 'ocean' && 'text-cyan-400'
      )}
      onClick={handleClick}
    >
      {showLineNumbers && (
        <span className="inline-block w-12 text-gray-500 dark:text-gray-600 select-none mr-4 text-right">
          {index + 1}
        </span>
      )}
      <span className="flex-1 whitespace-pre-wrap break-all">
        {searchTerm ? highlightedLine : line}
      </span>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for better performance
  return (
    prevProps.index === nextProps.index &&
    prevProps.data.lines[prevProps.index] === nextProps.data.lines[nextProps.index] &&
    prevProps.data.searchTerm === nextProps.data.searchTerm &&
    prevProps.data.showLineNumbers === nextProps.data.showLineNumbers &&
    prevProps.data.theme === nextProps.data.theme
  );
});

LineRenderer.displayName = 'LineRenderer';

export const VirtualTerminal: React.FC<VirtualTerminalProps> = memo(({
  lines,
  className,
  lineHeight = 20,
  fontFamily = 'SF Mono, Monaco, Inconsolata, Fira Code, monospace',
  fontSize = 13,
  theme = 'dark',
  showLineNumbers = false,
  wrapLines = false,
  maxLines = 10000,
  autoScroll = true,
  searchTerm,
  onLineClick,
}) => {
  const listRef = useRef<List>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cleanup = useCleanupManager({ componentName: 'VirtualTerminal' });

  // Limit lines to prevent memory issues
  const processedLines = useMemo(() => {
    if (lines.length > maxLines) {
      // Keep the most recent lines
      return lines.slice(-maxLines);
    }
    return lines;
  }, [lines, maxLines]);

  // Auto-scroll to bottom when new lines are added
  useEffect(() => {
    if (autoScroll && listRef.current && processedLines.length > 0) {
      // Small delay to ensure list is rendered
      const timer = cleanup.setTimeout(() => {
        listRef.current?.scrollToItem(processedLines.length - 1, 'end');
      }, 50);
    }
  }, [processedLines.length, autoScroll, cleanup]);

  // Calculate dynamic line height based on wrap setting
  const getItemSize = useCallback((index: number) => {
    if (!wrapLines) return lineHeight;

    // Estimate wrapped line height based on character count
    const line = processedLines[index];
    if (!line) return lineHeight;

    // Rough estimation: 80 chars per line on average
    const estimatedLines = Math.ceil(line.length / 80);
    return lineHeight * Math.max(1, estimatedLines);
  }, [processedLines, lineHeight, wrapLines]);

  // Memoized item data to prevent unnecessary re-renders
  const itemData = useMemo(() => ({
    lines: processedLines,
    showLineNumbers,
    searchTerm,
    theme,
    onLineClick,
  }), [processedLines, showLineNumbers, searchTerm, theme, onLineClick]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!listRef.current) return;

      // Ctrl/Cmd + Home - scroll to top
      if ((e.ctrlKey || e.metaKey) && e.key === 'Home') {
        e.preventDefault();
        listRef.current.scrollToItem(0, 'start');
      }

      // Ctrl/Cmd + End - scroll to bottom
      if ((e.ctrlKey || e.metaKey) && e.key === 'End') {
        e.preventDefault();
        listRef.current.scrollToItem(processedLines.length - 1, 'end');
      }
    };

    cleanup.addEventListener(window, 'keydown', handleKeyDown);
  }, [processedLines.length, cleanup]);

  // Apply enhanced theme if available
  useEffect(() => {
    if (containerRef.current && ['premiumLight', 'softPastel', 'paperWhite', 'solarizedLightEnhanced'].includes(theme)) {
      const enhancedTheme = getEnhancedTerminalTheme(theme);
      applyEnhancedTerminalTheme(containerRef.current, enhancedTheme);
    }
  }, [theme]);

  const getThemeClasses = () => {
    // Check if it's an enhanced theme
    if (['premiumLight', 'softPastel', 'paperWhite', 'solarizedLightEnhanced'].includes(theme)) {
      return 'enhanced-light-terminal terminal-theme-' + theme;
    }

    // Original theme classes
    switch (theme) {
      case 'matrix':
        return 'bg-black text-green-400';
      case 'dracula':
        return 'bg-gray-900 text-purple-300';
      case 'ocean':
        return 'bg-blue-950 text-cyan-400';
      case 'light':
        return 'bg-white text-gray-900';
      default:
        return 'bg-gray-900 text-gray-100';
    }
  };

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'relative w-full h-full rounded-lg overflow-hidden',
        getThemeClasses(),
        className
      )}
      style={{ fontFamily }}
    >
      {processedLines.length === 0 ? (
        <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-600">
          <p>No output yet...</p>
        </div>
      ) : (
        <AutoSizer>
          {({ height, width }) => (
            <List
              ref={listRef}
              height={height}
              width={width}
              itemCount={processedLines.length}
              itemSize={wrapLines ? getItemSize : lineHeight}
              itemData={itemData}
              overscanCount={5}
              className="scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent"
              style={{ fontSize }}
            >
              {LineRenderer}
            </List>
          )}
        </AutoSizer>
      )}

      {/* Performance indicator */}
      {processedLines.length > 5000 && (
        <div className="absolute top-2 right-2 px-2 py-1 bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 text-xs rounded">
          {processedLines.length.toLocaleString()} lines (virtualized)
        </div>
      )}
    </motion.div>
  );
});

VirtualTerminal.displayName = 'VirtualTerminal';

/**
 * Hook for managing terminal output with performance optimizations
 */
export function useVirtualTerminal(maxLines: number = 10000) {
  const linesRef = useRef<string[]>([]);
  const [lines, setLines] = React.useState<string[]>([]);
  const cleanup = useCleanupManager({ componentName: 'useVirtualTerminal' });

  const addLine = useCallback((line: string) => {
    linesRef.current = [...linesRef.current, line];

    // Trim old lines to prevent memory issues
    if (linesRef.current.length > maxLines) {
      linesRef.current = linesRef.current.slice(-maxLines);
    }

    setLines([...linesRef.current]);
  }, [maxLines]);

  const addLines = useCallback((newLines: string[]) => {
    linesRef.current = [...linesRef.current, ...newLines];

    // Trim old lines to prevent memory issues
    if (linesRef.current.length > maxLines) {
      linesRef.current = linesRef.current.slice(-maxLines);
    }

    setLines([...linesRef.current]);
  }, [maxLines]);

  const clearLines = useCallback(() => {
    linesRef.current = [];
    setLines([]);
  }, []);

  const searchInLines = useCallback((term: string): number[] => {
    if (!term) return [];

    const matches: number[] = [];
    const searchLower = term.toLowerCase();

    linesRef.current.forEach((line, index) => {
      if (line.toLowerCase().includes(searchLower)) {
        matches.push(index);
      }
    });

    return matches;
  }, []);

  return {
    lines,
    addLine,
    addLines,
    clearLines,
    searchInLines,
  };
}