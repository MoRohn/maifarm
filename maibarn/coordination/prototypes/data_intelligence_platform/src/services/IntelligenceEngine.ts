import OpenAI from 'openai';
import { Anthropic } from '@anthropic-ai/sdk';
import Sentiment from 'sentiment';
import { logger } from '../utils/logger';

interface DataPoint {
  id: string;
  source: string;
  content: string;
  timestamp: Date;
  metadata: Record<string, any>;
}

interface TrendAnalysis {
  trend_id: string;
  topic: string;
  momentum: number; // -100 to 100
  confidence: number; // 0 to 100
  related_keywords: string[];
  time_period: string;
  prediction: {
    direction: 'rising' | 'falling' | 'stable';
    strength: number;
    time_horizon: string;
  };
}

interface MarketIntelligence {
  intelligence_id: string;
  timestamp: Date;
  trends: TrendAnalysis[];
  opportunities: MarketOpportunity[];
  sentiment_analysis: SentimentAnalysis;
  competitive_insights: CompetitiveInsight[];
  predictions: MarketPrediction[];
  confidence_score: number;
}

interface MarketOpportunity {
  opportunity_id: string;
  title: string;
  description: string;
  market_size: number;
  competition_level: 'low' | 'medium' | 'high';
  entry_difficulty: number; // 1-10
  revenue_potential: {
    min: number;
    max: number;
    timeframe: string;
  };
  action_items: string[];
}

interface SentimentAnalysis {
  overall_sentiment: number; // -1 to 1
  sentiment_distribution: {
    positive: number;
    neutral: number;
    negative: number;
  };
  sentiment_trends: Array<{
    topic: string;
    sentiment: number;
    volume: number;
  }>;
}

interface CompetitiveInsight {
  competitor: string;
  market_position: string;
  strengths: string[];
  weaknesses: string[];
  recent_activities: string[];
  threat_level: 'low' | 'medium' | 'high';
}

interface MarketPrediction {
  prediction_id: string;
  topic: string;
  prediction: string;
  confidence: number;
  time_horizon: string;
  key_factors: string[];
  risk_assessment: string;
}

export class IntelligenceEngine {
  private openai: OpenAI;
  private anthropic: Anthropic;
  private sentiment: any;
  private isInitialized = false;
  private models: Map<string, any> = new Map();

  constructor() {
    this.openai = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY 
    });
    
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    
    this.sentiment = new Sentiment();
  }

  async initialize(): Promise<void> {
    try {
      logger.info('🧠 Initializing Intelligence Engine...');
      
      // Initialize and validate AI models
      await this.validateModels();
      
      // Load custom trained models for specific domains
      await this.loadCustomModels();
      
      this.isInitialized = true;
      logger.info('✅ Intelligence Engine initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to initialize Intelligence Engine:', error);
      throw error;
    }
  }

  private async validateModels(): Promise<void> {
    try {
      // Test OpenAI connection
      const testResponse = await this.openai.completions.create({
        model: "gpt-3.5-turbo-instruct",
        prompt: "Test",
        max_tokens: 5
      });
      
      // Test Anthropic connection
      const claudeTest = await this.anthropic.messages.create({
        model: "claude-3-sonnet-20240229",
        max_tokens: 10,
        messages: [{ role: "user", content: "Test" }]
      });
      
      logger.info('✅ AI model connections validated');
    } catch (error) {
      logger.error('❌ AI model validation failed:', error);
      throw error;
    }
  }

  private async loadCustomModels(): Promise<void> {
    // Load specialized models for different analysis types
    this.models.set('trend_detection', {
      name: 'trend_detector',
      type: 'statistical',
      parameters: { window_size: 168, threshold: 0.3 } // 1 week window
    });

    this.models.set('anomaly_detection', {
      name: 'anomaly_detector', 
      type: 'statistical',
      parameters: { std_threshold: 2.5, min_samples: 50 }
    });

    this.models.set('sentiment_classifier', {
      name: 'sentiment_classifier',
      type: 'nlp',
      parameters: { confidence_threshold: 0.7 }
    });
  }

  /**
   * Generate comprehensive market intelligence from raw data
   */
  async generateIntelligence(rawData: DataPoint[]): Promise<MarketIntelligence> {
    if (!this.isInitialized) {
      throw new Error('Intelligence Engine not initialized');
    }

    try {
      logger.info(`🔍 Generating intelligence from ${rawData.length} data points`);

      const [
        trends,
        opportunities,
        sentiment,
        competitiveInsights,
        predictions
      ] = await Promise.all([
        this.analyzeTrends(rawData),
        this.identifyOpportunities(rawData),
        this.analyzeSentiment(rawData),
        this.analyzeCompetitors(rawData),
        this.generatePredictions(rawData)
      ]);

      const intelligence: MarketIntelligence = {
        intelligence_id: `intel_${Date.now()}`,
        timestamp: new Date(),
        trends,
        opportunities,
        sentiment_analysis: sentiment,
        competitive_insights: competitiveInsights,
        predictions,
        confidence_score: this.calculateConfidenceScore([
          trends, opportunities, sentiment, competitiveInsights, predictions
        ])
      };

      logger.info(`✅ Intelligence generated with ${intelligence.confidence_score}% confidence`);
      return intelligence;

    } catch (error) {
      logger.error('❌ Intelligence generation failed:', error);
      throw error;
    }
  }

  private async analyzeTrends(data: DataPoint[]): Promise<TrendAnalysis[]> {
    const trendPrompt = `
    Analyze the following data points for emerging trends and patterns.
    Identify the top 10 most significant trends with their momentum and confidence scores.
    
    Data points: ${JSON.stringify(data.slice(0, 100))}
    
    Return analysis in this format:
    {
      "trends": [
        {
          "topic": "trend name",
          "momentum": -100 to 100,
          "confidence": 0 to 100,
          "keywords": ["key", "words"],
          "prediction": {
            "direction": "rising|falling|stable",
            "strength": 0-100,
            "horizon": "short|medium|long"
          }
        }
      ]
    }`;

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-3-sonnet-20240229",
        max_tokens: 2000,
        messages: [{ role: "user", content: trendPrompt }]
      });

      const analysis = JSON.parse(response.content[0].text);
      
      return analysis.trends.map((trend: any) => ({
        trend_id: `trend_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        topic: trend.topic,
        momentum: trend.momentum,
        confidence: trend.confidence,
        related_keywords: trend.keywords,
        time_period: 'current',
        prediction: {
          direction: trend.prediction.direction,
          strength: trend.prediction.strength,
          time_horizon: trend.prediction.horizon
        }
      }));

    } catch (error) {
      logger.error('❌ Trend analysis failed:', error);
      return [];
    }
  }

  private async identifyOpportunities(data: DataPoint[]): Promise<MarketOpportunity[]> {
    const opportunityPrompt = `
    Based on the following market data, identify the top 5 business opportunities.
    Focus on gaps in the market, underserved needs, and emerging demand patterns.
    
    Data: ${JSON.stringify(data.slice(0, 50))}
    
    Format response as:
    {
      "opportunities": [
        {
          "title": "opportunity name",
          "description": "detailed description",
          "market_size": estimated_size_in_dollars,
          "competition": "low|medium|high",
          "difficulty": 1-10,
          "revenue_potential": {
            "min": min_revenue,
            "max": max_revenue, 
            "timeframe": "timeframe"
          },
          "actions": ["action items"]
        }
      ]
    }`;

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: opportunityPrompt }],
        max_tokens: 1500
      });

      const analysis = JSON.parse(response.choices[0].message.content || '{}');
      
      return analysis.opportunities?.map((opp: any) => ({
        opportunity_id: `opp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: opp.title,
        description: opp.description,
        market_size: opp.market_size,
        competition_level: opp.competition,
        entry_difficulty: opp.difficulty,
        revenue_potential: opp.revenue_potential,
        action_items: opp.actions
      })) || [];

    } catch (error) {
      logger.error('❌ Opportunity identification failed:', error);
      return [];
    }
  }

  private async analyzeSentiment(data: DataPoint[]): Promise<SentimentAnalysis> {
    try {
      const sentiments = data.map(point => {
        const result = this.sentiment.analyze(point.content);
        return {
          score: result.score,
          comparative: result.comparative,
          source: point.source
        };
      });

      const totalScore = sentiments.reduce((sum, s) => sum + s.comparative, 0);
      const averageSentiment = totalScore / sentiments.length;

      const positive = sentiments.filter(s => s.comparative > 0).length;
      const negative = sentiments.filter(s => s.comparative < 0).length;
      const neutral = sentiments.length - positive - negative;

      return {
        overall_sentiment: Math.max(-1, Math.min(1, averageSentiment)),
        sentiment_distribution: {
          positive: (positive / sentiments.length) * 100,
          neutral: (neutral / sentiments.length) * 100,
          negative: (negative / sentiments.length) * 100
        },
        sentiment_trends: this.analyzeSentimentTrends(data, sentiments)
      };

    } catch (error) {
      logger.error('❌ Sentiment analysis failed:', error);
      return {
        overall_sentiment: 0,
        sentiment_distribution: { positive: 33, neutral: 34, negative: 33 },
        sentiment_trends: []
      };
    }
  }

  private analyzeSentimentTrends(data: DataPoint[], sentiments: any[]): Array<{topic: string; sentiment: number; volume: number}> {
    // Group by topic/source and calculate sentiment trends
    const topicSentiments = new Map();
    
    data.forEach((point, index) => {
      const topic = point.source;
      if (!topicSentiments.has(topic)) {
        topicSentiments.set(topic, []);
      }
      topicSentiments.get(topic).push(sentiments[index]);
    });

    return Array.from(topicSentiments.entries()).map(([topic, sentiments]) => ({
      topic,
      sentiment: sentiments.reduce((sum: number, s: any) => sum + s.comparative, 0) / sentiments.length,
      volume: sentiments.length
    }));
  }

  private async analyzeCompetitors(data: DataPoint[]): Promise<CompetitiveInsight[]> {
    // Implementation for competitive analysis
    // This would analyze competitor mentions, activities, and market positioning
    return []; // Placeholder
  }

  private async generatePredictions(data: DataPoint[]): Promise<MarketPrediction[]> {
    // Implementation for predictive analytics
    // This would use time series analysis and ML models for forecasting
    return []; // Placeholder
  }

  private calculateConfidenceScore(analysisResults: any[]): number {
    // Calculate overall confidence based on data quality and analysis results
    const dataQuality = Math.min(100, analysisResults.flat().length * 2);
    const analysisDepth = analysisResults.filter(r => r && r.length > 0).length * 20;
    
    return Math.min(100, (dataQuality + analysisDepth) / 2);
  }

  /**
   * Generate daily comprehensive reports
   */
  async generateDailyReports(): Promise<void> {
    logger.info('📊 Generating daily intelligence reports');
    // Implementation for daily report generation
  }

  /**
   * Identify market opportunities based on trend analysis
   */
  async identifyMarketOpportunities(): Promise<MarketOpportunity[]> {
    logger.info('🎯 Identifying market opportunities');
    // Implementation for opportunity identification
    return [];
  }

  /**
   * Optimize AI models based on performance data
   */
  async optimizeModels(): Promise<void> {
    logger.info('⚡ Optimizing intelligence models');
    // Implementation for model optimization
  }

  isHealthy(): boolean {
    return this.isInitialized && this.models.size > 0;
  }

  async shutdown(): Promise<void> {
    logger.info('🛑 Shutting down Intelligence Engine');
    this.models.clear();
    this.isInitialized = false;
  }
}