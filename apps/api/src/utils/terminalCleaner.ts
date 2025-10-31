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
const CLAUDE_CODE_DIVIDER = /[─━]+/g;
const CLAUDE_CODE_STATUS_BAR = /⏵⏵ bypass.*?permissions on.*?cycle\)/g;
const CLAUDE_CODE_PROMPT_MARKER = />\s+You are .+ \(Agent \d+ of \d+\) working on farm/g;

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

  // Remove Claude Code headers
  cleaned = cleaned.replace(CLAUDE_CODE_HEADER, '');

  // Remove divider lines
  cleaned = cleaned.replace(CLAUDE_CODE_DIVIDER, '');

  // Remove status bars
  cleaned = cleaned.replace(CLAUDE_CODE_STATUS_BAR, '');

  // Remove repeated "You are Agent X of Y" prompts
  cleaned = cleaned.replace(CLAUDE_CODE_PROMPT_MARKER, '');

  // Remove screen clear sequences [2J[3J[H
  cleaned = cleaned.replace(/\[2J\[3J\[H/g, '');
  cleaned = cleaned.replace(/\[H\[2J/g, '');

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
 * Filter out shell prompts, timestamps, usernames, and command echoes, keeping only agent output
 */
export function filterShellPrompts(text: string): string {
  if (!text) return '';

  const lines = text.split('\n');
  const filtered: string[] = [];

  for (const line of lines) {
    let trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    // Remove timestamps at the beginning (ISO format, human-readable, etc.)
    trimmed = trimmed.replace(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?\s*/, '');
    trimmed = trimmed.replace(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]\s*/, '');
    trimmed = trimmed.replace(/^\d{2}:\d{2}:\d{2}\s*/, '');

    // Remove usernames/hostnames at the beginning
    trimmed = trimmed.replace(/^[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+:?\s*/, '');
    trimmed = trimmed.replace(/^[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+\s+in\s+.*?\s*/, '');

    // Skip % prompt indicators
    if (trimmed === '%' || trimmed.match(/^%\s*$/)) {
      continue;
    }

    // Skip command echoes that start with common commands
    if (trimmed.match(/^(cd|echo|clear|export|source|claude|cat|ls|pwd|mkdir|rm|cp|mv)\s+/)) {
      continue;
    }

    // Skip tmux command echoes (set-buffer, paste-buffer, send-keys)
    if (trimmed.match(/^(tmux|set-buffer|paste-buffer|send-keys)\s+/)) {
      continue;
    }

    // Skip environment variable exports
    if (trimmed.match(/^export\s+\w+=/) || trimmed.startsWith('AGENT_')) {
      continue;
    }

    // Skip raw prompt text being echoed back
    if (trimmed.startsWith('You are ') && trimmed.includes('working on farm')) {
      continue;
    }

    // Skip lines that are just file paths or numbers
    if (trimmed.match(/^[0-9]+$/) || trimmed.match(/^\/[a-zA-Z0-9_\-./]+$/)) {
      continue;
    }

    // Skip fragments that end with apostrophes (incomplete command echoes)
    if (trimmed.endsWith("'") && trimmed.length < 10) {
      continue;
    }

    // Skip lines that are just shell prompts
    if (trimmed.match(/^[\w-]+\s*>\s*$/) || trimmed.match(/^[\w-]+\s*\$\s*$/)) {
      continue;
    }

    // Only keep lines that look like actual agent output
    // Agent responses typically:
    // - Start with common sentence beginnings (I, Let, Here, The, This, etc.)
    // - Contain thinking indicators (🤔, analyzing, working on, etc.)
    // - Start with [MARKER] tags
    // - Are substantial sentences with proper capitalization

    const isAgentResponse =
      trimmed.match(/^\[.*?\]/) ||                          // [PIPE-PANE], [THINKING], etc.
      trimmed.match(/^(I|Let|Here|The|This|That|Now|First|Next|To|For|With|After|Before)\s/i) ||  // Common sentence starts
      trimmed.match(/🤔|analyzing|working|thinking|processing|generating|creating|building/i) ||    // Activity indicators
      trimmed.match(/^(Task|Step|Goal|Plan|Result|Output|Summary|Analysis):/i) ||                   // Structured output
      trimmed.startsWith('#') ||                            // Headers
      (trimmed.length > 30 && trimmed.match(/^[A-Z]/));   // Substantial capitalized text

    if (isAgentResponse) {
      filtered.push(trimmed);
    }
  }

  return filtered.join('\n');
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

  // 4. Normalize line endings (\r\n -> \n)
  if (options.normalizeLineEndings !== false) {
    cleaned = normalizeLineEndings(cleaned);
  }

  // 5. Process carriage returns (handles terminal overwrites)
  cleaned = processCarriageReturns(cleaned);

  // 6. Filter out shell prompts and command echoes
  cleaned = filterShellPrompts(cleaned);

  // 7. Remove duplicate consecutive lines (from screen redraws)
  const lines = cleaned.split('\n');
  const deduped: string[] = [];
  let lastLine = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && trimmed !== lastLine) {
      deduped.push(line);
      lastLine = trimmed;
    }
  }
  cleaned = deduped.join('\n');

  // 8. Trim empty lines if requested
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
