import natural from 'natural';
import crypto from 'crypto';
import type { NewsArticle } from '../../src/types/news.js';

export class DeduplicationService {
  private seenHashes: Set<string>;
  private similarityThreshold: number;

  constructor(similarityThreshold: number = 0.8) {
    this.seenHashes = new Set();
    this.similarityThreshold = similarityThreshold;
  }

  deduplicateArticles(articles: NewsArticle[]): {
    unique: NewsArticle[];
    duplicatesRemoved: number;
  } {
    const uniqueArticles: NewsArticle[] = [];
    let duplicatesRemoved = 0;

    for (const article of articles) {
      if (this.isUnique(article, uniqueArticles)) {
        uniqueArticles.push(article);
      } else {
        duplicatesRemoved++;
      }
    }

    return { unique: uniqueArticles, duplicatesRemoved };
  }

  private isUnique(article: NewsArticle, existingArticles: NewsArticle[]): boolean {
    // Check URL hash first (exact URL match)
    const urlHash = this.hashUrl(article.url);
    if (this.seenHashes.has(urlHash)) {
      return false;
    }

    // Check title similarity
    for (const existing of existingArticles) {
      if (this.areSimilar(article, existing)) {
        return false;
      }
    }

    // Add to seen hashes
    this.seenHashes.add(urlHash);
    return true;
  }

  private areSimilar(article1: NewsArticle, article2: NewsArticle): boolean {
    // Quick check: if URLs are the same
    if (article1.url === article2.url) {
      return true;
    }

    // Calculate title similarity
    const titleSimilarity = this.calculateSimilarity(
      article1.title,
      article2.title
    );

    if (titleSimilarity >= this.similarityThreshold) {
      return true;
    }

    // Check content similarity if both have content
    if (article1.content && article2.content) {
      const contentSimilarity = this.calculateSimilarity(
        article1.content.substring(0, 500), // Compare first 500 chars for performance
        article2.content.substring(0, 500)
      );

      if (contentSimilarity >= this.similarityThreshold) {
        return true;
      }
    }

    // Check if they're from the same source and published very close in time
    if (
      article1.source.name === article2.source.name &&
      Math.abs(
        new Date(article1.publishedAt).getTime() -
        new Date(article2.publishedAt).getTime()
      ) < 60000 // Within 1 minute
    ) {
      // If titles are somewhat similar and from same source at same time
      if (titleSimilarity >= 0.6) {
        return true;
      }
    }

    return false;
  }

  private calculateSimilarity(text1: string, text2: string): number {
    // Use Jaro-Winkler distance for string similarity
    const distance = natural.JaroWinklerDistance(
      text1.toLowerCase(),
      text2.toLowerCase()
    );

    return distance;
  }

  private hashUrl(url: string): string {
    return crypto.createHash('sha256').update(url).digest('hex');
  }

  clearCache(): void {
    this.seenHashes.clear();
  }

  getCacheSize(): number {
    return this.seenHashes.size;
  }

  // Advanced deduplication using TF-IDF vectors
  deduplicateWithVectors(articles: NewsArticle[]): {
    unique: NewsArticle[];
    duplicatesRemoved: number;
    clusters: Map<string, NewsArticle[]>;
  } {
    const tfidf = new natural.TfIdf();
    const uniqueArticles: NewsArticle[] = [];
    const clusters = new Map<string, NewsArticle[]>();
    let duplicatesRemoved = 0;

    // Add all articles to TF-IDF
    articles.forEach(article => {
      const text = `${article.title} ${article.description || ''} ${article.content || ''}`;
      tfidf.addDocument(text);
    });

    // Calculate similarity matrix
    const processed = new Set<number>();

    for (let i = 0; i < articles.length; i++) {
      if (processed.has(i)) continue;

      const article = articles[i];
      const clusterId = article.id;
      const cluster = [article];
      uniqueArticles.push(article);
      processed.add(i);

      // Find similar articles
      for (let j = i + 1; j < articles.length; j++) {
        if (processed.has(j)) continue;

        const similarity = this.calculateCosineSimilarity(tfidf, i, j);
        
        if (similarity >= this.similarityThreshold) {
          cluster.push(articles[j]);
          processed.add(j);
          duplicatesRemoved++;
        }
      }

      if (cluster.length > 1) {
        clusters.set(clusterId, cluster);
      }
    }

    return { unique: uniqueArticles, duplicatesRemoved, clusters };
  }

  private calculateCosineSimilarity(
    tfidf: natural.TfIdf,
    doc1Index: number,
    doc2Index: number
  ): number {
    const terms = new Set<string>();
    const vector1: number[] = [];
    const vector2: number[] = [];

    // Get all unique terms
    tfidf.listTerms(doc1Index).forEach(item => terms.add(item.term));
    tfidf.listTerms(doc2Index).forEach(item => terms.add(item.term));

    // Build vectors
    const termsArray = Array.from(terms);
    termsArray.forEach(term => {
      let val1 = 0;
      let val2 = 0;

      tfidf.tfidfs(term, (i, measure) => {
        if (i === doc1Index) val1 = measure;
        if (i === doc2Index) val2 = measure;
      });

      vector1.push(val1);
      vector2.push(val2);
    });

    // Calculate cosine similarity
    return this.cosineSimilarity(vector1, vector2);
  }

  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (norm1 * norm2);
  }
}