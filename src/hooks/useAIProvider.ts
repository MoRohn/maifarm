import { useState, useEffect, useCallback } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import type { AIProvider } from '../components/common/AIProviderSelector';

interface AIProviderHook {
  provider: AIProvider;
  setProvider: (provider: AIProvider) => void;
  isValidating: boolean;
  isConfigured: boolean;
  validateProvider: () => Promise<boolean>;
  providerStatus: {
    claude: { configured: boolean; enabled: boolean };
    qwen: { configured: boolean; enabled: boolean };
  };
}

export const useAIProvider = (): AIProviderHook => {
  const { settings, updateSettings } = useSettingsStore();
  const [isValidating, setIsValidating] = useState(false);
  const [isConfigured, setIsConfigured] = useState(true);
  const [providerStatus, setProviderStatus] = useState({
    claude: { configured: true, enabled: true },
    qwen: { configured: false, enabled: false }
  });

  // Get provider from settings with fallback
  const provider = (settings.aiProvider as AIProvider) || 'claude';

  // Fetch provider status on mount
  useEffect(() => {
    fetchProviderStatus();
  }, []);

  const fetchProviderStatus = async () => {
    try {
      const response = await fetch('/api/providers/status');
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data.providers) {
          const status = {
            claude: { configured: false, enabled: false },
            qwen: { configured: false, enabled: false }
          };
          
          result.data.providers.forEach((p: any) => {
            status[p.provider as AIProvider] = {
              configured: p.configured,
              enabled: p.enabled
            };
          });
          
          setProviderStatus(status);
        }
      }
    } catch (error) {
      console.error('Failed to fetch provider status:', error);
    }
  };

  const setProvider = useCallback((newProvider: AIProvider) => {
    updateSettings({ aiProvider: newProvider } as any);
  }, [updateSettings]);

  const validateProvider = useCallback(async (): Promise<boolean> => {
    setIsValidating(true);
    try {
      const response = await fetch(`/api/providers/${provider}`);
      const result = await response.json();
      
      if (result.success && result.data) {
        const configured = result.data.configured && result.data.enabled;
        setIsConfigured(configured);
        
        // Update provider status
        setProviderStatus(prev => ({
          ...prev,
          [provider]: { configured: result.data.configured, enabled: result.data.enabled }
        }));
        
        return configured;
      } else {
        setIsConfigured(false);
        return false;
      }
    } catch (error) {
      console.error('Failed to validate provider:', error);
      setIsConfigured(false);
      return false;
    } finally {
      setIsValidating(false);
    }
  }, [provider]);

  // Validate current provider when it changes
  useEffect(() => {
    validateProvider();
  }, [provider, validateProvider]);

  return {
    provider,
    setProvider,
    isValidating,
    isConfigured,
    validateProvider,
    providerStatus
  };
};