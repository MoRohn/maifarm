/**
 * Date utility functions for consistent date handling
 */

/**
 * Ensures a value is a Date object
 * @param value - Date, string, or number to convert
 * @returns Date object
 */
export function ensureDate(value: Date | string | number): Date {
  if (value instanceof Date) {
    return value;
  }
  return new Date(value);
}

/**
 * Safely converts a value to Date or returns undefined
 * @param value - Value to convert
 * @returns Date object or undefined
 */
export function toDateOrUndefined(value: Date | string | number | undefined | null): Date | undefined {
  if (!value) {
    return undefined;
  }
  return ensureDate(value);
}

/**
 * Formats a date to ISO string
 * @param date - Date to format
 * @returns ISO string representation
 */
export function toISOString(date: Date | string | number): string {
  return ensureDate(date).toISOString();
}