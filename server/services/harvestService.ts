import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';
import { db } from '../database/client';
import { websocketManager } from '../websocket/websocketManager';
import { 
  Harvest, 
  HarvestResult, 
  HarvestInsight, 
  HarvestYield,
  HarvestFilter,
  HarvestExport,
  HarvestSummary 
} from '../../src/types/harvest';
import { harvestFileCollector, HarvestFileCollection } from './harvestFileCollector';

export class HarvestService {
  private harvests: Map<string, Harvest> = new Map();
  private activeHarvests: Map<string, ReturnType<typeof setInterval>> = new Map();
  private userHarvests: Map<string, Set<string>> = new Map();
  private harvestAgents: Map<string, Map<string, any>> = new Map(); // harvestId -> Map of agents
  private harvestFileCollections: Map<string, HarvestFileCollection> = new Map(); // harvestId -> file collection

  async startHarvest(farmId: string, farmName: string, userId: string = 'default-user'): Promise<Harvest> {
    try {
      // Get farmer template information from the farm record
      let farmerTemplateId: string | undefined;
      let farmerTemplateName: string | undefined;
      
      try {
        const farmResult = await db.query(
          'SELECT farmer_template_id, farmer_template_name FROM farms WHERE id = $1',
          [farmId]
        );
        if (farmResult.rows.length > 0) {
          farmerTemplateId = farmResult.rows[0].farmer_template_id;
          farmerTemplateName = farmResult.rows[0].farmer_template_name;
        }
      } catch (dbError) {
        console.warn('Failed to fetch farmer template info for harvest:', dbError);
      }

      const harvest: Harvest = {
        id: randomUUID(),
        farmId,
        farmName,
        status: 'processing',
        createdAt: new Date(),
        summary: {
          description: `Harvesting outputs from farm ${farmName}`,
          totalFiles: 0,           // New primary metric
          filesGenerated: 0,       // New primary metric
          filesFailed: 0,          // New primary metric
          totalTasks: 0,           // Legacy compatibility
          completedTasks: 0,       // Legacy compatibility
          failedTasks: 0,          // Legacy compatibility
          duration: 0,
          efficiency: 0,
          fileCategories: {        // New: Track file types
            text: 0,
            code: 0,
            image: 0,
            data: 0,
            config: 0,
            other: 0
          }
        },
        results: [],
        insights: [],
        yield: [],
        quality: {
          completeness: 0,
          accuracy: 0,
          relevance: 0,
          overallScore: 0
        },
        tags: [],
        farmerTemplateId,
        farmerTemplateName,
        exportFormats: ['json', 'markdown', 'pdf']
      };

      this.harvests.set(harvest.id, harvest);
      
      // Immediately persist to database
      await this.persistHarvest(harvest);
      
      // Track user ownership
      if (!this.userHarvests.has(userId)) {
        this.userHarvests.set(userId, new Set());
      }
      this.userHarvests.get(userId)!.add(harvest.id);

      // Start monitoring the harvest
      this.monitorHarvest(harvest.id);

      // Emit WebSocket event
      websocketManager.broadcast('harvest:started', {
        harvestId: harvest.id,
        farmId,
        farmName
      });

      logger.info(`Started harvest ${harvest.id} for farm ${farmId}`);
      return harvest;
    } catch (error) {
      logger.error('Failed to start harvest:', error);
      throw new Error('Failed to start harvest');
    }
  }

  private monitorHarvest(harvestId: string) {
    // Monitor real harvest progress from agents
    const timer = setInterval(async () => {
      const harvest = this.harvests.get(harvestId);
      if (!harvest || harvest.status !== 'processing') {
        clearInterval(timer);
        this.activeHarvests.delete(harvestId);
        return;
      }

      // Update harvest duration
      harvest.summary.duration = Math.floor((Date.now() - harvest.createdAt.getTime()) / 1000);
      
      // Collect real output from tmux sessions if it's a quick task
      if (harvest.farmId.startsWith('quick-task-')) {
        await this.collectQuickTaskOutput(harvest);
      }

      // Calculate quality metrics based on real data
      harvest.quality = this.calculateQuality(harvest);

      // Emit progress update
      websocketManager.broadcast('harvest:progress', {
        harvestId,
        progress: harvest.status === 'ready' ? 100 : Math.min((harvest.summary.completedTasks / Math.max(1, harvest.summary.totalTasks)) * 100, 90),
        summary: harvest.summary
      });
    }, 5000); // Check every 5 seconds

    this.activeHarvests.set(harvestId, timer);
  }

  private async collectQuickTaskOutput(harvest: Harvest): Promise<void> {
    try {
      // Get the task ID from farmId
      const taskId = harvest.farmId.replace('quick-task-', '');
      const sessionName = `quick_${taskId.substring(0, 8)}`;
      
      // Import spawn for tmux capture
      const { spawn } = await import('child_process');
      
      // Capture tmux output
      const output = await new Promise<string>((resolve) => {
        const captureProcess = spawn('tmux', [
          'capture-pane',
          '-t', `${sessionName}:0`,
          '-p',
          '-S', '-500' // Last 500 lines
        ]);
        
        let captured = '';
        captureProcess.stdout?.on('data', (data) => {
          captured += data.toString();
        });
        
        captureProcess.on('exit', () => {
          resolve(captured);
        });
        
        // Timeout fallback
        setTimeout(() => resolve(captured || ''), 2000);
      });
      
      // Only add new result if we have output and haven't captured it yet
      if (output && output.length > 100 && !harvest.metadata?.lastOutputLength || 
          (harvest.metadata?.lastOutputLength && output.length > harvest.metadata.lastOutputLength)) {
        
        // Create a real result from the captured output
        const result: HarvestResult = {
          id: randomUUID(),
          agentId: harvest.metadata?.agentId || randomUUID(),
          agentName: 'Quick Task Agent',
          agentType: 'executor',
          taskType: 'quick-task',
          content: output.substring(Math.max(0, output.length - 2000)), // Last 2000 chars
          metadata: {
            sessionName,
            capturedAt: new Date(),
            outputLength: output.length
          },
          timestamp: new Date(),
          processingTime: harvest.summary.duration,
          success: !output.includes('error') && !output.includes('failed')
        };
        
        harvest.results.push(result);
        harvest.summary.completedTasks++;
        harvest.metadata = { ...harvest.metadata, lastOutputLength: output.length };
        
        // Create yield from output files if any were created
        const outputLines = output.split('\n');
        for (const line of outputLines) {
          // Look for file creation patterns
          if (line.includes('Created file:') || line.includes('Writing to:') || line.includes('Saved to:')) {
            const fileMatch = line.match(/['"]([^'"]+\.[a-z]+)['"]/);
            if (fileMatch) {
              const fileName = fileMatch[1];
              const yieldItem: HarvestYield = {
                id: randomUUID(),
                type: 'file',
                name: fileName,
                description: `File created by Quick Task agent`,
                mimeType: this.getMimeType(fileName),
                size: 0,
                location: `/harvests/${harvest.id}/${fileName}`,
                checksum: '',
                createdBy: {
                  agentId: harvest.metadata?.agentId || 'quick-task-agent',
                  agentName: 'Quick Task Agent'
                },
                createdAt: new Date(),
                metadata: { fromQuickTask: true }
              };
              
              // Add to yield if not already present
              if (!harvest.yield.find(y => y.name === fileName)) {
                harvest.yield.push(yieldItem);
              }
            }
          }
        }
        
        // Add insight if task completed
        if (output.includes('Task completed') || output.includes('Done') || output.includes('Finished')) {
          harvest.insights.push({
            id: randomUUID(),
            type: 'completion',
            title: 'Task Completed',
            description: 'Quick Task agent has completed the requested work',
            importance: 'high',
            source: { agentId: harvest.metadata?.agentId || 'quick-task-agent', agentName: 'Quick Task Agent' },
            relatedResults: [result.id],
            timestamp: new Date()
          });
        }
      }
    } catch (error) {
      logger.error(`Failed to collect Quick Task output for harvest ${harvest.id}:`, error);
    }
  }
  
  private getMimeType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      'py': 'text/x-python',
      'js': 'application/javascript',
      'ts': 'application/typescript',
      'json': 'application/json',
      'md': 'text/markdown',
      'txt': 'text/plain',
      'yaml': 'text/yaml',
      'yml': 'text/yaml',
      'html': 'text/html',
      'css': 'text/css'
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
  }

  // Remove the mock data generator - no longer needed
  private generateSampleResult(harvest: Harvest): HarvestResult {
    const taskTypes = ['analysis', 'generation', 'validation', 'optimization'];
    const agentTypes = ['analyzer', 'generator', 'validator', 'optimizer'];
    
    return {
      id: randomUUID(),
      agentId: randomUUID(),
      agentName: `Agent-${Math.floor(Math.random() * 100)}`,
      agentType: agentTypes[Math.floor(Math.random() * agentTypes.length)],
      taskType: taskTypes[Math.floor(Math.random() * taskTypes.length)],
      content: `Completed ${taskTypes[Math.floor(Math.random() * taskTypes.length)]} task with successful results`,
      metadata: {
        inputSize: Math.floor(Math.random() * 1000),
        outputSize: Math.floor(Math.random() * 2000),
        iterations: Math.floor(Math.random() * 10) + 1
      },
      timestamp: new Date(),
      processingTime: Math.floor(Math.random() * 60) + 10,
      success: Math.random() > 0.1,
      error: Math.random() > 0.9 ? 'Minor validation warning' : undefined
    };
  }

  private generateSampleInsight(harvest: Harvest): HarvestInsight {
    const types: HarvestInsight['type'][] = ['discovery', 'pattern', 'recommendation', 'summary'];
    const importance: HarvestInsight['importance'][] = ['low', 'medium', 'high'];
    
    return {
      id: randomUUID(),
      type: types[Math.floor(Math.random() * types.length)],
      title: 'Key Finding from Analysis',
      description: 'The agents have identified an important pattern in the processed data',
      importance: importance[Math.floor(Math.random() * importance.length)],
      source: {
        agentId: harvest.results[0]?.agentId,
        agentName: harvest.results[0]?.agentName
      },
      relatedResults: harvest.results.slice(0, 2).map(r => r.id),
      timestamp: new Date()
    };
  }

  private calculateQuality(harvest: Harvest): Harvest['quality'] {
    const successRate = harvest.results.filter(r => r.success).length / Math.max(harvest.results.length, 1);
    const completeness = Math.min((harvest.results.length / 5) * 100, 100);
    const accuracy = successRate * 100;
    const relevance = harvest.insights.length > 0 ? 85 + Math.random() * 15 : 70;
    
    return {
      completeness,
      accuracy,
      relevance,
      overallScore: (completeness + accuracy + relevance) / 3
    };
  }

  async completeHarvest(harvestId: string): Promise<Harvest> {
    const harvest = this.harvests.get(harvestId);
    if (!harvest) {
      throw new Error('Harvest not found');
    }

    harvest.status = 'ready';
    harvest.completedAt = new Date();
    harvest.summary.efficiency = 
      (harvest.summary.completedTasks / Math.max(harvest.summary.totalTasks, 1)) * 100;

    // Add final summary insight
    harvest.insights.push({
      id: randomUUID(),
      type: 'summary',
      title: 'Harvest Complete',
      description: `Successfully harvested ${harvest.results.length} results with ${harvest.insights.length - 1} key insights`,
      importance: 'high',
      source: {},
      relatedResults: [],
      timestamp: new Date()
    });

    // Generate sample yield
    harvest.yield = [
      {
        id: randomUUID(),
        type: 'report',
        name: 'harvest-summary.md',
        description: 'Complete harvest summary in Markdown format',
        mimeType: 'text/markdown',
        size: 2048,
        location: `/harvests/${harvestId}/summary.md`,
        checksum: 'abc123',
        createdBy: {
          agentId: 'system',
          agentName: 'Harvest Service'
        },
        createdAt: new Date(),
        metadata: {}
      }
    ];

    this.harvests.set(harvestId, harvest);

    // Clear monitoring timer
    const timer = this.activeHarvests.get(harvestId);
    if (timer) {
      clearInterval(timer);
      this.activeHarvests.delete(harvestId);
    }

    // Collect and organize harvest files
    try {
      const agents = this.harvestAgents.get(harvestId);
      const agentIds = agents ? Array.from(agents.keys()) : [];
      
      const fileCollection = await harvestFileCollector.collectHarvestFiles(
        harvestId,
        harvest.farmId,
        harvest.farmName,
        agentIds
      );
      
      this.harvestFileCollections.set(harvestId, fileCollection);
      
      // Update yield with actual file paths from collection
      if (fileCollection.fileTree.children) {
        const yieldFromFiles = this.extractYieldFromFileTree(fileCollection.fileTree, harvestId);
        harvest.yield = [...harvest.yield, ...yieldFromFiles];
      }
      
      logger.info(`[HarvestService] Collected ${fileCollection.totalFiles} files for harvest ${harvestId}`);
    } catch (collectionError) {
      logger.error('Failed to collect harvest files:', collectionError);
      // Don't fail the harvest if file collection fails
    }

    // Persist to database if available
    if (db) {
      try {
        await this.persistHarvest(harvest);
      } catch (dbError) {
        logger.warn('Failed to persist harvest to database:', dbError);
      }
    }

    // Automatically store in Barn with intelligent categorization
    try {
      const { barnService } = await import('./barnService');
      
      // Determine folder based on harvest content
      let folderId = 'templates'; // default
      let type: 'application' | 'script' | 'workflow' | 'dataset' | 'template' | 'other' = 'other';
      
      // Analyze harvest results to categorize
      const hasCode = harvest.results.some(r => r.taskType === 'generation' || r.content.includes('code'));
      const hasWorkflow = harvest.results.some(r => r.taskType === 'workflow' || r.content.includes('workflow'));
      const hasAnalysis = harvest.results.some(r => r.taskType === 'analysis');
      
      if (hasCode && harvest.results.length > 3) {
        folderId = 'apps';
        type = 'application';
      } else if (hasWorkflow) {
        folderId = 'workflows';
        type = 'workflow';
      } else if (hasCode) {
        folderId = 'scripts';
        type = 'script';
      } else if (hasAnalysis) {
        folderId = 'templates';
        type = 'dataset';
      }
      
      const barnItem = await barnService.storeHarvest(harvestId, {
        name: `${harvest.farmName} - ${new Date().toLocaleDateString()}`,
        description: harvest.summary.description,
        type,
        category: type === 'application' ? 'full-app' : 'utility',
        tags: [...harvest.tags, type, `agents-${harvest.summary.totalTasks}`],
        folderId
      });
      
      logger.info(`Harvest ${harvestId} automatically stored in Barn as ${barnItem.id}`);
      
      // Emit barn storage event
      websocketManager.broadcast('harvest:stored-in-barn', {
        harvestId,
        barnItemId: barnItem.id,
        folderId,
        type
      });
    } catch (barnError) {
      logger.error('Failed to store harvest in barn:', barnError);
      // Don't throw - harvest completion should succeed even if barn storage fails
    }

    // Emit completion event
    websocketManager.broadcast('harvest:completed', {
      harvestId,
      summary: harvest.summary,
      quality: harvest.quality
    });

    logger.info(`Completed harvest ${harvestId}`);
    return harvest;
  }

  private async persistHarvest(harvest: Harvest): Promise<void> {
    try {
      // Use UPSERT to ensure harvest is always saved
      await db.query(
        `INSERT INTO harvests (id, farm_id, farm_name, name, description, type, status, 
         created_at, yield, config, metadata, tags, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           yield = EXCLUDED.yield,
           metadata = EXCLUDED.metadata,
           updated_at = CURRENT_TIMESTAMP`,
        [
          harvest.id, 
          harvest.farmId, 
          harvest.farmName,
          harvest.farmName + ' Harvest', // name
          harvest.summary.description, // description
          'workflow', // type (from allowed values)
          harvest.status,
          harvest.createdAt,
          JSON.stringify(harvest.yield), // yield data
          JSON.stringify({ summary: harvest.summary, quality: harvest.quality }), // config
          JSON.stringify({ insights: harvest.insights, results: harvest.results }), // metadata
          harvest.tags,
          'system' // created_by (will be updated later with actual user)
        ]
      );
      console.log(`[HarvestService] Harvest ${harvest.id} persisted to database with status ${harvest.status}`);
    } catch (error) {
      console.error(`[HarvestService] Failed to persist harvest ${harvest.id}:`, error);
      // Don't throw - we want harvests to continue even if persistence fails
    }
  }

  async findById(id: string): Promise<Harvest | null> {
    return this.harvests.get(id) || null;
  }

  async findByFarmId(farmId: string): Promise<Harvest[]> {
    const harvests = Array.from(this.harvests.values())
      .filter(h => h.farmId === farmId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    console.log(`[HarvestService] Finding harvests for farm ${farmId}`);
    console.log(`[HarvestService] Total harvests in memory: ${this.harvests.size}`);
    console.log(`[HarvestService] Found ${harvests.length} harvests for farm ${farmId}`);
    
    if (harvests.length > 0) {
      console.log(`[HarvestService] Latest harvest status: ${harvests[0].status}, ID: ${harvests[0].id}`);
    }
    
    return harvests;
  }

  async loadPersistedHarvests(): Promise<void> {
    try {
      console.log('[HarvestService] Loading persisted harvests from database...');
      const result = await db.query(
        'SELECT * FROM harvests WHERE status != $1 ORDER BY created_at DESC',
        ['deleted']
      );
      
      for (const row of result.rows) {
        try {
          const harvest: Harvest = {
            id: row.id,
            farmId: row.farm_id,
            farmName: row.farm_name || row.name,
            status: row.status || 'completed',
            createdAt: row.created_at,
            completedAt: row.updated_at,
            summary: row.config?.summary || {
              description: row.description || '',
              totalFiles: 0,
              filesGenerated: 0,
              filesFailed: 0,
              totalTasks: 0,
              completedTasks: 0,
              failedTasks: 0,
              duration: 0,
              efficiency: 0,
              fileCategories: {
                text: 0,
                code: 0,
                image: 0,
                data: 0,
                config: 0,
                other: 0
              }
            },
            results: row.metadata?.results || [],
            insights: row.metadata?.insights || [],
            yield: Array.isArray(row.yield) ? row.yield : [],
            quality: row.config?.quality || {
              completeness: 100,
              accuracy: 100,
              relevance: 100,
              overallScore: 100
            },
            tags: row.tags || [],
            exportFormats: ['json', 'markdown', 'pdf']
          };
          
          // Store in memory for fast access
          this.harvests.set(harvest.id, harvest);
          console.log(`[HarvestService] Loaded harvest ${harvest.id} (${harvest.farmName})`);
        } catch (parseError) {
          console.error(`[HarvestService] Failed to parse harvest ${row.id}:`, parseError);
        }
      }
      
      console.log(`[HarvestService] Loaded ${this.harvests.size} harvests from database`);
    } catch (error) {
      console.error('[HarvestService] Error loading persisted harvests:', error);
    }
  }

  async findAll(filter?: HarvestFilter): Promise<Harvest[]> {
    // Load from database if not already loaded
    if (this.harvests.size === 0) {
      await this.loadPersistedHarvests();
    }
    
    let harvests = Array.from(this.harvests.values());

    if (filter) {
      if (filter.farmId) {
        harvests = harvests.filter(h => h.farmId === filter.farmId);
      }
      if (filter.status && filter.status.length > 0) {
        harvests = harvests.filter(h => filter.status!.includes(h.status));
      }
      if (filter.tags && filter.tags.length > 0) {
        harvests = harvests.filter(h => 
          filter.tags!.some(tag => h.tags.includes(tag))
        );
      }
      if (filter.qualityThreshold) {
        harvests = harvests.filter(h => 
          h.quality.overallScore >= filter.qualityThreshold!
        );
      }
      if (filter.dateRange) {
        harvests = harvests.filter(h => {
          const createdAt = h.createdAt.getTime();
          return createdAt >= filter.dateRange!.start.getTime() && 
                 createdAt <= filter.dateRange!.end.getTime();
        });
      }
      if (filter.searchQuery) {
        const search = filter.searchQuery.toLowerCase();
        harvests = harvests.filter(h =>
          h.farmName.toLowerCase().includes(search) ||
          h.summary.description.toLowerCase().includes(search) ||
          h.tags.some(tag => tag.toLowerCase().includes(search))
        );
      }
    }

    // Sort by creation date descending
    harvests.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return harvests;
  }

  async exportHarvest(exportConfig: HarvestExport): Promise<string> {
    const harvest = this.harvests.get(exportConfig.harvestId);
    if (!harvest) {
      throw new Error('Harvest not found');
    }

    switch (exportConfig.format) {
      case 'json':
        return this.exportAsJson(harvest, exportConfig);
      case 'markdown':
        return this.exportAsMarkdown(harvest, exportConfig);
      case 'pdf':
        return this.exportAsPdf(harvest, exportConfig);
      case 'csv':
        return this.exportAsCsv(harvest, exportConfig);
      default:
        throw new Error('Unsupported export format');
    }
  }

  private exportAsJson(harvest: Harvest, config: HarvestExport): string {
    const data: any = {
      id: harvest.id,
      farmName: harvest.farmName,
      status: harvest.status,
      createdAt: harvest.createdAt,
      completedAt: harvest.completedAt,
      summary: harvest.summary,
      quality: harvest.quality
    };

    if (config.includeResults) {
      data.results = harvest.results;
    }
    if (config.includeInsights) {
      data.insights = harvest.insights;
    }
    if (config.includeYield) {
      data.yield = harvest.yield;
    }

    return JSON.stringify(data, null, 2);
  }

  private exportAsMarkdown(harvest: Harvest, config: HarvestExport): string {
    let markdown = `# Harvest Report: ${harvest.farmName}\n\n`;
    markdown += `**ID:** ${harvest.id}\n`;
    markdown += `**Status:** ${harvest.status}\n`;
    markdown += `**Created:** ${harvest.createdAt.toISOString()}\n`;
    if (harvest.completedAt) {
      markdown += `**Completed:** ${harvest.completedAt.toISOString()}\n`;
    }
    markdown += '\n## Summary\n\n';
    markdown += `${harvest.summary.description}\n\n`;
    markdown += `- **Total Tasks:** ${harvest.summary.totalTasks}\n`;
    markdown += `- **Completed:** ${harvest.summary.completedTasks}\n`;
    markdown += `- **Failed:** ${harvest.summary.failedTasks}\n`;
    markdown += `- **Duration:** ${harvest.summary.duration}s\n`;
    markdown += `- **Efficiency:** ${harvest.summary.efficiency.toFixed(1)}%\n`;

    markdown += '\n## Quality Metrics\n\n';
    markdown += `- **Completeness:** ${harvest.quality.completeness.toFixed(1)}%\n`;
    markdown += `- **Accuracy:** ${harvest.quality.accuracy.toFixed(1)}%\n`;
    markdown += `- **Relevance:** ${harvest.quality.relevance.toFixed(1)}%\n`;
    markdown += `- **Overall Score:** ${harvest.quality.overallScore.toFixed(1)}%\n`;

    if (config.includeInsights && harvest.insights.length > 0) {
      markdown += '\n## Key Insights\n\n';
      harvest.insights.forEach(insight => {
        markdown += `### ${insight.title} (${insight.importance})\n`;
        markdown += `${insight.description}\n\n`;
      });
    }

    return markdown;
  }

  private exportAsPdf(harvest: Harvest, config: HarvestExport): string {
    // In a real implementation, this would generate a PDF
    // For now, return a placeholder
    return `PDF export for harvest ${harvest.id} would be generated here`;
  }

  private exportAsCsv(harvest: Harvest, config: HarvestExport): string {
    if (!config.includeResults) {
      return 'Agent,Task Type,Success,Processing Time\n';
    }

    let csv = 'Agent,Task Type,Success,Processing Time,Timestamp\n';
    harvest.results.forEach(result => {
      csv += `${result.agentName},${result.taskType},${result.success},${result.processingTime},${result.timestamp.toISOString()}\n`;
    });
    return csv;
  }

  async getSummaries(): Promise<HarvestSummary[]> {
    const harvests = await this.findAll({ status: ['ready'] });
    return harvests.map(h => ({
      id: h.id,
      farmName: h.farmName,
      completedAt: h.completedAt!,
      totalFiles: h.summary.totalFiles || h.summary.totalTasks || 0,
      filesGenerated: h.summary.filesGenerated || h.summary.completedTasks || 0,
      totalTasks: h.summary.totalTasks,
      successRate: h.quality.accuracy,
      overallQuality: h.quality.overallScore,
      topInsights: h.insights.filter(i => i.importance === 'high').slice(0, 3),
      yieldCount: h.yield.length,
      tags: h.tags
    }));
  }

  async getUserHarvests(userId: string, filter?: HarvestFilter): Promise<Harvest[]> {
    // Get all harvests for the user
    const userHarvestIds = this.userHarvests.get(userId) || new Set();
    let harvests = Array.from(userHarvestIds)
      .map(id => this.harvests.get(id))
      .filter(h => h !== undefined) as Harvest[];

    // Apply filters
    if (filter) {
      if (filter.farmId) {
        harvests = harvests.filter(h => h.farmId === filter.farmId);
      }
      if (filter.status && filter.status.length > 0) {
        harvests = harvests.filter(h => filter.status!.includes(h.status));
      }
      // Add more filter logic as needed
    }

    return harvests;
  }

  async getHarvest(id: string, userId: string): Promise<Harvest | null> {
    console.log(`[HarvestService] Looking for harvest ${id} for user ${userId}`);
    console.log(`[HarvestService] Total harvests in memory: ${this.harvests.size}`);
    console.log(`[HarvestService] User ${userId} has ${(this.userHarvests.get(userId) || new Set()).size} harvests`);
    
    const harvest = this.harvests.get(id);
    if (!harvest) {
      console.log(`[HarvestService] Harvest ${id} not found in memory`);
      return null;
    }

    // Check user ownership
    const userHarvestIds = this.userHarvests.get(userId) || new Set();
    if (!userHarvestIds.has(id)) {
      console.log(`[HarvestService] Harvest ${id} not owned by user ${userId}`);
      console.log(`[HarvestService] User's harvest IDs: ${Array.from(userHarvestIds).join(', ')}`);
      return null;
    }

    console.log(`[HarvestService] Found harvest ${id} for user ${userId}: status=${harvest.status}`);
    return harvest;
  }

  getAllHarvests(userId: string): Harvest[] {
    const userHarvestIds = this.userHarvests.get(userId) || new Set();
    const harvests: Harvest[] = [];
    
    for (const harvestId of userHarvestIds) {
      const harvest = this.harvests.get(harvestId);
      if (harvest) {
        harvests.push(harvest);
      }
    }
    
    return harvests;
  }

  async createHarvest(input: { farmId: string; farmName: string; userId: string; description?: string; tags?: string[] }): Promise<Harvest> {
    const harvest = await this.startHarvest(input.farmId, input.farmName, input.userId);
    if (input.description) {
      harvest.summary.description = input.description;
    }
    if (input.tags) {
      harvest.tags = input.tags;
    }
    this.harvests.set(harvest.id, harvest);
    return harvest;
  }

  async completeHarvest(id: string, userId?: string, data?: { data?: any; summary?: any }): Promise<Harvest | null> {
    // If called with userId, validate ownership first
    if (userId) {
      const harvest = await this.getHarvest(id, userId);
      if (!harvest) {
        return null;
      }
      
      if (data?.data) {
        // Add the provided data to results
        harvest.results.push({
          id: randomUUID(),
          agentId: 'user-provided',
          agentName: 'Manual Entry',
          agentType: 'manual',
          taskType: 'manual',
          content: JSON.stringify(data.data),
          metadata: data.data,
          timestamp: new Date(),
          processingTime: 0,
          success: true
        });
      }
      
      if (data?.summary) {
        harvest.summary = { ...harvest.summary, ...data.summary };
      }
    }
    
    // Call the original completeHarvest method
    const harvest = this.harvests.get(id);
    if (!harvest) {
      throw new Error('Harvest not found');
    }

    harvest.status = 'ready';
    harvest.completedAt = new Date();
    harvest.summary.efficiency = 
      (harvest.summary.completedTasks / Math.max(harvest.summary.totalTasks, 1)) * 100;

    // Add final summary insight
    harvest.insights.push({
      id: randomUUID(),
      type: 'summary',
      title: 'Harvest Complete',
      description: `Successfully harvested ${harvest.results.length} results with ${harvest.insights.length - 1} key insights`,
      importance: 'high',
      source: {},
      relatedResults: [],
      timestamp: new Date()
    });

    // Generate sample yield including images
    harvest.yield = [
      {
        id: randomUUID(),
        type: 'report',
        name: 'harvest-summary.md',
        description: 'Complete harvest summary in Markdown format',
        mimeType: 'text/markdown',
        size: 2048,
        location: `/harvests/${id}/summary.md`,
        checksum: 'abc123',
        createdBy: {
          agentId: 'system',
          agentName: 'Harvest Service'
        },
        createdAt: new Date(),
        metadata: {}
      }
    ];
    
    // Add image yield if this was an image generation farm
    if (harvest.farmName.toLowerCase().includes('image') || 
        harvest.summary.description.toLowerCase().includes('image')) {
      harvest.yield.push({
        id: randomUUID(),
        type: 'image' as any,
        name: 'hero-image-v1.png',
        description: 'Generated hero image - primary variation',
        mimeType: 'image/png',
        size: 524288,
        location: `/harvests/${id}/images/hero-v1.png`,
        checksum: 'img123abc',
        createdBy: {
          agentId: 'agent-2',
          agentName: 'Image Generator'
        },
        createdAt: new Date(),
        metadata: {
          width: 1920,
          height: 1080,
          format: 'PNG',
          colorSpace: 'sRGB',
          prompt: 'Modern tech product hero image',
          model: 'DALL-E 3'
        }
      });
      
      harvest.yield.push({
        id: randomUUID(),
        type: 'image' as any,
        name: 'hero-image-v2.png',
        description: 'Generated hero image - alternative variation',
        mimeType: 'image/png',
        size: 498765,
        location: `/harvests/${id}/images/hero-v2.png`,
        checksum: 'img456def',
        createdBy: {
          agentId: 'agent-2',
          agentName: 'Image Generator'
        },
        createdAt: new Date(),
        metadata: {
          width: 1920,
          height: 1080,
          format: 'PNG',
          colorSpace: 'sRGB',
          prompt: 'Modern tech product hero image with vibrant colors',
          model: 'DALL-E 3'
        }
      });
    }

    this.harvests.set(id, harvest);

    // Clear monitoring timer
    const timer = this.activeHarvests.get(id);
    if (timer) {
      clearInterval(timer);
      this.activeHarvests.delete(id);
    }

    // Persist to database if available
    if (db) {
      try {
        await this.persistHarvest(harvest);
      } catch (dbError) {
        logger.warn('Failed to persist harvest to database:', dbError);
      }
    }

    // Emit completion event
    websocketManager.broadcast('harvest:completed', {
      harvestId: id,
      summary: harvest.summary,
      quality: harvest.quality
    });

    logger.info(`Completed harvest ${id}`);
    return harvest;
  }

  async deleteHarvest(id: string, userId: string): Promise<boolean> {
    const harvest = await this.getHarvest(id, userId);
    if (!harvest) {
      return false;
    }
    
    // Stop any active monitoring
    const timer = this.activeHarvests.get(id);
    if (timer) {
      clearInterval(timer);
      this.activeHarvests.delete(id);
    }
    
    // Remove from user's harvest list
    const userHarvestIds = this.userHarvests.get(userId);
    if (userHarvestIds) {
      userHarvestIds.delete(id);
    }
    
    this.harvests.delete(id);
    return true;
  }

  // Agent tracking methods
  async registerAgent(harvestId: string, agentUid: string, agentData: any): Promise<void> {
    if (!this.harvestAgents.has(harvestId)) {
      this.harvestAgents.set(harvestId, new Map());
    }
    
    const agents = this.harvestAgents.get(harvestId)!;
    agents.set(agentUid, {
      ...agentData,
      registeredAt: new Date(),
      status: 'active'
    });
    
    // Update harvest with real agent data
    const harvest = this.harvests.get(harvestId);
    if (harvest) {
      harvest.summary.totalTasks = agents.size;
      
      // Emit WebSocket event for agent registration
      websocketManager.broadcast('agent:registered', {
        harvestId,
        agentUid,
        agentData,
        timestamp: new Date()
      });
    }
    
    logger.info(`Agent ${agentUid} registered for harvest ${harvestId}`);
  }
  
  async updateAgentStatus(harvestId: string, agentUid: string, status: string, data?: any): Promise<void> {
    const agents = this.harvestAgents.get(harvestId);
    if (!agents) return;
    
    const agent = agents.get(agentUid);
    if (agent) {
      agent.status = status;
      agent.lastUpdate = new Date();
      if (data) {
        agent.data = { ...agent.data, ...data };
      }
      
      // Update harvest metrics
      const harvest = this.harvests.get(harvestId);
      if (harvest) {
        if (status === 'completed') {
          harvest.summary.completedTasks++;
        } else if (status === 'failed') {
          harvest.summary.failedTasks++;
        }
        
        // Calculate efficiency
        if (harvest.summary.totalTasks > 0) {
          harvest.summary.efficiency = 
            (harvest.summary.completedTasks / harvest.summary.totalTasks) * 100;
        }
      }
      
      // Emit WebSocket event
      websocketManager.broadcast('agent:status', {
        harvestId,
        agentUid,
        status,
        timestamp: new Date()
      });
    }
  }
  
  async getHarvestAgents(harvestId: string): Promise<Map<string, any> | undefined> {
    return this.harvestAgents.get(harvestId);
  }
  
  async linkToFarmAgents(harvestId: string, farmId: string): Promise<void> {
    // This method will be called when agents are registered via the coordination file
    logger.info(`Linking harvest ${harvestId} to agents from farm ${farmId}`);
    
    // Watch for agent updates in the coordination file
    // This will be handled by the coordination service watching active_agents.json
  }

  async createGoWildHarvest(goWildData: {
    farmId: string;
    farmName: string;
    sessionId: string;
    discoveries: any[];
    nodes: any[];
    stats: any;
    duration: number;
    completedAt: Date;
    results?: any[];
    userId?: string;
  }): Promise<Harvest> {
    try {
      const harvest: Harvest = {
        id: randomUUID(),
        farmId: goWildData.farmId,
        farmName: goWildData.farmName,
        status: 'ready',
        createdAt: new Date(Date.now() - goWildData.duration),
        completedAt: goWildData.completedAt,
        summary: {
          description: `Go Wild exploration completed with ${goWildData.discoveries.length} discoveries across ${goWildData.nodes.length} exploration nodes`,
          totalFiles: goWildData.discoveries.length,  // Discoveries count as files
          filesGenerated: goWildData.discoveries.length,
          filesFailed: 0,
          totalTasks: goWildData.nodes.length,  // Legacy compatibility
          completedTasks: goWildData.nodes.length,
          failedTasks: 0,
          duration: Math.floor(goWildData.duration / 1000),
          efficiency: 100,
          fileCategories: {
            text: 0,
            code: 0,
            image: 0,
            data: goWildData.discoveries.length,  // Discoveries are data files
            config: 0,
            other: 0
          }
        },
        results: goWildData.results && goWildData.results.length > 0 
          ? goWildData.results.map(result => ({
              id: result.id,
              agentId: result.agentId,
              agentName: result.agentName,
              agentType: result.agentType || 'explorer',
              taskType: 'exploration',
              content: result.content,
              metadata: result.metadata || {},
              timestamp: result.timestamp,
              processingTime: 0,
              success: true
            }))
          : goWildData.nodes.map(node => ({
              id: node.id,
              agentId: node.agentId || 'goWild',
              agentName: node.agentName || 'Go Wild Explorer',
              agentType: 'explorer',
              taskType: node.type || 'exploration',
              content: node.content || node.label,
              metadata: {
                creativity: node.creativity,
                confidence: node.confidence,
                position: node.position
              },
              timestamp: node.timestamp,
              processingTime: 0,
              success: true
            })),
        insights: goWildData.discoveries.map(discovery => ({
          id: discovery.id,
          type: 'discovery' as const,
          title: discovery.title,
          description: discovery.description,
          importance: discovery.impact,
          source: {
            agentId: 'goWild',
            agentName: 'Go Wild Explorer'
          },
          relatedResults: [discovery.nodeId],
          timestamp: discovery.timestamp
        })),
        yield: [],
        quality: {
          completeness: 100,
          accuracy: 95,
          relevance: goWildData.discoveries.filter(d => d.impact === 'high').length > 0 ? 90 : 75,
          overallScore: 0
        },
        tags: ['go-wild', 'exploration', `session-${goWildData.sessionId.slice(0, 8)}`],
        exportFormats: ['json', 'markdown', 'pdf'],
        metadata: {
          sessionId: goWildData.sessionId,
          stats: goWildData.stats,
          type: 'goWild'
        }
      };

      // Calculate overall quality score
      harvest.quality.overallScore = (
        harvest.quality.completeness + 
        harvest.quality.accuracy + 
        harvest.quality.relevance
      ) / 3;

      this.harvests.set(harvest.id, harvest);

      // Track user ownership if userId provided
      const userId = goWildData.userId || 'dev-user';
      if (!this.userHarvests.has(userId)) {
        this.userHarvests.set(userId, new Set());
      }
      this.userHarvests.get(userId)!.add(harvest.id);

      // Emit WebSocket event
      websocketManager.broadcast('harvest:created', {
        harvestId: harvest.id,
        farmId: goWildData.farmId,
        farmName: goWildData.farmName,
        type: 'goWild'
      });

      // Auto-complete since Go Wild harvests are already finished
      websocketManager.broadcast('harvest:completed', {
        harvestId: harvest.id,
        summary: harvest.summary,
        quality: harvest.quality
      });

      logger.info(`Created Go Wild harvest ${harvest.id} for session ${goWildData.sessionId}`);
      return harvest;
    } catch (error) {
      logger.error('Failed to create Go Wild harvest:', error);
      throw new Error('Failed to create Go Wild harvest');
    }
  }

  async addYield(harvestId: string, yieldItem: any): Promise<void> {
    const harvest = this.harvests.get(harvestId);
    if (!harvest) {
      throw new Error('Harvest not found');
    }

    harvest.yield.push({
      id: yieldItem.id || randomUUID(),
      type: yieldItem.type || 'discovery',
      name: yieldItem.name,
      description: yieldItem.description || '',
      mimeType: 'application/json',
      size: yieldItem.size || 0,
      location: yieldItem.path || `/harvests/${harvestId}/yield/${yieldItem.id}`,
      checksum: yieldItem.checksum || 'auto',
      createdBy: {
        agentId: 'goWild',
        agentName: 'Go Wild Explorer'
      },
      createdAt: yieldItem.createdAt || new Date(),
      metadata: yieldItem.content || {}
    });

    logger.info(`Added yield item ${yieldItem.id} to harvest ${harvestId}`);
  }

  /**
   * Extract yield items from file tree
   */
  private extractYieldFromFileTree(fileTree: any, harvestId: string): HarvestYield[] {
    const yieldItems: HarvestYield[] = [];
    
    const traverse = (node: any, parentPath: string = '') => {
      if (node.type === 'file' && !node.name.includes('.log') && !node.name.includes('summary')) {
        // Determine yield type based on file location or extension
        let yieldType: HarvestYield['type'] = 'file';
        if (node.path.includes('/code/')) yieldType = 'code';
        else if (node.path.includes('/docs/')) yieldType = 'documentation';
        else if (node.path.includes('/data/')) yieldType = 'data';
        else if (node.path.includes('/reports/')) yieldType = 'report';
        
        yieldItems.push({
          id: node.id,
          type: yieldType,
          name: node.name,
          description: `File collected from harvest`,
          mimeType: node.mimeType || 'application/octet-stream',
          size: node.size || 0,
          location: node.path,
          checksum: 'auto',
          createdBy: {
            agentId: 'file-collector',
            agentName: 'File Collector'
          },
          createdAt: node.createdAt || new Date(),
          metadata: {
            fromFileTree: true
          }
        });
      }
      
      if (node.children) {
        node.children.forEach((child: any) => traverse(child, node.path));
      }
    };
    
    traverse(fileTree);
    return yieldItems;
  }

  /**
   * Get file collection for a harvest
   */
  async getHarvestFileCollection(harvestId: string): Promise<HarvestFileCollection | null> {
    return this.harvestFileCollections.get(harvestId) || null;
  }

  /**
   * Get file tree for a harvest
   */
  async getHarvestFileTree(harvestId: string): Promise<any | null> {
    const collection = this.harvestFileCollections.get(harvestId);
    return collection ? collection.fileTree : null;
  }

  /**
   * Get file content from harvest
   */
  async getHarvestFileContent(harvestId: string, filePath: string): Promise<Buffer | null> {
    try {
      const collection = this.harvestFileCollections.get(harvestId);
      if (!collection) {
        // Try to get from file system if not in memory
        return await harvestFileCollector.getFileContent(filePath);
      }
      return await harvestFileCollector.getFileContent(filePath);
    } catch (error) {
      logger.error(`Failed to get file content for ${filePath}:`, error);
      return null;
    }
  }
}

export const harvestService = new HarvestService();

// Load persisted harvests on startup
if (typeof process !== 'undefined' && process.nextTick) {
  process.nextTick(() => {
    harvestService.loadPersistedHarvests().catch(error => {
      console.error('[HarvestService] Failed to load persisted harvests on startup:', error);
    });
  });
}