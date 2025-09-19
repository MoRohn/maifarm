import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger, LogCategory } from '../utils/logger';
import { pathConfig } from '../config/paths';
import { db } from '../database/connection';

interface BarnItem {
  id: string;
  name: string;
  type: 'file' | 'directory' | 'artifact';
  path: string;
  size?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt?: Date;
}

interface BarnCategory {
  name: string;
  path: string;
  items: BarnItem[];
}

class BarnService {
  private static instance: BarnService;
  private barnItems = new Map<string, BarnItem>();
  private categories = new Map<string, BarnCategory>();

  private constructor() {
    this.initializeCategories();
  }

  static getInstance(): BarnService {
    if (!this.instance) {
      this.instance = new BarnService();
    }
    return this.instance;
  }

  private async initializeCategories() {
    const barnPath = pathConfig.getPath('BARN_STORAGE');

    // Create default categories
    const defaultCategories = ['harvests', 'templates', 'seeds', 'artifacts', 'workspaces'];

    for (const category of defaultCategories) {
      const categoryPath = path.join(barnPath, category);

      try {
        await fs.mkdir(categoryPath, { recursive: true });
        this.categories.set(category, {
          name: category,
          path: categoryPath,
          items: []
        });
      } catch (error) {
        logger.error(LogCategory.BARN, `Failed to create category ${category}:`, error);
      }
    }
  }

  async addItem(item: Omit<BarnItem, 'id' | 'createdAt'>): Promise<BarnItem> {
    const barnItem: BarnItem = {
      ...item,
      id: uuidv4(),
      createdAt: new Date()
    };

    this.barnItems.set(barnItem.id, barnItem);

    logger.info(LogCategory.BARN, `Added item ${barnItem.id} to barn: ${barnItem.name}`);

    // Save to database
    try {
      await db.query(
        `INSERT INTO barn_items (id, name, type, path, size, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         type = EXCLUDED.type,
         path = EXCLUDED.path,
         size = EXCLUDED.size,
         metadata = EXCLUDED.metadata,
         updated_at = NOW()`,
        [
          barnItem.id,
          barnItem.name,
          barnItem.type,
          barnItem.path,
          barnItem.size || 0,
          JSON.stringify(barnItem.metadata || {}),
          barnItem.createdAt
        ]
      );
    } catch (error) {
      logger.error(LogCategory.BARN, `Failed to save barn item to database:`, error);
    }

    return barnItem;
  }

  async getItem(itemId: string): Promise<BarnItem | undefined> {
    // Try memory first
    const cached = this.barnItems.get(itemId);
    if (cached) {
      return cached;
    }

    // Try database
    try {
      const result = await db.query('SELECT * FROM barn_items WHERE id = $1', [itemId]);
      if (result.rows.length > 0) {
        const row = result.rows[0];
        const item: BarnItem = {
          id: row.id,
          name: row.name,
          type: row.type,
          path: row.path,
          size: row.size,
          metadata: row.metadata,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
        this.barnItems.set(item.id, item);
        return item;
      }
    } catch (error) {
      logger.error(LogCategory.BARN, `Failed to get barn item from database:`, error);
    }

    return undefined;
  }

  async getAllItems(): Promise<BarnItem[]> {
    try {
      const result = await db.query('SELECT * FROM barn_items ORDER BY created_at DESC');
      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        type: row.type,
        path: row.path,
        size: row.size,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      logger.error(LogCategory.BARN, `Failed to get all barn items:`, error);
      return Array.from(this.barnItems.values());
    }
  }

  async deleteItem(itemId: string): Promise<boolean> {
    const item = await this.getItem(itemId);
    if (!item) {
      return false;
    }

    // Delete from filesystem
    try {
      const stats = await fs.stat(item.path);
      if (stats.isDirectory()) {
        await fs.rm(item.path, { recursive: true, force: true });
      } else {
        await fs.unlink(item.path);
      }
    } catch (error) {
      logger.error(LogCategory.BARN, `Failed to delete barn item from filesystem:`, error);
    }

    // Delete from database
    try {
      await db.query('DELETE FROM barn_items WHERE id = $1', [itemId]);
    } catch (error) {
      logger.error(LogCategory.BARN, `Failed to delete barn item from database:`, error);
    }

    // Delete from memory
    this.barnItems.delete(itemId);

    logger.info(LogCategory.BARN, `Deleted barn item ${itemId}`);
    return true;
  }

  async syncFromFileSystem(categoryName?: string): Promise<void> {
    const barnPath = pathConfig.getPath('BARN_STORAGE');
    const targetPath = categoryName
      ? path.join(barnPath, categoryName)
      : barnPath;

    try {
      const items = await this.scanDirectory(targetPath);

      for (const item of items) {
        await this.addItem(item);
      }

      logger.info(LogCategory.BARN, `Synced ${items.length} items from filesystem`);
    } catch (error) {
      logger.error(LogCategory.BARN, `Failed to sync from filesystem:`, error);
    }
  }

  private async scanDirectory(dirPath: string, basePath?: string): Promise<Omit<BarnItem, 'id' | 'createdAt'>[]> {
    const items: Omit<BarnItem, 'id' | 'createdAt'>[] = [];
    const base = basePath || dirPath;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(base, fullPath);

        if (entry.isDirectory()) {
          items.push({
            name: entry.name,
            type: 'directory',
            path: fullPath,
            metadata: { relativePath }
          });

          // Recursively scan subdirectories
          const subItems = await this.scanDirectory(fullPath, base);
          items.push(...subItems);
        } else {
          const stats = await fs.stat(fullPath);
          items.push({
            name: entry.name,
            type: 'file',
            path: fullPath,
            size: stats.size,
            metadata: { relativePath }
          });
        }
      }
    } catch (error) {
      logger.error(LogCategory.BARN, `Failed to scan directory ${dirPath}:`, error);
    }

    return items;
  }

  getCategories(): BarnCategory[] {
    return Array.from(this.categories.values());
  }

  async createCategory(name: string): Promise<BarnCategory> {
    const barnPath = pathConfig.getPath('BARN_STORAGE');
    const categoryPath = path.join(barnPath, name);

    try {
      await fs.mkdir(categoryPath, { recursive: true });
      const category: BarnCategory = {
        name,
        path: categoryPath,
        items: []
      };
      this.categories.set(name, category);
      return category;
    } catch (error) {
      logger.error(LogCategory.BARN, `Failed to create category ${name}:`, error);
      throw error;
    }
  }
}

export const barnService = BarnService.getInstance();
export { BarnService, BarnItem, BarnCategory };