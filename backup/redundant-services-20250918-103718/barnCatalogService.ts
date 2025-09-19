import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger, LogCategory } from '../utils/logger';
import { pathConfig } from '../config/paths';

interface CatalogItem {
  id: string;
  name: string;
  description?: string;
  category: string;
  tags: string[];
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt?: Date;
}

interface CatalogCategory {
  name: string;
  description?: string;
  items: CatalogItem[];
}

class BarnCatalogService {
  private static instance: BarnCatalogService;
  private catalog = new Map<string, CatalogItem>();
  private categories = new Map<string, CatalogCategory>();

  private constructor() {
    this.initializeDefaultCategories();
  }

  static getInstance(): BarnCatalogService {
    if (!this.instance) {
      this.instance = new BarnCatalogService();
    }
    return this.instance;
  }

  private initializeDefaultCategories(): void {
    const defaultCategories = [
      { name: 'templates', description: 'Reusable farm templates' },
      { name: 'seeds', description: 'Pre-configured task seeds' },
      { name: 'tools', description: 'Utility tools and helpers' },
      { name: 'workflows', description: 'Workflow definitions' }
    ];

    for (const cat of defaultCategories) {
      this.categories.set(cat.name, {
        name: cat.name,
        description: cat.description,
        items: []
      });
    }
  }

  async addToCatalog(item: Omit<CatalogItem, 'id' | 'createdAt'>): Promise<CatalogItem> {
    const catalogItem: CatalogItem = {
      ...item,
      id: uuidv4(),
      createdAt: new Date()
    };

    this.catalog.set(catalogItem.id, catalogItem);

    // Add to category
    const category = this.categories.get(item.category);
    if (category) {
      category.items.push(catalogItem);
    }

    logger.info(LogCategory.BARN, `Added item ${catalogItem.id} to catalog: ${catalogItem.name}`);

    return catalogItem;
  }

  async removeFromCatalog(itemId: string): Promise<boolean> {
    const item = this.catalog.get(itemId);
    if (!item) {
      return false;
    }

    // Remove from category
    const category = this.categories.get(item.category);
    if (category) {
      category.items = category.items.filter(i => i.id !== itemId);
    }

    this.catalog.delete(itemId);
    logger.info(LogCategory.BARN, `Removed item ${itemId} from catalog`);

    return true;
  }

  getCatalogItem(itemId: string): CatalogItem | undefined {
    return this.catalog.get(itemId);
  }

  getCatalogByCategory(categoryName: string): CatalogItem[] {
    const category = this.categories.get(categoryName);
    return category?.items || [];
  }

  getAllCatalogItems(): CatalogItem[] {
    return Array.from(this.catalog.values());
  }

  searchCatalog(query: string, tags?: string[]): CatalogItem[] {
    const lowerQuery = query.toLowerCase();

    return Array.from(this.catalog.values()).filter(item => {
      // Match name or description
      const textMatch = item.name.toLowerCase().includes(lowerQuery) ||
                       (item.description?.toLowerCase().includes(lowerQuery) ?? false);

      // Match tags if provided
      const tagMatch = !tags || tags.length === 0 ||
                      tags.some(tag => item.tags.includes(tag));

      return textMatch && tagMatch;
    });
  }

  async loadFromDisk(): Promise<void> {
    const catalogPath = path.join(pathConfig.getBarnPath(), 'catalog.json');

    try {
      const data = await fs.readFile(catalogPath, 'utf-8');
      const catalogData = JSON.parse(data);

      // Clear existing catalog
      this.catalog.clear();

      // Load items
      for (const item of catalogData.items || []) {
        const catalogItem: CatalogItem = {
          ...item,
          createdAt: new Date(item.createdAt),
          updatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined
        };
        this.catalog.set(catalogItem.id, catalogItem);

        // Add to category
        const category = this.categories.get(catalogItem.category);
        if (category) {
          category.items.push(catalogItem);
        }
      }

      logger.info(LogCategory.BARN, `Loaded ${this.catalog.size} items from catalog`);
    } catch (error) {
      logger.warn(LogCategory.BARN, 'No existing catalog found, starting fresh');
    }
  }

  async saveToDisk(): Promise<void> {
    const catalogPath = path.join(pathConfig.getBarnPath(), 'catalog.json');

    const catalogData = {
      version: '1.0',
      updatedAt: new Date(),
      items: Array.from(this.catalog.values())
    };

    try {
      await fs.writeFile(catalogPath, JSON.stringify(catalogData, null, 2));
      logger.info(LogCategory.BARN, `Saved ${this.catalog.size} items to catalog`);
    } catch (error) {
      logger.error(LogCategory.BARN, 'Failed to save catalog to disk:', error);
    }
  }

  getCategories(): CatalogCategory[] {
    return Array.from(this.categories.values());
  }

  async createCategory(name: string, description?: string): Promise<CatalogCategory> {
    if (this.categories.has(name)) {
      throw new Error(`Category ${name} already exists`);
    }

    const category: CatalogCategory = {
      name,
      description,
      items: []
    };

    this.categories.set(name, category);
    return category;
  }
}

export const barnCatalogService = BarnCatalogService.getInstance();
export { BarnCatalogService, CatalogItem, CatalogCategory };