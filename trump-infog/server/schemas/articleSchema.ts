import { body, query, param } from 'express-validator'
import { sanitizeString, sanitizeArray } from '../middleware/validation.js'

/**
 * Validation for article query parameters
 */
export const validateArticleQuery = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date'),
  
  query('sources')
    .optional()
    .isString()
    .customSanitizer((value) => value ? value.split(',').map(sanitizeString) : []),
  
  query('categories')
    .optional()
    .isString()
    .customSanitizer((value) => value ? value.split(',').map(sanitizeString) : []),
  
  query('search')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 200 })
    .customSanitizer(sanitizeString),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .toInt(),
  
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .toInt()
]

/**
 * Validation for NewsAPI collection
 */
export const validateNewsAPICollection = [
  body('query')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 200 })
    .customSanitizer(sanitizeString),
  
  body('maxArticles')
    .optional()
    .isInt({ min: 1, max: 100 })
    .toInt()
    .withMessage('Max articles must be between 1 and 100')
]

/**
 * Validation for RSS collection
 */
export const validateRSSCollection = [
  body('feeds')
    .optional()
    .isArray()
    .withMessage('Feeds must be an array')
    .customSanitizer(sanitizeArray),
  
  body('keywords')
    .optional()
    .isArray()
    .withMessage('Keywords must be an array')
    .customSanitizer(sanitizeArray)
]

/**
 * Validation for article ID parameter
 */
export const validateArticleId = [
  param('id')
    .isUUID()
    .withMessage('Invalid article ID format')
]

/**
 * Validation for source name parameter
 */
export const validateSourceName = [
  param('sourceName')
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .customSanitizer(sanitizeString)
    .withMessage('Source name must be between 1 and 100 characters')
]

/**
 * Validation for cleanup operation
 */
export const validateCleanup = [
  body('daysToKeep')
    .optional()
    .isInt({ min: 1, max: 365 })
    .toInt()
    .withMessage('Days to keep must be between 1 and 365')
]