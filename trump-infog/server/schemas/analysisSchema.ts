import { body, query, param } from 'express-validator'
import { sanitizeString, sanitizeArray, isValidUUID } from '../middleware/validation.js'

/**
 * Validation for analysis query parameters
 */
export const validateAnalysisQuery = [
  query('articleIds')
    .optional()
    .isString()
    .customSanitizer((value) => {
      if (!value) return []
      return value.split(',').filter(id => isValidUUID(id))
    }),
  
  query('minSentiment')
    .optional()
    .isFloat({ min: -1, max: 1 })
    .toFloat()
    .withMessage('Min sentiment must be between -1 and 1'),
  
  query('maxSentiment')
    .optional()
    .isFloat({ min: -1, max: 1 })
    .toFloat()
    .withMessage('Max sentiment must be between -1 and 1'),
  
  query('themes')
    .optional()
    .isString()
    .customSanitizer((value) => value ? value.split(',').map(sanitizeString) : []),
  
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
 * Validation for creating analysis
 */
export const validateCreateAnalysis = [
  body('article_id')
    .notEmpty()
    .isUUID()
    .withMessage('Valid article ID is required'),
  
  body('sentiment_score')
    .notEmpty()
    .isFloat({ min: -1, max: 1 })
    .withMessage('Sentiment score must be between -1 and 1'),
  
  body('sentiment_label')
    .notEmpty()
    .isString()
    .isIn(['very_negative', 'negative', 'neutral', 'positive', 'very_positive'])
    .withMessage('Invalid sentiment label'),
  
  body('themes')
    .isArray()
    .withMessage('Themes must be an array')
    .customSanitizer(sanitizeArray),
  
  body('entities')
    .isObject()
    .withMessage('Entities must be an object')
    .custom((value) => {
      const allowedKeys = ['people', 'organizations', 'locations', 'events', 'dates']
      const keys = Object.keys(value)
      
      for (const key of keys) {
        if (!allowedKeys.includes(key)) {
          throw new Error(`Invalid entity type: ${key}`)
        }
        if (!Array.isArray(value[key])) {
          throw new Error(`Entity ${key} must be an array`)
        }
      }
      
      return true
    }),
  
  body('key_phrases')
    .isArray()
    .withMessage('Key phrases must be an array')
    .customSanitizer(sanitizeArray),
  
  body('summary')
    .notEmpty()
    .isString()
    .isLength({ min: 10, max: 1000 })
    .customSanitizer(sanitizeString)
    .withMessage('Summary must be between 10 and 1000 characters'),
  
  body('word_count')
    .notEmpty()
    .isInt({ min: 0 })
    .withMessage('Word count must be a non-negative integer'),
  
  body('reading_time_minutes')
    .notEmpty()
    .isInt({ min: 0 })
    .withMessage('Reading time must be a non-negative integer')
]

/**
 * Validation for analysis ID parameter
 */
export const validateAnalysisId = [
  param('id')
    .isUUID()
    .withMessage('Invalid analysis ID format')
]

/**
 * Validation for article ID parameter
 */
export const validateArticleIdParam = [
  param('articleId')
    .isUUID()
    .withMessage('Invalid article ID format')
]

/**
 * Validation for sentiment trends query
 */
export const validateSentimentTrends = [
  query('days')
    .optional()
    .isInt({ min: 1, max: 365 })
    .toInt()
    .withMessage('Days must be between 1 and 365')
]

/**
 * Validation for top themes query
 */
export const validateTopThemes = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .toInt()
    .withMessage('Limit must be between 1 and 50')
]