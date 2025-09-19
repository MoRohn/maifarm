/**
 * Legacy compatibility layer for env.ts
 * Redirects to the new centralized configuration
 */

export {
  config,
  validateConfiguration,
  logConfiguration,
  ConfigurationValidationError,
  ConfigurationValidationResult,
} from './index';

export default './index';
