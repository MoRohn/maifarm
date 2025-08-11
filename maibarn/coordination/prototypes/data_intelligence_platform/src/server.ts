import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cron from 'node-cron';

import { DataCollectionManager } from './services/DataCollectionManager';
import { IntelligenceEngine } from './services/IntelligenceEngine';
import { SubscriptionManager } from './services/SubscriptionManager';
import { ApiRouter } from './routes/api';
import { WebSocketHandler } from './services/WebSocketHandler';
import { DatabaseManager } from './services/DatabaseManager';
import { logger } from './utils/logger';

class AutonomousDataIntelligencePlatform {
  private app: express.Application;
  private server: any;
  private wss: WebSocketServer;
  private dataCollectionManager: DataCollectionManager;
  private intelligenceEngine: IntelligenceEngine;
  private subscriptionManager: SubscriptionManager;
  private wsHandler: WebSocketHandler;
  private dbManager: DatabaseManager;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    
    this.initializeServices();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.scheduleAutonomousOperations();
  }

  private initializeServices() {
    this.dbManager = new DatabaseManager();
    this.dataCollectionManager = new DataCollectionManager();
    this.intelligenceEngine = new IntelligenceEngine();
    this.subscriptionManager = new SubscriptionManager();
    this.wsHandler = new WebSocketHandler(this.wss);
  }

  private setupMiddleware() {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
  }

  private setupRoutes() {
    this.app.use('/api/v1', new ApiRouter(
      this.intelligenceEngine,
      this.subscriptionManager,
      this.dataCollectionManager
    ).router);

    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'operational',
        timestamp: new Date().toISOString(),
        services: {
          dataCollection: this.dataCollectionManager.isHealthy(),
          intelligence: this.intelligenceEngine.isHealthy(),
          subscriptions: this.subscriptionManager.isHealthy(),
          database: this.dbManager.isHealthy()
        }
      });
    });
  }

  private setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      this.wsHandler.handleConnection(ws, req);
    });
  }

  /**
   * Schedule autonomous operations to run without human intervention
   */
  private scheduleAutonomousOperations() {
    // Real-time data collection (every 15 minutes)
    cron.schedule('*/15 * * * *', async () => {
      logger.info('🔄 Starting autonomous data collection cycle');
      try {
        await this.dataCollectionManager.collectRealTimeData();
        logger.info('✅ Real-time data collection completed');
      } catch (error) {
        logger.error('❌ Real-time data collection failed:', error);
      }
    });

    // Hourly trend analysis and intelligence generation
    cron.schedule('0 * * * *', async () => {
      logger.info('🧠 Starting autonomous intelligence generation');
      try {
        const rawData = await this.dataCollectionManager.getLatestData();
        const intelligence = await this.intelligenceEngine.generateIntelligence(rawData);
        
        // Broadcast intelligence to subscribers via WebSocket
        this.wsHandler.broadcastIntelligence(intelligence);
        
        logger.info('✅ Intelligence generation completed');
      } catch (error) {
        logger.error('❌ Intelligence generation failed:', error);
      }
    });

    // Daily comprehensive analysis and reporting
    cron.schedule('0 6 * * *', async () => {
      logger.info('📊 Starting daily comprehensive analysis');
      try {
        await this.intelligenceEngine.generateDailyReports();
        await this.subscriptionManager.deliverDailyReports();
        logger.info('✅ Daily analysis and delivery completed');
      } catch (error) {
        logger.error('❌ Daily analysis failed:', error);
      }
    });

    // Weekly market opportunity analysis
    cron.schedule('0 8 * * 1', async () => {
      logger.info('🎯 Starting weekly opportunity analysis');
      try {
        const opportunities = await this.intelligenceEngine.identifyMarketOpportunities();
        await this.subscriptionManager.deliverOpportunityReports(opportunities);
        logger.info('✅ Weekly opportunity analysis completed');
      } catch (error) {
        logger.error('❌ Weekly opportunity analysis failed:', error);
      }
    });

    // Monthly performance optimization
    cron.schedule('0 2 1 * *', async () => {
      logger.info('⚡ Starting monthly performance optimization');
      try {
        await this.intelligenceEngine.optimizeModels();
        await this.dataCollectionManager.optimizeDataSources();
        await this.subscriptionManager.analyzeCustomerEngagement();
        logger.info('✅ Monthly optimization completed');
      } catch (error) {
        logger.error('❌ Monthly optimization failed:', error);
      }
    });

    // Customer success monitoring (every 4 hours)
    cron.schedule('0 */4 * * *', async () => {
      try {
        await this.subscriptionManager.monitorCustomerHealth();
        await this.subscriptionManager.runRetentionCampaigns();
      } catch (error) {
        logger.error('❌ Customer success monitoring failed:', error);
      }
    });
  }

  /**
   * Start the autonomous platform
   */
  public async start() {
    try {
      // Initialize database connections
      await this.dbManager.connect();
      
      // Initialize AI models
      await this.intelligenceEngine.initialize();
      
      // Start data collection services
      await this.dataCollectionManager.initialize();
      
      // Start subscription services
      await this.subscriptionManager.initialize();

      const port = process.env.PORT || 3000;
      this.server.listen(port, () => {
        logger.info(`🚀 Autonomous Data Intelligence Platform started on port ${port}`);
        logger.info('🤖 All autonomous operations scheduled and running');
        logger.info('📈 Platform operating in full autonomous mode');
      });

      // Graceful shutdown handling
      process.on('SIGTERM', () => this.gracefulShutdown());
      process.on('SIGINT', () => this.gracefulShutdown());

    } catch (error) {
      logger.error('💥 Failed to start platform:', error);
      process.exit(1);
    }
  }

  private async gracefulShutdown() {
    logger.info('🛑 Starting graceful shutdown...');
    
    try {
      // Stop accepting new connections
      this.server.close();
      
      // Close WebSocket connections
      this.wss.close();
      
      // Stop all services
      await this.dataCollectionManager.shutdown();
      await this.intelligenceEngine.shutdown();
      await this.subscriptionManager.shutdown();
      await this.dbManager.disconnect();
      
      logger.info('✅ Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Start the autonomous platform
const platform = new AutonomousDataIntelligencePlatform();
platform.start();

export { AutonomousDataIntelligencePlatform };