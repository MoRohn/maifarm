export interface NewsSource {
  id: string;
  name: string;
  description?: string;
  url?: string;
  category?: string;
  language?: string;
  country?: string;
}

export interface Article {
  id: string;
  source: {
    id: string | null;
    name: string;
  };
  author: string | null;
  title: string;
  description: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: Date;
  content: string | null;
  relevanceScore: number;
  sentiment: SentimentData | null;
  themes: string[];
  entities: EntityData[];
}

export interface NewsApiResponse {
  status: 'ok' | 'error';
  totalResults?: number;
  articles?: any[];
  message?: string;
  code?: string;
}

export interface SentimentData {
  score: number;
  comparative: number;
  positive: string[];
  negative: string[];
  label: 'positive' | 'negative' | 'neutral';
}

export interface EntityData {
  type: 'person' | 'organization' | 'location' | 'topic';
  name: string;
  count: number;
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
  sentiment: SentimentData;
  keywords: Array<{ word: string; score: number }>;
  summary: string;
  statistics: {
    wordCount: number;
    sentenceCount: number;
    readingTime: number;
  };
}

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
}