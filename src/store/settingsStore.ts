import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { 
  Settings,
  ThemeConfig, 
  NotificationPreferences, 
  IntegrationConfig, 
  FarmTemplate,
  AINotificationSuggestion 
} from '../types/settings';

// Use Settings interface from types/settings.ts

interface AgentConfiguration {
  maxConcurrentAgents?: number;
  maxAgents: number;
  staggerTime: number;
  defaultTimeout: number;
  retryAttempts?: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  autoRestart: boolean;
  healthCheckInterval?: number;
  resourceLimits?: {
    cpuThreshold: number;
    memoryThreshold: number;
    diskThreshold: number;
  };
  communicationProtocol?: 'websocket' | 'http' | 'grpc';
  parallelExecution: boolean;
  memoryLimit: number;
  cpuLimit: number;
  enableLogging: boolean;
  coordinationMode: 'centralized' | 'distributed' | 'hybrid';
  taskAllocation: 'round-robin' | 'load-balanced';
  failoverStrategy: 'restart' | 'reassign' | 'skip';
  // New agent modes
  agentMode: 'default' | 'supercharge' | 'ultrafarmer';
  defaultInterval: number; // in minutes
}

interface SettingsStore {
  // Legacy settings object for compatibility
  settings: Settings;
  updateSettings: (updates: Partial<Settings>) => void;
  
  // Theme
  theme: ThemeConfig;
  customThemes: ThemeConfig[];
  setTheme: (theme: ThemeConfig) => void;
  saveCustomTheme: (theme: ThemeConfig) => void;
  
  // Notifications
  notifications: NotificationPreferences;
  setNotifications: (notifications: NotificationPreferences) => void;
  aiSuggestions: AINotificationSuggestion[];
  
  // Integrations
  integrations: IntegrationConfig[];
  addIntegration: (integration: IntegrationConfig) => void;
  updateIntegration: (id: string, updates: Partial<IntegrationConfig>) => void;
  removeIntegration: (id: string) => void;
  
  // Templates
  templates: FarmTemplate[];
  addTemplate: (template: FarmTemplate) => void;
  removeTemplate: (id: string) => void;
  
  // Language
  language: string;
  setLanguage: (language: string) => void;
  
  // AI Assistance
  aiAssistance: {
    enabled: boolean;
    suggestionLevel: 'minimal' | 'moderate' | 'aggressive';
    learningEnabled: boolean;
  };
  setAIAssistance: (settings: Partial<SettingsStore['aiAssistance']>) => void;
  
  // Agent Configuration
  agentConfig: AgentConfiguration;
  updateAgentConfig: (config: Partial<AgentConfiguration>) => void;
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
  defaultInterval: 10, // 10 minutes default
};

// Helper function to get GPU count (mock implementation)
const getGPUCount = (): number => {
  // In a real implementation, this would detect GPU hardware
  // For now, return a reasonable default based on typical systems
  return 4; // Mock GPU count
};

// Helper function to calculate max agents based on mode
export const calculateMaxAgents = (mode: 'default' | 'supercharge' | 'ultrafarmer'): number => {
  switch (mode) {
    case 'default':
      return 8;
    case 'supercharge':
      return 10;
    case 'ultrafarmer':
      return Math.min(getGPUCount() * 2, 16); // 2 agents per GPU, max 16
    default:
      return 8;
  }
};

const defaultTheme: ThemeConfig = {
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

const defaultNotifications: NotificationPreferences = {
  types: {
    farmStart: { enabled: true, channels: { email: false, push: true, inApp: true } },
    farmComplete: { enabled: true, channels: { email: true, push: true, inApp: true } },
    agentError: { enabled: true, channels: { email: false, push: true, inApp: true } },
    resourceAlert: { enabled: true, channels: { email: false, push: false, inApp: true } },
    aiDiscovery: { enabled: true, channels: { email: false, push: true, inApp: true } },
  },
};

const defaultSettings: Settings = {
  aiProvider: 'claude', // Default AI provider
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
    notifications: {
      enabled: true,
      sound: true,
      desktop: true,
      email: {
        enabled: false,
        address: '',
        frequency: 'immediate',
      },
      triggers: {
        farmComplete: true,
        farmError: true,
        agentError: true,
        lowCredits: true,
        systemUpdate: true,
        aiSuggestions: true,
        aiDiscovery: true,
      },
    },
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
      autoPauseOnClose: true, // Default ON
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
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      // Legacy settings object
      settings: defaultSettings,
      
      updateSettings: (updates) => set((state) => ({
        settings: { ...state.settings, ...updates },
        // Also update individual properties for backward compatibility
        theme: (updates as any).theme || state.theme,
        notifications: (updates as any).notifications || state.notifications,
        language: (updates as any).language || state.language,
        aiAssistance: (updates as any).aiAssistance || state.aiAssistance,
      })),
      
      // Theme
      theme: defaultTheme,
      customThemes: [],
      setTheme: (theme) => set({ 
        theme,
        settings: { ...get().settings, theme: theme as any }
      }),
      saveCustomTheme: (theme) => set((state) => ({
        customThemes: [...state.customThemes, theme],
      })),
      
      // Notifications
      notifications: defaultNotifications,
      setNotifications: (notifications) => set({ notifications }),
      aiSuggestions: [],
      
      // Integrations
      integrations: [],
      addIntegration: (integration) => set((state) => ({
        integrations: [...state.integrations, integration],
      })),
      updateIntegration: (id, updates) => set((state) => ({
        integrations: state.integrations.map((i) =>
          i.id === id ? { ...i, ...updates } : i
        ),
      })),
      removeIntegration: (id) => set((state) => ({
        integrations: state.integrations.filter((i) => i.id !== id),
      })),
      
      // Templates
      templates: [],
      addTemplate: (template) => set((state) => ({
        templates: [...state.templates, template],
      })),
      removeTemplate: (id) => set((state) => ({
        templates: state.templates.filter((t) => t.id !== id),
      })),
      
      // Language
      language: 'en',
      setLanguage: (language) => set({ language }),
      
      // AI Assistance
      aiAssistance: {
        enabled: true,
        suggestionLevel: 'moderate',
        learningEnabled: true,
      },
      setAIAssistance: (settings) => set((state) => ({
        aiAssistance: { ...state.aiAssistance, ...settings },
      })),
      
      // Agent Configuration
      agentConfig: defaultAgentConfig,
      updateAgentConfig: (updates) => set((state) => ({
        agentConfig: { ...state.agentConfig, ...updates },
      })),
    }),
    {
      name: 'maifarm-settings',
    }
  )
);