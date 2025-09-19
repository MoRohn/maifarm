import DOMPurify from 'dompurify';

// Import the Config type separately to avoid namespace issues
type DOMPurifyConfig = {
  ALLOWED_TAGS?: string[];
  ALLOWED_ATTR?: string[];
  ALLOW_DATA_ATTR?: boolean;
  KEEP_CONTENT?: boolean;
  [key: string]: any;
};

/**
 * Sanitize HTML to prevent XSS attacks
 * @param dirty - The potentially unsafe HTML string
 * @param options - DOMPurify configuration options
 * @returns Sanitized HTML string
 */
export function sanitizeHtml(dirty: string, options?: DOMPurifyConfig): string {
  // Default configuration that allows common safe HTML elements
  const defaultConfig: DOMPurifyConfig = {
    ALLOWED_TAGS: [
      'b', 'i', 'em', 'strong', 'a', 'p', 'br', 'div', 'span',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'code', 'pre', 'blockquote'
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'id', 'style'],
    ALLOW_DATA_ATTR: false,
    ...options
  };

  return DOMPurify.sanitize(dirty, defaultConfig);
}

/**
 * Sanitize HTML for terminal output (more permissive)
 * @param dirty - The potentially unsafe HTML string
 * @returns Sanitized HTML string suitable for terminal display
 */
export function sanitizeTerminalHtml(dirty: string): string {
  const terminalConfig: DOMPurifyConfig = {
    ALLOWED_TAGS: [
      'b', 'i', 'em', 'strong', 'span', 'div', 'pre', 'code',
      'font', 'u', 's', 'strike', 'sub', 'sup'
    ],
    ALLOWED_ATTR: ['style', 'class', 'color', 'data-*'],
    ALLOW_DATA_ATTR: true,
    KEEP_CONTENT: true
  };

  return DOMPurify.sanitize(dirty, terminalConfig);
}

/**
 * Sanitize markdown content before rendering
 * @param markdown - The markdown string
 * @returns Sanitized markdown string
 */
export function sanitizeMarkdown(markdown: string): string {
  // Remove potential script tags and dangerous content from markdown
  const cleaned = markdown
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
  
  return cleaned;
}

/**
 * Check if a string contains potentially dangerous HTML
 * @param str - The string to check
 * @returns True if the string might contain dangerous HTML
 */
export function containsDangerousHtml(str: string): boolean {
  const dangerous = [
    /<script/i,
    /<iframe/i,
    /<object/i,
    /<embed/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /<img.*?onerror/i,
    /<svg.*?onload/i
  ];

  return dangerous.some(pattern => pattern.test(str));
}

/**
 * Create a safe HTML element with sanitized content
 * @param html - The HTML content
 * @returns An object with __html property for React's dangerouslySetInnerHTML
 */
export function createSafeHtml(html: string): { __html: string } {
  return { __html: sanitizeHtml(html) };
}

/**
 * Create safe terminal HTML for React's dangerouslySetInnerHTML
 * @param html - The terminal HTML content
 * @returns An object with __html property
 */
export function createSafeTerminalHtml(html: string): { __html: string } {
  return { __html: sanitizeTerminalHtml(html) };
}