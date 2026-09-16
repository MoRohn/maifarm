/**
 * Terminal Output Cleaner
 *
 * Strips ANSI escape codes and cleans terminal output for WebSocket streaming
 */

// Comprehensive ANSI escape sequence pattern
// Matches CSI sequences, OSC sequences, and other escape codes
const ANSI_ESCAPE_PATTERN = /\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

// Bracketed paste mode codes
const BRACKETED_PASTE = /\x1b\[\?2004[hl]/g;

// Color codes pattern (subset to preserve if needed)
const ANSI_COLOR_PATTERN = /\x1b\[[0-9;]*m/g;

// Claude Code UI chrome patterns to remove
const CLAUDE_CODE_HEADER = /▐▛███▜▌\s+Claude Code v[\d.]+[\s\S]*?▘▘\s+▝▝/g;
const CLAUDE_CODE_DIVIDER = /^[─━]{3,}$/gm; // Only match dividers on their own lines
const CLAUDE_CODE_STATUS_BAR = /⏵⏵ bypass.*?permissions on.*?cycle\)/gs;
const CLAUDE_CODE_PROMPT_MARKER = />\s+You are .+ \(Agent \d+ of \d+\) working on farm/g;
const CLAUDE_CODE_THINKING = /\[38;5;\d+m[✻✽✶⏺].*?(Thinking|Dilly-dallying|Drizzling|Writing).*?\[39m/g;
const CLAUDE_CODE_STATUS_ICONS = /\[38;5;\d+m[⏺✻✽✶·◆].*?\[39m/g;
const CLAUDE_PROMPT_DEBRIS = /\[7m[A-Z]\[27m.*?Try "create a util.*?\.\.\./g;
const TMUX_NOISE = /\[\?2004[hl]|\[\?2026[hl]|\[\?1004h/g;
const CURSOR_CONTROL = /\[\d+[A-K]|\[\d+;\d+[Hf]|\[s|\[u/g;

export interface CleanOptions {
  preserveColor?: boolean;
  normalizeLineEndings?: boolean;
  trimEmpty?: boolean;
}

/**
 * Strip Claude Code UI chrome and repeated interface elements
 */
export function stripClaudeCodeUI(text: string): string {
  if (!text) return '';

  let cleaned = text;

  // Remove tmux control codes first
  cleaned = cleaned.replace(TMUX_NOISE, '');
  cleaned = cleaned.replace(CURSOR_CONTROL, '');

  // Remove Claude Code headers
  cleaned = cleaned.replace(CLAUDE_CODE_HEADER, '');

  // Remove divider lines (only full-line dividers)
  cleaned = cleaned.replace(CLAUDE_CODE_DIVIDER, '');

  // Remove status bars with all variations
  cleaned = cleaned.replace(CLAUDE_CODE_STATUS_BAR, '');
  cleaned = cleaned.replace(/Thinking off.*?tab to toggle/gs, '');
  cleaned = cleaned.replace(/Approaching Opus.*?best available model/gs, '');

  // Remove Claude thinking/status messages
  cleaned = cleaned.replace(CLAUDE_CODE_THINKING, '');
  cleaned = cleaned.replace(CLAUDE_CODE_STATUS_ICONS, '');

  // Remove prompt debris
  cleaned = cleaned.replace(CLAUDE_PROMPT_DEBRIS, '');

  // Remove repeated "You are Agent X of Y" prompts
  cleaned = cleaned.replace(CLAUDE_CODE_PROMPT_MARKER, '');

  // Remove screen clear sequences [2J[3J[H
  cleaned = cleaned.replace(/\[2J\[3J\[H/g, '');
  cleaned = cleaned.replace(/\[H\[J/g, '');
  cleaned = cleaned.replace(/\[\d+J/g, ''); // Clear screen variants

  // Remove terminal metadata lines
  cleaned = cleaned.replace(/\[Terminal\] Starting output capture.*?\n/g, '');
  cleaned = cleaned.replace(/\[PIPE-PANE\] Output capture started.*?\n/g, '');
  cleaned = cleaned.replace(/\[PIPE-TEST\] Verifying output capture.*?\n/g, '');

  // Remove shell prompt artifacts
  cleaned = cleaned.replace(/\[1m\[7m%\[27m\[1m\[0m.*?\[K/g, '');
  cleaned = cleaned.replace(/rohnspringfield@[\w-]+ [\w-]+\s*%/g, '');

  // Remove repeated workspace/coordination dir prints
  cleaned = cleaned.replace(/Workspace:.*?coordination/gs, '');
  cleaned = cleaned.replace(/Coordination dir:.*?\n/g, '');
  cleaned = cleaned.replace(/Collaboration Rules:[\s\S]*?avoid conflicts\./g, '');

  // Remove entire system prompt blocks (multiline)
  // Pattern: "You are [Agent Name] (Agent X of Y) working on farm [uuid]"
  cleaned = cleaned.replace(/You are .+ \(Agent \d+ of \d+\) working on farm [\w-]+\.[\s\S]*?(?=\n\n|\n[A-Z]|$)/g, '');

  // Remove role assignment lines
  cleaned = cleaned.replace(/Role: .+\n/g, '');

  // Remove workspace path lines
  cleaned = cleaned.replace(/Workspace: \/.*?\n/g, '');

  // Remove coordination directory lines
  cleaned = cleaned.replace(/Coordination dir: \/.*?\n/g, '');

  // Remove collaboration rules sections (more aggressive)
  cleaned = cleaned.replace(/Collaboration Rules:[\s\S]*?(?=\n\n[A-Z]|$)/g, '');

  // Remove GO WILD MODE banners
  cleaned = cleaned.replace(/\[GO WILD MODE.*?\][\s\S]*?(?=\n\n|$)/g, '');

  // Remove "Feel free to:" lists
  cleaned = cleaned.replace(/Feel free to:[\s\S]*?(?=\n\nOriginal request:|$)/g, '');

  // Remove "Original request:" lines but keep the actual request text
  cleaned = cleaned.replace(/Original request:\s*/g, '');

  // Remove "Remember:" admonitions
  cleaned = cleaned.replace(/Remember:[\s\S]*?(?=\n\n|$)/g, '');

  // Remove tmux paste buffer markers
  cleaned = cleaned.replace(/\[tmux paste buffer\]/gi, '');

  // Remove export commands for API keys
  cleaned = cleaned.replace(/export ANTHROPIC_API_KEY=.*?\n/g, '');
  cleaned = cleaned.replace(/export NODE_OPTIONS=.*?\n/g, '');

  // Remove cd commands to workspace
  cleaned = cleaned.replace(/cd \/Users\/.*?\/workspaces\/[\w-]+\n/g, '');

  return cleaned;
}

/**
 * Strip ANSI escape sequences from text
 */
export function stripAnsi(text: string, preserveColor = false): string {
  if (!text) return '';

  // Remove bracketed paste mode first
  text = text.replace(BRACKETED_PASTE, '');

  if (preserveColor) {
    // Keep only color codes, remove everything else
    const colorMatches = text.match(ANSI_COLOR_PATTERN) || [];
    text = text.replace(ANSI_ESCAPE_PATTERN, '');
    // Re-insert color codes (this is tricky, for now just remove all)
    return text;
  }

  // Remove all ANSI codes
  return text.replace(ANSI_ESCAPE_PATTERN, '');
}

/**
 * Fix duplicate keystroke artifacts from tmux echo
 * Examples: "eecho" -> "echo", "cclear" -> "clear", "ccd" -> "cd"
 */
export function fixDuplicateKeystrokes(text: string): string {
  if (!text) return '';

  let fixed = text;

  // Common duplicate patterns (most aggressive matching)
  const duplicatePatterns: Array<[RegExp, string]> = [
    // Whole word duplicates at start of line
    [/^eecho\b/gm, 'echo'],
    [/^cclear\b/gm, 'clear'],
    [/^ccd\b/gm, 'cd'],
    [/^lls\b/gm, 'ls'],
    [/^ppwd\b/gm, 'pwd'],
    [/^mmkdir\b/gm, 'mkdir'],
    [/^tttouch\b/gm, 'touch'],
    [/^ccat\b/gm, 'cat'],
    [/^nnpm\b/gm, 'npm'],
    [/^ggit\b/gm, 'git'],
    [/^eexport\b/gm, 'export'],
    [/^ssource\b/gm, 'source'],
    [/^cclaude\b/gm, 'claude'],

    // After whitespace
    [/(\s)eecho\b/g, '$1echo'],
    [/(\s)cclear\b/g, '$1clear'],
    [/(\s)ccd\b/g, '$1cd'],
    [/(\s)lls\b/g, '$1ls'],
    [/(\s)ppwd\b/g, '$1pwd'],
  ];

  for (const [pattern, replacement] of duplicatePatterns) {
    fixed = fixed.replace(pattern, replacement);
  }

  // Generic pattern: first character duplicated at word start
  // Be careful - only apply to lowercase command-like words
  fixed = fixed.replace(/\b([a-z])(\1)([a-z]{2,})\b/g, (match, char, dup, rest) => {
    // Only fix if it looks like a command (all lowercase, 3+ chars total)
    return char + rest;
  });

  return fixed;
}

/**
 * Process carriage returns - when \r appears without \n, it means overwrite from start of line
 */
export function processCarriageReturns(text: string): string {
  if (!text) return '';

  // Split by actual newlines first
  const lines = text.split('\n');
  const processed: string[] = [];

  for (const line of lines) {
    // If line contains \r without preceding \n, it means terminal overwrite
    if (line.includes('\r')) {
      // Split by \r and find the best segment (longest one with brackets, or last one)
      const segments = line.split('\r');

      // Prefer segments that contain bracketed content like [PIPE-PANE], [MOCK], etc.
      const bracketedSegment = segments.find(seg => seg.includes('[') && seg.includes(']'));
      if (bracketedSegment && bracketedSegment.trim()) {
        processed.push(bracketedSegment.trim());
      } else {
        // Otherwise take the longest non-empty segment
        const longest = segments
          .filter(seg => seg.trim())
          .sort((a, b) => b.length - a.length)[0];
        if (longest) {
          processed.push(longest.trim());
        }
      }
    } else if (line.trim()) {
      processed.push(line);
    }
  }

  return processed.join('\n');
}

/**
 * Normalize line endings to \n
 */
export function normalizeLineEndings(text: string): string {
  if (!text) return '';

  // First normalize \r\n to \n (Windows line endings)
  return text.replace(/\r\n/g, '\n');
}

/**
 * Process backspace characters to simulate terminal behavior
 */
export function expandBackspaces(text: string): string {
  if (!text) return '';

  const result: string[] = [];
  for (const char of text) {
    if (char === '\b') {
      if (result.length > 0) {
        result.pop();
      }
    } else {
      result.push(char);
    }
  }
  return result.join('');
}

/**
 * Filter out shell prompts, timestamps, usernames, PWD, and command echoes, keeping agent output
 * CRITICAL: Be CONSERVATIVE - when in doubt, KEEP the line
 */
export function filterShellPrompts(text: string): string {
  if (!text) return '';

  const lines = text.split('\n');
  const filtered: string[] = [];

  for (const line of lines) {
    let trimmed = line.trim();

    // Keep empty lines for spacing (but limit consecutive empties later)
    if (!trimmed) {
      filtered.push('');
      continue;
    }

    // ONLY filter out obvious shell artifacts - be very conservative

    // Skip ONLY standalone % or $ prompts (nothing else on line)
    if (trimmed === '%' || trimmed === '$' || trimmed === '>' || trimmed === '#') {
      continue;
    }

    // Skip ONLY pure shell prompt patterns (username > with nothing after)
    if (trimmed.match(/^[\w@.-]+\s*[>$#]\s*$/) && trimmed.length < 30) {
      continue;
    }

    // Skip ONLY environment variable exports (EXPORT FOO=bar)
    if (trimmed.match(/^export\s+[A-Z_]+=/)) {
      continue;
    }

    // Skip ONLY shell initialization messages
    if (trimmed.match(/^(Last login|Welcome to|The default interactive shell is now)/)) {
      continue;
    }

    // Skip ONLY raw agent system prompts (the long prompt text)
    if (trimmed.startsWith('You are ') && trimmed.includes('working on farm') && trimmed.length > 100) {
      continue;
    }

    // KEEP EVERYTHING ELSE - including:
    // - Claude Code UI output (Thinking..., Drizzling..., etc.)
    // - Agent responses and tool calls
    // - File operations and search results
    // - Any text that might be meaningful output

    filtered.push(line); // Keep original indentation
  }

  // Remove excessive consecutive empty lines (max 2)
  const result: string[] = [];
  let emptyCount = 0;
  for (const line of filtered) {
    if (line.trim() === '') {
      emptyCount++;
      if (emptyCount <= 2) {
        result.push(line);
      }
    } else {
      emptyCount = 0;
      result.push(line);
    }
  }

  return result.join('\n');
}

/**
 * Clean terminal output for display
 */
export function cleanTerminalOutput(text: string, options: CleanOptions = {}): string {
  if (!text) return '';

  let cleaned = text;

  // 1. Strip ANSI codes FIRST (before processing text structure)
  cleaned = stripAnsi(cleaned, options.preserveColor);

  // 2. Strip Claude Code UI chrome (headers, dividers, repeated prompts)
  cleaned = stripClaudeCodeUI(cleaned);

  // 3. Expand backspaces (simulates terminal behavior)
  cleaned = expandBackspaces(cleaned);

  // 4. Fix duplicate keystrokes from tmux echo (eecho -> echo, cclear -> clear)
  cleaned = fixDuplicateKeystrokes(cleaned);

  // 5. Normalize line endings (\r\n -> \n)
  if (options.normalizeLineEndings !== false) {
    cleaned = normalizeLineEndings(cleaned);
  }

  // 6. Process carriage returns (handles terminal overwrites)
  cleaned = processCarriageReturns(cleaned);

  // 7. Filter out shell prompts and command echoes
  cleaned = filterShellPrompts(cleaned);

  // 8. Remove ONLY exact duplicate consecutive lines (not all similar lines)
  // This preserves repeated status updates but removes true duplicates
  const lines = cleaned.split('\n');
  const deduped: string[] = [];
  let lastLine = '';
  for (const line of lines) {
    // Only skip if EXACTLY the same as previous line (including whitespace)
    if (line !== lastLine) {
      deduped.push(line);
    }
    lastLine = line;
  }
  cleaned = deduped.join('\n');

  // 9. Trim empty lines if requested
  if (options.trimEmpty) {
    cleaned = cleaned
      .split('\n')
      .filter(line => line.trim().length > 0)
      .join('\n');
  }

  return cleaned;
}

/**
 * Clean lines for streaming (splits into clean lines)
 */
export function cleanTerminalLines(text: string, options: CleanOptions = {}): string[] {
  if (!text) return [];

  const cleaned = cleanTerminalOutput(text, options);
  const lines = cleaned.split('\n');

  if (options.trimEmpty) {
    return lines.filter(line => line.trim().length > 0);
  }

  return lines;
}

/**
 * Extract meaningful agent messages from terminal output
 * Focus on actual work output, tool calls, and important status updates
 */
export function extractAgentMessages(text: string): string[] {
  if (!text) return [];

  // First clean the output
  const cleaned = cleanTerminalOutput(text, {
    preserveColor: false,
    normalizeLineEndings: true,
    trimEmpty: true
  });

  const lines = cleaned.split('\n');
  const messages: string[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    // Detect code blocks
    if (trimmed.includes('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLines = [trimmed];
      } else {
        codeBlockLines.push(trimmed);
        messages.push(codeBlockLines.join('\n'));
        codeBlockLines = [];
        inCodeBlock = false;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Keep agent responses (starting with "I'll", "Let me", etc.)
    if (trimmed.match(/^(I'll|I will|Let me|I've|I have|Here|This|The|Creating|Writing|Running|Executing|Analyzing)/)) {
      messages.push(trimmed);
      continue;
    }

    // Keep tool calls (Write, Bash, Read, etc.)
    if (trimmed.match(/^(Write|Bash|Read|Edit|Grep|Glob|Search)\(/)) {
      messages.push(`🔧 ${trimmed}`);
      continue;
    }

    // Keep file creation messages
    if (trimmed.includes('hello_world_time.py') || trimmed.includes('.py')) {
      messages.push(`📄 ${trimmed}`);
      continue;
    }

    // Keep important status messages
    if (trimmed.match(/(completed|created|finished|success|failed|error)/i)) {
      messages.push(trimmed);
      continue;
    }

    // Keep lines that look like actual output (not shell/UI noise)
    if (trimmed.length > 20 && !trimmed.includes('[') && !trimmed.includes('%') && !trimmed.includes('$')) {
      messages.push(trimmed);
    }
  }

  return messages;
}
