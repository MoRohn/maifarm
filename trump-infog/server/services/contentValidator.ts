import natural from 'natural';
import type { NewsArticle, ValidationRule } from '../../src/types/news.js';

export class ContentValidator {
  private tokenizer: natural.WordTokenizer;
  private tfidf: natural.TfIdf;

  constructor() {
    this.tokenizer = new natural.WordTokenizer();
    this.tfidf = new natural.TfIdf();
  }

  validateArticles(
    articles: NewsArticle[],
    rules: ValidationRule
  ): NewsArticle[] {
    const validatedArticles: NewsArticle[] = [];

    for (const article of articles) {
      if (this.validateArticle(article, rules)) {
        validatedArticles.push(article);
      }
    }

    return validatedArticles;
  }

  private validateArticle(
    article: NewsArticle,
    rules: ValidationRule
  ): boolean {
    // Check date range if specified
    if (rules.dateRange) {
      const publishedDate = new Date(article.publishedAt);
      if (publishedDate < rules.dateRange.from || publishedDate > rules.dateRange.to) {
        return false;
      }
    }

    // Combine all text content for analysis
    const fullText = `${article.title} ${article.description} ${article.content}`.toLowerCase();

    // Check for excluded keywords
    if (rules.excludeKeywords && rules.excludeKeywords.length > 0) {
      for (const excludeKeyword of rules.excludeKeywords) {
        if (fullText.includes(excludeKeyword.toLowerCase())) {
          return false;
        }
      }
    }

    // Check for required keywords (ALL must be present)
    if (rules.requiredKeywords && rules.requiredKeywords.length > 0) {
      for (const requiredKeyword of rules.requiredKeywords) {
        if (!fullText.includes(requiredKeyword.toLowerCase())) {
          return false;
        }
      }
    }

    // Calculate relevance score
    const relevanceScore = this.calculateRelevanceScore(fullText, rules.keywords);
    article.relevanceScore = relevanceScore;

    return relevanceScore >= rules.minRelevanceScore;
  }

  private calculateRelevanceScore(text: string, keywords: string[]): number {
    if (keywords.length === 0) return 1;

    const tokens = this.tokenizer.tokenize(text.toLowerCase());
    if (!tokens || tokens.length === 0) return 0;

    let matchCount = 0;
    const keywordSet = new Set(keywords.map(k => k.toLowerCase()));

    // Count keyword matches
    for (const token of tokens) {
      if (keywordSet.has(token)) {
        matchCount++;
      }
    }

    // Calculate TF-IDF for more sophisticated scoring
    this.tfidf.addDocument(text);
    let tfidfScore = 0;

    keywords.forEach(keyword => {
      this.tfidf.tfidfs(keyword.toLowerCase(), (i, measure) => {
        tfidfScore += measure;
      });
    });

    // Combine simple match ratio with TF-IDF score
    const matchRatio = matchCount / tokens.length;
    const normalizedTfidf = Math.min(tfidfScore / keywords.length, 1);

    // Weight the scores (70% TF-IDF, 30% simple matching)
    return (normalizedTfidf * 0.7) + (matchRatio * 0.3);
  }

  getDefaultValidationRules(): ValidationRule {
    return {
      keywords: [
        'trump',
        'donald trump',
        'president trump',
        'maga',
        'republican',
        'gop',
        'white house',
        'election',
        'campaign',
        'rally',
        'indictment',
        'trial',
        'court',
        'poll',
        'biden',
        'desantis',
        'primary',
        'debate',
        'policy',
        'immigration',
        'economy'
      ],
      requiredKeywords: ['trump'],
      excludeKeywords: [
        'satire',
        'opinion',
        'editorial',
        'sponsored',
        'advertisement'
      ],
      minRelevanceScore: 0.1,
      dateRange: {
        from: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48 hours ago
        to: new Date()
      }
    };
  }

  extractKeyPhrases(text: string, count: number = 5): string[] {
    const sentences = new natural.SentenceTokenizer().tokenize(text);
    const keyPhrases = new Set<string>();

    // Use n-grams to find common phrases
    const NGrams = natural.NGrams;
    
    sentences.forEach(sentence => {
      const bigrams = NGrams.bigrams(sentence);
      const trigrams = NGrams.trigrams(sentence);

      bigrams.forEach(gram => {
        const phrase = gram.join(' ').toLowerCase();
        if (this.isValidKeyPhrase(phrase)) {
          keyPhrases.add(phrase);
        }
      });

      trigrams.forEach(gram => {
        const phrase = gram.join(' ').toLowerCase();
        if (this.isValidKeyPhrase(phrase)) {
          keyPhrases.add(phrase);
        }
      });
    });

    return Array.from(keyPhrases).slice(0, count);
  }

  private isValidKeyPhrase(phrase: string): boolean {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
      'before', 'after', 'above', 'below', 'between', 'under', 'again',
      'further', 'then', 'once', 'is', 'are', 'was', 'were', 'been', 'be',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
      'could', 'ought', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours'
    ]);

    const words = phrase.split(' ');
    
    // Filter out phrases that are mostly stop words
    const nonStopWords = words.filter(word => !stopWords.has(word));
    
    return nonStopWords.length >= words.length / 2 && nonStopWords.length > 0;
  }
}