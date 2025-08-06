import { AgentConfiguration } from '../components/Settings/AgentSettings';

const STORAGE_KEYS = {
  AGENT_CONFIG: 'maifarm_agent_config',
  NOTIFICATION_PREFS: 'maifarm_notification_prefs',
  USER_PREFERENCES: 'maifarm_user_preferences',
  THEME_SETTINGS: 'maifarm_theme_settings'
};

export interface NotificationPreferences {
  enabled: boolean;
  soundEnabled: boolean;
  position: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
  duration: number;
  types: {
    success: boolean;
    error: boolean;
    warning: boolean;
    info: boolean;
    harvest: boolean;
    agent: boolean;
  };
  priorities: {
    low: boolean;
    medium: boolean;
    high: boolean;
    critical: boolean;
  };
}

export interface UserPreferences {
  language: string;
  timezone: string;
  dateFormat: string;
  compactMode: boolean;
  animations: boolean;
  accessibility: {
    highContrast: boolean;
    reducedMotion: boolean;
    screenReaderMode: boolean;
  };
}

class SettingsPersistence {
  /**
   * Agent Configuration
   */
  saveAgentSettings(config: AgentConfiguration): void {
    try {
      localStorage.setItem(STORAGE_KEYS.AGENT_CONFIG, JSON.stringify(config));
    } catch (error) {
      console.error('Failed to save agent settings:', error);
    }
  }

  loadAgentSettings(): AgentConfiguration | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.AGENT_CONFIG);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Failed to load agent settings:', error);
      return null;
    }
  }

  getDefaultAgentSettings(): AgentConfiguration {
    return {
      maxAgents: 5,
      staggerTime: 1000,
      defaultTimeout: 300,
      autoRestart: true,
      parallelExecution: true,
      memoryLimit: 2048,
      cpuLimit: 80,
      enableLogging: true,
      logLevel: 'info',
      coordinationMode: 'hybrid',
      taskAllocation: 'load-balanced',
      failoverStrategy: 'reassign'
    };
  }

  /**
   * Notification Preferences
   */
  saveNotificationPreferences(prefs: NotificationPreferences): void {
    try {
      localStorage.setItem(STORAGE_KEYS.NOTIFICATION_PREFS, JSON.stringify(prefs));
    } catch (error) {
      console.error('Failed to save notification preferences:', error);
    }
  }

  loadNotificationPreferences(): NotificationPreferences | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.NOTIFICATION_PREFS);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Failed to load notification preferences:', error);
      return null;
    }
  }

  getDefaultNotificationPreferences(): NotificationPreferences {
    return {
      enabled: true,
      soundEnabled: false,
      position: 'top-right',
      duration: 5000,
      types: {
        success: true,
        error: true,
        warning: true,
        info: true,
        harvest: true,
        agent: true
      },
      priorities: {
        low: true,
        medium: true,
        high: true,
        critical: true
      }
    };
  }

  /**
   * User Preferences
   */
  saveUserPreferences(prefs: UserPreferences): void {
    try {
      localStorage.setItem(STORAGE_KEYS.USER_PREFERENCES, JSON.stringify(prefs));
    } catch (error) {
      console.error('Failed to save user preferences:', error);
    }
  }

  loadUserPreferences(): UserPreferences | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.USER_PREFERENCES);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Failed to load user preferences:', error);
      return null;
    }
  }

  getDefaultUserPreferences(): UserPreferences {
    return {
      language: 'en',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      dateFormat: 'MM/DD/YYYY',
      compactMode: false,
      animations: true,
      accessibility: {
        highContrast: false,
        reducedMotion: false,
        screenReaderMode: false
      }
    };
  }

  /**
   * Theme Settings - extends existing theme functionality
   */
  saveThemeSettings(settings: Record<string, any>): void {
    try {
      localStorage.setItem(STORAGE_KEYS.THEME_SETTINGS, JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save theme settings:', error);
    }
  }

  loadThemeSettings(): Record<string, any> | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.THEME_SETTINGS);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Failed to load theme settings:', error);
      return null;
    }
  }

  /**
   * Clear all settings
   */
  clearAllSettings(): void {
    Object.values(STORAGE_KEYS).forEach(key => {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.error(`Failed to clear ${key}:`, error);
      }
    });
  }

  /**
   * Export all settings
   */
  exportSettings(): Record<string, any> {
    const settings: Record<string, any> = {};
    
    Object.entries(STORAGE_KEYS).forEach(([name, key]) => {
      try {
        const value = localStorage.getItem(key);
        if (value) {
          settings[name] = JSON.parse(value);
        }
      } catch (error) {
        console.error(`Failed to export ${name}:`, error);
      }
    });

    return settings;
  }

  /**
   * Import settings
   */
  importSettings(settings: Record<string, any>): void {
    Object.entries(settings).forEach(([name, value]) => {
      const key = STORAGE_KEYS[name as keyof typeof STORAGE_KEYS];
      if (key) {
        try {
          localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
          console.error(`Failed to import ${name}:`, error);
        }
      }
    });
  }

  /**
   * Check if settings exist
   */
  hasSettings(): boolean {
    return Object.values(STORAGE_KEYS).some(key => {
      try {
        return localStorage.getItem(key) !== null;
      } catch {
        return false;
      }
    });
  }
}

// Create singleton instance
export const settingsPersistence = new SettingsPersistence();

// Export for convenience
export default settingsPersistence;