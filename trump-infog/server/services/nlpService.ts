import natural from 'natural';
import Sentiment from 'sentiment';
import nlp from 'compromise';
import crypto from 'crypto';
import { INLPService, NewsArticle, AnalyzedContent } from './types.js';
import { cacheService } from './cacheService.js';

export class NLPService implements INLPService {
  private sentiment: Sentiment;
  private tokenizer: natural.WordTokenizer;
  private tfidf: natural.TfIdf;

  constructor() {
    this.sentiment = new Sentiment();
    this.tokenizer = new natural.WordTokenizer();
    this.tfidf = new natural.TfIdf();
  }

  async analyzeContent(article: NewsArticle): Promise<AnalyzedContent> {
    const cacheKey = `nlp:${article.id}`;
    const cached = await cacheService.get<AnalyzedContent>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const content = `${article.title} ${article.description} ${article.content}`;
    
    const [themes, sentimentData, entities, keywords] = await Promise.all([
      this.extractThemes(content),
      this.analyzeSentiment(content),
      this.extractEntities(content),
      this.extractKeywords(content)
    ]);

    const summary = await this.summarize(content, 150);
    const statistics = this.calculateStatistics(content);

    const analyzed: AnalyzedContent = {
      id: crypto.createHash('md5').update(`${article.id}-analysis`).digest('hex'),
      articleId: article.id,
      themes,
      entities,
      sentiment: sentimentData,
      keywords,
      summary,
      statistics
    };

    await cacheService.set(cacheKey, analyzed, { ttl: 7200 }); // Cache for 2 hours
    
    return analyzed;
  }

  async extractThemes(content: string): Promise<string[]> {
    const doc = nlp(content);
    const themes = new Set<string>();

    const topics = doc.topics().out('array');
    topics.forEach(topic => themes.add(topic.toLowerCase()));

    const nouns = doc.nouns().out('array');
    const nounFreq = this.calculateFrequency(nouns);
    const topNouns = Object.entries(nounFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([noun]) => noun);
    
    topNouns.forEach(noun => themes.add(noun.toLowerCase()));

    const patterns = [
      /trump\s+\w+\s+policy/gi,
      /\w+\s+administration/gi,
      /\w+\s+campaign/gi,
      /\w+\s+election/gi,
      /economic\s+\w+/gi,
      /foreign\s+\w+/gi,
      /immigration\s+\w+/gi
    ];

    patterns.forEach(pattern => {
      const matches = content.match(pattern) || [];
      matches.forEach(match => themes.add(match.toLowerCase()));
    });

    return Array.from(themes).slice(0, 10);
  }

  async analyzeSentiment(content: string): Promise<AnalyzedContent['sentiment']> {
    const result = this.sentiment.analyze(content);
    
    let label: 'positive' | 'negative' | 'neutral';
    if (result.score > 2) {
      label = 'positive';
    } else if (result.score < -2) {
      label = 'negative';
    } else {
      label = 'neutral';
    }

    return {
      score: result.score,
      comparative: result.comparative,
      positive: result.positive || [],
      negative: result.negative || [],
      label
    };
  }

  async extractEntities(content: string): Promise<AnalyzedContent['entities']> {
    const doc = nlp(content);
    
    const entities: AnalyzedContent['entities'] = {
      people: [],
      organizations: [],
      locations: [],
      topics: []
    };

    entities.people = doc.people().out('array')
      .map(person => person.trim())
      .filter(person => person.length > 2);

    entities.organizations = doc.organizations().out('array')
      .map(org => org.trim())
      .filter(org => org.length > 2);

    entities.locations = doc.places().out('array')
      .map(place => place.trim())
      .filter(place => place.length > 2);

    const knownOrgs = [
      'Republican Party', 'Democratic Party', 'GOP', 'Congress',
      'Senate', 'House of Representatives', 'White House',
      'Supreme Court', 'Department of Justice', 'FBI', 'CIA'
    ];

    knownOrgs.forEach(org => {
      if (content.toLowerCase().includes(org.toLowerCase())) {
        if (!entities.organizations.includes(org)) {
          entities.organizations.push(org);
        }
      }
    });

    const topicPatterns = [
      { pattern: /\b(economy|economic|inflation|jobs|employment)\b/gi, topic: 'Economy' },
      { pattern: /\b(immigration|border|migrants?)\b/gi, topic: 'Immigration' },
      { pattern: /\b(healthcare|medicare|medicaid)\b/gi, topic: 'Healthcare' },
      { pattern: /\b(foreign policy|international|diplomacy)\b/gi, topic: 'Foreign Policy' },
      { pattern: /\b(election|campaign|polls?|voting)\b/gi, topic: 'Elections' },
      { pattern: /\b(climate|environment|energy)\b/gi, topic: 'Climate/Energy' }
    ];

    topicPatterns.forEach(({ pattern, topic }) => {
      if (pattern.test(content)) {
        entities.topics.push(topic);
      }
    });

    entities.people = [...new Set(entities.people)].slice(0, 10);
    entities.organizations = [...new Set(entities.organizations)].slice(0, 10);
    entities.locations = [...new Set(entities.locations)].slice(0, 10);
    entities.topics = [...new Set(entities.topics)];

    return entities;
  }

  async summarize(content: string, maxLength: number = 200): Promise<string> {
    const sentences = content.match(/[^.!?]+[.!?]+/g) || [];
    
    if (sentences.length <= 3) {
      return content.substring(0, maxLength) + '...';
    }

    this.tfidf.addDocument(content);
    
    const scoredSentences = sentences.map(sentence => {
      let score = 0;
      const words = this.tokenizer.tokenize(sentence.toLowerCase());
      
      words.forEach(word => {
        this.tfidf.tfidfs(word, (i, measure) => {
          score += measure;
        });
      });
      
      return { sentence: sentence.trim(), score };
    });

    scoredSentences.sort((a, b) => b.score - a.score);
    
    const topSentences = scoredSentences.slice(0, 3);
    topSentences.sort((a, b) => sentences.indexOf(a.sentence) - sentences.indexOf(b.sentence));
    
    const summary = topSentences.map(s => s.sentence).join(' ');
    
    if (summary.length > maxLength) {
      return summary.substring(0, maxLength) + '...';
    }
    
    return summary;
  }

  private async extractKeywords(content: string): Promise<Array<{ word: string; score: number }>> {
    const doc = nlp(content);
    const words = doc.nouns().out('array')
      .concat(doc.adjectives().out('array'))
      .map(word => word.toLowerCase());
    
    const wordFreq = this.calculateFrequency(words);
    
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that'
    ]);
    
    const keywords = Object.entries(wordFreq)
      .filter(([word]) => !stopWords.has(word) && word.length > 3)
      .map(([word, freq]) => ({
        word,
        score: freq / words.length
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
    
    return keywords;
  }

  private calculateFrequency(words: string[]): Record<string, number> {
    const freq: Record<string, number> = {};
    
    words.forEach(word => {
      const normalized = word.toLowerCase().trim();
      if (normalized) {
        freq[normalized] = (freq[normalized] || 0) + 1;
      }
    });
    
    return freq;
  }

  private calculateStatistics(content: string): AnalyzedContent['statistics'] {
    const words = this.tokenizer.tokenize(content);
    const sentences = content.match(/[^.!?]+[.!?]+/g) || [];
    
    const wordCount = words.length;
    const sentenceCount = sentences.length;
    const avgWordsPerMinute = 200;
    const readingTime = Math.ceil(wordCount / avgWordsPerMinute);
    
    return {
      wordCount,
      sentenceCount,
      readingTime
    };
  }
}

export const nlpService = new NLPService();