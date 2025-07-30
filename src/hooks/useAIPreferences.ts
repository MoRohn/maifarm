import { useState, useEffect } from 'react';
import { useUserStore } from '../store/userStore';
import { aiPreferences } from '../services/aiPreferences';

interface AIPreferenceSuggestion {
  id: string;
  category: string;
  suggestion: any;
  reason: string;
  confidence: number;
  basedOn: string[];
  timestamp: Date;
}

export const useAIPreferences = () => {
  const { user, preferences, userActivity } = useUserStore();
  const [aiSuggestions, setAiSuggestions] = useState<AIPreferenceSuggestion[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    if (preferences?.aiSuggestions?.enabled && userActivity) {
      analyzeUserBehavior();
    }
  }, [userActivity, preferences?.aiSuggestions?.enabled]);

  const analyzeUserBehavior = async () => {
    if (!user || !userActivity || isAnalyzing) return;

    setIsAnalyzing(true);
    try {
      const suggestions = await aiPreferences.generateSuggestions(userActivity, preferences);
      setAiSuggestions(suggestions);
    } catch (error) {
      console.error('Failed to generate AI suggestions:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const acceptSuggestion = async (suggestionId: string) => {
    const suggestion = aiSuggestions.find(s => s.id === suggestionId);
    if (!suggestion) return;

    try {
      await aiPreferences.applySuggestion(suggestion);
      setAiSuggestions(prev => prev.filter(s => s.id !== suggestionId));
      
      // Track that the suggestion was accepted for future learning
      await aiPreferences.trackSuggestionFeedback(suggestionId, 'accepted');
    } catch (error) {
      console.error('Failed to apply suggestion:', error);
    }
  };

  const dismissSuggestion = async (suggestionId: string) => {
    setAiSuggestions(prev => prev.filter(s => s.id !== suggestionId));
    
    // Track that the suggestion was dismissed for future learning
    await aiPreferences.trackSuggestionFeedback(suggestionId, 'dismissed');
  };

  const requestSuggestions = async (category?: string) => {
    setIsAnalyzing(true);
    try {
      const suggestions = await aiPreferences.generateSuggestions(
        userActivity, 
        preferences,
        category
      );
      setAiSuggestions(suggestions);
    } catch (error) {
      console.error('Failed to generate AI suggestions:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return {
    aiSuggestions,
    isAnalyzing,
    acceptSuggestion,
    dismissSuggestion,
    requestSuggestions,
    analyzeUserBehavior
  };
};