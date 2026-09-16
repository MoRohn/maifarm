/**
 * Enhanced Light Terminal Component
 *
 * Premium terminal component with professional light mode themes
 * featuring WCAG AAA compliance, modern design patterns, and
 * exceptional user experience optimizations.
 */

import React, { useRef, useEffect, useState, useMemo, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Terminal,
  Sun,
  Moon,
  Palette,
  ZoomIn,
  ZoomOut,
  Copy,
  Download,
  Search,
  Settings,
  Eye,
  EyeOff,
  Maximize2,
  RefreshCw
} from 'lucide-react';
import { cn } from '@/utils/cn';
import {
  enhancedTerminalThemes,
  applyEnhancedTerminalTheme,
  getEnhancedTerminalTheme,
  lightThemes,
  type EnhancedTerminalTheme
} from '@/config/terminalThemesEnhanced';

interface EnhancedLightTerminalProps {
  sessionId: string;
  agentId?: number;
  agentName?: string;
  lines?: string[];
  className?: string;
  defaultTheme?: string;
  showControls?: boolean;
  autoScroll?: boolean;
  enableSearch?: boolean;
  onThemeChange?: (theme: string) => void;
}

interface ProcessedLine {
  id: string;
  content: string;
  type: 'command' | 'output' | 'error' | 'warning' | 'info' | 'success' | 'debug';
  timestamp: number;
  lineNumber: number;
}

// Line type detection with improved patterns
const detectLineType = (content: string): ProcessedLine['type'] => {
  const lowerContent = content.toLowerCase();

  if (lowerContent.includes('error') || lowerContent.includes('failed') || lowerContent.includes('exception')) {
    return 'error';
  }
  if (lowerContent.includes('warning') || lowerContent.includes('warn')) {
    return 'warning';
  }
  if (lowerContent.includes('success') || lowerContent.includes('complete') || lowerContent.includes('done')) {
    return 'success';
  }
  if (lowerContent.includes('info') || lowerContent.includes('note')) {
    return 'info';
  }
  if (lowerContent.includes('debug') || lowerContent.includes('trace')) {
    return 'debug';
  }
  if (content.startsWith('$') || content.startsWith('>') || content.startsWith('#')) {
    return 'command';
  }
  return 'output';
};

// Enhanced line renderer with syntax highlighting
const EnhancedLineRenderer = memo<{
  line: ProcessedLine;
  theme: EnhancedTerminalTheme;
  isHighlighted: boolean;
  showLineNumbers: boolean;
  searchTerm?: string;
}>(({ line, theme, isHighlighted, showLineNumbers, searchTerm }) => {
  // Highlight search terms
  const highlightedContent = useMemo(() => {
    if (!searchTerm || !line.content.includes(searchTerm)) {
      return line.content;
    }

    const parts = line.content.split(new RegExp(`(${searchTerm})`, 'gi'));
    return parts.map((part, i) => {
      if (part.toLowerCase() === searchTerm.toLowerCase()) {
        return (
          <mark
            key={i}
            className="search-highlight"
            style={{
              backgroundColor: 'rgba(251, 191, 36, 0.3)',
              color: 'inherit',
              borderRadius: '2px',
              padding: '0 2px',
              boxShadow: '0 0 0 1px rgba(251, 191, 36, 0.2)',
            }}
          >
            {part}
          </mark>
        );
      }
      return part;
    });
  }, [line.content, searchTerm]);

  // Get color based on line type
  const getLineColor = () => {
    switch (line.type) {
      case 'error': return theme.errorColor;
      case 'warning': return theme.warningColor;
      case 'success': return theme.successColor;
      case 'info': return theme.infoColor;
      case 'debug': return theme.debugColor;
      case 'command': return theme.promptColor;
      default: return theme.textColor;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className={cn(
        'terminal-line flex items-start group',
        'hover:bg-opacity-50 transition-all duration-150',
        isHighlighted && 'highlighted-line'
      )}
      style={{
        backgroundColor: isHighlighted ? theme.activeBackground : 'transparent',
        paddingLeft: '1rem',
        paddingRight: '1rem',
        paddingTop: '0.125rem',
        paddingBottom: '0.125rem',
        borderLeft: line.type === 'command' ? `3px solid ${theme.promptColor}` : '3px solid transparent',
      }}
    >
      {showLineNumbers && (
        <span
          className="line-number select-none mr-4 opacity-50 text-xs"
          style={{
            color: theme.textColor,
            minWidth: '3ch',
            textAlign: 'right',
            fontWeight: 300,
          }}
        >
          {line.lineNumber}
        </span>
      )}

      {/* Line type indicator */}
      {line.type !== 'output' && (
        <span
          className="line-type-indicator mr-2 text-xs font-medium uppercase tracking-wider opacity-60"
          style={{ color: getLineColor() }}
        >
          {line.type === 'command' && '›'}
          {line.type === 'error' && '✕'}
          {line.type === 'warning' && '⚠'}
          {line.type === 'success' && '✓'}
          {line.type === 'info' && 'ℹ'}
          {line.type === 'debug' && '⋯'}
        </span>
      )}

      <span
        className="line-content flex-1 whitespace-pre-wrap break-all"
        style={{
          color: getLineColor(),
          fontWeight: line.type === 'command' ? theme.fontWeight || 500 : theme.fontWeight || 400,
        }}
      >
        {searchTerm ? highlightedContent : line.content}
      </span>

      {/* Timestamp on hover */}
      <span
        className="line-timestamp ml-4 text-xs opacity-0 group-hover:opacity-40 transition-opacity"
        style={{ color: theme.textColor }}
      >
        {new Date(line.timestamp).toLocaleTimeString()}
      </span>
    </motion.div>
  );
});

EnhancedLineRenderer.displayName = 'EnhancedLineRenderer';

export const EnhancedLightTerminal: React.FC<EnhancedLightTerminalProps> = memo(({
  sessionId,
  agentId,
  agentName = agentId ? `Agent ${agentId}` : 'Terminal',
  lines = [],
  className,
  defaultTheme = 'premiumLight',
  showControls = true,
  autoScroll = true,
  enableSearch = true,
  onThemeChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // State
  const [currentTheme, setCurrentTheme] = useState(defaultTheme);
  const [fontSize, setFontSize] = useState(14);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [highlightedLine, setHighlightedLine] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showThemeSelector, setShowThemeSelector] = useState(false);

  // Get current theme object
  const theme = useMemo(() => getEnhancedTerminalTheme(currentTheme), [currentTheme]);

  // Process lines with metadata
  const processedLines = useMemo<ProcessedLine[]>(() => {
    return lines.map((content, index) => ({
      id: `line-${index}-${Date.now()}`,
      content,
      type: detectLineType(content),
      timestamp: Date.now(),
      lineNumber: index + 1,
    }));
  }, [lines]);

  // Apply theme to container
  useEffect(() => {
    if (containerRef.current) {
      applyEnhancedTerminalTheme(containerRef.current, theme);
    }
  }, [theme]);

  // Auto-scroll functionality
  useEffect(() => {
    if (autoScroll && scrollRef.current && processedLines.length > 0) {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    }
  }, [processedLines, autoScroll]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + F for search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setIsSearchOpen(!isSearchOpen);
      }

      // Ctrl/Cmd + L to clear
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        // Clear terminal logic here
      }

      // Escape to close search
      if (e.key === 'Escape' && isSearchOpen) {
        setIsSearchOpen(false);
        setSearchTerm('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen]);

  // Handlers
  const handleThemeChange = (themeName: string) => {
    setCurrentTheme(themeName);
    onThemeChange?.(themeName);
  };

  const handleCopy = useCallback(() => {
    const text = processedLines.map(l => l.content).join('\n');
    navigator.clipboard.writeText(text);
  }, [processedLines]);

  const handleDownload = useCallback(() => {
    const content = processedLines.map(l =>
      `[${new Date(l.timestamp).toISOString()}] ${l.content}`
    ).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `terminal-${sessionId}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [processedLines, sessionId]);

  return (
    <motion.div
      ref={containerRef}
      className={cn(
        'enhanced-light-terminal',
        'relative flex flex-col',
        'rounded-xl overflow-hidden',
        'transition-all duration-300',
        isFullscreen && 'fixed inset-0 z-50 rounded-none',
        className
      )}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        boxShadow: theme.effects?.glassMorphism
          ? '0 8px 32px rgba(0, 0, 0, 0.06), 0 2px 8px rgba(0, 0, 0, 0.04)'
          : '0 4px 16px rgba(0, 0, 0, 0.05)',
        border: `1px solid ${theme.borderColor}`,
      }}
    >
      {/* Glass morphism overlay effect */}
      {theme.effects?.glassMorphism && (
        <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-white/20 pointer-events-none" />
      )}

      {/* Header */}
      {showControls && (
        <motion.div
          className="terminal-header relative z-10 px-4 py-3 flex items-center justify-between"
          style={{
            background: theme.headerBackground,
            borderBottom: `1px solid ${theme.borderColor}`,
            backdropFilter: theme.effects?.backdropBlur,
          }}
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-center space-x-3">
            <Terminal className="w-5 h-5" style={{ color: theme.promptColor }} />
            <div>
              <h3 className="text-sm font-semibold" style={{ color: theme.headerText }}>
                {agentName}
              </h3>
              <p className="text-xs opacity-60" style={{ color: theme.headerText }}>
                Session: {sessionId.slice(0, 8)}...
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Search toggle */}
            {enableSearch && (
              <button
                onClick={() => setIsSearchOpen(!isSearchOpen)}
                className="p-1.5 rounded-lg transition-all hover:scale-105"
                style={{
                  backgroundColor: isSearchOpen ? theme.activeBackground : 'transparent',
                  color: theme.headerText,
                }}
                title="Search (Ctrl+F)"
              >
                <Search className="w-4 h-4" />
              </button>
            )}

            {/* Theme selector */}
            <div className="relative">
              <button
                onClick={() => setShowThemeSelector(!showThemeSelector)}
                className="p-1.5 rounded-lg transition-all hover:scale-105"
                style={{
                  backgroundColor: showThemeSelector ? theme.activeBackground : 'transparent',
                  color: theme.headerText,
                }}
                title="Change theme"
              >
                <Palette className="w-4 h-4" />
              </button>

              {/* Theme dropdown */}
              <AnimatePresence>
                {showThemeSelector && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute right-0 top-full mt-2 w-48 rounded-lg shadow-xl overflow-hidden z-50"
                    style={{
                      backgroundColor: theme.backgroundColor,
                      border: `1px solid ${theme.borderColor}`,
                    }}
                  >
                    {lightThemes.map(themeName => (
                      <button
                        key={themeName}
                        onClick={() => {
                          handleThemeChange(themeName);
                          setShowThemeSelector(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm transition-colors"
                        style={{
                          backgroundColor: currentTheme === themeName ? theme.activeBackground : 'transparent',
                          color: theme.textColor,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = theme.hoverBackground;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor =
                            currentTheme === themeName ? theme.activeBackground : 'transparent';
                        }}
                      >
                        {enhancedTerminalThemes[themeName].name}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Line numbers toggle */}
            <button
              onClick={() => setShowLineNumbers(!showLineNumbers)}
              className="p-1.5 rounded-lg transition-all hover:scale-105"
              style={{
                backgroundColor: showLineNumbers ? theme.activeBackground : 'transparent',
                color: theme.headerText,
              }}
              title="Toggle line numbers"
            >
              {showLineNumbers ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>

            {/* Font size controls */}
            <div className="flex items-center space-x-1 px-2 py-1 rounded-lg"
                 style={{ backgroundColor: theme.hoverBackground }}>
              <button
                onClick={() => setFontSize(Math.max(10, fontSize - 1))}
                className="p-0.5 rounded transition-all hover:scale-110"
                style={{ color: theme.headerText }}
              >
                <ZoomOut className="w-3 h-3" />
              </button>
              <span className="text-xs px-1 min-w-[3ch] text-center"
                    style={{ color: theme.headerText }}>
                {fontSize}
              </span>
              <button
                onClick={() => setFontSize(Math.min(20, fontSize + 1))}
                className="p-0.5 rounded transition-all hover:scale-110"
                style={{ color: theme.headerText }}
              >
                <ZoomIn className="w-3 h-3" />
              </button>
            </div>

            {/* Copy button */}
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg transition-all hover:scale-105"
              style={{
                backgroundColor: 'transparent',
                color: theme.headerText,
              }}
              title="Copy to clipboard"
            >
              <Copy className="w-4 h-4" />
            </button>

            {/* Download button */}
            <button
              onClick={handleDownload}
              className="p-1.5 rounded-lg transition-all hover:scale-105"
              style={{
                backgroundColor: 'transparent',
                color: theme.headerText,
              }}
              title="Download log"
            >
              <Download className="w-4 h-4" />
            </button>

            {/* Fullscreen toggle */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 rounded-lg transition-all hover:scale-105"
              style={{
                backgroundColor: 'transparent',
                color: theme.headerText,
              }}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}

      {/* Search bar */}
      <AnimatePresence>
        {isSearchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="search-bar px-4 py-2"
            style={{
              backgroundColor: theme.hoverBackground,
              borderBottom: `1px solid ${theme.borderColor}`,
            }}
          >
            <input
              type="text"
              placeholder="Search in terminal..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg text-sm outline-none"
              style={{
                backgroundColor: theme.backgroundColor,
                color: theme.textColor,
                border: `1px solid ${theme.borderColor}`,
              }}
              autoFocus
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Terminal content */}
      <div
        ref={scrollRef}
        className="terminal-content flex-1 overflow-auto relative"
        style={{
          fontFamily: theme.fontFamily,
          fontSize: `${fontSize}px`,
          lineHeight: theme.lineHeight || 1.6,
          letterSpacing: theme.letterSpacing,
          backgroundColor: theme.backgroundColor,
          backgroundImage: theme.backgroundGradient,
        }}
      >
        <div ref={contentRef} className="py-4">
          {processedLines.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-64"
              style={{ color: theme.textColor }}
            >
              <Terminal className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-sm opacity-60">Waiting for output...</p>
              <p className="text-xs opacity-40 mt-1">Terminal is ready</p>
            </motion.div>
          ) : (
            <AnimatePresence mode="popLayout">
              {processedLines.map((line) => (
                <EnhancedLineRenderer
                  key={line.id}
                  line={line}
                  theme={theme}
                  isHighlighted={line.lineNumber === highlightedLine}
                  showLineNumbers={showLineNumbers}
                  searchTerm={searchTerm}
                />
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Custom scrollbar */}
        <style jsx>{`
          .terminal-content::-webkit-scrollbar {
            width: 12px;
          }
          .terminal-content::-webkit-scrollbar-track {
            background: var(--terminal-scrollbar-track);
            border-radius: 6px;
          }
          .terminal-content::-webkit-scrollbar-thumb {
            background: var(--terminal-scrollbar-thumb);
            border-radius: 6px;
            border: 2px solid var(--terminal-scrollbar-track);
          }
          .terminal-content::-webkit-scrollbar-thumb:hover {
            background: var(--terminal-scrollbar-thumb-hover);
          }

          /* Selection styles */
          .terminal-content ::selection {
            background-color: var(--terminal-selection-bg);
            color: var(--terminal-selection-text);
          }

          /* Glass morphism effect */
          .terminal-glass-morphism {
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
          }

          /* Smooth transitions */
          .terminal-line {
            transition: background-color 0.15s ease, padding-left 0.15s ease;
          }

          /* Focus styles for accessibility */
          button:focus-visible {
            outline: 2px solid var(--terminal-focus-outline);
            outline-offset: 2px;
          }

          input:focus-visible {
            outline: 2px solid var(--terminal-focus-outline);
            outline-offset: -2px;
          }
        `}</style>
      </div>

      {/* Status bar */}
      <motion.div
        className="terminal-status px-4 py-2 flex items-center justify-between text-xs"
        style={{
          backgroundColor: theme.headerBackground,
          borderTop: `1px solid ${theme.borderColor}`,
          color: theme.headerText,
          opacity: 0.8,
        }}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center space-x-4">
          <span>Lines: {processedLines.length}</span>
          <span>Theme: {theme.name}</span>
          <span>Font: {fontSize}px</span>
        </div>
        <div className="flex items-center space-x-4">
          {searchTerm && (
            <span className="text-amber-600">
              Searching: "{searchTerm}"
            </span>
          )}
          <span className="opacity-60">
            {new Date().toLocaleTimeString()}
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
});

EnhancedLightTerminal.displayName = 'EnhancedLightTerminal';

export default EnhancedLightTerminal;