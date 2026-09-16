import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Copy, Download, ChevronUp, ChevronDown, ChevronRight,
  FileCode, Image, Link, FolderOpen, Terminal as TerminalIcon
} from 'lucide-react';
import DOMPurify from 'dompurify';
import { useTerminalTheme } from '../themes/TerminalThemeProvider';
import { terminalLineAnimation, typewriterEffect } from '../animations/terminalAnimations';
import { AnsiParser } from '@/utils/ansiParser';
import hljs from 'highlight.js/lib/core';

// Import common languages for syntax highlighting
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import markdown from 'highlight.js/lib/languages/markdown';

// Register languages
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('css', css);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('markdown', markdown);

interface TerminalLine {
  id: string;
  content: string;
  type: 'command' | 'output' | 'error' | 'success' | 'warning' | 'info' | 'code';
  timestamp: Date;
  language?: string;
  metadata?: {
    filePath?: string;
    lineNumber?: number;
    isCollapsible?: boolean;
    isCollapsed?: boolean;
    hasPreview?: boolean;
    previewUrl?: string;
  };
}

interface TerminalOutputProps {
  lines: TerminalLine[];
  className?: string;
  autoScroll?: boolean;
  showTimestamps?: boolean;
  showLineNumbers?: boolean;
  enableSearch?: boolean;
  enableSyntaxHighlight?: boolean;
  onLineClick?: (line: TerminalLine) => void;
  onFileLinkClick?: (filePath: string) => void;
  onImagePreview?: (url: string) => void;
  maxLines?: number;
  searchQuery?: string;
}

export const TerminalOutput: React.FC<TerminalOutputProps> = ({
  lines,
  className = '',
  autoScroll = true,
  showTimestamps = false,
  showLineNumbers = false,
  enableSearch = true,
  enableSyntaxHighlight = true,
  onLineClick,
  onFileLinkClick,
  onImagePreview,
  maxLines = 1000,
  searchQuery: externalSearchQuery,
}) => {
  const { currentTheme } = useTerminalTheme();
  const outputRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState(externalSearchQuery || '');
  const [searchResults, setSearchResults] = useState<Set<string>>(new Set());
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [showSearch, setShowSearch] = useState(false);
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());

  // Auto-scroll to bottom when new lines are added
  useEffect(() => {
    if (autoScroll && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  // Search functionality
  useEffect(() => {
    if (searchQuery) {
      const results = new Set<string>();
      lines.forEach(line => {
        if (line.content.toLowerCase().includes(searchQuery.toLowerCase())) {
          results.add(line.id);
        }
      });
      setSearchResults(results);
      setCurrentSearchIndex(0);
    } else {
      setSearchResults(new Set());
    }
  }, [searchQuery, lines]);

  // Syntax highlighting for code blocks
  const highlightCode = useCallback((code: string, language?: string) => {
    if (!enableSyntaxHighlight || !language) return code;
    
    try {
      const highlighted = hljs.highlight(code, { language }).value;
      return highlighted;
    } catch (error) {
      return code;
    }
  }, [enableSyntaxHighlight]);

  // Helper function to escape HTML attributes
  const escapeAttr = (str: string): string => {
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  // Parse and detect special content types
  const parseLineContent = useCallback((content: string): React.ReactNode => {
    // First, check if the content has ANSI codes and clean/parse them
    let cleanContent = content;
    let hasAnsi = false;

    if (AnsiParser.hasAnsiCodes(content)) {
      hasAnsi = true;
      // Parse ANSI codes to HTML with proper styling
      cleanContent = AnsiParser.parseToHtml(content);
    } else {
      // If no ANSI codes, escape HTML characters
      cleanContent = content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    // Detect file paths
    const filePathRegex = /([a-zA-Z0-9_\-./]+\.(ts|tsx|js|jsx|py|json|css|html|md|txt))(:\d+)?/g;
    // Detect URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    // Detect image files
    const imageRegex = /([a-zA-Z0-9_\-./]+\.(png|jpg|jpeg|gif|svg|webp))/g;

    let result = cleanContent;

    // Only apply these replacements if we haven't already parsed ANSI
    // to avoid breaking the HTML structure
    if (!hasAnsi) {
      // Replace file paths with clickable links
      if (onFileLinkClick) {
        result = result.replace(filePathRegex, (match, filePath, ext, lineNumber) => {
          const escapedPath = escapeAttr(filePath);
          const escapedLine = escapeAttr(lineNumber?.slice(1) || '');
          return `<span class="terminal-file-link" data-path="${escapedPath}" data-line="${escapedLine}">
            <svg class="inline w-3 h-3 mr-1"><use xlink:href="#icon-file"></use></svg>${match}
          </span>`;
        });
      }

      // Replace URLs with clickable links (validate protocol first)
      result = result.replace(urlRegex, (url) => {
        // Only allow http and https protocols to prevent javascript: XSS
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          return url;
        }
        const escapedUrl = escapeAttr(url);
        return `<a href="${escapedUrl}" target="_blank" rel="noopener noreferrer" class="terminal-url-link">
          <svg class="inline w-3 h-3 mr-1"><use xlink:href="#icon-link"></use></svg>${url}
        </a>`;
      });

      // Replace image paths with preview icons
      if (onImagePreview) {
        result = result.replace(imageRegex, (match, imagePath) => {
          const escapedImage = escapeAttr(imagePath);
          return `<span class="terminal-image-link" data-image="${escapedImage}">
            <svg class="inline w-3 h-3 mr-1"><use xlink:href="#icon-image"></use></svg>${match}
          </span>`;
        });
      }
    }

    // FIX: Sanitize HTML to prevent XSS attacks from terminal output
    // Allow safe HTML elements for styling but block scripts and event handlers
    const sanitizedResult = DOMPurify.sanitize(result, {
      ALLOWED_TAGS: ['span', 'a', 'div', 'svg', 'use', 'br', 'b', 'i', 'strong', 'em', 'code', 'pre'],
      ALLOWED_ATTR: ['class', 'style', 'href', 'target', 'rel', 'data-path', 'data-line', 'data-image', 'xlink:href'],
      ADD_ATTR: ['target', 'rel'],
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input'],
      FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover']
    });

    return <div dangerouslySetInnerHTML={{ __html: sanitizedResult }} />;
  }, [onFileLinkClick, onImagePreview]);

  // Toggle section collapse
  const toggleCollapse = (lineId: string) => {
    setCollapsedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(lineId)) {
        newSet.delete(lineId);
      } else {
        newSet.add(lineId);
      }
      return newSet;
    });
  };

  // Toggle line selection
  const toggleLineSelection = (lineId: string, shiftKey: boolean) => {
    setSelectedLines(prev => {
      const newSet = new Set(prev);
      if (shiftKey) {
        // Multi-select with shift
        if (newSet.has(lineId)) {
          newSet.delete(lineId);
        } else {
          newSet.add(lineId);
        }
      } else {
        // Single select
        newSet.clear();
        newSet.add(lineId);
      }
      return newSet;
    });
  };

  // Copy selected lines to clipboard
  const copySelectedLines = () => {
    const selectedContent = lines
      .filter(line => selectedLines.has(line.id))
      .map(line => AnsiParser.stripAnsi(line.content)) // Strip ANSI codes when copying
      .join('\n');
    navigator.clipboard.writeText(selectedContent);
  };

  // Line type colors
  const lineTypeColors = {
    command: currentTheme.colors.cyan,
    output: currentTheme.colors.foreground,
    error: currentTheme.colors.red,
    success: currentTheme.colors.green,
    warning: currentTheme.colors.yellow,
    info: currentTheme.colors.blue,
    code: currentTheme.colors.magenta,
  };

  // Line type icons
  const lineTypeIcons = {
    command: '$ ',
    output: '  ',
    error: '✗ ',
    success: '✓ ',
    warning: '⚠ ',
    info: 'ℹ ',
    code: '> ',
  };

  // PERFORMANCE: Memoize displayLines to prevent recalculation on every render
  const displayLines = useMemo(() => lines.slice(-maxLines), [lines, maxLines]);

  // ACCESSIBILITY: Handle keyboard navigation for line selection
  const handleLineKeyDown = useCallback((e: React.KeyboardEvent, lineId: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleLineSelection(lineId, e.shiftKey);
    }
  }, []);

  return (
    <div className={`terminal-output-container relative ${className}`}>
      {/* Hidden SVG definitions for icons */}
      <svg className="hidden">
        <defs>
          <symbol id="icon-file" viewBox="0 0 24 24" fill="currentColor">
            <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2Z" />
          </symbol>
          <symbol id="icon-link" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10.59,13.41C11,13.8 11,14.44 10.59,14.83C10.2,15.22 9.56,15.22 9.17,14.83C7.22,12.88 7.22,9.71 9.17,7.76L12.71,4.22C14.66,2.27 17.83,2.27 19.78,4.22C21.73,6.17 21.73,9.34 19.78,11.29L18.29,12.78C18.3,11.96 18.17,11.14 17.89,10.36L18.36,9.88C19.54,8.71 19.54,6.81 18.36,5.64C17.19,4.46 15.29,4.46 14.12,5.64L10.59,9.17C9.41,10.34 9.41,12.24 10.59,13.41Z" />
          </symbol>
          <symbol id="icon-image" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21,3H3C2,3 1,4 1,5V19A2,2 0 0,0 3,21H21C22,21 23,20 23,19V5C23,4 22,3 21,3M5,17L8.5,12.5L11,15.5L14.5,11L19,17H5Z" />
          </symbol>
        </defs>
      </svg>

      {/* Search Bar */}
      {enableSearch && (
        <AnimatePresence>
          {showSearch && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-2 right-2 z-10 flex items-center space-x-2 bg-gray-800 rounded-lg px-3 py-2"
              style={{ backgroundColor: currentTheme.colors.background }}
            >
              <label htmlFor="terminal-search" className="sr-only">Search terminal output</label>
              <Search className="w-4 h-4" style={{ color: currentTheme.colors.accent }} aria-hidden="true" />
              <input
                id="terminal-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search output..."
                className="bg-transparent outline-none text-sm"
                style={{ color: currentTheme.colors.foreground }}
                aria-label="Search terminal output"
              />
              <span className="text-xs" style={{ color: currentTheme.colors.brightBlack }}>
                {searchResults.size > 0 ? `${currentSearchIndex + 1}/${searchResults.size}` : '0/0'}
              </span>
              <button
                onClick={() => setShowSearch(false)}
                className="ml-2 text-xs"
                style={{ color: currentTheme.colors.accent }}
              >
                ESC
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Control Bar */}
      <div className="terminal-controls absolute top-2 right-2 flex items-center space-x-2">
        {!showSearch && enableSearch && (
          <button
            onClick={() => setShowSearch(true)}
            className="p-1 rounded hover:bg-gray-700 transition-colors"
            aria-label="Search"
          >
            <Search className="w-4 h-4" style={{ color: currentTheme.colors.foreground }} />
          </button>
        )}
        {selectedLines.size > 0 && (
          <button
            onClick={copySelectedLines}
            className="p-1 rounded hover:bg-gray-700 transition-colors"
            aria-label="Copy selected"
          >
            <Copy className="w-4 h-4" style={{ color: currentTheme.colors.foreground }} />
          </button>
        )}
      </div>

      {/* Output Content */}
      <div
        ref={outputRef}
        className="terminal-output overflow-y-auto p-4 font-mono text-sm"
        style={{
          backgroundColor: currentTheme.colors.background,
          color: currentTheme.colors.foreground,
          fontFamily: currentTheme.font.family,
          fontSize: currentTheme.font.size,
          lineHeight: currentTheme.font.lineHeight,
          height: '100%',
        }}
      >
        <AnimatePresence initial={false}>
          {displayLines.map((line, index) => {
            const isCollapsed = collapsedSections.has(line.id);
            const isSearchMatch = searchResults.has(line.id);
            const isSelected = selectedLines.has(line.id);

            return (
              <motion.div
                key={line.id}
                variants={terminalLineAnimation}
                initial="hidden"
                animate="visible"
                exit="hidden"
                role="listitem"
                tabIndex={0}
                className={`terminal-line ${isSelected ? 'bg-opacity-20' : ''} ${
                  isSearchMatch ? 'bg-yellow-500 bg-opacity-10' : ''
                } hover:bg-opacity-10 hover:bg-gray-700 active:bg-gray-600 cursor-pointer px-2 py-0.5 rounded focus:outline-none focus:ring-2 focus:ring-blue-500`}
                onClick={(e) => {
                  toggleLineSelection(line.id, e.shiftKey);
                  onLineClick?.(line);
                }}
                onKeyDown={(e) => handleLineKeyDown(e, line.id)}
                style={{
                  backgroundColor: isSelected ? `${currentTheme.colors.selection}` : 'transparent',
                  // iOS touch optimizations
                  WebkitTapHighlightColor: 'transparent',
                  touchAction: 'manipulation',
                }}
                aria-selected={isSelected}
              >
                <div className="flex items-start space-x-2">
                  {/* Line Number */}
                  {showLineNumbers && (
                    <span
                      className="text-xs select-none"
                      style={{ color: currentTheme.colors.brightBlack, minWidth: '3rem' }}
                    >
                      {index + 1}
                    </span>
                  )}

                  {/* Timestamp */}
                  {showTimestamps && (
                    <span
                      className="text-xs select-none"
                      style={{ color: currentTheme.colors.brightBlack }}
                    >
                      {line.timestamp.toLocaleTimeString()}
                    </span>
                  )}

                  {/* Collapsible Indicator */}
                  {line.metadata?.isCollapsible && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCollapse(line.id);
                      }}
                      className="hover:bg-gray-700 rounded p-0.5"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>
                  )}

                  {/* Line Type Icon */}
                  <span
                    className="select-none"
                    style={{ color: lineTypeColors[line.type] }}
                  >
                    {lineTypeIcons[line.type]}
                  </span>

                  {/* Line Content */}
                  <div className="flex-1">
                    {!isCollapsed && (
                      <>
                        {line.type === 'code' && line.language ? (
                          <pre
                            className="terminal-code-block"
                            dangerouslySetInnerHTML={{
                              __html: highlightCode(line.content, line.language),
                            }}
                          />
                        ) : (
                          <span style={{ color: lineTypeColors[line.type] }}>
                            {parseLineContent(line.content)}
                          </span>
                        )}
                      </>
                    )}
                    {isCollapsed && (
                      <span style={{ color: currentTheme.colors.brightBlack }}>
                        ... collapsed ({line.content.split('\n').length} lines)
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Empty State */}
        {displayLines.length === 0 && (
          <div
            className="flex flex-col items-center justify-center h-full text-center"
            role="status"
            aria-live="polite"
            aria-label="Terminal output is empty"
          >
            <TerminalIcon
              className="w-12 h-12 mb-4 opacity-30"
              style={{ color: currentTheme.colors.brightBlack }}
              aria-hidden="true"
            />
            <p style={{ color: currentTheme.colors.brightBlack }}>
              Waiting for output...
            </p>
          </div>
        )}
      </div>

      {/* Custom scrollbar */}
      <style>{`
        .terminal-output::-webkit-scrollbar {
          width: 8px;
        }
        .terminal-output::-webkit-scrollbar-track {
          background: ${currentTheme.colors.scrollbarTrack};
        }
        .terminal-output::-webkit-scrollbar-thumb {
          background: ${currentTheme.colors.scrollbarThumb};
          border-radius: 4px;
        }
        .terminal-output::-webkit-scrollbar-thumb:hover {
          background: ${currentTheme.colors.accent};
        }
        .terminal-file-link {
          color: ${currentTheme.colors.cyan};
          cursor: pointer;
          text-decoration: underline;
        }
        .terminal-file-link:hover {
          color: ${currentTheme.colors.brightCyan};
        }
        .terminal-url-link {
          color: ${currentTheme.colors.blue};
          text-decoration: underline;
        }
        .terminal-url-link:hover {
          color: ${currentTheme.colors.brightBlue};
        }
        .terminal-image-link {
          color: ${currentTheme.colors.magenta};
          cursor: pointer;
        }
        .terminal-image-link:hover {
          color: ${currentTheme.colors.brightMagenta};
        }
      `}</style>
    </div>
  );
};