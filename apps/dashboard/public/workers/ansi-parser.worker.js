/**
 * ANSI Parser Web Worker
 *
 * Offloads ANSI parsing to a background thread to keep the main thread responsive.
 * Handles large volumes of terminal output without blocking the UI.
 */

// ANSI color palette
const ANSI_COLORS = {
  30: '#000000', 31: '#CD3131', 32: '#0DBC79', 33: '#E5E510',
  34: '#2472C8', 35: '#BC3FBC', 36: '#11A8CD', 37: '#E5E5E5',
  90: '#666666', 91: '#F14C4C', 92: '#23D18B', 93: '#F5F543',
  94: '#3B8EEA', 95: '#D670D6', 96: '#29B8DB', 97: '#FFFFFF'
};

// Clean terminal output
function cleanTerminalOutput(text) {
  if (!text) return '';

  let cleaned = text;

  // Remove ANSI escape sequences
  cleaned = cleaned.replace(/\x1B\[[0-9;]*[JKmsu]/g, '');
  cleaned = cleaned.replace(/\x1B\][0-9];[^\x07]*\x07/g, '');
  cleaned = cleaned.replace(/\x1B\][0-9];[^\x1B]*\x1B\\/g, '');

  // Remove control characters except newline and tab
  cleaned = cleaned.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

  // Remove box drawing characters
  cleaned = cleaned.replace(/[╭─╮│╰╯⏵◆✻✽·]/g, '');

  // Remove excessive whitespace
  cleaned = cleaned.replace(/  +/g, ' ');

  return cleaned;
}

// Parse ANSI line
function parseAnsiLine(line) {
  const style = {};
  let text = '';
  let i = 0;

  while (i < line.length) {
    if (line[i] === '\x1B' && line[i + 1] === '[') {
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

// Apply ANSI codes to style
function applyAnsiCodes(codes, style) {
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];

    switch (code) {
      case 0: // Reset
        Object.keys(style).forEach(key => delete style[key]);
        break;

      case 1: style.bold = true; break;
      case 2: style.dim = true; break;
      case 3: style.italic = true; break;
      case 4: style.underline = true; break;
      case 7: style.inverse = true; break;
      case 9: style.strikethrough = true; break;

      case 22: style.bold = false; style.dim = false; break;
      case 23: style.italic = false; break;
      case 24: style.underline = false; break;
      case 27: style.inverse = false; break;
      case 29: style.strikethrough = false; break;

      // Foreground colors
      case 30: case 31: case 32: case 33:
      case 34: case 35: case 36: case 37:
      case 90: case 91: case 92: case 93:
      case 94: case 95: case 96: case 97:
        style.color = ANSI_COLORS[code];
        break;

      // Background colors
      case 40: case 41: case 42: case 43:
      case 44: case 45: case 46: case 47:
        style.backgroundColor = ANSI_COLORS[code - 10];
        break;

      case 100: case 101: case 102: case 103:
      case 104: case 105: case 106: case 107:
        style.backgroundColor = ANSI_COLORS[code - 10];
        break;

      case 39: delete style.color; break;
      case 49: delete style.backgroundColor; break;
    }
  }
}

// Batch parse lines
function batchParse(lines) {
  return lines.map(line => parseAnsiLine(line));
}

// Message handler
self.onmessage = function(e) {
  const { type, data, id } = e.data;

  try {
    let result;

    switch (type) {
      case 'parse-line':
        result = parseAnsiLine(data);
        break;

      case 'parse-batch':
        result = batchParse(data);
        break;

      case 'clean':
        result = cleanTerminalOutput(data);
        break;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }

    self.postMessage({
      type: 'success',
      id,
      result
    });

  } catch (error) {
    self.postMessage({
      type: 'error',
      id,
      error: error.message
    });
  }
};

// Notify that worker is ready
self.postMessage({ type: 'ready' });
