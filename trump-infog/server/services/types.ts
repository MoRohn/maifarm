export interface NewsArticle {
  id: string;
  title: string;
  description: string;
  content: string;
  source: {
    id: string | null;
    name: string;
  };
  author: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  relevanceScore?: number;
}

export interface NewsSearchOptions {
  query: string;
  from?: Date;
  to?: Date;
  sources?: string[];
  language?: string;
  sortBy?: 'relevancy' | 'popularity' | 'publishedAt';
  pageSize?: number;
  page?: number;
}

export interface AnalyzedContent {
  id: string;
  articleId: string;
  themes: string[];
  entities: {
    people: string[];
    organizations: string[];
    locations: string[];
    topics: string[];
  };
  sentiment: {
    score: number;
    comparative: number;
    positive: string[];
    negative: string[];
    label: 'positive' | 'negative' | 'neutral';
  };
  keywords: Array<{
    word: string;
    score: number;
  }>;
  summary: string;
  statistics: {
    wordCount: number;
    sentenceCount: number;
    readingTime: number;
  };
}

export interface VisualizationConfig {
  type: 'bar' | 'line' | 'pie' | 'donut' | 'scatter' | 'heatmap' | 'treemap';
  data: any;
  options?: {
    title?: string;
    width?: number;
    height?: number;
    colors?: string[];
    theme?: 'light' | 'dark';
    responsive?: boolean;
    animation?: boolean;
  };
}

export interface ChartOutput {
  svg: string;
  png?: Buffer;
  metadata: {
    width: number;
    height: number;
    type: string;
  };
}

export interface ExportOptions {
  format: 'png' | 'pdf' | 'svg';
  quality?: number;
  width?: number;
  height?: number;
  dpi?: number;
  colorSpace?: 'rgb' | 'cmyk';
  metadata?: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string[];
    createdAt?: Date;
  };
}

export interface ExportResult {
  format: string;
  data: Buffer | string;
  size: {
    width: number;
    height: number;
  };
  fileSize: number;
  metadata: any;
}

export interface CacheOptions {
  ttl?: number;
  key?: string;
  namespace?: string;
}

export interface RateLimitOptions {
  maxConcurrent?: number;
  minTime?: number;
  reservoir?: number;
  reservoirRefreshAmount?: number;
  reservoirRefreshInterval?: number;
}

export interface INewsService {
  searchArticles(options: NewsSearchOptions): Promise<NewsArticle[]>;
  getArticleById(id: string): Promise<NewsArticle | null>;
  validateArticle(article: NewsArticle): boolean;
  removeDuplicates(articles: NewsArticle[]): NewsArticle[];
}

export interface INLPService {
  analyzeContent(article: NewsArticle): Promise<AnalyzedContent>;
  extractThemes(content: string): Promise<string[]>;
  analyzeSentiment(content: string): Promise<AnalyzedContent['sentiment']>;
  extractEntities(content: string): Promise<AnalyzedContent['entities']>;
  summarize(content: string, maxLength?: number): Promise<string>;
}

export interface IVisualizationService {
  createChart(config: VisualizationConfig): Promise<ChartOutput>;
  generateInfographicLayout(data: any): Promise<string>;
  optimizeSVG(svg: string): Promise<string>;
  validateVisualization(output: ChartOutput): boolean;
}

export interface IExportService {
  exportInfographic(data: any, options: ExportOptions): Promise<ExportResult>;
  convertSVGToPNG(svg: string, options?: ExportOptions): Promise<Buffer>;
  generatePDF(content: any, options?: ExportOptions): Promise<Buffer>;
  optimizeOutput(data: Buffer, format: string): Promise<Buffer>;
}

export interface ICacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, options?: CacheOptions): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(namespace?: string): Promise<void>;
  has(key: string): Promise<boolean>;
}

export interface IRateLimiter {
  schedule<T>(fn: () => Promise<T>): Promise<T>;
  currentReservoir(): number;
  stop(): Promise<void>;
}