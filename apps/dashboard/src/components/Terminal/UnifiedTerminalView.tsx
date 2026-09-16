import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { FixedSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { clsx } from 'clsx';
import { AnsiParser } from '@/utils/ansiParser';

interface TerminalLine {
  content: string;
  type: 'normal' | 'command' | 'status' | 'warning' | 'error' | 'success' | 'info';
  timestamp?: string;
}

interface UnifiedTerminalViewProps {
  lines: TerminalLine[];
  theme?: 'matrix' | 'ocean' | 'dracula' | 'classic' | 'nord';
  className?: string;
  autoScroll?: boolean;
  showLineNumbers?: boolean;
  maxLines?: number;
}

const TERMINAL_THEMES = {
  matrix: {
    bg: 'bg-black',
    text: 'text-green-400',
    command: 'text-green-300',
    status: 'text-green-500',
    warning: 'text-yellow-400',
    error: 'text-red-400',
    success: 'text-green-500',
    info: 'text-cyan-400'
  },
  ocean: {
    bg: 'bg-blue-950',
    text: 'text-blue-100',
    command: 'text-cyan-300',
    status: 'text-blue-300',
    warning: 'text-amber-400',
    error: 'text-red-400',
    success: 'text-emerald-400',
    info: 'text-sky-300'
  },
  dracula: {
    bg: 'bg-[#282a36]',
    text: 'text-[#f8f8f2]',
    command: 'text-[#50fa7b]',
    status: 'text-[#8be9fd]',
    warning: 'text-[#ffb86c]',
    error: 'text-[#ff5555]',
    success: 'text-[#50fa7b]',
    info: 'text-[#bd93f9]'
  },
  classic: {
    bg: 'bg-black',
    text: 'text-gray-300',
    command: 'text-green-400',
    status: 'text-yellow-400',
    warning: 'text-orange-400',
    error: 'text-red-400',
    success: 'text-green-500',
    info: 'text-blue-400'
  },
  nord: {
    bg: 'bg-[#2e3440]',
    text: 'text-[#eceff4]',
    command: 'text-[#a3be8c]',
    status: 'text-[#88c0d0]',
    warning: 'text-[#ebcb8b]',
    error: 'text-[#bf616a]',
    success: 'text-[#a3be8c]',
    info: 'text-[#81a1c1]'
  }
};

export const UnifiedTerminalView: React.FC<UnifiedTerminalViewProps> = ({
  lines,
  theme = 'classic',
  className,
  autoScroll = true,
  showLineNumbers = false,
  maxLines = 10000
}) => {
  const listRef = useRef<List>(null);
  const themeColors = TERMINAL_THEMES[theme];

  // Limit lines to prevent memory issues
  const displayLines = useMemo(() => {
    return lines.slice(-maxLines);
  }, [lines, maxLines]);

  // Auto-scroll to bottom when new lines arrive
  useEffect(() => {
    if (autoScroll && listRef.current && displayLines.length > 0) {
      listRef.current.scrollToItem(displayLines.length - 1, 'end');
    }
  }, [displayLines.length, autoScroll]);

  // Render a single terminal line (optimized with React.memo)
  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const line = displayLines[index];
    if (!line) return null;

    const cleanContent = AnsiParser.cleanTerminalOutput(line.content);
    const colorClass = themeColors[line.type] || themeColors.text;

    return (
      <div
        style={style}
        className={clsx(
          'font-mono text-xs whitespace-pre-wrap leading-relaxed px-4',
          colorClass
        )}
      >
        {showLineNumbers && (
          <span className="text-gray-600 select-none mr-3 inline-block w-12 text-right">
            {index + 1}
          </span>
        )}
        {cleanContent || '\u00A0'}
      </div>
    );
  }, [displayLines, themeColors, showLineNumbers]);

  return (
    <div className={clsx('h-full w-full', themeColors.bg, className)}>
      <AutoSizer>
        {({ height, width }) => (
          <List
            ref={listRef}
            height={height}
            width={width}
            itemCount={displayLines.length}
            itemSize={20} // Height of each line in pixels
            overscanCount={10} // Render 10 extra items for smooth scrolling
          >
            {Row}
          </List>
        )}
      </AutoSizer>
    </div>
  );
};

// Memoized version for performance
export default React.memo(UnifiedTerminalView);
