/**
 * ANSI Escape Code Parser
 * Converts ANSI escape sequences to clean text or HTML with proper styling
 *
 * PERFORMANCE: Includes LRU cache for parsed HTML to avoid redundant processing
 */

// PERFORMANCE FIX: LRU Cache for parsed ANSI content
class LRUCache<K, V> {
  private maxSize: number;
  private cache: Map<K, V>;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) return undefined;
    // Move to end (most recently used)
    const value = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove oldest entry (first in map)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }
}

// Global cache instances for performance
const parseHtmlCache = new LRUCache<string, string>(2000);
const cleanOutputCache = new LRUCache<string, string>(2000);
const stripAnsiCache = new LRUCache<string, string>(2000);

export interface AnsiStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  dim?: boolean;
  hidden?: boolean;
  inverse?: boolean;
  color?: string;
  backgroundColor?: string;
}

// ANSI color codes mapping
const ANSI_COLORS: Record<number, string> = {
  // Standard colors
  30: '#000000', // Black
  31: '#cc0000', // Red
  32: '#4e9a06', // Green
  33: '#c4a000', // Yellow
  34: '#3465a4', // Blue
  35: '#75507b', // Magenta
  36: '#06989a', // Cyan
  37: '#d3d7cf', // White
  
  // Bright colors
  90: '#555753', // Bright Black
  91: '#ef2929', // Bright Red
  92: '#8ae234', // Bright Green
  93: '#fce94f', // Bright Yellow
  94: '#729fcf', // Bright Blue
  95: '#ad7fa8', // Bright Magenta
  96: '#34e2e2', // Bright Cyan
  97: '#eeeeec', // Bright White
  
  // Default
  39: '#d3d7cf', // Default foreground
  49: 'transparent', // Default background
};

// Background colors (add 10 to foreground codes)
const ANSI_BG_COLORS: Record<number, string> = {
  40: '#000000', // Black
  41: '#cc0000', // Red
  42: '#4e9a06', // Green
  43: '#c4a000', // Yellow
  44: '#3465a4', // Blue
  45: '#75507b', // Magenta
  46: '#06989a', // Cyan
  47: '#d3d7cf', // White
  
  // Bright backgrounds
  100: '#555753', // Bright Black
  101: '#ef2929', // Bright Red
  102: '#8ae234', // Bright Green
  103: '#fce94f', // Bright Yellow
  104: '#729fcf', // Bright Blue
  105: '#ad7fa8', // Bright Magenta
  106: '#34e2e2', // Bright Cyan
  107: '#eeeeec', // Bright White
};

export class AnsiParser {
  /**
   * Remove all ANSI escape codes from text
   * PERFORMANCE: Uses LRU cache to avoid reprocessing same content
   */
  static stripAnsi(text: string): string {
    // Check cache first
    const cached = stripAnsiCache.get(text);
    if (cached !== undefined) return cached;

    // Remove all ANSI escape sequences
    const result = text
      // Remove CSI sequences (including 256-color codes)
      .replace(/\x1b\[[0-9;]*m/g, '')
      // Remove OSC sequences
      .replace(/\x1b\][0-9;]*\x07/g, '')
      // Remove cursor movement codes
      .replace(/\x1b\[[0-9]*[A-Z]/gi, '')
      // Remove clear screen/line codes
      .replace(/\x1b\[2[JK]/g, '')
      // Remove other escape sequences
      .replace(/\x1b\[[^m]*m/g, '')
      // Remove remaining escape characters
      .replace(/\x1b/g, '')
      // Also remove incomplete/broken ANSI codes that might appear as [38;5;174m etc
      .replace(/\[[0-9;]+m/g, '')
      // Remove box drawing characters and special symbols
      .replace(/[┌─┐│└┘├┤┬┴┼╭╮╰╯]/g, '')
      // Remove other control characters except newline and tab
      .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

    // Cache result for future lookups
    stripAnsiCache.set(text, result);
    return result;
  }

  /**
   * Parse ANSI codes and convert to HTML with inline styles
   * PERFORMANCE: Uses LRU cache to avoid reprocessing same content
   */
  static parseToHtml(text: string): string {
    // Check cache first
    const cached = parseHtmlCache.get(text);
    if (cached !== undefined) return cached;

    // First, strip problematic control characters but keep ANSI codes
    const cleanText = text
      .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1A\x1C-\x1F\x7F]/g, '');
    
    // Split by ANSI escape sequences
    const parts = cleanText.split(/(\x1b\[[^m]*m)/);
    
    let currentStyle: AnsiStyle = {};
    let html = '';
    let isInSpan = false;

    for (const part of parts) {
      if (part.startsWith('\x1b[')) {
        // This is an ANSI escape sequence
        const codes = part
          .slice(2, -1) // Remove \x1b[ and m
          .split(';')
          .map(c => parseInt(c, 10))
          .filter(c => !isNaN(c));

        for (const code of codes) {
          currentStyle = this.applyAnsiCode(currentStyle, code);
        }
      } else if (part) {
        // This is text content
        const styles = this.stylesToCss(currentStyle);
        
        if (styles) {
          if (isInSpan) {
            html += '</span>';
          }
          html += `<span style="${styles}">`;
          isInSpan = true;
        } else if (isInSpan) {
          html += '</span>';
          isInSpan = false;
        }
        
        // Escape HTML and preserve whitespace
        html += this.escapeHtml(part);
      }
    }

    if (isInSpan) {
      html += '</span>';
    }

    const result = html || this.escapeHtml(this.stripAnsi(text));
    // Cache result for future lookups
    parseHtmlCache.set(text, result);
    return result;
  }

  /**
   * Parse ANSI codes and return structured data
   */
  static parseToSegments(text: string): Array<{ text: string; style: AnsiStyle }> {
    const cleanText = text
      .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1A\x1C-\x1F\x7F]/g, '');
    
    const parts = cleanText.split(/(\x1b\[[^m]*m)/);
    const segments: Array<{ text: string; style: AnsiStyle }> = [];
    let currentStyle: AnsiStyle = {};

    for (const part of parts) {
      if (part.startsWith('\x1b[')) {
        const codes = part
          .slice(2, -1)
          .split(';')
          .map(c => parseInt(c, 10))
          .filter(c => !isNaN(c));

        for (const code of codes) {
          currentStyle = this.applyAnsiCode(currentStyle, code);
        }
      } else if (part) {
        segments.push({
          text: part,
          style: { ...currentStyle }
        });
      }
    }

    return segments;
  }

  /**
   * Apply a single ANSI code to the current style
   */
  private static applyAnsiCode(style: AnsiStyle, code: number): AnsiStyle {
    const newStyle = { ...style };

    switch (code) {
      case 0: // Reset
        return {};
      case 1: // Bold
        newStyle.bold = true;
        break;
      case 2: // Dim
        newStyle.dim = true;
        break;
      case 3: // Italic
        newStyle.italic = true;
        break;
      case 4: // Underline
        newStyle.underline = true;
        break;
      case 5: // Blink (we'll treat as bold)
        newStyle.bold = true;
        break;
      case 7: // Inverse
        newStyle.inverse = true;
        break;
      case 8: // Hidden
        newStyle.hidden = true;
        break;
      case 9: // Strikethrough
        newStyle.strikethrough = true;
        break;
      case 22: // Not bold/dim
        delete newStyle.bold;
        delete newStyle.dim;
        break;
      case 23: // Not italic
        delete newStyle.italic;
        break;
      case 24: // Not underline
        delete newStyle.underline;
        break;
      case 27: // Not inverse
        delete newStyle.inverse;
        break;
      case 28: // Not hidden
        delete newStyle.hidden;
        break;
      case 29: // Not strikethrough
        delete newStyle.strikethrough;
        break;
      default:
        // Color codes
        if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) {
          newStyle.color = ANSI_COLORS[code] || ANSI_COLORS[39];
        } else if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) {
          newStyle.backgroundColor = ANSI_BG_COLORS[code] || 'transparent';
        } else if (code === 39) {
          delete newStyle.color;
        } else if (code === 49) {
          delete newStyle.backgroundColor;
        }
    }

    return newStyle;
  }

  /**
   * Convert style object to CSS string
   */
  private static stylesToCss(style: AnsiStyle): string {
    const css: string[] = [];

    if (style.color) css.push(`color: ${style.color}`);
    if (style.backgroundColor) css.push(`background-color: ${style.backgroundColor}`);
    if (style.bold) css.push('font-weight: bold');
    if (style.italic) css.push('font-style: italic');
    if (style.underline) css.push('text-decoration: underline');
    if (style.strikethrough) css.push('text-decoration: line-through');
    if (style.dim) css.push('opacity: 0.6');
    if (style.hidden) css.push('visibility: hidden');
    
    if (style.inverse) {
      const fg = style.color || '#d3d7cf';
      const bg = style.backgroundColor || '#000000';
      css.push(`color: ${bg}; background-color: ${fg}`);
    }

    return css.join('; ');
  }

  /**
   * Escape HTML special characters
   */
  private static escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/\n/g, '<br>')
      .replace(/ {2}/g, ' &nbsp;') // Preserve multiple spaces
      .replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;'); // Convert tabs to spaces
  }

  /**
   * Check if text contains ANSI codes
   */
  static hasAnsiCodes(text: string): boolean {
    return /\x1b\[/.test(text);
  }

  /**
   * Clean terminal output for display
   * Removes cursor movements, clear commands, and other terminal control sequences
   * PERFORMANCE: Uses LRU cache to avoid reprocessing same content
   */
  static cleanTerminalOutput(text: string): string {
    // Check cache first
    const cached = cleanOutputCache.get(text);
    if (cached !== undefined) return cached;

    const result = text
      // First remove complete ANSI escape sequences
      .replace(/\x1b\[[0-9;]*m/g, '') // Color codes
      .replace(/\x1b\[[0-9]*[A-Z]/gi, '') // Cursor movement
      .replace(/\x1b\[[0-9;]*[Hf]/gi, '') // Cursor positioning
      .replace(/\x1b\[2[JK]/g, '') // Clear screen/line
      .replace(/\x1b\[[01]?K/g, '') // Clear line
      .replace(/\x1b\[[0-9;]*r/g, '') // Scroll region
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') // Other CSI sequences
      .replace(/\x1b\].*?\x07/g, '') // OSC sequences
      .replace(/\x1b[PD]/g, '') // DCS sequences
      .replace(/\x1b/g, '') // Remaining escape characters
      
      // Remove broken/incomplete ANSI codes that appear as plain text
      .replace(/\[38;5;\d+m/g, '') // 256-color foreground
      .replace(/\[48;5;\d+m/g, '') // 256-color background
      .replace(/\[38;2;\d+;\d+;\d+m/g, '') // RGB foreground
      .replace(/\[48;2;\d+;\d+;\d+m/g, '') // RGB background
      .replace(/\[\d+(;\d+)*m/g, '') // Any remaining color codes
      .replace(/\[[\d;]+[a-zA-Z]/g, '') // Any remaining control sequences
      .replace(/\[\d+m/g, '') // Simple codes like [0m, [39m
      
      // Remove special characters and box drawing
      .replace(/[⏵◆✻✽·╭─╮│╰╯┌┐└┘├┤┬┴┼]/g, '')
      .replace(/[▶▸▪▫◀◂]/g, '') // Arrow and bullet characters
      
      // Remove other control characters except newline and tab
      .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
      
      // Clean up excessive whitespace while preserving structure
      .replace(/\s*\n\s*\n\s*/g, '\n\n') // Reduce multiple blank lines to max 2
      .replace(/[ \t]+$/gm, '') // Remove trailing whitespace from lines
      .replace(/^[ \t]+$/gm, '') // Remove whitespace-only lines
      .trim(); // Remove leading/trailing whitespace

    // Cache result for future lookups
    cleanOutputCache.set(text, result);
    return result;
  }
  
  /**
   * Filter out system messages from terminal output
   */
  static filterSystemMessages(text: string): string {
    const lines = text.split('\n');
    return lines.filter(line => {
      const cleanLine = line.toLowerCase();
      // Filter out MaiFarm system messages
      if (cleanLine.includes('[maifarm]') ||
          cleanLine.includes('[system]') ||
          cleanLine.includes('[internal]') ||
          cleanLine.includes('establishing connection') ||
          cleanLine.includes('websocket connected') ||
          cleanLine.includes('terminal session') ||
          cleanLine.includes('pipe-pane') ||
          cleanLine.includes('tmux session') ||
          cleanLine.includes('terminal verification') ||
          cleanLine.includes('session joined') ||
          cleanLine.includes('streaming started') ||
          cleanLine.startsWith('>>') ||
          cleanLine.startsWith('<<<') ||
          cleanLine.startsWith('---') ||
          cleanLine.match(/^\[[\d:]+\]/) || // Timestamp patterns like [12:34:56]
          cleanLine.match(/^debug:/i) ||
          cleanLine.match(/^info:/i) ||
          cleanLine.match(/^maifarm:/i)) {
        return false;
      }
      return true;
    }).join('\n');
  }
}

/**
 * React hook for parsing ANSI text
 */
export function useAnsiParser(text: string, options?: {
  stripOnly?: boolean;
  preserveNewlines?: boolean;
}) {
  if (options?.stripOnly) {
    return AnsiParser.stripAnsi(text);
  }

  if (AnsiParser.hasAnsiCodes(text)) {
    const parsed = AnsiParser.parseToHtml(text);
    return options?.preserveNewlines ? parsed : parsed.replace(/<br>/g, '\n');
  }

  return text;
}

// Legacy exports for backward compatibility
export const parseAnsi = AnsiParser.parseToHtml.bind(AnsiParser);
export const stripAnsi = AnsiParser.stripAnsi.bind(AnsiParser);
export const parseToSegments = AnsiParser.parseToSegments.bind(AnsiParser);

/**
 * Detect output type based on content
 */
export function detectOutputType(content: string): 'command' | 'error' | 'warning' | 'info' | 'success' | 'normal' {
  const cleanContent = AnsiParser.stripAnsi(content);
  
  if (cleanContent.startsWith('$') || cleanContent.startsWith('>') || cleanContent.includes('[COMMAND]')) {
    return 'command';
  }
  if (cleanContent.includes('error') || cleanContent.includes('Error') || cleanContent.includes('ERROR')) {
    return 'error';
  }
  if (cleanContent.includes('warning') || cleanContent.includes('Warning') || cleanContent.includes('WARNING')) {
    return 'warning';
  }
  if (cleanContent.includes('success') || cleanContent.includes('Success') || cleanContent.includes('✓')) {
    return 'success';
  }
  if (cleanContent.includes('info') || cleanContent.includes('Info') || cleanContent.includes('ℹ')) {
    return 'info';
  }
  return 'normal';
}

/**
 * Get color for output type
 */
export function getOutputColor(type: string): string {
  switch (type) {
    case 'command':
      return 'text-green-400';
    case 'error':
      return 'text-red-400';
    case 'warning':
      return 'text-yellow-400';
    case 'success':
      return 'text-green-500';
    case 'info':
      return 'text-blue-400';
    default:
      return 'text-gray-300';
  }
}