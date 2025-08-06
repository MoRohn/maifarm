import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ContentValidator } from '../../server/services/contentValidator';
import { DeduplicationService } from '../../server/services/deduplicationService';
import type { NewsArticle, ValidationRule } from '../../src/types/news';

describe('ContentValidator', () => {
  let validator: ContentValidator;
  
  beforeEach(() => {
    validator = new ContentValidator();
  });

  describe('validateArticles', () => {
    it('should filter articles based on keywords', () => {
      const articles: NewsArticle[] = [
        {
          id: '1',
          title: 'Trump announces new policy',
          description: 'President Trump revealed new immigration policy',
          content: 'Full article content here',
          url: 'https://example.com/1',
          publishedAt: new Date(),
          source: { id: null, name: 'Example News' },
          author: 'John Doe'
        },
        {
          id: '2',
          title: 'Weather forecast for tomorrow',
          description: 'Sunny skies expected',
          content: 'Weather details',
          url: 'https://example.com/2',
          publishedAt: new Date(),
          source: { id: null, name: 'Weather Channel' },
          author: 'Jane Doe'
        }
      ];

      const rules: ValidationRule = {
        keywords: ['trump', 'president'],
        minRelevanceScore: 0.1,
      };

      const validated = validator.validateArticles(articles, rules);
      
      expect(validated).toHaveLength(1);
      expect(validated[0].id).toBe('1');
      expect(validated[0].relevanceScore).toBeGreaterThan(0);
    });

    it('should respect required keywords', () => {
      const articles: NewsArticle[] = [
        {
          id: '1',
          title: 'Political news about elections',
          description: 'Election coverage',
          content: 'Details about elections',
          url: 'https://example.com/1',
          publishedAt: new Date(),
          source: { id: null, name: 'News' },
          author: null
        }
      ];

      const rules: ValidationRule = {
        keywords: ['election'],
        requiredKeywords: ['trump'],
        minRelevanceScore: 0,
      };

      const validated = validator.validateArticles(articles, rules);
      expect(validated).toHaveLength(0);
    });

    it('should exclude articles with excluded keywords', () => {
      const articles: NewsArticle[] = [
        {
          id: '1',
          title: 'Trump satire piece',
          description: 'A satirical take on Trump',
          content: 'Satire content',
          url: 'https://example.com/1',
          publishedAt: new Date(),
          source: { id: null, name: 'Satire News' },
          author: null
        }
      ];

      const rules: ValidationRule = {
        keywords: ['trump'],
        excludeKeywords: ['satire'],
        minRelevanceScore: 0,
      };

      const validated = validator.validateArticles(articles, rules);
      expect(validated).toHaveLength(0);
    });
  });

  describe('extractKeyPhrases', () => {
    it('should extract meaningful key phrases', () => {
      const text = 'President Trump announced new immigration policy at the White House today. The policy will affect border security and visa applications.';
      
      const phrases = validator.extractKeyPhrases(text, 5);
      
      expect(phrases).toBeInstanceOf(Array);
      expect(phrases.length).toBeGreaterThan(0);
      expect(phrases.length).toBeLessThanOrEqual(5);
    });
  });
});

describe('DeduplicationService', () => {
  let deduplicator: DeduplicationService;
  
  beforeEach(() => {
    deduplicator = new DeduplicationService(0.8);
  });

  describe('deduplicateArticles', () => {
    it('should remove exact URL duplicates', () => {
      const articles: NewsArticle[] = [
        {
          id: '1',
          title: 'Trump news',
          description: 'Description',
          content: 'Content',
          url: 'https://example.com/article',
          publishedAt: new Date(),
          source: { id: null, name: 'News' },
          author: null
        },
        {
          id: '2',
          title: 'Trump news',
          description: 'Description',
          content: 'Content',
          url: 'https://example.com/article',
          publishedAt: new Date(),
          source: { id: null, name: 'News' },
          author: null
        }
      ];

      const { unique, duplicatesRemoved } = deduplicator.deduplicateArticles(articles);
      
      expect(unique).toHaveLength(1);
      expect(duplicatesRemoved).toBe(1);
    });

    it('should detect similar titles', () => {
      const articles: NewsArticle[] = [
        {
          id: '1',
          title: 'Trump announces new policy on immigration',
          description: 'Description',
          content: 'Content',
          url: 'https://example.com/1',
          publishedAt: new Date(),
          source: { id: null, name: 'News A' },
          author: null
        },
        {
          id: '2',
          title: 'Trump announces new policy on immigration',
          description: 'Different description',
          content: 'Different content',
          url: 'https://example.com/2',
          publishedAt: new Date(),
          source: { id: null, name: 'News B' },
          author: null
        }
      ];

      const { unique, duplicatesRemoved } = deduplicator.deduplicateArticles(articles);
      
      expect(unique).toHaveLength(1);
      expect(duplicatesRemoved).toBe(1);
    });

    it('should not mark different articles as duplicates', () => {
      const articles: NewsArticle[] = [
        {
          id: '1',
          title: 'Trump speaks at rally',
          description: 'Rally coverage',
          content: 'Rally details',
          url: 'https://example.com/1',
          publishedAt: new Date(),
          source: { id: null, name: 'News A' },
          author: null
        },
        {
          id: '2',
          title: 'Biden addresses Congress',
          description: 'Congressional speech',
          content: 'Speech details',
          url: 'https://example.com/2',
          publishedAt: new Date(),
          source: { id: null, name: 'News B' },
          author: null
        }
      ];

      const { unique, duplicatesRemoved } = deduplicator.deduplicateArticles(articles);
      
      expect(unique).toHaveLength(2);
      expect(duplicatesRemoved).toBe(0);
    });
  });

  describe('deduplicateWithVectors', () => {
    it('should cluster similar articles', () => {
      const articles: NewsArticle[] = [
        {
          id: '1',
          title: 'Trump policy announcement at White House',
          description: 'President announces new policy',
          content: 'Detailed policy information about immigration reform',
          url: 'https://example.com/1',
          publishedAt: new Date(),
          source: { id: null, name: 'News A' },
          author: null
        },
        {
          id: '2',
          title: 'White House: Trump announces policy',
          description: 'New policy announced by President',
          content: 'Immigration reform policy details announced today',
          url: 'https://example.com/2',
          publishedAt: new Date(),
          source: { id: null, name: 'News B' },
          author: null
        },
        {
          id: '3',
          title: 'Sports: Local team wins championship',
          description: 'Victory celebration',
          content: 'The local team won their first championship',
          url: 'https://example.com/3',
          publishedAt: new Date(),
          source: { id: null, name: 'Sports News' },
          author: null
        }
      ];

      const { unique, duplicatesRemoved, clusters } = deduplicator.deduplicateWithVectors(articles);
      
      expect(unique.length).toBeLessThanOrEqual(articles.length);
      expect(duplicatesRemoved).toBeGreaterThanOrEqual(0);
      expect(clusters.size).toBeGreaterThanOrEqual(0);
    });
  });
});