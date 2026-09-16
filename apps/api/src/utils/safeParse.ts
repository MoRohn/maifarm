/**
 * Safe JSON Parser with Prototype Pollution Protection
 *
 * Prevents:
 * - Prototype pollution attacks
 * - DoS via deeply nested objects
 * - Stack overflow from circular references
 * - Memory exhaustion from large payloads
 */

interface SafeParseOptions {
  maxDepth?: number;
  maxSize?: number;
  preventPrototypePollution?: boolean;
  allowedKeys?: string[];
  blockedKeys?: string[];
}

const DEFAULT_OPTIONS: Required<SafeParseOptions> = {
  maxDepth: 10,
  maxSize: 100000, // 100KB
  preventPrototypePollution: true,
  allowedKeys: [],
  blockedKeys: ['__proto__', 'constructor', 'prototype']
};

class SafeParseError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'SafeParseError';
  }
}

/**
 * Validates object depth to prevent stack overflow
 */
function validateDepth(obj: any, maxDepth: number, currentDepth = 0): void {
  if (currentDepth > maxDepth) {
    throw new SafeParseError(
      `Object depth exceeds maximum of ${maxDepth}`,
      'MAX_DEPTH_EXCEEDED'
    );
  }

  if (obj && typeof obj === 'object') {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        validateDepth(obj[key], maxDepth, currentDepth + 1);
      }
    }
  }
}

/**
 * Removes dangerous keys that could cause prototype pollution
 */
function sanitizeObject(
  obj: any,
  blockedKeys: string[],
  allowedKeys: string[]
): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, blockedKeys, allowedKeys));
  }

  const sanitized: any = {};

  for (const key in obj) {
    // Only process own properties
    if (!obj.hasOwnProperty(key)) continue;

    // Block dangerous keys
    if (blockedKeys.includes(key)) {
      continue;
    }

    // If allowedKeys is specified, only allow those keys
    if (allowedKeys.length > 0 && !allowedKeys.includes(key)) {
      continue;
    }

    // Recursively sanitize nested objects
    sanitized[key] = sanitizeObject(obj[key], blockedKeys, allowedKeys);
  }

  return sanitized;
}

/**
 * Safely parse JSON with protection against common attacks
 *
 * @param jsonString - JSON string to parse
 * @param options - Parsing options
 * @returns Parsed and sanitized object
 * @throws SafeParseError if validation fails
 *
 * @example
 * ```typescript
 * try {
 *   const data = safeParse(userInput, {
 *     maxDepth: 5,
 *     maxSize: 50000,
 *     preventPrototypePollution: true
 *   });
 * } catch (error) {
 *   if (error instanceof SafeParseError) {
 *     logger.warn('Malicious JSON detected', { code: error.code });
 *   }
 * }
 * ```
 */
export function safeParse<T = any>(
  jsonString: string,
  options: SafeParseOptions = {}
): T {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Validate input type
  if (typeof jsonString !== 'string') {
    throw new SafeParseError('Input must be a string', 'INVALID_INPUT_TYPE');
  }

  // Check size limit
  if (jsonString.length > opts.maxSize) {
    throw new SafeParseError(
      `JSON string exceeds maximum size of ${opts.maxSize} bytes`,
      'MAX_SIZE_EXCEEDED'
    );
  }

  // Parse JSON
  let parsed: any;
  try {
    parsed = JSON.parse(jsonString);
  } catch (error) {
    throw new SafeParseError(
      `Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'INVALID_JSON'
    );
  }

  // Validate depth
  try {
    validateDepth(parsed, opts.maxDepth);
  } catch (error) {
    if (error instanceof SafeParseError) {
      throw error;
    }
    throw new SafeParseError('Depth validation failed', 'DEPTH_VALIDATION_ERROR');
  }

  // Sanitize object to prevent prototype pollution
  if (opts.preventPrototypePollution) {
    parsed = sanitizeObject(parsed, opts.blockedKeys, opts.allowedKeys);
  }

  return parsed as T;
}

/**
 * Utility to check if a JSON string is safe without parsing
 */
export function isValidJSON(jsonString: string, options: SafeParseOptions = {}): boolean {
  try {
    safeParse(jsonString, options);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse with fallback to default value if parsing fails
 */
export function safeParseWithDefault<T = any>(
  jsonString: string,
  defaultValue: T,
  options: SafeParseOptions = {}
): T {
  try {
    return safeParse<T>(jsonString, options);
  } catch {
    return defaultValue;
  }
}

export { SafeParseError, SafeParseOptions };
