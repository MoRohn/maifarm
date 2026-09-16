/**
 * Enhanced ANSI Parser
 *
 * High-performance ANSI escape sequence parser with support for:
 * - Color codes (8-bit, 16-bit, 24-bit RGB)
 * - Text styling (bold, italic, underline, etc.)
 * - Cursor control
 * - Clean text extraction
 * - Syntax highlighting
 */

export interface AnsiStyle {
  color?: string;
  backgroundColor?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  dim?: boolean;
  blink?: boolean;
  inverse?: boolean;
}

export interface ParsedLine {
  text: string;
  style?: AnsiStyle;
  raw?: string;
}

export interface ParsedOutput {
  lines: ParsedLine[];
  plainText: string;
  hasAnsi: boolean;
}

// ANSI color palette (standard 16 colors)
const ANSI_COLORS: Record<number, string> = {
  // Normal colors
  30: '#000000', // Black
  31: '#CD3131', // Red
  32: '#0DBC79', // Green
  33: '#E5E510', // Yellow
  34: '#2472C8', // Blue
  35: '#BC3FBC', // Magenta
  36: '#11A8CD', // Cyan
  37: '#E5E5E5', // White

  // Bright colors
  90: '#666666', // Bright Black (Gray)
  91: '#F14C4C', // Bright Red
  92: '#23D18B', // Bright Green
  93: '#F5F543', // Bright Yellow
  94: '#3B8EEA', // Bright Blue
  95: '#D670D6', // Bright Magenta
  96: '#29B8DB', // Bright Cyan
  97: '#FFFFFF', // Bright White
};

// Background color codes (add 10 to foreground code)
const BG_OFFSET = 10;

/**
 * Clean terminal output by removing ANSI codes and control characters
 */
export function cleanTerminalOutput(text: string): string {
  if (!text) return '';

  let cleaned = text;

  // Remove ANSI escape sequences
  cleaned = cleaned.replace(/\x1B\[[0-9;]*[JKmsu]/g, '');
  cleaned = cleaned.replace(/\x1B\][0-9];[^\x07]*\x07/g, '');
  cleaned = cleaned.replace(/\x1B\][0-9];[^\x1B]*\x1B\\/g, '');

  // Remove control characters except newline and tab
  cleaned = cleaned.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

  // Remove box drawing and special characters
  cleaned = cleaned.replace(/[╭─╮│╰╯⏵◆✻✽·]/g, '');

  // Remove excessive whitespace
  cleaned = cleaned.replace(/  +/g, ' ');

  return cleaned;
}

/**
 * Parse ANSI escape sequences and extract styling information
 */
export function parseAnsiCodes(text: string): ParsedOutput {
  if (!text) {
    return {
      lines: [],
      plainText: '',
      hasAnsi: false
    };
  }

  const hasAnsi = /\x1B\[/.test(text);

  if (!hasAnsi) {
    // No ANSI codes - return as-is
    const lines = text.split('\n').map(line => ({
      text: line,
      raw: line
    }));

    return {
      lines,
      plainText: text,
      hasAnsi: false
    };
  }

  const parsedLines: ParsedLine[] = [];
  const textLines = text.split('\n');

  for (const line of textLines) {
    const parsed = parseAnsiLine(line);
    parsedLines.push(parsed);
  }

  const plainText = parsedLines.map(l => l.text).join('\n');

  return {
    lines: parsedLines,
    plainText,
    hasAnsi
  };
}

/**
 * Parse a single line with ANSI codes
 */
function parseAnsiLine(line: string): ParsedLine {
  const style: AnsiStyle = {};
  let text = '';
  let i = 0;

  while (i < line.length) {
    if (line[i] === '\x1B' && line[i + 1] === '[') {
      // Found ANSI escape sequence
      const endIndex = line.indexOf('m', i);
      if (endIndex !== -1) {
        const codes = line.substring(i + 2, endIndex).split(';').map(Number);
        applyAnsiCodes(codes, style);
        i = endIndex + 1;
        continue;
      }
    }

    text += line[i];
    i++;
  }

  return {
    text: cleanTerminalOutput(text),
    style: Object.keys(style).length > 0 ? style : undefined,
    raw: line
  };
}

/**
 * Apply ANSI codes to style object
 */
function applyAnsiCodes(codes: number[], style: AnsiStyle): void {
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];

    switch (code) {
      case 0: // Reset
        Object.keys(style).forEach(key => delete (style as any)[key]);
        break;

      case 1: // Bold
        style.bold = true;
        break;

      case 2: // Dim
        style.dim = true;
        break;

      case 3: // Italic
        style.italic = true;
        break;

      case 4: // Underline
        style.underline = true;
        break;

      case 5: // Blink
        style.blink = true;
        break;

      case 7: // Inverse
        style.inverse = true;
        break;

      case 9: // Strikethrough
        style.strikethrough = true;
        break;

      case 22: // Normal intensity (not bold/dim)
        style.bold = false;
        style.dim = false;
        break;

      case 23: // Not italic
        style.italic = false;
        break;

      case 24: // Not underlined
        style.underline = false;
        break;

      case 27: // Not inverse
        style.inverse = false;
        break;

      case 29: // Not strikethrough
        style.strikethrough = false;
        break;

      // Foreground colors (30-37, 90-97)
      case 30: case 31: case 32: case 33:
      case 34: case 35: case 36: case 37:
      case 90: case 91: case 92: case 93:
      case 94: case 95: case 96: case 97:
        style.color = ANSI_COLORS[code];
        break;

      // Background colors (40-47, 100-107)
      case 40: case 41: case 42: case 43:
      case 44: case 45: case 46: case 47:
        style.backgroundColor = ANSI_COLORS[code - BG_OFFSET];
        break;

      case 100: case 101: case 102: case 103:
      case 104: case 105: case 106: case 107:
        style.backgroundColor = ANSI_COLORS[code - BG_OFFSET];
        break;

      // 256-color mode
      case 38: // Foreground
        if (codes[i + 1] === 5 && codes[i + 2] !== undefined) {
          style.color = get256Color(codes[i + 2]);
          i += 2;
        } else if (codes[i + 1] === 2) {
          // RGB color
          const r = codes[i + 2];
          const g = codes[i + 3];
          const b = codes[i + 4];
          if (r !== undefined && g !== undefined && b !== undefined) {
            style.color = `rgb(${r}, ${g}, ${b})`;
            i += 4;
          }
        }
        break;

      case 48: // Background
        if (codes[i + 1] === 5 && codes[i + 2] !== undefined) {
          style.backgroundColor = get256Color(codes[i + 2]);
          i += 2;
        } else if (codes[i + 1] === 2) {
          // RGB color
          const r = codes[i + 2];
          const g = codes[i + 3];
          const b = codes[i + 4];
          if (r !== undefined && g !== undefined && b !== undefined) {
            style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
            i += 4;
          }
        }
        break;

      case 39: // Default foreground
        delete style.color;
        break;

      case 49: // Default background
        delete style.backgroundColor;
        break;
    }
  }
}

/**
 * Get color from 256-color palette
 */
function get256Color(code: number): string {
  // Standard colors (0-15)
  if (code < 16) {
    const baseCode = code < 8 ? 30 + code : 90 + (code - 8);
    return ANSI_COLORS[baseCode] || '#FFFFFF';
  }

  // 216-color cube (16-231)
  if (code < 232) {
    const index = code - 16;
    const r = Math.floor(index / 36);
    const g = Math.floor((index % 36) / 6);
    const b = index % 6;

    const toRgb = (v: number) => v === 0 ? 0 : 55 + v * 40;

    return `rgb(${toRgb(r)}, ${toRgb(g)}, ${toRgb(b)})`;
  }

  // Grayscale (232-255)
  if (code < 256) {
    const gray = 8 + (code - 232) * 10;
    return `rgb(${gray}, ${gray}, ${gray})`;
  }

  return '#FFFFFF';
}

/**
 * Convert styled line to HTML
 */
export function styledLineToHtml(line: ParsedLine): string {
  if (!line.style || Object.keys(line.style).length === 0) {
    return escapeHtml(line.text);
  }

  const styles: string[] = [];

  if (line.style.color) {
    styles.push(`color: ${line.style.color}`);
  }

  if (line.style.backgroundColor) {
    styles.push(`background-color: ${line.style.backgroundColor}`);
  }

  if (line.style.bold) {
    styles.push('font-weight: bold');
  }

  if (line.style.italic) {
    styles.push('font-style: italic');
  }

  if (line.style.underline) {
    styles.push('text-decoration: underline');
  }

  if (line.style.strikethrough) {
    styles.push('text-decoration: line-through');
  }

  if (line.style.dim) {
    styles.push('opacity: 0.6');
  }

  const styleAttr = styles.length > 0 ? ` style="${styles.join('; ')}"` : '';

  return `<span${styleAttr}>${escapeHtml(line.text)}</span>`;
}

/**
 * Escape HTML entities
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Detect message type based on content
 */
export function detectMessageType(text: string): 'info' | 'warning' | 'error' | 'success' | 'command' | 'normal' {
  const lower = text.toLowerCase();

  if (lower.includes('error') || lower.includes('failed') || lower.includes('exception')) {
    return 'error';
  }

  if (lower.includes('warning') || lower.includes('warn')) {
    return 'warning';
  }

  if (lower.includes('success') || lower.includes('completed') || lower.includes('done')) {
    return 'success';
  }

  if (text.startsWith('>') || text.startsWith('$') || text.startsWith('#')) {
    return 'command';
  }

  if (lower.includes('info') || lower.includes('[i]')) {
    return 'info';
  }

  return 'normal';
}

/**
 * Split text into manageable chunks for rendering
 */
export function splitIntoChunks(text: string, chunkSize: number = 1000): string[] {
  const lines = text.split('\n');
  const chunks: string[] = [];
  let currentChunk: string[] = [];

  for (const line of lines) {
    currentChunk.push(line);

    if (currentChunk.length >= chunkSize) {
      chunks.push(currentChunk.join('\n'));
      currentChunk = [];
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join('\n'));
  }

  return chunks;
}

/**
 * Performance-optimized batch parser for multiple lines
 */
export function batchParse(lines: string[], batchSize: number = 100): ParsedLine[] {
  const results: ParsedLine[] = [];

  for (let i = 0; i < lines.length; i += batchSize) {
    const batch = lines.slice(i, i + batchSize);
    for (const line of batch) {
      results.push(parseAnsiLine(line));
    }
  }

  return results;
}

/**
 * Check if text contains ANSI codes
 */
export function hasAnsiCodes(text: string): boolean {
  return /\x1B\[/.test(text);
}

/**
 * Strip all ANSI codes and return plain text
 */
export function stripAnsiCodes(text: string): string {
  return text.replace(/\x1B\[[0-9;]*[JKmsu]/g, '');
}
