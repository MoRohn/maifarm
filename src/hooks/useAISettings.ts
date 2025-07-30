import { useState, useEffect, useCallback } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { useUserStore } from '../store/userStore';
import { AISuggestion, ConfigTemplate } from '../types/settings';
import { aiSettingsService } from '../services/aiSettingsService';

export const useAISettings = () => {
  const { settings, updateSettings } = useSettingsStore();
  const { user } = useUserStore();
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Get AI suggestions based on user behavior
  const analyzeUserBehavior = useCallback(async () => {
    setIsAnalyzing(true);
    try {
      const userActivity = await aiSettingsService.analyzeUserActivity(user?.id || '');
      const aiSuggestions = await aiSettingsService.generateSuggestions(userActivity, settings);
      setSuggestions(aiSuggestions);
    } catch (error) {
      console.error('Failed to analyze user behavior:', error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [user, settings]);

  // Apply an AI suggestion
  const applyAISuggestion = useCallback(async (suggestionId: string) => {
    const suggestion = suggestions.find(s => s.id === suggestionId);
    if (!suggestion) return;

    try {
      await suggestion.action();
      // Remove applied suggestion
      setSuggestions(prev => prev.filter(s => s.id !== suggestionId));
    } catch (error) {
      console.error('Failed to apply suggestion:', error);
    }
  }, [suggestions]);

  // Get AI notification suggestions
  const getAINotificationSuggestions = useCallback(async () => {
    try {
      const userPatterns = await aiSettingsService.analyzeNotificationPatterns(user?.id || '');
      return aiSettingsService.generateNotificationSuggestions(userPatterns);
    } catch (error) {
      console.error('Failed to get notification suggestions:', error);
      return [];
    }
  }, [user]);

  // Generate farm template from AI
  const generateFarmTemplate = useCallback(async (prompt: string): Promise<ConfigTemplate> => {
    try {
      const template = await aiSettingsService.generateFarmTemplate(prompt);
      return {
        id: Date.now().toString(),
        name: template.name,
        description: template.description,
        category: 'farm',
        config: template.config,
        isDefault: false,
        createdBy: user?.id || 'ai',
        createdAt: new Date().toISOString(),
        tags: template.tags,
      };
    } catch (error) {
      console.error('Failed to generate farm template:', error);
      throw error;
    }
  }, [user]);

  // Analyze settings efficiency
  const analyzeSettingsEfficiency = useCallback(async () => {
    try {
      const analysis = await aiSettingsService.analyzeSettingsEfficiency(settings);
      return analysis;
    } catch (error) {
      console.error('Failed to analyze settings:', error);
      return null;
    }
  }, [settings]);

  // Auto-optimize settings
  const autoOptimizeSettings = useCallback(async () => {
    if (!settings.user?.aiAssistant?.autoOptimize) return;

    try {
      const optimizedSettings = await aiSettingsService.optimizeSettings(settings);
      updateSettings(optimizedSettings);
    } catch (error) {
      console.error('Failed to optimize settings:', error);
    }
  }, [settings, updateSettings]);

  // Load suggestions on mount
  useEffect(() => {
    if (settings.user?.aiAssistant?.enabled) {
      analyzeUserBehavior();
    }
  }, []);

  return {
    suggestions,
    isAnalyzing,
    analyzeUserBehavior,
    applyAISuggestion,
    getAINotificationSuggestions,
    generateFarmTemplate,
    analyzeSettingsEfficiency,
    autoOptimizeSettings,
  };
};