import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { motion } from 'framer-motion';
import { AnsiParser, stripAnsi } from '@/utils/ansiParser';

interface VirtualizedTerminalProps {
  lines: string[];
  className?: string;
  theme?: 'dark' | 'light' | 'matrix' | 'ocean';
  autoScroll?: boolean;
  maxLines?: number;
}

// Memoized line renderer
const LineRenderer = React.memo<{
  index: number;
  style: React.CSSProperties;
  data: string[]
}>(({ index, style, data }) => {
  const line = data[index];

  // Parse ANSI codes safely
  const parsedContent = useMemo(() => {
    try {
      if (!line || typeof line !== 'string') return '\u00A0';

      // Truncate very long lines
      const truncated = line.length > 5000
        ? line.substring(0, 5000) + '...[truncated]'
        : line;

      return AnsiParser.parseToHtml(truncated);
    } catch {
      return stripAnsi(line) || '\u00A0';
    }
  }, [line]);

  return (
    <div style={style} className="terminal-line px-2 font-mono text-sm">
      <span
        className="block whitespace-pre-wrap break-all"
        dangerouslySetInnerHTML={{ __html: parsedContent }}
      />
    </div>
  );
});

LineRenderer.displayName = 'LineRenderer';

export const VirtualizedTerminal = React.memo<VirtualizedTerminalProps>(({
  lines,
  className = '',
  theme = 'dark',
  autoScroll = true,
  maxLines = 10000
}) => {
  const listRef = useRef<any>(null);
  const prevLinesLength = useRef(lines.length);

  // Limit lines to prevent memory issues
  const limitedLines = useMemo(() => {
    if (lines.length > maxLines) {
      return lines.slice(-maxLines);
    }
    return lines;
  }, [lines, maxLines]);

  // Auto-scroll to bottom when new content is added
  useEffect(() => {
    if (autoScroll && listRef.current && lines.length > prevLinesLength.current) {
      listRef.current.scrollToItem(limitedLines.length - 1, 'end');
    }
    prevLinesLength.current = lines.length;
  }, [lines.length, limitedLines.length, autoScroll]);

  // Theme classes
  const themeClasses = {
    dark: 'bg-gray-900 text-gray-100',
    light: 'bg-white text-gray-900',
    matrix: 'bg-black text-green-400',
    ocean: 'bg-blue-950 text-cyan-300'
  };

  const itemKey = useCallback((index: number, data: string[]) => {
    // Use content hash for better reconciliation
    return `${index}-${data[index]?.substring(0, 50) || ''}`;
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`terminal-container ${themeClasses[theme]} ${className}`}
    >
      <AutoSizer>
        {({ height, width }) => (
          <List
            ref={listRef}
            height={height}
            width={width}
            itemCount={limitedLines.length}
            itemSize={20} // Estimated line height
            itemData={limitedLines}
            itemKey={itemKey}
            overscanCount={10} // Pre-render 10 items outside viewport
            className="scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent"
          >
            {LineRenderer as any}
          </List>
        )}
      </AutoSizer>
    </motion.div>
  );
});

VirtualizedTerminal.displayName = 'VirtualizedTerminal';