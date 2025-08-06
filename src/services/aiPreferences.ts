import { UserActivity, UserPreferences } from '../types/settings';

interface AIPreferenceSuggestion {
  id: string;
  category: string;
  suggestion: any;
  reason: string;
  confidence: number;
  basedOn: string[];
  timestamp: Date;
}

class AIPreferencesService {
  private readonly SUGGESTION_THRESHOLD = 0.7; // Confidence threshold for suggestions

  async generateSuggestions(
    userActivity: UserActivity,
    currentPreferences: UserPreferences,
    category?: string
  ): Promise<AIPreferenceSuggestion[]> {
    const suggestions: AIPreferenceSuggestion[] = [];

    // Analyze theme preferences
    if (!category || category === 'theme') {
      const themeSuggestion = this.analyzeThemeUsage(userActivity, currentPreferences);
      if (themeSuggestion) suggestions.push(themeSuggestion);
    }

    // Analyze notification patterns
    if (!category || category === 'notifications') {
      const notificationSuggestion = this.analyzeNotificationPatterns(userActivity, currentPreferences);
      if (notificationSuggestion) suggestions.push(notificationSuggestion);
    }

    // Analyze template usage
    if (!category || category === 'templates') {
      const templateSuggestions = this.analyzeTemplateUsage(userActivity, currentPreferences);
      suggestions.push(...templateSuggestions);
    }

    // Analyze language preferences
    if (!category || category === 'language') {
      const languageSuggestion = this.analyzeLanguagePatterns(userActivity);
      if (languageSuggestion) suggestions.push(languageSuggestion);
    }

    return suggestions.filter(s => s.confidence >= this.SUGGESTION_THRESHOLD);
  }

  private analyzeThemeUsage(
    activity: UserActivity,
    preferences: UserPreferences
  ): AIPreferenceSuggestion | null {
    // Check if user frequently changes themes at certain times
    const themeChanges = activity.actions?.filter(a => a.type === 'theme_change') || [];
    if (themeChanges.length < 5) return null;

    // Analyze time patterns
    const hourCounts = new Map<number, number>();
    themeChanges.forEach(change => {
      const hour = new Date(change.timestamp).getHours();
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    });

    // Find most common theme change hours
    const sortedHours = Array.from(hourCounts.entries())
      .sort((a, b) => b[1] - a[1]);

    if (sortedHours.length > 0 && sortedHours[0][1] >= 3) {
      const suggestedHour = sortedHours[0][0];
      const isDarkTime = suggestedHour >= 18 || suggestedHour < 6;

      return {
        id: `theme-${Date.now()}`,
        category: 'theme',
        suggestion: {
          mode: 'auto',
          schedule: {
            dark: { start: '18:00', end: '06:00' },
            light: { start: '06:00', end: '18:00' }
          }
        },
        reason: `You often switch themes around ${suggestedHour}:00. Enable automatic theme switching?`,
        confidence: 0.85,
        basedOn: ['theme_change_patterns'],
        timestamp: new Date()
      };
    }

    return null;
  }

  private analyzeNotificationPatterns(
    activity: UserActivity,
    preferences: UserPreferences
  ): AIPreferenceSuggestion | null {
    // Check dismissal patterns
    const dismissals = activity.actions?.filter(a => a.type === 'notification_dismissed') || [];
    const interactions = activity.actions?.filter(a => a.type === 'notification_clicked') || [];

    if (dismissals.length + interactions.length < 10) return null;

    const dismissalRate = dismissals.length / (dismissals.length + interactions.length);

    if (dismissalRate > 0.8) {
      return {
        id: `notifications-${Date.now()}`,
        category: 'notifications',
        suggestion: {
          quietHours: {
            enabled: true,
            start: '22:00',
            end: '08:00'
          },
          categories: {
            ...(preferences.notifications as any)?.categories,
            aiDiscovery: false // Disable less critical notifications
          }
        },
        reason: 'You dismiss most notifications. Would you like to enable quiet hours and reduce notification frequency?',
        confidence: 0.9,
        basedOn: ['notification_dismissal_rate'],
        timestamp: new Date()
      };
    }

    return null;
  }

  private analyzeTemplateUsage(
    activity: UserActivity,
    preferences: UserPreferences
  ): AIPreferenceSuggestion[] {
    const suggestions: AIPreferenceSuggestion[] = [];
    
    // Analyze most used farm configurations
    const farmCreations = activity.actions?.filter(a => a.type === 'farm_created') || [];
    if (farmCreations.length < 3) return suggestions;

    // Group by similar configurations
    const configPatterns = new Map<string, number>();
    farmCreations.forEach(creation => {
      const key = this.getConfigurationKey((creation as any).data);
      configPatterns.set(key, (configPatterns.get(key) || 0) + 1);
    });

    // Find patterns used more than twice
    const frequentPatterns = Array.from(configPatterns.entries())
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1]);

    if (frequentPatterns.length > 0) {
      const [pattern, count] = frequentPatterns[0];
      suggestions.push({
        id: `template-${Date.now()}`,
        category: 'templates',
        suggestion: {
          name: 'Frequently Used Setup',
          description: `You've used this configuration ${count} times`,
          config: pattern,
          saveAsTemplate: true
        },
        reason: `You frequently use similar farm configurations. Save this as a template for quick access?`,
        confidence: 0.8,
        basedOn: ['farm_creation_patterns'],
        timestamp: new Date()
      });
    }

    return suggestions;
  }

  private analyzeLanguagePatterns(activity: UserActivity): AIPreferenceSuggestion | null {
    // Check browser language vs app language
    const browserLang = navigator.language.substring(0, 2);
    const supportedLangs = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh'];

    if (supportedLangs.includes(browserLang) && browserLang !== 'en') {
      return {
        id: `language-${Date.now()}`,
        category: 'language',
        suggestion: {
          current: browserLang,
          autoDetect: true
        },
        reason: `Your browser is set to ${this.getLanguageName(browserLang)}. Would you like to use MaiFarm in this language?`,
        confidence: 0.75,
        basedOn: ['browser_language'],
        timestamp: new Date()
      };
    }

    return null;
  }

  private getConfigurationKey(config: any): string {
    // Create a normalized key from configuration
    return JSON.stringify({
      agents: config.agents,
      steps: config.steps?.length,
      speedProfile: config.speedProfile
    });
  }

  private getLanguageName(code: string): string {
    const languages: Record<string, string> = {
      en: 'English',
      es: 'Spanish',
      fr: 'French',
      de: 'German',
      it: 'Italian',
      pt: 'Portuguese',
      ja: 'Japanese',
      ko: 'Korean',
      zh: 'Chinese'
    };
    return languages[code] || code;
  }

  async applySuggestion(suggestion: AIPreferenceSuggestion): Promise<void> {
    // In a real app, this would apply the suggestion to user preferences
    console.log('Applying suggestion:', suggestion);
    
    // Update the appropriate preference category
    switch (suggestion.category) {
      case 'theme':
        // Apply theme suggestion
        break;
      case 'notifications':
        // Apply notification suggestion
        break;
      case 'templates':
        // Create new template
        break;
      case 'language':
        // Change language
        break;
    }
  }

  async trackSuggestionFeedback(
    suggestionId: string,
    feedback: 'accepted' | 'dismissed'
  ): Promise<void> {
    // Track user feedback for improving future suggestions
    console.log(`Suggestion ${suggestionId} was ${feedback}`);
    
    // In a real app, this would send telemetry data
    // to improve AI suggestion accuracy
  }
}

export const aiPreferences = new AIPreferencesService();