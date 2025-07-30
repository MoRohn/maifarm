import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { 
  ThemeConfig, 
  NotificationPreferences, 
  IntegrationConfig, 
  FarmTemplate,
  AINotificationSuggestion 
} from '../types/settings';

interface SettingsStore {
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
}

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

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      // Theme
      theme: defaultTheme,
      customThemes: [],
      setTheme: (theme) => set({ theme }),
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
    }),
    {
      name: 'maifarm-settings',
    }
  )
);