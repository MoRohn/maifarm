export interface Settings {
  user: UserSettings;
  system: SystemSettings;
  integrations: IntegrationSettings;
  templates: ConfigTemplate[];
}

// Theme-related types
export interface ThemeConfig {
  id: string;
  name: string;
  mode: 'light' | 'dark';
  colors: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
  };
}

// Notification-related types
export interface NotificationChannel {
  email: boolean;
  push: boolean;
  inApp: boolean;
}

export interface NotificationType {
  enabled: boolean;
  channels: NotificationChannel;
}

export interface NotificationPreferences {
  types: {
    farmStart: NotificationType;
    farmComplete: NotificationType;
    agentError: NotificationType;
    resourceAlert: NotificationType;
    aiDiscovery: NotificationType;
  };
}

export interface AINotificationSuggestion {
  type: string;
  reason: string;
  recommendation: string;
  confidence: number;
}

// Integration types
export interface IntegrationConfig {
  id: string;
  name: string;
  type: 'github' | 'gitlab' | 'slack' | 'discord' | 'custom';
  enabled: boolean;
  apiKey?: string;
  webhookUrl?: string;
  config: Record<string, any>;
}

// Template types
export interface FarmTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  agents: number;
  steps: string[];
  estimatedTime: string;
  tags: string[];
  yamlConfig: string;
  popularity: number;
  aiGenerated?: boolean;
}

// Language types
export interface LanguageConfig {
  code: string;
  name: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
}

export interface UserSettings {
  theme: ThemeSettings;
  notifications: NotificationSettings;
  language: LanguageSettings;
  dashboard: DashboardSettings;
  aiAssistant: AIAssistantSettings;
}

export interface ThemeSettings {
  mode: 'light' | 'dark' | 'system';
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  fontSize: 'small' | 'medium' | 'large';
  reducedMotion: boolean;
  highContrast: boolean;
}

export interface NotificationSettings {
  enabled: boolean;
  sound: boolean;
  desktop: boolean;
  email: EmailNotificationSettings;
  triggers: NotificationTriggers;
}

export interface EmailNotificationSettings {
  enabled: boolean;
  address: string;
  frequency: 'immediate' | 'hourly' | 'daily' | 'weekly';
}

export interface NotificationTriggers {
  farmComplete: boolean;
  farmError: boolean;
  agentError: boolean;
  lowCredits: boolean;
  systemUpdate: boolean;
  aiSuggestions: boolean;
}

export interface LanguageSettings {
  current: string;
  autoDetect: boolean;
  dateFormat: string;
  timeFormat: '12h' | '24h';
  timezone: string;
}

export interface DashboardSettings {
  layout: 'grid' | 'list' | 'compact';
  defaultView: 'active' | 'all' | 'historical';
  showMetrics: boolean;
  autoRefresh: boolean;
  refreshInterval: number;
}

export interface AIAssistantSettings {
  enabled: boolean;
  suggestions: boolean;
  autoOptimize: boolean;
  creativityLevel: number; // 0-100
  learningEnabled: boolean;
}

export interface SystemSettings {
  performance: PerformanceSettings;
  storage: StorageSettings;
  network: NetworkSettings;
}

export interface PerformanceSettings {
  maxConcurrentAgents: number;
  animationsEnabled: boolean;
  hardwareAcceleration: boolean;
  lowPowerMode: boolean;
}

export interface StorageSettings {
  cacheEnabled: boolean;
  maxCacheSize: number; // MB
  offlineMode: boolean;
  autoCleanup: boolean;
  retentionDays: number;
}

export interface NetworkSettings {
  proxyEnabled: boolean;
  proxyUrl?: string;
  timeout: number;
  retryAttempts: number;
  offlineQueueEnabled: boolean;
}

export interface IntegrationSettings {
  apiKeys: APIKey[];
  webhooks: Webhook[];
  externalServices: ExternalService[];
}

export interface APIKey {
  id: string;
  name: string;
  key: string;
  permissions: string[];
  expiresAt?: string;
  createdAt: string;
  lastUsed?: string;
}

export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  enabled: boolean;
  secret?: string;
}

export interface ExternalService {
  id: string;
  name: string;
  type: 'github' | 'gitlab' | 'slack' | 'discord' | 'custom';
  config: Record<string, any>;
  enabled: boolean;
}

export interface ConfigTemplate {
  id: string;
  name: string;
  description: string;
  category: 'farm' | 'agent' | 'workflow';
  config: any;
  isDefault: boolean;
  createdBy: string;
  createdAt: string;
  tags: string[];
}

export interface AISuggestion {
  id: string;
  type: 'setting' | 'template' | 'optimization';
  title: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  confidence: number; // 0-100
  action: () => void;
}