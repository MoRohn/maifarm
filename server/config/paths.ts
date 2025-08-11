import * as path from 'path';
import * as os from 'os';

/**
 * Centralized path configuration for MaiFarm file operations
 * Ensures all file operations are isolated within the maibarn directory
 */

export interface PathConfig {
  // Base paths
  MAIFARM_ROOT: string;
  MAIBARN_ROOT: string;
  
  // Isolated workspace paths
  FARM_WORKSPACES: string;
  FARM_WORKSPACES_ACTIVE: string;
  FARM_WORKSPACES_ARCHIVED: string;
  
  // Storage paths
  HARVEST_STORAGE: string;
  HARVEST_STORAGE_ACTIVE: string;
  HARVEST_STORAGE_COMPLETED: string;
  
  // Barn storage
  BARN_STORAGE: string;
  BARN_ITEMS: string;
  BARN_TEMPLATES: string;
  BARN_CATALOG: string;
  
  // Coordination paths
  COORDINATION_DIR: string;
  COORDINATION_FARMS: string;
  COORDINATION_LOCKS: string;
  ACTIVE_AGENTS_FILE: string;
  
  // Temporary and logs
  TEMP_DIR: string;
  LOGS_DIR: string;
  
  // Legacy paths (for migration)
  LEGACY_HARVESTS: string;
  LEGACY_TMP_COORDINATION: string;
  LEGACY_BARN: string;
}

class PathConfiguration {
  private static instance: PathConfiguration;
  private config: PathConfig;
  private initialized: boolean = false;

  private constructor() {
    this.config = this.initializePaths();
  }

  static getInstance(): PathConfiguration {
    if (!PathConfiguration.instance) {
      PathConfiguration.instance = new PathConfiguration();
    }
    return PathConfiguration.instance;
  }

  private initializePaths(): PathConfig {
    // Determine root paths based on environment
    const maifarmRoot = process.env.MAIFARM_ROOT || path.resolve(process.cwd());
    const maibarnRoot = process.env.MAIBARN_ROOT || path.join(maifarmRoot, 'maibarn');
    
    // Build comprehensive path configuration
    const config: PathConfig = {
      // Base paths
      MAIFARM_ROOT: maifarmRoot,
      MAIBARN_ROOT: maibarnRoot,
      
      // Farm workspaces
      FARM_WORKSPACES: path.join(maibarnRoot, 'workspaces'),
      FARM_WORKSPACES_ACTIVE: path.join(maibarnRoot, 'workspaces', 'active'),
      FARM_WORKSPACES_ARCHIVED: path.join(maibarnRoot, 'workspaces', 'archived'),
      
      // Harvest storage
      HARVEST_STORAGE: path.join(maibarnRoot, 'harvests'),
      HARVEST_STORAGE_ACTIVE: path.join(maibarnRoot, 'harvests', 'active'),
      HARVEST_STORAGE_COMPLETED: path.join(maibarnRoot, 'harvests', 'completed'),
      
      // Barn storage
      BARN_STORAGE: path.join(maibarnRoot, 'barn'),
      BARN_ITEMS: path.join(maibarnRoot, 'barn', 'items'),
      BARN_TEMPLATES: path.join(maibarnRoot, 'barn', 'templates'),
      BARN_CATALOG: path.join(maibarnRoot, 'barn', 'catalog.json'),
      
      // Coordination
      COORDINATION_DIR: path.join(maibarnRoot, 'coordination'),
      COORDINATION_FARMS: path.join(maibarnRoot, 'coordination', 'farms'),
      COORDINATION_LOCKS: path.join(maibarnRoot, 'coordination', 'locks'),
      ACTIVE_AGENTS_FILE: path.join(maibarnRoot, 'coordination', 'active_agents.json'),
      
      // Temporary and logs
      TEMP_DIR: path.join(maibarnRoot, 'temp'),
      LOGS_DIR: path.join(maibarnRoot, 'logs'),
      
      // Legacy paths for migration
      LEGACY_HARVESTS: path.join(maifarmRoot, 'harvests'),
      LEGACY_TMP_COORDINATION: '/tmp/claude_coordination',
      LEGACY_BARN: path.join(maifarmRoot, 'barn')
    };
    
    this.initialized = true;
    return config;
  }

  /**
   * Get the path configuration
   */
  getPaths(): PathConfig {
    if (!this.initialized) {
      throw new Error('Path configuration not initialized');
    }
    return { ...this.config };
  }

  /**
   * Get a specific path by key
   */
  getPath(key: keyof PathConfig): string {
    return this.config[key];
  }

  /**
   * Get workspace path for a specific farm
   */
  getFarmWorkspacePath(farmId: string, archived: boolean = false): string {
    const baseDir = archived ? this.config.FARM_WORKSPACES_ARCHIVED : this.config.FARM_WORKSPACES_ACTIVE;
    return path.join(baseDir, farmId);
  }

  /**
   * Get harvest storage path for a specific harvest
   */
  getHarvestPath(harvestId: string, completed: boolean = false): string {
    const baseDir = completed ? this.config.HARVEST_STORAGE_COMPLETED : this.config.HARVEST_STORAGE_ACTIVE;
    return path.join(baseDir, harvestId);
  }

  /**
   * Get barn item path
   */
  getBarnItemPath(itemId: string): string {
    return path.join(this.config.BARN_ITEMS, itemId);
  }

  /**
   * Get farm coordination file path
   */
  getFarmCoordinationPath(farmId: string): string {
    return path.join(this.config.COORDINATION_FARMS, `farm_${farmId}.yaml`);
  }

  /**
   * Get temporary directory for a session
   */
  getTempPath(sessionId: string): string {
    return path.join(this.config.TEMP_DIR, sessionId);
  }

  /**
   * Validate that a path is within the maibarn directory
   */
  isPathSafe(checkPath: string): boolean {
    const resolvedPath = path.resolve(checkPath);
    const normalizedBarnPath = path.resolve(this.config.MAIBARN_ROOT);
    return resolvedPath.startsWith(normalizedBarnPath);
  }

  /**
   * Ensure a path doesn't escape the barn
   */
  validatePath(inputPath: string): string {
    // Prevent path traversal attacks
    if (inputPath.includes('..') || path.isAbsolute(inputPath)) {
      throw new Error(`Invalid path: ${inputPath}. Path traversal or absolute paths not allowed.`);
    }
    
    const fullPath = path.join(this.config.MAIBARN_ROOT, inputPath);
    
    if (!this.isPathSafe(fullPath)) {
      throw new Error(`Path ${inputPath} would escape the barn directory`);
    }
    
    return fullPath;
  }

  /**
   * Get environment-specific configuration
   */
  getEnvironmentConfig(): {
    isDevelopment: boolean;
    isProduction: boolean;
    isDocker: boolean;
    isTesting: boolean;
  } {
    const nodeEnv = process.env.NODE_ENV || 'development';
    
    return {
      isDevelopment: nodeEnv === 'development',
      isProduction: nodeEnv === 'production',
      isDocker: !!process.env.DOCKER_ENV,
      isTesting: nodeEnv === 'test' || !!process.env.JEST_WORKER_ID
    };
  }

  /**
   * Update paths for testing environment
   */
  updateForTesting(): void {
    if (!this.getEnvironmentConfig().isTesting) {
      throw new Error('updateForTesting can only be called in test environment');
    }
    
    // Use temp directory for testing
    const testRoot = path.join(os.tmpdir(), 'maifarm-test', Date.now().toString());
    this.config.MAIBARN_ROOT = testRoot;
    
    // Update all dependent paths
    this.config = this.initializePaths();
  }

  /**
   * Get storage statistics
   */
  getStorageInfo(): {
    paths: PathConfig;
    environment: ReturnType<PathConfiguration['getEnvironmentConfig']>;
    features: {
      workspaceIsolation: boolean;
      harvestStorage: boolean;
      barnCatalog: boolean;
      coordination: boolean;
    };
  } {
    return {
      paths: this.getPaths(),
      environment: this.getEnvironmentConfig(),
      features: {
        workspaceIsolation: true,
        harvestStorage: true,
        barnCatalog: true,
        coordination: true
      }
    };
  }
}

// Export singleton instance
export const pathConfig = PathConfiguration.getInstance();

// Export convenient helper functions
export const getPaths = () => pathConfig.getPaths();
export const getPath = (key: keyof PathConfig) => pathConfig.getPath(key);
export const getFarmWorkspacePath = (farmId: string, archived = false) => 
  pathConfig.getFarmWorkspacePath(farmId, archived);
export const getHarvestPath = (harvestId: string, completed = false) => 
  pathConfig.getHarvestPath(harvestId, completed);
export const getBarnItemPath = (itemId: string) => pathConfig.getBarnItemPath(itemId);
export const isPathSafe = (path: string) => pathConfig.isPathSafe(path);
export const validatePath = (path: string) => pathConfig.validatePath(path);

// Export types
export type { PathConfig };