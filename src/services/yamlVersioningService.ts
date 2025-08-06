/**
 * YAML Version Control Service
 * Manages versioning, diffing, and rollback for YAML configurations
 */

import { YamlConfig } from '../types/yamlGenerator';
import { 
  YamlVersion, 
  YamlDiff, 
  DiffChange 
} from '../types/yamlPipeline';
import { openDB } from 'idb';
import * as yaml from 'js-yaml';
import { createHash } from '../utils/crypto';

class YamlVersioningService {
  private dbName = 'maifarm-yaml-versions';
  private storeName = 'versions';
  private db: any = null;

  constructor() {
    this.initializeDB();
  }

  /**
   * Initialize IndexedDB for version storage
   */
  private async initializeDB() {
    if (typeof window === 'undefined') return;
    
    const { openDB } = await import('idb');
    this.db = await openDB(this.dbName, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('versions')) {
          const store = db.createObjectStore('versions', { keyPath: 'id' });
          store.createIndex('yamlId', 'config.name');
          store.createIndex('timestamp', 'timestamp');
          store.createIndex('hash', 'hash');
        }
      }
    });
  }

  /**
   * Create a new version
   */
  async createVersion(
    config: YamlConfig, 
    author: string, 
    message: string,
    parentVersion?: YamlVersion
  ): Promise<YamlVersion> {
    const rawYaml = this.configToYaml(config);
    const hash = await this.generateHash(rawYaml);
    const versionNumber = parentVersion 
      ? this.incrementVersion(parentVersion.version)
      : '1.0.0';

    const version: YamlVersion = {
      id: `${config.name}-${Date.now()}`,
      version: versionNumber,
      config,
      rawYaml,
      timestamp: new Date().toISOString(),
      author,
      message,
      hash,
      parentHash: parentVersion?.hash,
      status: 'draft'
    };

    // Store in IndexedDB
    if (this.db) {
      await this.db.put('versions', version);
    }

    return version;
  }

  /**
   * Get version by ID
   */
  async getVersion(id: string): Promise<YamlVersion | null> {
    if (!this.db) return null;
    return await this.db.get('versions', id);
  }

  /**
   * Get all versions for a YAML config
   */
  async getVersionHistory(yamlName: string): Promise<YamlVersion[]> {
    if (!this.db) return [];
    
    const versions: YamlVersion[] = [];
    const tx = this.db.transaction('versions', 'readonly');
    const index = tx.objectStore('versions').index('yamlId');
    
    let cursor = await index.openCursor(yamlName);
    while (cursor) {
      versions.push(cursor.value);
      cursor = await cursor.continue();
    }

    // Sort by timestamp descending
    return versions.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  /**
   * Compare two versions and generate diff
   */
  async compareVersions(fromId: string, toId: string): Promise<YamlDiff> {
    const fromVersion = await this.getVersion(fromId);
    const toVersion = await this.getVersion(toId);

    if (!fromVersion || !toVersion) {
      throw new Error('Version not found');
    }

    const changes = this.generateDiff(fromVersion.rawYaml, toVersion.rawYaml);
    
    return {
      id: `diff-${fromId}-${toId}`,
      fromVersion: fromVersion.version,
      toVersion: toVersion.version,
      changes,
      summary: this.summarizeDiff(changes),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Rollback to a previous version
   */
  async rollback(versionId: string, author: string, reason: string): Promise<YamlVersion> {
    const targetVersion = await this.getVersion(versionId);
    if (!targetVersion) {
      throw new Error('Version not found');
    }

    const currentVersions = await this.getVersionHistory(targetVersion.config.name);
    const currentVersion = currentVersions[0];

    // Create a new version with the old config
    const rollbackVersion = await this.createVersion(
      targetVersion.config,
      author,
      `Rollback to version ${targetVersion.version}: ${reason}`,
      currentVersion
    );

    rollbackVersion.tags = ['rollback'];
    
    if (this.db) {
      await this.db.put('versions', rollbackVersion);
    }

    return rollbackVersion;
  }

  /**
   * Cherry-pick specific changes from one version to another
   */
  async cherryPick(
    sourceVersionId: string,
    targetVersionId: string,
    changePaths: string[],
    author: string,
    message: string
  ): Promise<YamlVersion> {
    const sourceVersion = await this.getVersion(sourceVersionId);
    const targetVersion = await this.getVersion(targetVersionId);

    if (!sourceVersion || !targetVersion) {
      throw new Error('Version not found');
    }

    // Apply selected changes
    const updatedConfig = this.applySelectedChanges(
      targetVersion.config,
      sourceVersion.config,
      changePaths
    );

    return this.createVersion(updatedConfig, author, message, targetVersion);
  }

  /**
   * Generate diff between two YAML strings
   */
  private generateDiff(fromYaml: string, toYaml: string): DiffChange[] {
    const changes: DiffChange[] = [];
    const fromLines = fromYaml.split('\n');
    const toLines = toYaml.split('\n');

    // Simple line-by-line diff (in production, use a proper diff algorithm)
    const maxLines = Math.max(fromLines.length, toLines.length);

    for (let i = 0; i < maxLines; i++) {
      const fromLine = fromLines[i];
      const toLine = toLines[i];

      if (fromLine === undefined && toLine !== undefined) {
        changes.push({
          type: 'addition',
          path: `line:${i + 1}`,
          lineNumber: i + 1,
          newValue: toLine,
          context: this.getContext(toLines, i)
        });
      } else if (fromLine !== undefined && toLine === undefined) {
        changes.push({
          type: 'deletion',
          path: `line:${i + 1}`,
          lineNumber: i + 1,
          oldValue: fromLine,
          context: this.getContext(fromLines, i)
        });
      } else if (fromLine !== toLine) {
        changes.push({
          type: 'modification',
          path: `line:${i + 1}`,
          lineNumber: i + 1,
          oldValue: fromLine,
          newValue: toLine,
          context: this.getContext(toLines, i)
        });
      }
    }

    // Also generate structural diff
    try {
      const fromObj = yaml.load(fromYaml) as any;
      const toObj = yaml.load(toYaml) as any;
      const structuralChanges = this.generateStructuralDiff(fromObj, toObj);
      changes.push(...structuralChanges);
    } catch (e) {
      console.error('Failed to parse YAML for structural diff:', e);
    }

    return changes;
  }

  /**
   * Generate structural diff between two objects
   */
  private generateStructuralDiff(fromObj: any, toObj: any, path = ''): DiffChange[] {
    const changes: DiffChange[] = [];

    // Check for additions and modifications
    for (const key in toObj) {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (!(key in fromObj)) {
        changes.push({
          type: 'addition',
          path: currentPath,
          newValue: JSON.stringify(toObj[key])
        });
      } else if (typeof toObj[key] === 'object' && typeof fromObj[key] === 'object') {
        changes.push(...this.generateStructuralDiff(fromObj[key], toObj[key], currentPath));
      } else if (toObj[key] !== fromObj[key]) {
        changes.push({
          type: 'modification',
          path: currentPath,
          oldValue: JSON.stringify(fromObj[key]),
          newValue: JSON.stringify(toObj[key])
        });
      }
    }

    // Check for deletions
    for (const key in fromObj) {
      if (!(key in toObj)) {
        const currentPath = path ? `${path}.${key}` : key;
        changes.push({
          type: 'deletion',
          path: currentPath,
          oldValue: JSON.stringify(fromObj[key])
        });
      }
    }

    return changes;
  }

  /**
   * Get context lines around a change
   */
  private getContext(lines: string[], index: number, contextSize = 2): string[] {
    const start = Math.max(0, index - contextSize);
    const end = Math.min(lines.length, index + contextSize + 1);
    return lines.slice(start, end);
  }

  /**
   * Summarize diff changes
   */
  private summarizeDiff(changes: DiffChange[]): { additions: number; deletions: number; modifications: number } {
    return {
      additions: changes.filter(c => c.type === 'addition').length,
      deletions: changes.filter(c => c.type === 'deletion').length,
      modifications: changes.filter(c => c.type === 'modification').length
    };
  }

  /**
   * Apply selected changes from source to target
   */
  private applySelectedChanges(
    targetConfig: YamlConfig,
    sourceConfig: YamlConfig,
    changePaths: string[]
  ): YamlConfig {
    const result = JSON.parse(JSON.stringify(targetConfig));

    for (const path of changePaths) {
      const value = this.getValueByPath(sourceConfig, path);
      this.setValueByPath(result, path, value);
    }

    return result;
  }

  /**
   * Get value from object by path
   */
  private getValueByPath(obj: any, path: string): any {
    const parts = path.split('.');
    let current = obj;
    
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return undefined;
      }
    }
    
    return current;
  }

  /**
   * Set value in object by path
   */
  private setValueByPath(obj: any, path: string, value: any): void {
    const parts = path.split('.');
    let current = obj;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current) || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }
    
    current[parts[parts.length - 1]] = value;
  }

  /**
   * Convert config to YAML string
   */
  private configToYaml(config: YamlConfig): string {
    return yaml.dump(config, {
      indent: 2,
      lineWidth: 120,
      noRefs: true
    });
  }

  /**
   * Generate hash for content
   */
  private async generateHash(content: string): Promise<string> {
    return createHash(content);
  }

  /**
   * Increment version number
   */
  private incrementVersion(version: string): string {
    const parts = version.split('.');
    const patch = parseInt(parts[2] || '0') + 1;
    return `${parts[0]}.${parts[1]}.${patch}`;
  }

  /**
   * Tag a version
   */
  async tagVersion(versionId: string, tags: string[]): Promise<void> {
    const version = await this.getVersion(versionId);
    if (!version) {
      throw new Error('Version not found');
    }

    version.tags = [...(version.tags || []), ...tags];
    
    if (this.db) {
      await this.db.put('versions', version);
    }
  }

  /**
   * Update version status
   */
  async updateVersionStatus(
    versionId: string, 
    status: YamlVersion['status']
  ): Promise<void> {
    const version = await this.getVersion(versionId);
    if (!version) {
      throw new Error('Version not found');
    }

    version.status = status;
    
    if (this.db) {
      await this.db.put('versions', version);
    }
  }

  /**
   * Search versions by criteria
   */
  async searchVersions(criteria: {
    yamlName?: string;
    author?: string;
    status?: YamlVersion['status'];
    tags?: string[];
    startDate?: string;
    endDate?: string;
  }): Promise<YamlVersion[]> {
    if (!this.db) return [];

    const allVersions: YamlVersion[] = [];
    const tx = this.db.transaction('versions', 'readonly');
    let cursor = await tx.objectStore('versions').openCursor();

    while (cursor) {
      const version = cursor.value;
      let matches = true;

      if (criteria.yamlName && version.config.name !== criteria.yamlName) matches = false;
      if (criteria.author && version.author !== criteria.author) matches = false;
      if (criteria.status && version.status !== criteria.status) matches = false;
      if (criteria.tags && !criteria.tags.every(tag => version.tags?.includes(tag))) matches = false;
      if (criteria.startDate && new Date(version.timestamp) < new Date(criteria.startDate)) matches = false;
      if (criteria.endDate && new Date(version.timestamp) > new Date(criteria.endDate)) matches = false;

      if (matches) {
        allVersions.push(version);
      }

      cursor = await cursor.continue();
    }

    return allVersions.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }
}

export default new YamlVersioningService();