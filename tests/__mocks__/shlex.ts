/**
 * Mock for shlex module
 * Provides shell-safe quoting for command arguments
 */

export function quote(s: string): string {
  // Simple shell quoting - wrap in single quotes and escape internal single quotes
  if (!s) return "''";
  if (/^[a-zA-Z0-9._\-/]+$/.test(s)) {
    return s;
  }
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

export function split(s: string): string[] {
  // Simple shell splitting - split on whitespace respecting quotes
  const result: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];

    if (c === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (c === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (c === ' ' && !inSingle && !inDouble) {
      if (current) {
        result.push(current);
        current = '';
      }
    } else {
      current += c;
    }
  }

  if (current) {
    result.push(current);
  }

  return result;
}

export default {
  quote,
  split
};
