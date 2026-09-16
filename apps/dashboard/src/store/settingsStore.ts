import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Settings, ThemeConfig, IntegrationConfig, FarmTemplate } from '@/types/settings';
import { settingsService } from '@/services/settingsService';
import { deepMerge, mergeWithDefaults } from '@/utils/deepMerge';
import { AgentConfiguration } from '@/types/agentSettings';

interface OrchestratorConfiguration {
  type: 'xenosync';
  xenosync?: {
    enabled: boolean;
    defaultMode: 'parallel' | 'collaborative';
    minAgents: number;
    maxAgents: number;
    agentMonitorInterval: number;
    messageGracePeriod: number;
    logLevel: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
  };
}

interface NotificationChannelConfig {
  email: boolean;
  push: boolean;
  inApp: boolean;
}

interface NotificationTypeConfig {
  enabled: boolean;
  channels: NotificationChannelConfig;
}

export interface NotificationSettingsState {
  enabled: boolean;
  sound: boolean;
  desktop: boolean;
  email: {
    enabled: boolean;
    address: string;
    frequency: 'immediate' | 'hourly' | 'daily' | 'weekly';
  };
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
  };
  types: {
    farmStart: NotificationTypeConfig;
    farmComplete: NotificationTypeConfig;
    agentError: NotificationTypeConfig;
    resourceAlert: NotificationTypeConfig;
    aiDiscovery: NotificationTypeConfig;
  };
}

interface SettingsStoreState {
  settings: Settings;
  serverSnapshot: Settings;
  integrations: IntegrationConfig[];
  templates: FarmTemplate[];
  agentConfig: AgentConfiguration;
  orchestratorConfig: OrchestratorConfiguration;
  notifications: NotificationSettingsState;
  theme: ThemeConfig;
  customThemes: ThemeConfig[];
  language: string;
  aiAssistance: {
    enabled: boolean;
    suggestionLevel: 'minimal' | 'moderate' | 'aggressive';
    learningEnabled: boolean;
  };

  loading: boolean;
  loaded: boolean;
  saving: boolean;
  dirty: boolean;
  error: string | null;

  updateSettings: (updates: Partial<Settings>) => void;
  updateAgentConfig: (config: Partial<AgentConfiguration>) => void;
  updateOrchestratorConfig: (config: Partial<OrchestratorConfiguration>) => void;
  setNotifications: (prefs: NotificationSettingsState) => void;
  addIntegration: (integration: IntegrationConfig) => void;
  updateIntegration: (id: string, updates: Partial<IntegrationConfig>) => void;
  removeIntegration: (id: string) => void;
  addTemplate: (template: FarmTemplate) => void;
  removeTemplate: (id: string) => void;
  setLanguage: (language: string) => void;
  setAIAssistance: (settings: Partial<SettingsStoreState['aiAssistance']>) => void;
  saveCustomTheme: (theme: ThemeConfig) => void;
  setTheme: (theme: ThemeConfig) => void;

  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
  resetSettings: () => void;
}

const defaultAgentConfig: AgentConfiguration = {
  maxConcurrentAgents: 8,
  maxAgents: 8,
  staggerTime: 1000,
  defaultTimeout: 30000,
  retryAttempts: 3,
  logLevel: 'info',
  autoRestart: true,
  healthCheckInterval: 60000,
  resourceLimits: {
    cpuThreshold: 80,
    memoryThreshold: 85,
    diskThreshold: 90,
  },
  communicationProtocol: 'websocket',
  parallelExecution: true,
  memoryLimit: 1024,
  cpuLimit: 80,
  enableLogging: true,
  coordinationMode: 'centralized',
  taskAllocation: 'load-balanced',
  failoverStrategy: 'restart',
  agentMode: 'default',
  defaultInterval: 10,
};

const defaultOrchestratorConfig: OrchestratorConfiguration = {
  type: 'xenosync',
  xenosync: {
    enabled: true,
    defaultMode: 'parallel',
    minAgents: 2,
    maxAgents: 20,
    agentMonitorInterval: 30,
    messageGracePeriod: 60,
    logLevel: 'INFO'
  }
};

const defaultNotifications: NotificationSettingsState = {
  enabled: true,
  sound: true,
  desktop: true,
  email: {
    enabled: false,
    address: '',
    frequency: 'immediate'
  },
  quietHours: {
    enabled: false,
    start: '22:00',
    end: '08:00'
  },
  types: {
    farmStart: { enabled: true, channels: { email: false, push: true, inApp: true } },
    farmComplete: { enabled: true, channels: { email: true, push: true, inApp: true } },
    agentError: { enabled: true, channels: { email: false, push: true, inApp: true } },
    resourceAlert: { enabled: true, channels: { email: false, push: false, inApp: true } },
    aiDiscovery: { enabled: true, channels: { email: false, push: true, inApp: true } }
  }
};

const defaultThemeConfig: ThemeConfig = {
  id: 'light',
  name: 'Light',
  mode: 'light',
  colors: {
    primary: '#3B82F6',
    secondary: '#10B981',
    background: '#FFFFFF',
    surface: '#F3F4F6',
    text: '#1F2937',
    textSecondary: '#6B7280',
  },
};

const defaultSettings: Settings = {
  aiProvider: 'claude',  // Default to Claude with Opus 4.5 model
  user: {
    theme: {
      mode: 'system',
      primaryColor: '#3B82F6',
      accentColor: '#10B981',
      fontFamily: 'Inter',
      fontSize: 'medium',
      reducedMotion: false,
      highContrast: false,
    },
    notifications: defaultNotifications,
    language: {
      current: 'en',
      autoDetect: true,
      dateFormat: 'MM/dd/yyyy',
      timeFormat: '12h',
      timezone: 'UTC',
    },
    dashboard: {
      layout: 'grid',
      defaultView: 'active',
      showMetrics: true,
      autoRefresh: true,
      refreshInterval: 30000,
    },
    aiAssistant: {
      enabled: true,
      suggestions: true,
      autoOptimize: false,
      creativityLevel: 50,
      learningEnabled: true,
    },
  },
  system: {
    performance: {
      maxConcurrentAgents: 10,
      animationsEnabled: true,
      hardwareAcceleration: true,
      lowPowerMode: false,
    },
    storage: {
      cacheEnabled: true,
      maxCacheSize: 500,
      offlineMode: false,
      autoCleanup: true,
      retentionDays: 30,
    },
    network: {
      proxyEnabled: false,
      timeout: 30000,
      retryAttempts: 3,
      offlineQueueEnabled: true,
    },
    behavior: {
      autoPauseOnClose: true,
      runInBackground: false,
      showBackgroundIndicator: true,
    },
  },
  integrations: {
    apiKeys: [],
    webhooks: [],
    externalServices: [],
  },
  templates: [],
  agentConfig: defaultAgentConfig,
  orchestratorConfig: defaultOrchestratorConfig,
  aiAssistance: {
    enabled: true,
    suggestionLevel: 'moderate',
    learningEnabled: true,
  },
};

function mapNotificationsToSettings(prefs: NotificationSettingsState): NotificationSettingsState {
  return {
    enabled: prefs.enabled,
    sound: prefs.sound,
    desktop: prefs.desktop,
    email: { ...prefs.email },
    quietHours: { ...prefs.quietHours },
    types: {
      farmStart: { ...prefs.types.farmStart, channels: { ...prefs.types.farmStart.channels } },
      farmComplete: { ...prefs.types.farmComplete, channels: { ...prefs.types.farmComplete.channels } },
      agentError: { ...prefs.types.agentError, channels: { ...prefs.types.agentError.channels } },
      resourceAlert: { ...prefs.types.resourceAlert, channels: { ...prefs.types.resourceAlert.channels } },
      aiDiscovery: { ...prefs.types.aiDiscovery, channels: { ...prefs.types.aiDiscovery.channels } },
    }
  };
}

const createState = () => ({
  settings: defaultSettings,
  serverSnapshot: defaultSettings,
  integrations: defaultSettings.integrations.externalServices ?? [],
  templates: defaultSettings.templates ?? [],
  agentConfig: defaultAgentConfig,
  orchestratorConfig: defaultOrchestratorConfig,
  notifications: defaultNotifications,
  theme: defaultThemeConfig,
  customThemes: [] as ThemeConfig[],
  language: defaultSettings.user.language?.current ?? 'en',
  aiAssistance: defaultSettings.aiAssistance ?? {
    enabled: true,
    suggestionLevel: 'moderate',
    learningEnabled: true,
  },
  loading: false,
  loaded: false,
  saving: false,
  dirty: false,
  error: null as string | null,
});

export const useSettingsStore = create<SettingsStoreState>()(
  persist(
    (set, get) => ({
      ...createState(),

      updateSettings: (updates) => {
        const merged = deepMerge(get().settings, updates);
        set({ settings: merged, dirty: true });
      },

      updateAgentConfig: (config) => {
        const updated = { ...get().agentConfig, ...config };
        set({
          agentConfig: updated,
          settings: deepMerge(get().settings, { agentConfig: updated }),
          dirty: true
        });
      },

      updateOrchestratorConfig: (config) => {
        const updated = mergeWithDefaults(get().orchestratorConfig, config);
        set({
          orchestratorConfig: updated,
          settings: deepMerge(get().settings, { orchestratorConfig: updated }),
          dirty: true
        });
      },

      setNotifications: (prefs) => {
        const mapped = mapNotificationsToSettings(prefs);
        set({
          notifications: mapped,
          settings: deepMerge(get().settings, { user: { notifications: mapped } }),
          dirty: true
        });
      },

      addIntegration: (integration) => {
        const updated = [...get().integrations, integration];
        set({
          integrations: updated,
          settings: deepMerge(get().settings, {
            integrations: {
              externalServices: updated
            }
          }),
          dirty: true
        });
      },

      updateIntegration: (id, updates) => {
        const updated = get().integrations.map((integration) =>
          integration.id === id ? { ...integration, ...updates } : integration
        );
        set({
          integrations: updated,
          settings: deepMerge(get().settings, {
            integrations: {
              externalServices: updated
            }
          }),
          dirty: true
        });
      },

      removeIntegration: (id) => {
        const updated = get().integrations.filter((integration) => integration.id !== id);
        set({
          integrations: updated,
          settings: deepMerge(get().settings, {
            integrations: {
              externalServices: updated
            }
          }),
          dirty: true
        });
      },

      addTemplate: (template) => {
        const updated = [...get().templates, template];
        set({
          templates: updated,
          settings: deepMerge(get().settings, { templates: updated }),
          dirty: true
        });
      },

      removeTemplate: (id) => {
        const updated = get().templates.filter((template) => template.id !== id);
        set({
          templates: updated,
          settings: deepMerge(get().settings, { templates: updated }),
          dirty: true
        });
      },

      setLanguage: (language) => {
        set({
          language,
          settings: deepMerge(get().settings, {
            user: {
              language: {
                ...(get().settings.user.language ?? {}),
                current: language
              }
            }
          }),
          dirty: true
        });
      },

      setAIAssistance: (updates) => {
        const merged = {
          ...get().aiAssistance,
          ...updates,
        };
        set({
          aiAssistance: merged,
          settings: deepMerge(get().settings, {
            aiAssistance: merged,
            user: {
              aiAssistant: {
                ...(get().settings.user.aiAssistant ?? {}),
                ...updates,
              }
            }
          }),
          dirty: true
        });
      },

      saveCustomTheme: (theme) => {
        const updated = [...get().customThemes, theme];
        set({ customThemes: updated, dirty: true });
      },

      setTheme: (theme) => {
        set({ theme });
      },

      loadSettings: async () => {
        set({ loading: true, error: null });
        try {
          const remote = await settingsService.getAll();
          const uiSettings = remote.ui as Partial<Settings> | undefined;
          const merged = mergeWithDefaults(defaultSettings, uiSettings);

          const agentConfig = mergeWithDefaults(defaultAgentConfig, (merged as any).agentConfig);
          const orchestratorConfig = mergeWithDefaults(defaultOrchestratorConfig, (merged as any).orchestratorConfig);
          const notifications = mapNotificationsToSettings((merged.user?.notifications as NotificationSettingsState) || defaultNotifications);
          const integrations = merged.integrations?.externalServices ?? [];
          const templates = merged.templates ?? [];
          const language = merged.user?.language?.current ?? 'en';
          const aiAssistance = merged.aiAssistance ?? defaultSettings.aiAssistance;

          set({
            settings: merged,
            serverSnapshot: merged,
            agentConfig,
            orchestratorConfig,
            notifications,
            integrations,
            templates,
            language,
            aiAssistance,
            loading: false,
            loaded: true,
            dirty: false,
            error: null
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to load settings';
          set({ loading: false, error: message });
        }
      },

      saveSettings: async () => {
        const state = get();
        set({ saving: true, error: null });
        try {
          const payload: Settings = deepMerge(state.settings, {
            agentConfig: state.agentConfig,
            orchestratorConfig: state.orchestratorConfig,
            integrations: {
              ...(state.settings.integrations ?? {}),
              externalServices: state.integrations
            },
            templates: state.templates,
            aiAssistance: state.aiAssistance,
            user: {
              ...(state.settings.user ?? {}),
              notifications: state.notifications,
              language: {
                ...(state.settings.user?.language ?? {}),
                current: state.language
              },
              aiAssistant: {
                ...(state.settings.user?.aiAssistant ?? {}),
                enabled: state.aiAssistance.enabled,
                suggestions: state.aiAssistance.suggestionLevel !== 'minimal',
                autoOptimize: state.aiAssistance.suggestionLevel === 'aggressive',
                creativityLevel: state.settings.user?.aiAssistant?.creativityLevel ?? 50,
                learningEnabled: state.aiAssistance.learningEnabled
              }
            }
          });

          await settingsService.update('ui', payload);
          set({
            serverSnapshot: payload,
            settings: payload,
            saving: false,
            dirty: false
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to save settings';
          set({ saving: false, error: message });
          throw error;
        }
      },

      resetSettings: () => {
        const snapshot = get().serverSnapshot;
        set({
          settings: snapshot,
          agentConfig: snapshot.agentConfig ?? defaultAgentConfig,
          orchestratorConfig: snapshot.orchestratorConfig ?? defaultOrchestratorConfig,
          notifications: mapNotificationsToSettings((snapshot.user?.notifications as NotificationSettingsState) ?? defaultNotifications),
          integrations: snapshot.integrations?.externalServices ?? [],
          templates: snapshot.templates ?? [],
          language: snapshot.user?.language?.current ?? 'en',
          aiAssistance: snapshot.aiAssistance ?? defaultSettings.aiAssistance,
          dirty: false
        });
      }
    }),
    {
      name: 'maifarm-settings',
      partialize: (state) => ({
        settings: state.settings,
        serverSnapshot: state.serverSnapshot,
        agentConfig: state.agentConfig,
        orchestratorConfig: state.orchestratorConfig,
        notifications: state.notifications,
        theme: state.theme,
        integrations: state.integrations,
        templates: state.templates,
        language: state.language,
        aiAssistance: state.aiAssistance
      })
    }
  )
);

export const calculateMaxAgents = (mode: AgentConfiguration['agentMode']) => {
  switch (mode) {
    case 'supercharge':
      return 10;
    case 'ultrafarmer':
      return 16;
    case 'default':
    default:
      return 8;
  }
};
