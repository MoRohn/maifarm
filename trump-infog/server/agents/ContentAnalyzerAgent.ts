import * as fs from 'fs/promises';
import * as path from 'path';
import natural from 'natural';
import { BaseAgent } from './BaseAgent.js';
import {
  IContentAnalyzerAgent,
  AgentConfig,
  AgentMessage,
  DataCollectionResult,
  ContentAnalysisResult,
  NewsArticle,
  Theme,
  Entity,
  SentimentAnalysis,
  ContentHierarchy,
  Topic,
  HierarchyNode,
  AgentRole
} from './types.js';

const { TfIdf, SentimentAnalyzer, PorterStemmer } = natural;

export class ContentAnalyzerAgent extends BaseAgent implements IContentAnalyzerAgent {
  private tfidf: typeof TfIdf;
  private sentimentAnalyzer: typeof SentimentAnalyzer;
  private tokenizer: any;

  constructor(config: AgentConfig) {
    super({
      ...config,
      role: AgentRole.CONTENT_ANALYZER
    });
    
    this.tfidf = new TfIdf();
    this.sentimentAnalyzer = new SentimentAnalyzer('English', PorterStemmer, 'afinn');
    this.tokenizer = new natural.WordTokenizer();
  }

  async initializeAgent(): Promise<void> {
    console.log('Content Analyzer Agent initialized with NLP capabilities');
  }

  async startAgent(): Promise<void> {
    console.log('Content Analyzer Agent started, waiting for data to analyze...');
    
    // Wait for data collection to complete
    await this.waitForStage('data_collection');
    
    // Load and analyze the collected data
    const dataPath = path.join(this.coordinationPath, 'trump_infog', 'data_pipeline', 'raw_data.json');
    try {
      const content = await fs.readFile(dataPath, 'utf-8');
      const data: DataCollectionResult = JSON.parse(content);
      await this.analyzeContent(data);
    } catch (error) {
      console.error('Failed to load data for analysis:', error);
      this.handleError(error as Error);
    }
  }

  async stopAgent(): Promise<void> {
    console.log('Content Analyzer Agent stopping...');
  }

  async processTask(task: any): Promise<any> {
    this.updateProgress(0, 'Processing content analysis task');
    
    try {
      const { data } = task;
      const result = await this.analyzeContent(data);
      
      this.notifyComplete(result);
      return result;
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  protected async handleAgentMessage(message: AgentMessage): Promise<void> {
    switch (message.type) {
      case 'analyze:start':
        await this.analyzeContent(message.payload.data);
        break;
      case 'extract:themes':
        await this.extractThemes(message.payload.articles);
        break;
      default:
        console.log(`Unknown message type: ${message.type}`);
    }
  }

  async analyzeContent(data: DataCollectionResult): Promise<ContentAnalysisResult> {
    try {
      this.updateProgress(10, 'Extracting themes from articles');
      
      // Extract themes
      const themes = await this.extractThemes(data.articles);
      
      this.updateProgress(30, 'Performing entity recognition');
      
      // Extract entities
      const entities = this.extractEntities(data.articles);
      
      this.updateProgress(50, 'Analyzing sentiment');
      
      // Analyze sentiment
      const sentiment = this.analyzeSentiment(data.articles);
      
      this.updateProgress(70, 'Creating content hierarchy');
      
      // Create content hierarchy
      const hierarchy = this.createContentHierarchy(themes, entities);
      
      this.updateProgress(85, 'Generating insights');
      
      // Generate insights
      const insights = this.generateInsights(themes, sentiment, entities);
      
      this.updateProgress(95, 'Creating summary');
      
      // Generate summary
      const result: ContentAnalysisResult = {
        themes,
        entities,
        sentiment,
        summary: await this.generateSummary({ themes, entities, sentiment, hierarchy, insights, summary: '' }),
        hierarchy,
        insights
      };

      // Save analysis results
      await this.saveAnalysisResults(result);
      
      this.updateProgress(100, 'Analysis complete');
      this.addOutput(path.join(this.config.workingDirectory, 'outputs', 'analysis_results.json'));
      
      // Mark content analysis stage as complete
      await this.completeStage('content_analysis', {
        themeCount: themes.length,
        entityCount: entities.length,
        overallSentiment: sentiment.overall
      });
      
      return result;
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  async extractThemes(articles: NewsArticle[]): Promise<Theme[]> {
    // Add all articles to TF-IDF
    articles.forEach(article => {
      this.tfidf.addDocument(`${article.title} ${article.content}`);
    });

    // Extract key terms from all documents
    const allTerms: Map<string, number> = new Map();
    const termContexts: Map<string, string[]> = new Map();
    
    articles.forEach((article, docIndex) => {
      const topTerms = this.tfidf.listTerms(docIndex);
      
      topTerms.slice(0, 20).forEach(item => {
        const term = item.term;
        const score = item.tfidf;
        
        // Aggregate scores
        allTerms.set(term, (allTerms.get(term) || 0) + score);
        
        // Store contexts
        if (!termContexts.has(term)) {
          termContexts.set(term, []);
        }
        termContexts.get(term)!.push(article.title);
      });
    });

    // Sort terms by aggregate score
    const sortedTerms = Array.from(allTerms.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);

    // Group related terms into themes
    const themes: Theme[] = [];
    const usedTerms = new Set<string>();

    for (const [term, score] of sortedTerms) {
      if (usedTerms.has(term)) continue;
      
      // Find related terms
      const relatedTerms: string[] = [];
      for (const [otherTerm] of sortedTerms) {
        if (term !== otherTerm && !usedTerms.has(otherTerm)) {
          // Simple similarity check (could be improved with word embeddings)
          if (this.areTermsRelated(term, otherTerm)) {
            relatedTerms.push(otherTerm);
            usedTerms.add(otherTerm);
          }
        }
      }
      
      usedTerms.add(term);
      
      // Calculate sentiment for this theme
      const themeSentiment = this.calculateThemeSentiment(articles, term, relatedTerms);
      
      themes.push({
        name: this.capitalizeTheme(term),
        frequency: score,
        relatedTerms: relatedTerms.slice(0, 5),
        sentiment: themeSentiment
      });
    }

    return themes.slice(0, 10);
  }

  private areTermsRelated(term1: string, term2: string): boolean {
    // Simple heuristic - check if terms share common stems or are substrings
    const stem1 = PorterStemmer.stem(term1);
    const stem2 = PorterStemmer.stem(term2);
    
    return stem1 === stem2 || 
           term1.includes(term2) || 
           term2.includes(term1) ||
           (term1.length > 3 && term2.length > 3 && 
            (term1.substring(0, 3) === term2.substring(0, 3)));
  }

  private capitalizeTheme(term: string): string {
    return term.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  private calculateThemeSentiment(articles: NewsArticle[], mainTerm: string, relatedTerms: string[]): number {
    const relevantSentences: string[] = [];
    const allTerms = [mainTerm, ...relatedTerms];
    
    articles.forEach(article => {
      const sentences = article.content.split(/[.!?]+/);
      sentences.forEach(sentence => {
        if (allTerms.some(term => sentence.toLowerCase().includes(term))) {
          relevantSentences.push(sentence);
        }
      });
    });

    if (relevantSentences.length === 0) return 0;

    const sentiments = relevantSentences.map(sentence => {
      const tokens = this.tokenizer.tokenize(sentence);
      return this.sentimentAnalyzer.getSentiment(tokens);
    });

    return sentiments.reduce((a, b) => a + b, 0) / sentiments.length;
  }

  private extractEntities(articles: NewsArticle[]): Entity[] {
    const entityMap: Map<string, { type: string; frequency: number; contexts: string[] }> = new Map();
    
    // Simple entity extraction (in production, would use NER)
    const patterns = {
      person: /\b([A-Z][a-z]+ (?:[A-Z][a-z]+ )?[A-Z][a-z]+)\b/g,
      organization: /\b((?:The )?[A-Z][a-zA-Z]+(?: [A-Z][a-zA-Z]+)*(?:Inc|Corp|LLC|Company|Administration|Department|Agency|Committee)?)\b/g,
      location: /\b([A-Z][a-z]+(?: [A-Z][a-z]+)*(?:, [A-Z][a-z]+)?)\b/g
    };

    const commonWords = new Set(['The', 'This', 'That', 'These', 'Those', 'And', 'But', 'For']);

    articles.forEach(article => {
      const text = `${article.title} ${article.content}`;
      
      // Extract persons
      const persons = text.match(patterns.person) || [];
      persons.forEach(person => {
        if (!commonWords.has(person) && person.split(' ').length >= 2) {
          const key = person.trim();
          if (!entityMap.has(key)) {
            entityMap.set(key, { type: 'person', frequency: 0, contexts: [] });
          }
          const entity = entityMap.get(key)!;
          entity.frequency++;
          entity.contexts.push(article.title);
        }
      });

      // Extract organizations
      const orgs = text.match(patterns.organization) || [];
      orgs.forEach(org => {
        if (!commonWords.has(org) && org.length > 3) {
          const key = org.trim();
          if (!entityMap.has(key)) {
            entityMap.set(key, { type: 'organization', frequency: 0, contexts: [] });
          }
          const entity = entityMap.get(key)!;
          entity.frequency++;
          entity.contexts.push(article.title);
        }
      });
    });

    // Convert to array and sort by frequency
    return Array.from(entityMap.entries())
      .map(([name, data]) => ({
        name,
        type: data.type,
        frequency: data.frequency,
        context: data.contexts.slice(0, 3)
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 20);
  }

  private analyzeSentiment(articles: NewsArticle[]): SentimentAnalysis {
    const bySource: Record<string, number> = {};
    const byTheme: Record<string, number> = {};
    let totalSentiment = 0;
    let count = 0;

    articles.forEach(article => {
      const tokens = this.tokenizer.tokenize(article.content);
      const sentiment = this.sentimentAnalyzer.getSentiment(tokens);
      
      totalSentiment += sentiment;
      count++;

      // By source
      if (!bySource[article.source]) {
        bySource[article.source] = 0;
      }
      bySource[article.source] += sentiment;
    });

    // Normalize by source
    Object.keys(bySource).forEach(source => {
      const sourceCount = articles.filter(a => a.source === source).length;
      bySource[source] = bySource[source] / sourceCount;
    });

    return {
      overall: totalSentiment / count,
      bySource,
      byTheme // Will be populated based on theme extraction
    };
  }

  private createContentHierarchy(themes: Theme[], entities: Entity[]): ContentHierarchy {
    // Create main topics from top themes
    const mainTopics: Topic[] = themes.slice(0, 5).map(theme => ({
      title: theme.name,
      importance: theme.frequency,
      subtopics: theme.relatedTerms
    }));

    // Create hierarchy structure
    const structure: HierarchyNode = {
      label: 'Trump News Analysis',
      children: [
        {
          label: 'Key Themes',
          children: themes.map(theme => ({
            label: theme.name,
            value: theme.frequency,
            children: theme.relatedTerms.map(term => ({
              label: term,
              value: 1
            }))
          }))
        },
        {
          label: 'Key People',
          children: entities
            .filter(e => e.type === 'person')
            .slice(0, 10)
            .map(entity => ({
              label: entity.name,
              value: entity.frequency
            }))
        },
        {
          label: 'Organizations',
          children: entities
            .filter(e => e.type === 'organization')
            .slice(0, 10)
            .map(entity => ({
              label: entity.name,
              value: entity.frequency
            }))
        }
      ]
    };

    return {
      mainTopics,
      structure
    };
  }

  private generateInsights(themes: Theme[], sentiment: SentimentAnalysis, entities: Entity[]): string[] {
    const insights: string[] = [];

    // Theme-based insights
    if (themes.length > 0) {
      const topTheme = themes[0];
      insights.push(`The dominant theme is "${topTheme.name}" appearing with high frequency across articles`);
      
      if (topTheme.sentiment > 0.2) {
        insights.push(`Coverage of "${topTheme.name}" tends to be positive`);
      } else if (topTheme.sentiment < -0.2) {
        insights.push(`Coverage of "${topTheme.name}" tends to be negative`);
      }
    }

    // Sentiment insights
    if (sentiment.overall > 0.1) {
      insights.push('Overall media sentiment is positive');
    } else if (sentiment.overall < -0.1) {
      insights.push('Overall media sentiment is negative');
    } else {
      insights.push('Overall media sentiment is neutral');
    }

    // Source diversity
    const sourceCount = Object.keys(sentiment.bySource).length;
    insights.push(`Analysis includes perspectives from ${sourceCount} different news sources`);

    // Entity insights
    const topPerson = entities.find(e => e.type === 'person');
    if (topPerson) {
      insights.push(`${topPerson.name} is the most frequently mentioned person`);
    }

    // Trend insights
    const recentThemes = themes.filter(t => t.relatedTerms.some(term => 
      term.includes('new') || term.includes('recent') || term.includes('latest')
    ));
    if (recentThemes.length > 0) {
      insights.push(`Emerging topics include: ${recentThemes.map(t => t.name).join(', ')}`);
    }

    return insights;
  }

  async generateSummary(analysis: ContentAnalysisResult): Promise<string> {
    const { themes, entities, sentiment, insights } = analysis;
    
    const summary = `
Analysis of ${entities.length} news articles reveals ${themes.length} major themes in Trump-related coverage. 
The top themes are ${themes.slice(0, 3).map(t => t.name).join(', ')}. 
Overall sentiment is ${sentiment.overall > 0.1 ? 'positive' : sentiment.overall < -0.1 ? 'negative' : 'neutral'} 
with a score of ${sentiment.overall.toFixed(2)}. 
Key figures mentioned include ${entities.filter(e => e.type === 'person').slice(0, 3).map(e => e.name).join(', ')}. 
${insights[0]}
    `.trim();

    return summary;
  }

  private async saveAnalysisResults(result: ContentAnalysisResult): Promise<void> {
    const outputPath = path.join(this.config.workingDirectory, 'outputs', 'analysis_results.json');
    const pipelinePath = path.join(this.coordinationPath, 'trump_infog', 'data_pipeline', 'analysis_results.json');
    
    // Save to both locations
    await Promise.all([
      fs.writeFile(outputPath, JSON.stringify(result, null, 2)),
      fs.writeFile(pipelinePath, JSON.stringify(result, null, 2))
    ]);

    // Save summary for quick reference
    const summaryPath = path.join(this.config.workingDirectory, 'outputs', 'analysis_summary.json');
    const summary = {
      timestamp: new Date(),
      summary: result.summary,
      topThemes: result.themes.slice(0, 5).map(t => ({
        name: t.name,
        sentiment: t.sentiment,
        frequency: t.frequency
      })),
      overallSentiment: result.sentiment.overall,
      keyInsights: result.insights
    };
    
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
  }
}