export interface NewsArticle {
  id: string;
  title: string;
  description: string;
  content: string;
  url: string;
  urlToImage?: string;
  publishedAt: Date;
  source: {
    id: string | null;
    name: string;
  };
  author: string | null;
  relevanceScore?: number;
  sentiment?: {
    score: number;
    label: 'positive' | 'negative' | 'neutral';
  };
}

export interface RSSFeedSource {
  name: string;
  url: string;
  category?: string;
  enabled: boolean;
}

export interface CollectionResult {
  success: boolean;
  articlesFound: number;
  articlesFiltered: number;
  duplicatesRemoved: number;
  articles: NewsArticle[];
  sources: string[];
  timestamp: Date;
  errors?: string[];
}

export interface ValidationRule {
  keywords: string[];
  requiredKeywords?: string[];
  excludeKeywords?: string[];
  minRelevanceScore: number;
  dateRange?: {
    from: Date;
    to: Date;
  };
}

export interface CollectorConfig {
  newsApiKey?: string;
  rssFeeds: RSSFeedSource[];
  validationRules: ValidationRule;
  deduplicationThreshold: number;
  maxArticles: number;
  cacheTimeout: number;
}

export interface DataCollectionEvent {
  type: 'data_collected' | 'collection_started' | 'collection_error';
  payload: {
    articleCount?: number;
    sources?: string[];
    error?: string;
    timestamp: Date;
  };
}