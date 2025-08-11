/**
 * Legacy compatibility layer for env.ts
 * Redirects to the new centralized configuration
 */

export { config, validateConfig as validateConfiguration, logConfiguration } from './index';
export default './index';