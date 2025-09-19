import { describe, it, expect } from '@jest/globals';
import { AnsiParser, parseToSegments, stripAnsi } from '../ansiParser';

describe('AnsiParser', () => {
  describe('stripAnsi', () => {
    it('should remove ANSI codes from text', () => {
      const input = '\x1b[32mGreen Text\x1b[0m Normal';
      const expected = 'Green Text Normal';
      expect(stripAnsi(input)).toBe(expected);
    });

    it('should handle text without ANSI codes', () => {
      const input = 'Plain text';
      expect(stripAnsi(input)).toBe(input);
    });

    it('should remove complex ANSI sequences', () => {
      const input = '\x1b[1;33mBold Yellow\x1b[0m \x1b[41m\x1b[37mWhite on Red\x1b[0m';
      const expected = 'Bold Yellow White on Red';
      expect(stripAnsi(input)).toBe(expected);
    });
  });

  describe('parseToSegments', () => {
    it('should parse text into segments with styles', () => {
      const input = '\x1b[32mGreen\x1b[0m Normal';
      const segments = parseToSegments(input);
      
      expect(segments).toHaveLength(2);
      expect(segments[0]).toEqual({
        text: 'Green',
        style: { color: '#4e9a06' }
      });
      expect(segments[1]).toEqual({
        text: ' Normal',
        style: {}
      });
    });

    it('should handle bold text', () => {
      const input = '\x1b[1mBold Text\x1b[0m';
      const segments = parseToSegments(input);
      
      expect(segments).toHaveLength(1);
      expect(segments[0]).toEqual({
        text: 'Bold Text',
        style: { bold: true }
      });
    });

    it('should handle multiple style codes', () => {
      const input = '\x1b[1;31mBold Red\x1b[0m';
      const segments = parseToSegments(input);
      
      expect(segments).toHaveLength(1);
      expect(segments[0]).toEqual({
        text: 'Bold Red',
        style: { bold: true, color: '#cc0000' }
      });
    });

    it('should handle background colors', () => {
      const input = '\x1b[41mRed Background\x1b[0m';
      const segments = parseToSegments(input);
      
      expect(segments).toHaveLength(1);
      expect(segments[0]).toEqual({
        text: 'Red Background',
        style: { backgroundColor: '#cc0000' }
      });
    });
  });

  describe('parseToHtml', () => {
    it('should convert ANSI to HTML with inline styles', () => {
      const input = '\x1b[32mGreen\x1b[0m';
      const html = AnsiParser.parseToHtml(input);
      
      expect(html).toContain('<span style="color: #4e9a06">Green</span>');
    });

    it('should handle multiple styles in HTML', () => {
      const input = '\x1b[1;31mBold Red\x1b[0m';
      const html = AnsiParser.parseToHtml(input);
      
      expect(html).toContain('color: #cc0000');
      expect(html).toContain('font-weight: bold');
    });
  });

  describe('cleanTerminalOutput', () => {
    it('should remove terminal control sequences', () => {
      const input = '\x1b[2J\x1b[H\x1b[32mClean Text\x1b[0m\x1b[K';
      const cleaned = AnsiParser.cleanTerminalOutput(input);
      
      expect(cleaned).toBe('Clean Text');
    });

    it('should remove cursor movement codes', () => {
      const input = '\x1b[5A\x1b[10CText\x1b[2B';
      const cleaned = AnsiParser.cleanTerminalOutput(input);
      
      expect(cleaned).toBe('Text');
    });
  });

  describe('hasAnsiCodes', () => {
    it('should detect ANSI codes in text', () => {
      expect(AnsiParser.hasAnsiCodes('\x1b[32mGreen\x1b[0m')).toBe(true);
      expect(AnsiParser.hasAnsiCodes('Plain text')).toBe(false);
    });
  });
});