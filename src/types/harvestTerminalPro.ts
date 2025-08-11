/**
 * Harvest Terminal Pro - Advanced Terminal Interface Types
 * Next-generation terminal emulator for multi-agent orchestration
 */

import type { Terminal as XTerm, ITheme } from 'xterm';

// ============================================================================
// Core Terminal Types
// ============================================================================

export interface TerminalProInstance {
  id: string;
  agentId: number;
  sessionId: string;
  xterm: XTerm;
  status: TerminalAgentStatus;
  metrics: TerminalAgentMetrics;
  lastActivity: Date;
  isRecording: boolean;
}

export type TerminalAgentStatus = 
  | 'initializing'
  | 'connecting'
  | 'ready'
  | 'working'
  | 'idle'
  | 'paused'
  | 'error'
  | 'disconnected';

export interface TerminalAgentMetrics {
  cpuUsage: number;
  memoryUsage: number;
  networkLatency: number;
  commandsExecuted: number;
  outputLinesPerSecond: number;
  errorRate: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface TerminalProConfig {
  // XTerm.js Configuration
  xterm: {
    fontSize: number;
    fontFamily: string;
    fontWeight: number;
    letterSpacing: number;
    lineHeight: number;
    theme: ITheme;
    cursorBlink: boolean;
    cursorStyle: 'block' | 'underline' | 'bar';
    scrollback: number;
    tabStopWidth: number;
    bellStyle: 'none' | 'sound' | 'visual' | 'both';
    macOptionIsMeta: boolean;
    rightClickSelectsWord: boolean;
    rendererType: 'canvas' | 'dom' | 'webgl';
  };
  
  // Performance Settings
  performance: {
    maxBufferSize: number;
    renderThrottle: number;
    metricsInterval: number;
    virtualScrolling: boolean;
    lazyRendering: boolean;
    useWebWorkers: boolean;
  };
  
  // Mobile Configuration
  mobile: {
    enableTouch: boolean;
    virtualKeyboard: boolean;
    gestureSupport: boolean;
    swipeNavigation: boolean;
    pinchToZoom: boolean;
    hapticFeedback: boolean;
  };
  
  // Recording Settings
  recording: {
    enabled: boolean;
    autoRecord: boolean;
    maxDuration: number;
    compression: boolean;
    format: 'asciinema' | 'ttyrec' | 'svg' | 'gif';
    includeTimestamps: boolean;
  };
  
  // Remote Access
  cloudflare: {
    enabled: boolean;
    tunnelUrl?: string;
    accessPolicy?: string;
    requireAuth: boolean;
  };
}

// ============================================================================
// Theme System
// ============================================================================

export interface TerminalProTheme {
  // Metadata
  id: string;
  name: string;
  type: 'dark' | 'light';
  category: 'cyberpunk' | 'retro' | 'modern' | 'minimal' | 'custom';
  
  // Terminal Colors (XTerm.js compatible)
  terminal: ITheme & {
    // Extended theme properties
    cursorAccent?: string;
    selectionBackground?: string;
    selectionForeground?: string;
  };
  
  // UI Theme
  ui: {
    // Backgrounds
    primaryBackground: string;
    secondaryBackground: string;
    tertiaryBackground: string;
    surfaceBackground: string;
    overlayBackground: string;
    
    // Text
    primaryText: string;
    secondaryText: string;
    tertiaryText: string;
    mutedText: string;
    
    // Accents
    accentColor: string;
    accentHover: string;
    accentActive: string;
    
    // Status Colors
    successColor: string;
    warningColor: string;
    errorColor: string;
    infoColor: string;
    
    // Borders & Shadows
    borderColor: string;
    borderHover: string;
    shadowColor: string;
    shadowElevation: string[];
  };
  
  // Special Effects
  effects: {
    glowEffect: boolean;
    scanlines: boolean;
    noise: boolean;
    chromatic: boolean;
    bloom: boolean;
    animations: {
      cursorPulse: boolean;
      textGlow: boolean;
      matrixRain: boolean;
      retroCRT: boolean;
      typewriter: boolean;
    };
  };
}

// ============================================================================
// Session Management
// ============================================================================

export interface TerminalProSession {
  id: string;
  name: string;
  farmId?: string;
  agents: TerminalProAgent[];
  status: SessionStatus;
  viewMode: ViewMode;
  layout: LayoutConfig;
  recording?: SessionRecording;
  createdAt: Date;
  lastActivity: Date;
  metadata: Record<string, any>;
}

export interface TerminalProAgent {
  id: number;
  sessionId: string;
  name: string;
  role?: string;
  terminal: TerminalProInstance;
  commandHistory: CommandHistoryEntry[];
  workingDirectory: string;
  environment: Record<string, string>;
  resourceUsage: ResourceUsage;
}

export type SessionStatus = 
  | 'initializing'
  | 'active'
  | 'paused'
  | 'completed'
  | 'error';

export type ViewMode = 
  | 'grid'
  | 'tabs'
  | 'single'
  | 'split'
  | 'stack'
  | 'carousel';

export interface LayoutConfig {
  mode: ViewMode;
  gridColumns?: number;
  splitRatio?: number[];
  activeIndex?: number;
  maximizedAgent?: number;
}

// ============================================================================
// Recording & Playback
// ============================================================================

export interface SessionRecording {
  id: string;
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  duration: number;
  format: RecordingFormat;
  size: number;
  events: RecordingEvent[];
  metadata: RecordingMetadata;
}

export type RecordingFormat = 
  | 'asciinema'
  | 'ttyrec'
  | 'svg'
  | 'gif'
  | 'custom';

export interface RecordingEvent {
  timestamp: number;
  type: 'output' | 'input' | 'resize' | 'clear';
  agentId: number;
  data: string | ResizeData;
}

export interface RecordingMetadata {
  title?: string;
  description?: string;
  tags?: string[];
  terminal: {
    columns: number;
    rows: number;
    fontSize: number;
  };
}

export interface ResizeData {
  columns: number;
  rows: number;
}

// ============================================================================
// Command System
// ============================================================================

export interface CommandHistoryEntry {
  id: string;
  command: string;
  timestamp: Date;
  duration?: number;
  exitCode?: number;
  output?: string;
  error?: string;
}

export interface CommandPaletteItem {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  shortcut?: string[];
  category: CommandCategory;
  action: () => void | Promise<void>;
  enabled?: boolean;
}

export type CommandCategory = 
  | 'navigation'
  | 'editing'
  | 'view'
  | 'session'
  | 'theme'
  | 'tools'
  | 'help';

export interface KeyboardShortcut {
  id: string;
  keys: string[];
  description: string;
  action: () => void;
  context?: 'global' | 'terminal' | 'command';
}

// ============================================================================
// Performance Monitoring
// ============================================================================

export interface PerformanceMetrics {
  timestamp: Date;
  system: SystemMetrics;
  terminals: Map<string, TerminalMetrics>;
  network: NetworkMetrics;
  rendering: RenderingMetrics;
}

export interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  processCount: number;
  threadCount: number;
}

export interface TerminalMetrics {
  terminalId: string;
  bufferSize: number;
  outputRate: number;
  renderTime: number;
  scrollbackSize: number;
  commandQueueSize: number;
}

export interface NetworkMetrics {
  websocketLatency: number;
  messagesPerSecond: number;
  bytesReceived: number;
  bytesSent: number;
  reconnectCount: number;
}

export interface RenderingMetrics {
  fps: number;
  frameTime: number;
  paintTime: number;
  layoutTime: number;
  gpuUsage?: number;
}

// ============================================================================
// Resource Management
// ============================================================================

export interface ResourceUsage {
  cpu: {
    percentage: number;
    cores: number;
    threads: number;
  };
  memory: {
    used: number;
    available: number;
    percentage: number;
  };
  network: {
    bytesReceived: number;
    bytesSent: number;
    packetsReceived: number;
    packetsSent: number;
  };
}

// ============================================================================
// Mobile & Touch Support
// ============================================================================

export interface TouchGesture {
  type: GestureType;
  handler: (event: TouchGestureEvent) => void;
  options?: GestureOptions;
}

export type GestureType = 
  | 'swipe'
  | 'pinch'
  | 'rotate'
  | 'tap'
  | 'doubleTap'
  | 'longPress'
  | 'pan';

export interface TouchGestureEvent {
  type: GestureType;
  direction?: 'up' | 'down' | 'left' | 'right';
  distance?: number;
  scale?: number;
  rotation?: number;
  center: { x: number; y: number };
  velocity: { x: number; y: number };
}

export interface GestureOptions {
  threshold?: number;
  preventDefault?: boolean;
  stopPropagation?: boolean;
}

// ============================================================================
// WebSocket Events
// ============================================================================

export interface TerminalWebSocketEvents {
  // Session Events
  'terminal:session:created': {
    sessionId: string;
    agents: number;
    config: TerminalProConfig;
  };
  'terminal:session:destroyed': {
    sessionId: string;
  };
  'terminal:session:updated': {
    sessionId: string;
    updates: Partial<TerminalProSession>;
  };
  
  // Agent Events
  'terminal:agent:output': {
    sessionId: string;
    agentId: number;
    lines: string[];
    type: 'stdout' | 'stderr';
  };
  'terminal:agent:status': {
    sessionId: string;
    agentId: number;
    status: TerminalAgentStatus;
  };
  'terminal:agent:metrics': {
    sessionId: string;
    agentId: number;
    metrics: TerminalAgentMetrics;
  };
  
  // Command Events
  'terminal:command:execute': {
    sessionId: string;
    agentId: number;
    command: string;
    id: string;
  };
  'terminal:command:result': {
    sessionId: string;
    agentId: number;
    commandId: string;
    exitCode: number;
    duration: number;
  };
  
  // Recording Events
  'terminal:recording:start': {
    sessionId: string;
    recordingId: string;
  };
  'terminal:recording:stop': {
    sessionId: string;
    recordingId: string;
    url?: string;
  };
  
  // Performance Events
  'terminal:performance:update': {
    metrics: PerformanceMetrics;
  };
}

// ============================================================================
// Component Props
// ============================================================================

export interface HarvestTerminalProProps {
  farmId?: string;
  sessionId?: string;
  config?: Partial<TerminalProConfig>;
  theme?: TerminalProTheme;
  className?: string;
  onSessionCreate?: (session: TerminalProSession) => void;
  onSessionDestroy?: (sessionId: string) => void;
  onCommandExecute?: (agentId: number, command: string) => void;
  onRecordingStart?: (recordingId: string) => void;
  onRecordingStop?: (recordingId: string, url?: string) => void;
}

// ============================================================================
// Store Interface
// ============================================================================

export interface TerminalProStore {
  // State
  sessions: Map<string, TerminalProSession>;
  activeSessionId: string | null;
  terminals: Map<string, TerminalProInstance>;
  config: TerminalProConfig;
  theme: TerminalProTheme;
  themes: Map<string, TerminalProTheme>;
  metrics: PerformanceMetrics;
  recordings: Map<string, SessionRecording>;
  commandHistory: CommandHistoryEntry[];
  
  // UI State
  viewMode: ViewMode;
  selectedAgentId: number | null;
  isCommandPaletteOpen: boolean;
  isMobileMode: boolean;
  isFullscreen: boolean;
  isRecording: boolean;
  
  // Actions
  createSession: (config: Partial<TerminalProSession>) => Promise<string>;
  destroySession: (sessionId: string) => Promise<void>;
  setActiveSession: (sessionId: string) => void;
  
  executeCommand: (agentId: number, command: string) => Promise<void>;
  clearTerminal: (agentId: number) => void;
  
  setTheme: (themeId: string) => void;
  createCustomTheme: (theme: TerminalProTheme) => void;
  
  setViewMode: (mode: ViewMode) => void;
  toggleFullscreen: () => void;
  
  startRecording: (sessionId: string) => Promise<string>;
  stopRecording: (sessionId: string) => Promise<string>;
  
  updateMetrics: (metrics: PerformanceMetrics) => void;
}