/**
 * API Key Validator Service
 * Checks for required API keys before launching farms
 */

import { logger } from '../utils/logger';
import { db } from '../database/connection';

export interface ApiKeyStatus {
  valid: boolean;
  provider: string;
  error?: string;
  suggestions?: string[];
}

export class ApiKeyValidator {
  /**
   * Validate API keys for the specified provider
   */
  static async validateForProvider(provider: string): Promise<ApiKeyStatus> {
    const status: ApiKeyStatus = {
      valid: false,
      provider
    };
    
    try {
      // Check environment variables first
      const envKeys = this.checkEnvironmentKeys(provider);
      if (envKeys.valid) {
        status.valid = true;
        return status;
      }
      
      // Check database for stored API keys
      const dbKeys = await this.checkDatabaseKeys(provider);
      if (dbKeys.valid) {
        status.valid = true;
        return status;
      }
      
      // No valid keys found
      status.error = `No API key found for provider: ${provider}`;
      status.suggestions = this.getSuggestions(provider);
      
      logger.warn(`[ApiKeyValidator] ${status.error}`);
      
    } catch (error) {
      logger.error(`[ApiKeyValidator] Error validating API keys:`, error);
      status.error = 'Failed to validate API keys';
    }
    
    return status;
  }
  
  /**
   * Check environment variables for API keys
   */
  private static checkEnvironmentKeys(provider: string): { valid: boolean } {
    switch (provider.toLowerCase()) {
      case 'claude':
      case 'anthropic':
        return {
          valid: !!(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY)
        };
        
      case 'openai':
      case 'gpt':
        return {
          valid: !!process.env.OPENAI_API_KEY
        };
        
      case 'ollama':
        // Ollama doesn't require API keys
        return { valid: true };
        
      case 'mock':
        // Mock provider for testing
        return { valid: true };
        
      default:
        return { valid: false };
    }
  }
  
  /**
   * Check database for stored API keys
   */
  private static async checkDatabaseKeys(provider: string): Promise<{ valid: boolean }> {
    try {
      const result = await db.query(
        `SELECT COUNT(*) as count 
         FROM api_keys 
         WHERE service = $1 
         AND is_active = true 
         AND key_encrypted IS NOT NULL`,
        [provider.toLowerCase()]
      );
      
      return {
        valid: result.rows[0].count > 0
      };
    } catch (error) {
      logger.error(`[ApiKeyValidator] Database check failed:`, error);
      return { valid: false };
    }
  }
  
  /**
   * Get suggestions for missing API keys
   */
  private static getSuggestions(provider: string): string[] {
    const suggestions: string[] = [];
    
    switch (provider.toLowerCase()) {
      case 'claude':
      case 'anthropic':
        suggestions.push(
          'Add ANTHROPIC_API_KEY to your .env.development file',
          'Get your API key from https://console.anthropic.com/',
          'Or configure via Settings > API Keys in the UI'
        );
        break;
        
      case 'openai':
      case 'gpt':
        suggestions.push(
          'Add OPENAI_API_KEY to your .env.development file',
          'Get your API key from https://platform.openai.com/api-keys',
          'Or configure via Settings > API Keys in the UI'
        );
        break;
        
      default:
        suggestions.push(
          `Configure API key for ${provider} provider`,
          'Check Settings > API Keys in the UI'
        );
    }
    
    return suggestions;
  }
  
  /**
   * Create a mock API key for development/testing
   */
  static createMockApiKey(provider: string): string {
    logger.warn(`[ApiKeyValidator] Using mock API key for ${provider} - agents will not actually run`);
    return `mock-${provider}-key-${Date.now()}`;
  }
  
  /**
   * Validate and prepare environment for farm launch
   */
  static async prepareEnvironment(provider: string): Promise<{
    ready: boolean;
    error?: string;
    usingMock?: boolean;
  }> {
    const validation = await this.validateForProvider(provider);
    
    if (validation.valid) {
      return { ready: true };
    }
    
    // In development mode with BYPASS_AUTH, use mock keys
    if (process.env.NODE_ENV === 'development' && process.env.BYPASS_AUTH === 'true') {
      const mockKey = this.createMockApiKey(provider);
      
      // Temporarily set the mock key
      if (provider.toLowerCase() === 'claude' || provider.toLowerCase() === 'anthropic') {
        process.env.ANTHROPIC_API_KEY = mockKey;
      } else if (provider.toLowerCase() === 'openai') {
        process.env.OPENAI_API_KEY = mockKey;
      }
      
      return {
        ready: true,
        usingMock: true
      };
    }
    
    return {
      ready: false,
      error: validation.error
    };
  }
}

export default ApiKeyValidator;