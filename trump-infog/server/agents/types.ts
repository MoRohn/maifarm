export enum AgentStatus {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  WORKING = 'working',
  WAITING = 'waiting',
  COMPLETED = 'completed',
  ERROR = 'error'
}

export enum AgentRole {
  DATA_COLLECTOR = 'data_collector',
  CONTENT_ANALYZER = 'content_analyzer',
  DESIGN_GENERATOR = 'design_generator',
  OUTPUT_ASSEMBLER = 'output_assembler'
}

export interface AgentConfig {
  id: number;
  name: string;
  role: AgentRole;
  workingDirectory: string;
  coordinationPath: string;
  websocketUrl?: string;
  timeout?: number;
  retryAttempts?: number;
}

export interface AgentState {
  status: AgentStatus;
  currentTask?: string;
  progress: number;
  lastUpdate: Date;
  errors: string[];
  outputs: string[];
}

export interface AgentMessage {
  from: string;
  to: string;
  type: string;
  payload: any;
  timestamp: Date;
}

export interface DataCollectionResult {
  articles: NewsArticle[];
  sources: string[];
  totalCount: number;
  validatedCount: number;
  timestamp: Date;
}

export interface NewsArticle {
  id: string;
  title: string;
  content: string;
  source: string;
  author?: string;
  publishedAt: Date;
  url: string;
  relevanceScore: number;
  metadata?: Record<string, any>;
}

export interface ContentAnalysisResult {
  themes: Theme[];
  entities: Entity[];
  sentiment: SentimentAnalysis;
  summary: string;
  hierarchy: ContentHierarchy;
  insights: string[];
}

export interface Theme {
  name: string;
  frequency: number;
  relatedTerms: string[];
  sentiment: number;
}

export interface Entity {
  name: string;
  type: string;
  frequency: number;
  context: string[];
}

export interface SentimentAnalysis {
  overall: number;
  bySource: Record<string, number>;
  byTheme: Record<string, number>;
}

export interface ContentHierarchy {
  mainTopics: Topic[];
  structure: HierarchyNode;
}

export interface Topic {
  title: string;
  importance: number;
  subtopics: string[];
}

export interface HierarchyNode {
  label: string;
  value?: any;
  children?: HierarchyNode[];
}

export interface DesignAssets {
  templates: DesignTemplate[];
  visualElements: VisualElement[];
  colorScheme: ColorScheme;
  typography: Typography;
  layout: LayoutSpecification;
}

export interface DesignTemplate {
  id: string;
  name: string;
  type: string;
  structure: any;
  styles: Record<string, any>;
}

export interface VisualElement {
  id: string;
  type: 'chart' | 'icon' | 'graphic' | 'background';
  data?: any;
  svg?: string;
  styles?: Record<string, any>;
}

export interface ColorScheme {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  additional: string[];
}

export interface Typography {
  headingFont: string;
  bodyFont: string;
  sizes: {
    h1: string;
    h2: string;
    h3: string;
    body: string;
    small: string;
  };
}

export interface LayoutSpecification {
  width: number;
  height: number;
  grid: GridSpecification;
  sections: LayoutSection[];
}

export interface GridSpecification {
  columns: number;
  rows: number;
  gap: number;
}

export interface LayoutSection {
  id: string;
  type: string;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  content?: any;
}

export interface OutputFormats {
  png: OutputConfig;
  pdf: OutputConfig;
  svg: OutputConfig;
}

export interface OutputConfig {
  enabled: boolean;
  quality?: number;
  resolution?: string;
  optimization?: boolean;
  metadata?: Record<string, any>;
}

export interface InfographicOutput {
  id: string;
  title: string;
  formats: {
    png?: string;
    pdf?: string;
    svg?: string;
  };
  metadata: {
    created: Date;
    sources: string[];
    themes: string[];
    quality: number;
  };
}

export interface IAgent {
  config: AgentConfig;
  state: AgentState;
  
  initialize(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  
  processTask(task: any): Promise<any>;
  handleMessage(message: AgentMessage): Promise<void>;
  
  getStatus(): AgentStatus;
  getProgress(): number;
  getOutputs(): string[];
  
  onStateChange(callback: (state: AgentState) => void): void;
  onError(callback: (error: Error) => void): void;
  onComplete(callback: (result: any) => void): void;
}

export interface IDataCollectorAgent extends IAgent {
  collectNews(query: string, options?: any): Promise<DataCollectionResult>;
  validateArticles(articles: NewsArticle[]): Promise<NewsArticle[]>;
  saveRawData(data: DataCollectionResult): Promise<void>;
}

export interface IContentAnalyzerAgent extends IAgent {
  analyzeContent(data: DataCollectionResult): Promise<ContentAnalysisResult>;
  extractThemes(articles: NewsArticle[]): Promise<Theme[]>;
  generateSummary(analysis: ContentAnalysisResult): Promise<string>;
}

export interface IDesignGeneratorAgent extends IAgent {
  generateDesign(analysis: ContentAnalysisResult): Promise<DesignAssets>;
  createVisualizations(data: any): Promise<VisualElement[]>;
  applyBranding(assets: DesignAssets): Promise<DesignAssets>;
}

export interface IOutputAssemblerAgent extends IAgent {
  assembleInfographic(
    content: ContentAnalysisResult,
    design: DesignAssets
  ): Promise<InfographicOutput>;
  exportFormats(infographic: any, formats: OutputFormats): Promise<InfographicOutput>;
  validateOutput(output: InfographicOutput): Promise<boolean>;
}

export interface CoordinationEvent {
  type: string;
  agentId: string;
  payload: any;
  timestamp: Date;
}

export interface SharedState {
  projectId: string;
  status: string;
  agents: Record<string, AgentState>;
  pipeline: {
    currentStage: string;
    completedStages: string[];
    data: Record<string, any>;
  };
  lastUpdate: Date;
}