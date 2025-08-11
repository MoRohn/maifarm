import { barnService } from './barnService';
import { logger } from '../utils/logger';
import { websocketManager } from '../websocket/websocketManager';
import { BarnItem, BarnArtifact } from '../../src/types/barn';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface BarnCatalogItem {
  id: string;
  name: string;
  description: string;
  type: BarnItem['type'];
  category: string;
  tags: string[];
  farmId: string;
  farmName: string;
  createdAt: Date;
  useCount: number;
  size: number;
  artifacts: Array<{
    name: string;
    type: string;
    path: string;
    size: number;
  }>;
  reference: string; // @barn:item-id format
  yaml?: string; // YAML configuration if available
}

export interface BarnCatalog {
  version: string;
  generatedAt: Date;
  totalItems: number;
  itemsByType: Record<string, number>;
  items: BarnCatalogItem[];
  recentlyUsed: BarnCatalogItem[];
  mostPopular: BarnCatalogItem[];
}

export interface BarnReference {
  itemId: string;
  name: string;
  type: 'full' | 'partial' | 'config' | 'artifact';
  targetPath?: string; // Where to place the referenced content
  artifactName?: string; // Specific artifact to reference
}

class BarnCatalogService {
  private catalog: BarnCatalog | null = null;
  private catalogUpdateInterval: ReturnType<typeof setInterval> | null = null;
  private itemUsageMap: Map<string, number> = new Map();

  constructor() {
    this.initializeCatalog();
    this.startCatalogUpdates();
  }

  private async initializeCatalog() {
    try {
      await this.refreshCatalog();
      logger.info('[BarnCatalog] Initialized barn catalog service');
    } catch (error) {
      logger.error('[BarnCatalog] Failed to initialize catalog:', error);
    }
  }

  private startCatalogUpdates() {
    // Refresh catalog every 30 seconds
    this.catalogUpdateInterval = setInterval(async () => {
      await this.refreshCatalog();
    }, 30000);
  }

  async refreshCatalog(): Promise<void> {
    try {
      const items = await barnService.findAll();
      const stats = await barnService.getStats();

      // Transform barn items to catalog items
      const catalogItems: BarnCatalogItem[] = items.map(item => ({
        id: item.id,
        name: item.name,
        description: item.description,
        type: item.type,
        category: item.category,
        tags: item.tags,
        farmId: item.farmId,
        farmName: item.farmName,
        createdAt: item.createdAt,
        useCount: item.useCount,
        size: item.artifacts.reduce((sum, a) => sum + a.size, 0),
        artifacts: item.artifacts.map(a => ({
          name: a.name,
          type: a.type,
          path: a.path,
          size: a.size
        })),
        reference: `@barn:${item.id}`,
        yaml: item.config.yaml
      }));

      // Sort by use count and recency
      const recentlyUsed = [...catalogItems]
        .filter(item => item.useCount > 0)
        .sort((a, b) => b.useCount - a.useCount)
        .slice(0, 10);

      const mostPopular = [...catalogItems]
        .sort((a, b) => b.useCount - a.useCount)
        .slice(0, 5);

      this.catalog = {
        version: '1.0.0',
        generatedAt: new Date(),
        totalItems: catalogItems.length,
        itemsByType: stats.itemsByType,
        items: catalogItems,
        recentlyUsed,
        mostPopular
      };

      // Broadcast catalog update
      websocketManager.broadcast('barn:catalog:updated', {
        totalItems: this.catalog.totalItems,
        timestamp: new Date()
      });

      logger.info(`[BarnCatalog] Refreshed catalog with ${catalogItems.length} items`);
    } catch (error) {
      logger.error('[BarnCatalog] Failed to refresh catalog:', error);
    }
  }

  async getCatalog(): Promise<BarnCatalog> {
    if (!this.catalog) {
      await this.refreshCatalog();
    }
    return this.catalog!;
  }

  async searchCatalog(query: {
    type?: string;
    category?: string;
    tags?: string[];
    farmId?: string;
    searchText?: string;
  }): Promise<BarnCatalogItem[]> {
    const catalog = await this.getCatalog();
    let items = [...catalog.items];

    if (query.type) {
      items = items.filter(item => item.type === query.type);
    }

    if (query.category) {
      items = items.filter(item => item.category === query.category);
    }

    if (query.tags && query.tags.length > 0) {
      items = items.filter(item =>
        query.tags!.some(tag => item.tags.includes(tag))
      );
    }

    if (query.farmId) {
      items = items.filter(item => item.farmId === query.farmId);
    }

    if (query.searchText) {
      const search = query.searchText.toLowerCase();
      items = items.filter(item =>
        item.name.toLowerCase().includes(search) ||
        item.description.toLowerCase().includes(search) ||
        item.tags.some(tag => tag.toLowerCase().includes(search))
      );
    }

    return items;
  }

  async getItemReference(itemId: string): Promise<BarnReference | null> {
    const item = await barnService.findById(itemId);
    if (!item) return null;

    return {
      itemId: item.id,
      name: item.name,
      type: 'full',
      targetPath: `/barn/${item.id}`
    };
  }

  async resolveReference(reference: string): Promise<BarnItem | null> {
    // Parse @barn:item-id format
    const match = reference.match(/^@barn:([a-f0-9-]+)$/i);
    if (!match) return null;

    const itemId = match[1];
    return await barnService.findById(itemId);
  }

  async getItemContent(itemId: string, artifactName?: string): Promise<string | null> {
    const item = await barnService.findById(itemId);
    if (!item) return null;

    // If specific artifact requested
    if (artifactName) {
      const artifact = item.artifacts.find(a => a.name === artifactName);
      if (!artifact) return null;

      // Try to read artifact content
      try {
        const content = await fs.readFile(artifact.path, 'utf-8');
        return content;
      } catch (error) {
        logger.error(`[BarnCatalog] Failed to read artifact ${artifactName}:`, error);
        return artifact.content || null;
      }
    }

    // Return YAML config if available
    if (item.config.yaml) {
      return item.config.yaml;
    }

    // Return a summary of the item
    return JSON.stringify({
      id: item.id,
      name: item.name,
      description: item.description,
      type: item.type,
      artifacts: item.artifacts.map(a => ({ name: a.name, type: a.type }))
    }, null, 2);
  }

  async generateCatalogForFarm(farmId: string, options?: {
    includeYaml?: boolean;
    maxItems?: number;
    types?: string[];
  }): Promise<string> {
    const catalog = await this.getCatalog();
    let items = [...catalog.items];

    // Filter by types if specified
    if (options?.types && options.types.length > 0) {
      items = items.filter(item => options.types!.includes(item.type));
    }

    // Limit items if specified
    if (options?.maxItems) {
      items = items.slice(0, options.maxItems);
    }

    // Generate catalog text for injection into prompts
    let catalogText = '# Available Barn Items\n\n';
    catalogText += 'You have access to the following previously created items in the Barn:\n\n';

    for (const item of items) {
      catalogText += `## ${item.name} (${item.reference})\n`;
      catalogText += `- Type: ${item.type}\n`;
      catalogText += `- Category: ${item.category}\n`;
      catalogText += `- Description: ${item.description}\n`;
      catalogText += `- From Farm: ${item.farmName}\n`;
      catalogText += `- Tags: ${item.tags.join(', ')}\n`;
      catalogText += `- Artifacts: ${item.artifacts.length} files\n`;
      
      if (options?.includeYaml && item.yaml) {
        catalogText += `\n### Configuration:\n\`\`\`yaml\n${item.yaml}\n\`\`\`\n`;
      }
      
      catalogText += '\n';
    }

    catalogText += '\nTo reference any of these items, use the format: @barn:item-id\n';
    catalogText += 'Example: "Use the configuration from @barn:abc-123"\n';

    return catalogText;
  }

  async trackItemUsage(itemId: string, farmId: string): Promise<void> {
    try {
      // Update usage in barn service
      await barnService.useItem(itemId);

      // Track in local map
      const currentCount = this.itemUsageMap.get(itemId) || 0;
      this.itemUsageMap.set(itemId, currentCount + 1);

      // Broadcast usage event
      websocketManager.broadcast('barn:item:referenced', {
        itemId,
        farmId,
        timestamp: new Date()
      });

      logger.info(`[BarnCatalog] Item ${itemId} referenced by farm ${farmId}`);
    } catch (error) {
      logger.error('[BarnCatalog] Failed to track item usage:', error);
    }
  }

  async getItemDependencies(itemId: string): Promise<string[]> {
    const item = await barnService.findById(itemId);
    if (!item) return [];

    return item.config.dependencies || [];
  }

  async getCatalogSummary(): Promise<{
    totalItems: number;
    totalSize: number;
    itemsByType: Record<string, number>;
    mostUsedItems: Array<{ id: string; name: string; useCount: number }>;
    recentItems: Array<{ id: string; name: string; createdAt: Date }>;
  }> {
    const catalog = await this.getCatalog();
    const totalSize = catalog.items.reduce((sum, item) => sum + item.size, 0);

    return {
      totalItems: catalog.totalItems,
      totalSize,
      itemsByType: catalog.itemsByType,
      mostUsedItems: catalog.mostPopular.map(item => ({
        id: item.id,
        name: item.name,
        useCount: item.useCount
      })),
      recentItems: catalog.items
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 5)
        .map(item => ({
          id: item.id,
          name: item.name,
          createdAt: item.createdAt
        }))
    };
  }

  async exportCatalogForMultiClaude(): Promise<{
    catalog: BarnCatalog;
    references: Record<string, string>; // Map of reference to item ID
    yamlConfigs: Record<string, string>; // Map of item ID to YAML
  }> {
    const catalog = await this.getCatalog();
    const references: Record<string, string> = {};
    const yamlConfigs: Record<string, string> = {};

    for (const item of catalog.items) {
      references[item.reference] = item.id;
      if (item.yaml) {
        yamlConfigs[item.id] = item.yaml;
      }
    }

    return {
      catalog,
      references,
      yamlConfigs
    };
  }

  destroy() {
    if (this.catalogUpdateInterval) {
      clearInterval(this.catalogUpdateInterval);
      this.catalogUpdateInterval = null;
    }
  }
}

export const barnCatalogService = new BarnCatalogService();