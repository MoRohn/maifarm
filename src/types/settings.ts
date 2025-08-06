export interface Settings {
  user: UserSettings;
  system: SystemSettings;
  integrations: IntegrationSettings;
  templates: ConfigTemplate[];
  // Legacy/alternate property names for backward compatibility
  theme?: ThemeSettings;
  notifications?: NotificationSettings;
  language?: string;
  aiAssistance?: AIAssistantSettings;
  aiProvider?: 'claude' | 'qwen';
  appearance?: {
    theme: 'light' | 'dark' | 'system';
    primaryColor?: string;
    animations?: {
      enabled: boolean;
      duration: 'fast' | 'normal' | 'slow';
      easing: string;
    };
  };
  api?: {
    endpoint?: string;
    baseUrl?: string;
    timeout?: number;
    retryAttempts?: number;
    cacheEnabled?: boolean;
  };
  security?: {
    twoFactorEnabled?: boolean;
    mfaEnabled?: boolean;
    sessionTimeout?: number;
    passwordPolicy?: {
      minLength?: number;
      requireSpecialChars?: boolean;
    };
  };
  // Additional properties that might be accessed
  colors?: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
  };
  animations?: {
    enabled: boolean;
    duration: 'fast' | 'normal' | 'slow';
    easing: string;
  };
  cacheEnabled?: boolean;
  mfaEnabled?: boolean;
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
  colors?: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
  };
  animations?: {
    enabled: boolean;
    duration: 'fast' | 'normal' | 'slow';
    easing: string;
  };
}

export interface NotificationSettings {
  enabled: boolean;
  sound: boolean;
  desktop: boolean;
  email: EmailNotificationSettings;
  triggers: NotificationTriggers;
  bundleNotifications?: boolean;
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
  aiDiscovery: boolean;
  [key: string]: boolean;
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
  updateSettings?: (settings: Partial<AIAssistantSettings>) => void;
}

export interface SystemSettings {
  performance: PerformanceSettings;
  storage: StorageSettings;
  network: NetworkSettings;
  behavior: BehaviorSettings;
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

export interface BehaviorSettings {
  autoPauseOnClose: boolean;
  runInBackground: boolean;
  showBackgroundIndicator: boolean;
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
  action: () => void | Promise<void>;
  category?: string;
}

export interface UserActivity {
  lastAction: string;
  timestamp: Date;
  frequentActions: string[];
  totalActions: number;
  sessionDuration: number;
  featureUsage: Record<string, number>;
  actions?: Array<{ type: string; timestamp: Date; }>;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  notifications: boolean;
  language: string;
  aiSettings?: {
    suggestionLevel: 'minimal' | 'moderate' | 'aggressive';
    autoOptimize: boolean;
  };
  apiKeys?: APIKey[];
  farmTemplates?: FarmTemplate[];
  goWild?: {
    creativityLevel: number;
    explorationDepth: number;
    maxDuration: number;
    boundaries: {
      allowExternalAPIs: boolean;
      allowFileSystem: boolean;
      allowNetworkRequests: boolean;
      restrictedDomains: string[];
    };
    focusAreas: string[];
  };
}