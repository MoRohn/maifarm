import { AgentConfiguration } from '@/types/agentSettings';
import { safeStorage } from './safeStorage';

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
   * Uses safeStorage for iOS private browsing compatibility
   */
  saveAgentSettings(config: AgentConfiguration): void {
    safeStorage.setJSON(STORAGE_KEYS.AGENT_CONFIG, config);
  }

  loadAgentSettings(): AgentConfiguration | null {
    return safeStorage.getJSON<AgentConfiguration | null>(STORAGE_KEYS.AGENT_CONFIG, null);
  }

  getDefaultAgentSettings(): AgentConfiguration {
    return {
      maxAgents: 8,
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
      failoverStrategy: 'reassign',
      agentMode: 'default',
      defaultInterval: 10
    };
  }

  /**
   * Notification Preferences
   * Uses safeStorage for iOS private browsing compatibility
   */
  saveNotificationPreferences(prefs: NotificationPreferences): void {
    safeStorage.setJSON(STORAGE_KEYS.NOTIFICATION_PREFS, prefs);
  }

  loadNotificationPreferences(): NotificationPreferences | null {
    return safeStorage.getJSON<NotificationPreferences | null>(STORAGE_KEYS.NOTIFICATION_PREFS, null);
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
   * Uses safeStorage for iOS private browsing compatibility
   */
  saveUserPreferences(prefs: UserPreferences): void {
    safeStorage.setJSON(STORAGE_KEYS.USER_PREFERENCES, prefs);
  }

  loadUserPreferences(): UserPreferences | null {
    return safeStorage.getJSON<UserPreferences | null>(STORAGE_KEYS.USER_PREFERENCES, null);
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
   * Uses safeStorage for iOS private browsing compatibility
   */
  saveThemeSettings(settings: Record<string, any>): void {
    safeStorage.setJSON(STORAGE_KEYS.THEME_SETTINGS, settings);
  }

  loadThemeSettings(): Record<string, any> | null {
    return safeStorage.getJSON<Record<string, any> | null>(STORAGE_KEYS.THEME_SETTINGS, null);
  }

  /**
   * Clear all settings
   * Uses safeStorage for iOS private browsing compatibility
   */
  clearAllSettings(): void {
    Object.values(STORAGE_KEYS).forEach(key => {
      safeStorage.removeItem(key);
    });
  }

  /**
   * Export all settings
   * Uses safeStorage for iOS private browsing compatibility
   */
  exportSettings(): Record<string, any> {
    const settings: Record<string, any> = {};

    Object.entries(STORAGE_KEYS).forEach(([name, key]) => {
      const value = safeStorage.getItem(key);
      if (value) {
        try {
          settings[name] = JSON.parse(value);
        } catch {
          // Skip unparseable values
        }
      }
    });

    return settings;
  }

  /**
   * Import settings
   * Uses safeStorage for iOS private browsing compatibility
   */
  importSettings(settings: Record<string, any>): void {
    Object.entries(settings).forEach(([name, value]) => {
      const key = STORAGE_KEYS[name as keyof typeof STORAGE_KEYS];
      if (key) {
        safeStorage.setJSON(key, value);
      }
    });
  }

  /**
   * Check if settings exist
   * Uses safeStorage for iOS private browsing compatibility
   */
  hasSettings(): boolean {
    return Object.values(STORAGE_KEYS).some(key => {
      return safeStorage.getItem(key) !== null;
    });
  }
}

// Create singleton instance
export const settingsPersistence = new SettingsPersistence();

// Export for convenience
export default settingsPersistence;