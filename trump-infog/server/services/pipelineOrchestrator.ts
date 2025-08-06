import { EventEmitter } from 'events';
import { writeFile, readFile, mkdir } from 'fs/promises';
import path from 'path';
import { NewsApiService } from './newsApiService.js';
import { nlpService } from './nlpService.js';
import { dataCollector } from './dataCollector.js';
import { contentValidator } from './contentValidator.js';
import { exportService } from './exportService.js';
import { sharedStateManager } from './sharedStateManager.js';
import { logger } from '../utils/logger.js';
import type { NewsArticle, AnalyzedContent } from '../types/news.js';

export interface PipelinePhase {
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startTime?: Date;
  endTime?: Date;
  progress: number;
  message?: string;
  error?: string;
  outputPath?: string;
}

export interface PipelineState {
  id: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  phases: {
    dataCollection: PipelinePhase;
    contentAnalysis: PipelinePhase;
    designGeneration: PipelinePhase;
    outputAssembly: PipelinePhase;
  };
  startedAt?: Date;
  completedAt?: Date;
  totalArticles: number;
  analyzedArticles: number;
  currentPhase?: string;
  errors: string[];
}

export class PipelineOrchestrator extends EventEmitter {
  private newsApiService: NewsApiService;
  private state: PipelineState;
  private coordinationPath: string;
  private outputBasePath: string;

  constructor() {
    super();
    this.newsApiService = new NewsApiService(process.env.NEWS_API_KEY);
    this.coordinationPath = process.env.COORDINATION_PATH || '/tmp/claude_coordination/trump_infog';
    this.outputBasePath = '/tmp/trump_infog';
    
    this.state = this.initializeState();
    this.setupDirectories();
  }

  private initializeState(): PipelineState {
    return {
      id: `pipeline_${Date.now()}`,
      status: 'idle',
      phases: {
        dataCollection: {
          name: 'Data Collection',
          status: 'pending',
          progress: 0
        },
        contentAnalysis: {
          name: 'Content Analysis',
          status: 'pending',
          progress: 0
        },
        designGeneration: {
          name: 'Design Generation',
          status: 'pending',
          progress: 0
        },
        outputAssembly: {
          name: 'Output Assembly',
          status: 'pending',
          progress: 0
        }
      },
      totalArticles: 0,
      analyzedArticles: 0,
      errors: []
    };
  }

  private async setupDirectories(): Promise<void> {
    const dirs = [
      this.coordinationPath,
      path.join(this.outputBasePath, 'raw_data'),
      path.join(this.outputBasePath, 'analyzed_content'),
      path.join(this.outputBasePath, 'design_assets'),
      path.join(this.outputBasePath, 'final_output')
    ];

    for (const dir of dirs) {
      await mkdir(dir, { recursive: true });
    }
  }

  async startPipeline(): Promise<void> {
    if (this.state.status === 'running') {
      throw new Error('Pipeline is already running');
    }

    logger.info('Starting Trump infographic pipeline', { id: this.state.id });
    
    this.state.status = 'running';
    this.state.startedAt = new Date();
    this.state.errors = [];
    
    this.emit('pipeline:started', { id: this.state.id });
    await this.updateSharedState();

    try {
      await this.runPhase1_DataCollection();
      await this.runPhase2_ContentAnalysis();
      await this.runPhase3_DesignGeneration();
      await this.runPhase4_OutputAssembly();
      
      this.state.status = 'completed';
      this.state.completedAt = new Date();
      
      logger.info('Pipeline completed successfully', {
        id: this.state.id,
        duration: this.state.completedAt.getTime() - this.state.startedAt.getTime()
      });
      
      this.emit('pipeline:completed', {
        id: this.state.id,
        duration: this.state.completedAt.getTime() - this.state.startedAt.getTime()
      });
    } catch (error) {
      this.state.status = 'failed';
      this.state.errors.push(error instanceof Error ? error.message : 'Unknown error');
      
      logger.error('Pipeline failed', { id: this.state.id, error });
      
      this.emit('pipeline:failed', {
        id: this.state.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw error;
    } finally {
      await this.updateSharedState();
    }
  }

  private async runPhase1_DataCollection(): Promise<void> {
    const phase = this.state.phases.dataCollection;
    phase.status = 'in_progress';
    phase.startTime = new Date();
    this.state.currentPhase = 'dataCollection';
    
    this.emit('phase:started', { phase: 'dataCollection' });
    await this.updateSharedState();

    try {
      logger.info('Phase 1: Collecting Trump-related articles');
      
      phase.progress = 10;
      await this.updateSharedState();
      
      const articles = await this.newsApiService.fetchTrumpArticles();
      
      phase.progress = 50;
      await this.updateSharedState();
      
      const validatedArticles = await contentValidator.validateArticles(articles);
      
      phase.progress = 75;
      await this.updateSharedState();
      
      const dedupedArticles = await dataCollector.deduplicateArticles(validatedArticles);
      
      this.state.totalArticles = dedupedArticles.length;
      
      const outputPath = path.join(this.outputBasePath, 'raw_data', 'articles.json');
      await writeFile(outputPath, JSON.stringify(dedupedArticles, null, 2));
      
      phase.outputPath = outputPath;
      phase.status = 'completed';
      phase.endTime = new Date();
      phase.progress = 100;
      phase.message = `Collected ${dedupedArticles.length} unique articles`;
      
      logger.info('Phase 1 completed', {
        articlesCollected: dedupedArticles.length,
        duration: phase.endTime.getTime() - phase.startTime.getTime()
      });
      
      this.emit('phase:completed', {
        phase: 'dataCollection',
        articlesCollected: dedupedArticles.length
      });
      
      this.emit('data_collected', {
        count: dedupedArticles.length,
        path: outputPath
      });
    } catch (error) {
      phase.status = 'failed';
      phase.error = error instanceof Error ? error.message : 'Unknown error';
      phase.endTime = new Date();
      throw error;
    } finally {
      await this.updateSharedState();
    }
  }

  private async runPhase2_ContentAnalysis(): Promise<void> {
    const phase = this.state.phases.contentAnalysis;
    phase.status = 'in_progress';
    phase.startTime = new Date();
    this.state.currentPhase = 'contentAnalysis';
    
    this.emit('phase:started', { phase: 'contentAnalysis' });
    await this.updateSharedState();

    try {
      logger.info('Phase 2: Analyzing article content');
      
      const articlesPath = this.state.phases.dataCollection.outputPath;
      if (!articlesPath) {
        throw new Error('No articles found from data collection phase');
      }
      
      const articlesData = await readFile(articlesPath, 'utf-8');
      const articles: NewsArticle[] = JSON.parse(articlesData);
      
      const analyzedContents: AnalyzedContent[] = [];
      const totalArticles = articles.length;
      
      for (let i = 0; i < articles.length; i++) {
        const article = articles[i];
        const analyzed = await nlpService.analyzeContent(article);
        analyzedContents.push(analyzed);
        
        this.state.analyzedArticles = i + 1;
        phase.progress = Math.floor(((i + 1) / totalArticles) * 100);
        
        if (i % 10 === 0) {
          await this.updateSharedState();
          this.emit('analysis:progress', {
            current: i + 1,
            total: totalArticles,
            percentage: phase.progress
          });
        }
      }
      
      const themes = this.aggregateThemes(analyzedContents);
      const sentiment = this.aggregateSentiment(analyzedContents);
      const entities = this.aggregateEntities(analyzedContents);
      
      const analysisResult = {
        timestamp: new Date(),
        totalArticles: analyzedContents.length,
        articles: analyzedContents,
        aggregated: {
          themes,
          sentiment,
          entities,
          topKeywords: this.getTopKeywords(analyzedContents)
        }
      };
      
      const outputPath = path.join(this.outputBasePath, 'analyzed_content', 'analysis.json');
      await writeFile(outputPath, JSON.stringify(analysisResult, null, 2));
      
      phase.outputPath = outputPath;
      phase.status = 'completed';
      phase.endTime = new Date();
      phase.progress = 100;
      phase.message = `Analyzed ${analyzedContents.length} articles`;
      
      logger.info('Phase 2 completed', {
        articlesAnalyzed: analyzedContents.length,
        duration: phase.endTime.getTime() - phase.startTime.getTime()
      });
      
      this.emit('phase:completed', {
        phase: 'contentAnalysis',
        articlesAnalyzed: analyzedContents.length
      });
      
      this.emit('analysis_complete', {
        count: analyzedContents.length,
        path: outputPath
      });
    } catch (error) {
      phase.status = 'failed';
      phase.error = error instanceof Error ? error.message : 'Unknown error';
      phase.endTime = new Date();
      throw error;
    } finally {
      await this.updateSharedState();
    }
  }

  private async runPhase3_DesignGeneration(): Promise<void> {
    const phase = this.state.phases.designGeneration;
    phase.status = 'in_progress';
    phase.startTime = new Date();
    this.state.currentPhase = 'designGeneration';
    
    this.emit('phase:started', { phase: 'designGeneration' });
    await this.updateSharedState();

    try {
      logger.info('Phase 3: Generating design assets');
      
      const analysisPath = this.state.phases.contentAnalysis.outputPath;
      if (!analysisPath) {
        throw new Error('No analysis found from content analysis phase');
      }
      
      const analysisData = await readFile(analysisPath, 'utf-8');
      const analysis = JSON.parse(analysisData);
      
      const designConfig = {
        template: 'modern-infographic',
        colorScheme: 'professional-blue',
        charts: this.determineChartTypes(analysis.aggregated),
        layout: 'vertical-flow',
        dimensions: { width: 1920, height: 1080 }
      };
      
      phase.progress = 50;
      await this.updateSharedState();
      
      const outputPath = path.join(this.outputBasePath, 'design_assets', 'design_config.json');
      await writeFile(outputPath, JSON.stringify(designConfig, null, 2));
      
      phase.outputPath = outputPath;
      phase.status = 'completed';
      phase.endTime = new Date();
      phase.progress = 100;
      phase.message = 'Design assets generated';
      
      logger.info('Phase 3 completed', {
        duration: phase.endTime.getTime() - phase.startTime.getTime()
      });
      
      this.emit('phase:completed', { phase: 'designGeneration' });
      this.emit('design_ready', { path: outputPath });
    } catch (error) {
      phase.status = 'failed';
      phase.error = error instanceof Error ? error.message : 'Unknown error';
      phase.endTime = new Date();
      throw error;
    } finally {
      await this.updateSharedState();
    }
  }

  private async runPhase4_OutputAssembly(): Promise<void> {
    const phase = this.state.phases.outputAssembly;
    phase.status = 'in_progress';
    phase.startTime = new Date();
    this.state.currentPhase = 'outputAssembly';
    
    this.emit('phase:started', { phase: 'outputAssembly' });
    await this.updateSharedState();

    try {
      logger.info('Phase 4: Assembling final output');
      
      const analysisPath = this.state.phases.contentAnalysis.outputPath;
      const designPath = this.state.phases.designGeneration.outputPath;
      
      if (!analysisPath || !designPath) {
        throw new Error('Missing required data from previous phases');
      }
      
      phase.progress = 25;
      await this.updateSharedState();
      
      const infographicMetadata = {
        id: this.state.id,
        generatedAt: new Date(),
        totalArticles: this.state.totalArticles,
        analyzedArticles: this.state.analyzedArticles,
        pipelineDuration: Date.now() - this.state.startedAt!.getTime(),
        formats: ['png', 'pdf', 'svg']
      };
      
      phase.progress = 75;
      await this.updateSharedState();
      
      const outputPath = path.join(this.outputBasePath, 'final_output', 'infographic_metadata.json');
      await writeFile(outputPath, JSON.stringify(infographicMetadata, null, 2));
      
      phase.outputPath = outputPath;
      phase.status = 'completed';
      phase.endTime = new Date();
      phase.progress = 100;
      phase.message = 'Infographic assembled successfully';
      
      logger.info('Phase 4 completed', {
        duration: phase.endTime.getTime() - phase.startTime.getTime()
      });
      
      this.emit('phase:completed', { phase: 'outputAssembly' });
      this.emit('infographic_complete', {
        path: outputPath,
        metadata: infographicMetadata
      });
    } catch (error) {
      phase.status = 'failed';
      phase.error = error instanceof Error ? error.message : 'Unknown error';
      phase.endTime = new Date();
      throw error;
    } finally {
      await this.updateSharedState();
    }
  }

  private aggregateThemes(contents: AnalyzedContent[]): Record<string, number> {
    const themes: Record<string, number> = {};
    
    contents.forEach(content => {
      content.themes.forEach(theme => {
        themes[theme] = (themes[theme] || 0) + 1;
      });
    });
    
    return themes;
  }

  private aggregateSentiment(contents: AnalyzedContent[]): any {
    const sentiments = contents.map(c => c.sentiment);
    const avgScore = sentiments.reduce((sum, s) => sum + s.score, 0) / sentiments.length;
    const avgComparative = sentiments.reduce((sum, s) => sum + s.comparative, 0) / sentiments.length;
    
    const distribution = {
      positive: sentiments.filter(s => s.label === 'positive').length,
      negative: sentiments.filter(s => s.label === 'negative').length,
      neutral: sentiments.filter(s => s.label === 'neutral').length
    };
    
    return {
      averageScore: avgScore,
      averageComparative: avgComparative,
      distribution,
      overallLabel: avgScore > 2 ? 'positive' : avgScore < -2 ? 'negative' : 'neutral'
    };
  }

  private aggregateEntities(contents: AnalyzedContent[]): any {
    const entities = {
      people: new Map<string, number>(),
      organizations: new Map<string, number>(),
      locations: new Map<string, number>(),
      topics: new Map<string, number>()
    };
    
    contents.forEach(content => {
      content.entities.people.forEach(person => {
        entities.people.set(person, (entities.people.get(person) || 0) + 1);
      });
      content.entities.organizations.forEach(org => {
        entities.organizations.set(org, (entities.organizations.get(org) || 0) + 1);
      });
      content.entities.locations.forEach(loc => {
        entities.locations.set(loc, (entities.locations.get(loc) || 0) + 1);
      });
      content.entities.topics.forEach(topic => {
        entities.topics.set(topic, (entities.topics.get(topic) || 0) + 1);
      });
    });
    
    return {
      topPeople: Array.from(entities.people.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10),
      topOrganizations: Array.from(entities.organizations.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10),
      topLocations: Array.from(entities.locations.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10),
      topTopics: Array.from(entities.topics.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
    };
  }

  private getTopKeywords(contents: AnalyzedContent[]): Array<{ word: string; totalScore: number }> {
    const keywordMap = new Map<string, number>();
    
    contents.forEach(content => {
      content.keywords.forEach(kw => {
        keywordMap.set(kw.word, (keywordMap.get(kw.word) || 0) + kw.score);
      });
    });
    
    return Array.from(keywordMap.entries())
      .map(([word, totalScore]) => ({ word, totalScore }))
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 30);
  }

  private determineChartTypes(aggregated: any): string[] {
    const charts = [];
    
    if (aggregated.sentiment?.distribution) {
      charts.push('sentiment-pie-chart');
    }
    
    if (aggregated.themes && Object.keys(aggregated.themes).length > 0) {
      charts.push('themes-bar-chart');
    }
    
    if (aggregated.entities?.topPeople?.length > 0) {
      charts.push('people-mention-chart');
    }
    
    if (aggregated.topKeywords?.length > 0) {
      charts.push('keyword-cloud');
    }
    
    return charts;
  }

  private async updateSharedState(): Promise<void> {
    const sharedStatePath = path.join(this.coordinationPath, 'shared_state.json');
    await writeFile(sharedStatePath, JSON.stringify(this.state, null, 2));
    
    await sharedStateManager.updateState('pipeline', this.state);
    
    this.emit('state:updated', this.state);
  }

  getState(): PipelineState {
    return { ...this.state };
  }

  async stopPipeline(): Promise<void> {
    if (this.state.status !== 'running') {
      return;
    }
    
    logger.info('Stopping pipeline', { id: this.state.id });
    
    this.state.status = 'failed';
    this.state.errors.push('Pipeline stopped by user');
    this.state.completedAt = new Date();
    
    await this.updateSharedState();
    
    this.emit('pipeline:stopped', { id: this.state.id });
  }
}

export const pipelineOrchestrator = new PipelineOrchestrator();