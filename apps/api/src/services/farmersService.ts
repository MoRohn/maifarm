import fs from 'fs/promises';
import { statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'yaml';
import { v4 as uuidv4 } from 'uuid';
import { FarmerTemplate, FarmerProfile, FarmerStats, FarmerCategory } from '../../src/types/farmers';

const _currentFilePath = fileURLToPath(import.meta.url);
const _currentDirPath = path.dirname(_currentFilePath);

export class FarmersService {
  private farmersCache: Map<string, FarmerTemplate> = new Map();
  private profilesCache: Map<string, FarmerProfile> = new Map();
  private statsCache: Map<string, FarmerStats> = new Map();
  private templatesPath: string;
  private initializationPromise: Promise<void>;
  private initializationAttempts: number = 0;
  private maxInitializationAttempts: number = 3;
  private initializationError: Error | null = null;
  private isInitialized: boolean = false;

  constructor() {
    // Try new monorepo structure first, then fallback to old structure
    const possiblePaths = [
      path.join(process.cwd(), 'apps', 'api', 'src', 'templates', 'farmers'),
      path.join(process.cwd(), 'apps', 'api', 'templates', 'farmers'),
      path.join(process.cwd(), 'apps', 'api', 'dist', 'templates', 'farmers'),
      path.join(process.cwd(), 'src', 'templates', 'farmers'),
      path.join(process.cwd(), 'dist', 'templates', 'farmers'),
      path.join(process.cwd(), 'templates', 'farmers'),
      path.join(process.cwd(), 'server', 'templates', 'farmers'),
      path.join(_currentDirPath, '..', 'templates', 'farmers')
    ];

    const uniquePaths = Array.from(new Set(possiblePaths.map(candidate => path.resolve(candidate))));
    const resolvedPath = this.resolveTemplatesPath(uniquePaths);

    this.templatesPath = resolvedPath;
    console.log('[FarmersService] ============================================');
    console.log('[FarmersService] INITIALIZING FARMERS SERVICE');
    console.log('[FarmersService] Candidate template paths:', uniquePaths);
    console.log('[FarmersService] Selected templates path:', this.templatesPath);
    console.log('[FarmersService] Working directory:', process.cwd());
    console.log('[FarmersService] _currentDirPath:', _currentDirPath);
    console.log('[FarmersService] ============================================');

    this.initializationPromise = this.initializeWithRetry();
  }

  private resolveTemplatesPath(possiblePaths: string[]): string {
    for (const candidate of possiblePaths) {
      try {
        if (statSync(candidate).isDirectory()) {
          return candidate;
        }
      } catch (error) {
        // Directory is not accessible, keep looking
        continue;
      }
    }

    // Fallback to the last option even if it does not exist yet.
    const fallback = possiblePaths[possiblePaths.length - 1];
    console.warn('[FarmersService] ⚠️ No existing templates directory found. Falling back to:', fallback);
    return fallback;
  }

  private async initializeWithRetry(): Promise<void> {
    while (this.initializationAttempts < this.maxInitializationAttempts) {
      this.initializationAttempts++;
      console.log(`[FarmersService] Initialization attempt ${this.initializationAttempts}/${this.maxInitializationAttempts}`);

      try {
        await this.initializeTemplates();
        this.isInitialized = true;
        this.initializationError = null;
        console.log('[FarmersService] ✅ Initialization successful');
        return;
      } catch (error) {
        this.initializationError = error as Error;
        console.error(`[FarmersService] ❌ Initialization attempt ${this.initializationAttempts} failed:`, error);
        console.error('[FarmersService] Error stack:', (error as Error).stack);

        if (this.initializationAttempts < this.maxInitializationAttempts) {
          const delay = Math.min(1000 * Math.pow(2, this.initializationAttempts - 1), 5000);
          console.log(`[FarmersService] Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    console.error('[FarmersService] ❌ FATAL: Failed to initialize after all retry attempts');
    console.error('[FarmersService] Last error:', this.initializationError);
    // Don't throw - allow service to continue with empty cache
  }

  private async ensureInitialized(): Promise<void> {
    await this.initializationPromise;
  }

  private async initializeTemplates() {
    try {
      console.log('[FarmersService] Creating templates directory...');
      // Create templates directory if it doesn't exist
      await fs.mkdir(this.templatesPath, { recursive: true });
      
      console.log('[FarmersService] Loading YAML templates...');
      // Load all YAML templates
      await this.loadTemplates();
      
      console.log('[FarmersService] Generating profiles...');
      // Generate profiles for each template
      this.generateProfiles();
      
      console.log('[FarmersService] Initializing stats...');
      // Initialize stats
      this.initializeStats();
      
      console.log('[FarmersService] Initialization complete. Loaded', this.farmersCache.size, 'farmers');
    } catch (error) {
      console.error('[FarmersService] Failed to initialize farmers templates:', error);
      throw error;
    }
  }

  private async loadTemplates() {
    try {
      const files = await fs.readdir(this.templatesPath);
      const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
      console.log(`[FarmersService] Found ${yamlFiles.length} YAML files:`, yamlFiles);

      for (const file of yamlFiles) {
        try {
          const filePath = path.join(this.templatesPath, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const yamlData = yaml.parse(content);
          
          const id = path.basename(file, path.extname(file));
          const template: FarmerTemplate = {
            id,
            name: yamlData.name || id,
            title: yamlData.title || this.generateTitle(yamlData.name || id),
            description: yamlData.description || '',
            category: this.categorizeTemplate(yamlData),
            agents: yamlData.agents || [],
            initial_prompt: yamlData.initial_prompt || '',
            steps: yamlData.steps || [],
            config: yamlData.config || {},
            metadata: yamlData.metadata || {},
            yaml_path: filePath,
            yaml_content: content
          };

          this.farmersCache.set(id, template);
          console.log(`[FarmersService] Loaded template: ${id} (${template.title})`);
        } catch (fileError) {
          console.error(`[FarmersService] Error loading template ${file}:`, fileError);
        }
      }
      console.log(`[FarmersService] Successfully loaded ${this.farmersCache.size} templates`);
    } catch (error) {
      console.error('[FarmersService] Error loading templates:', error);
      throw error;
    }
  }

  private generateTitle(name: string): string {
    // Convert kebab-case or snake_case to Title Case
    return name
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase());
  }

  private categorizeTemplate(yamlData: any): 'startup' | 'technical' | 'creative' | 'research' | 'operations' {
    const purpose = yamlData.metadata?.purpose;
    const name = yamlData.name?.toLowerCase() || '';
    const description = yamlData.description?.toLowerCase() || '';
    const title = yamlData.title?.toLowerCase() || '';
    
    if (purpose === 'startup' || name.includes('startup') || name.includes('founder') || 
        name.includes('vision') || name.includes('rooster') || 
        description.includes('startup') || title.includes('venture')) {
      return 'startup';
    } else if (purpose === 'development' || name.includes('code') || name.includes('dev') ||
               name.includes('owlbert') || name.includes('sage')) {
      return 'technical';
    } else if (purpose === 'creative' || name.includes('design') || name.includes('creative') ||
               name.includes('sparkle') || name.includes('unicorn')) {
      return 'creative';
    } else if (purpose === 'research' || name.includes('research') || name.includes('analysis') ||
               name.includes('harvest') || name.includes('hound')) {
      return 'research';
    } else if (name.includes('buzz') || name.includes('bee') || name.includes('daisy') || name.includes('donkey')) {
      return 'operations';
    } else {
      return 'operations';
    }
  }

  private generateProfiles() {
    for (const [id, template] of this.farmersCache) {
      const profile = this.generateProfile(id, template);
      this.profilesCache.set(id, profile);
    }
  }

  private generateProfile(farmerId: string, template: FarmerTemplate): FarmerProfile {
    const profiles = {
      'startup-founder': {
        nickname: 'The Visionary Rooster',
        avatar: '🐓',
        backstory: 'Once a simple farm rooster who dreamed of Silicon Valley, now helps founders build unicorn startups from their barns. Known for waking up before dawn to seize opportunities.',
        personality_traits: [
          { trait: 'Ambitious', level: 95, description: 'Never settles for small wins' },
          { trait: 'Strategic', level: 90, description: 'Sees the big picture' },
          { trait: 'Resourceful', level: 85, description: 'Makes the most of limited resources' },
          { trait: 'Persistent', level: 92, description: 'Never gives up on the vision' }
        ],
        skills: [
          { name: 'Business Strategy', level: 95, category: 'Business' },
          { name: 'AI Implementation', level: 90, category: 'Technical' },
          { name: 'Fundraising', level: 85, category: 'Business' },
          { name: 'Product Development', level: 88, category: 'Technical' },
          { name: 'Market Analysis', level: 87, category: 'Research' }
        ],
        achievements: [
          { id: 'first-unicorn', name: 'Unicorn Farmer', description: 'Helped create a $1B+ startup', icon: '🦄', unlocked: true, unlockedAt: new Date('2024-01-15') },
          { id: 'yc-alumni', name: 'YC Graduate', description: 'Successfully completed Y Combinator', icon: '🎓', unlocked: true, unlockedAt: new Date('2024-03-20') },
          { id: 'serial-founder', name: 'Serial Entrepreneur', description: 'Founded 3+ successful companies', icon: '🚀', unlocked: true, unlockedAt: new Date('2024-06-10') }
        ],
        quotes: [
          "The best time to plant a startup was yesterday. The second best time is now.",
          "Every farm can become a unicorn pasture with the right vision.",
          "I don't just count chickens before they hatch - I build the entire poultry empire.",
          "Wake up at 4 AM. The early bird doesn't just get the worm, it disrupts the entire ecosystem."
        ],
        mood: 'energetic',
        specialty_badges: [
          { name: 'AI Pioneer', color: 'purple', icon: '🤖' },
          { name: 'Growth Hacker', color: 'green', icon: '📈' },
          { name: 'Venture Builder', color: 'blue', icon: '🏗️' }
        ],
        fun_facts: [
          "Claims to have pitched to VCs while literally standing on a soapbox in a barn",
          "Has a collection of rejection letters framed as 'motivation wallpaper'",
          "Once pivoted a chicken coop rental app into a $100M agtech platform",
          "Believes every problem can be solved with 'AI leverage and barn wisdom'"
        ]
      }
    };

    // Return specific profile if exists, otherwise generate a default one
    const specificProfile = profiles[farmerId as keyof typeof profiles];
    if (specificProfile) {
      return {
        id: uuidv4(),
        farmerId,
        ...specificProfile
      };
    }

    // Default profile generation for other templates
    return {
      id: uuidv4(),
      farmerId,
      nickname: `The ${template.title} Expert`,
      avatar: this.getDefaultAvatar(template.category),
      backstory: `A seasoned farm professional specializing in ${template.category} operations.`,
      personality_traits: [
        { trait: 'Professional', level: 85, description: 'Gets the job done' },
        { trait: 'Reliable', level: 90, description: 'Consistent performance' },
        { trait: 'Knowledgeable', level: 88, description: 'Deep domain expertise' }
      ],
      skills: (template.agents && template.agents[0] && template.agents[0].capabilities) 
        ? template.agents[0].capabilities.map((cap: any, i: number) => ({
            name: cap,
            level: 75 + Math.floor(Math.random() * 20),
            category: template.category
          }))
        : [],
      achievements: [],
      quotes: [`"Excellence in ${template.category} is my passion."`],
      mood: 'focused',
      specialty_badges: [],
      fun_facts: [`Specializes in ${template.category} with ${template.metadata?.num_agents || template.agents?.length || 1} agents`]
    };
  }

  private getDefaultAvatar(category: string): string {
    const avatars = {
      startup: '🚀',
      technical: '💻',
      creative: '🎨',
      research: '🔬',
      operations: '⚙️'
    };
    return avatars[category as keyof typeof avatars] || '🌾';
  }

  private initializeStats() {
    for (const [id, template] of this.farmersCache) {
      const stats: FarmerStats = {
        farmerId: id,
        totalUses: Math.floor(Math.random() * 100), // Mock data
        successRate: 85 + Math.floor(Math.random() * 15),
        averageDuration: 30 + Math.floor(Math.random() * 60),
        popularityRank: Math.floor(Math.random() * 10) + 1,
        userRatings: {
          average: 4 + Math.random(),
          count: Math.floor(Math.random() * 50) + 10
        },
        topUseCases: this.getTopUseCases(template.category),
        performanceMetrics: {
          speed: 70 + Math.floor(Math.random() * 30),
          quality: 75 + Math.floor(Math.random() * 25),
          creativity: 60 + Math.floor(Math.random() * 40),
          reliability: 80 + Math.floor(Math.random() * 20)
        }
      };
      this.statsCache.set(id, stats);
    }
  }

  private getTopUseCases(category: string): string[] {
    const useCases = {
      startup: ['MVP Development', 'Market Research', 'Pitch Deck Creation'],
      technical: ['Code Review', 'Architecture Design', 'Bug Fixing'],
      creative: ['UI/UX Design', 'Content Creation', 'Branding'],
      research: ['Data Analysis', 'Literature Review', 'Hypothesis Testing'],
      operations: ['Process Optimization', 'Automation', 'Quality Assurance']
    };
    return useCases[category as keyof typeof useCases] || ['General Tasks'];
  }

  async getAllFarmers(): Promise<FarmerTemplate[]> {
    try {
      await this.ensureInitialized();
      const farmers = Array.from(this.farmersCache.values());
      console.log('[FarmersService] getAllFarmers() returning', farmers.length, 'farmers');
      console.log('[FarmersService] Farmer IDs:', farmers.map(f => f.id));
      return farmers;
    } catch (error) {
      console.error('[FarmersService] Error getting all farmers:', error);
      // Return empty array instead of throwing to prevent 500 error
      return [];
    }
  }

  async getFarmerById(id: string): Promise<FarmerTemplate | null> {
    await this.ensureInitialized();
    return this.farmersCache.get(id) || null;
  }

  async getFarmerProfile(farmerId: string): Promise<FarmerProfile | null> {
    await this.ensureInitialized();
    return this.profilesCache.get(farmerId) || null;
  }

  async getFarmerStats(farmerId: string): Promise<FarmerStats | null> {
    await this.ensureInitialized();
    return this.statsCache.get(farmerId) || null;
  }

  async getCategories(): Promise<FarmerCategory[]> {
    try {
      await this.ensureInitialized();
      const categories: Map<string, FarmerCategory> = new Map();
      
      const categoryInfo = {
        startup: { name: 'Startup & Business', icon: '🚀', color: 'purple', description: 'Build and scale ventures' },
        technical: { name: 'Technical Development', icon: '💻', color: 'blue', description: 'Code, architecture, and engineering' },
        creative: { name: 'Creative & Design', icon: '🎨', color: 'pink', description: 'Design, content, and innovation' },
        research: { name: 'Research & Analysis', icon: '🔬', color: 'green', description: 'Data, insights, and discovery' },
        operations: { name: 'Operations & Management', icon: '⚙️', color: 'gray', description: 'Efficiency and optimization' }
      };

      for (const template of this.farmersCache.values()) {
        const cat = template.category;
        if (!categories.has(cat)) {
          const info = categoryInfo[cat as keyof typeof categoryInfo];
          if (info) {
            categories.set(cat, {
              id: cat,
              name: info.name,
              description: info.description,
              icon: info.icon,
              color: info.color,
              farmerCount: 0
            });
          }
        }
        const category = categories.get(cat);
        if (category) {
          category.farmerCount++;
        }
      }

      return Array.from(categories.values());
    } catch (error) {
      console.error('[FarmersService] Error getting categories:', error);
      // Return default categories even if no farmers loaded
      return [
        { id: 'startup', name: 'Startup & Business', icon: '🚀', color: 'purple', description: 'Build and scale ventures', farmerCount: 0 },
        { id: 'technical', name: 'Technical Development', icon: '💻', color: 'blue', description: 'Code, architecture, and engineering', farmerCount: 0 },
        { id: 'creative', name: 'Creative & Design', icon: '🎨', color: 'pink', description: 'Design, content, and innovation', farmerCount: 0 },
        { id: 'research', name: 'Research & Analysis', icon: '🔬', color: 'green', description: 'Data, insights, and discovery', farmerCount: 0 },
        { id: 'operations', name: 'Operations & Management', icon: '⚙️', color: 'gray', description: 'Efficiency and optimization', farmerCount: 0 }
      ];
    }
  }

  async updateFarmerStats(farmerId: string, updates: Partial<FarmerStats>) {
    await this.ensureInitialized();
    const current = this.statsCache.get(farmerId);
    if (current) {
      this.statsCache.set(farmerId, { ...current, ...updates });
    }
  }

  async useFarmer(farmerId: string): Promise<{ template: FarmerTemplate; customizedYaml: string } | null> {
    await this.ensureInitialized();
    const template = this.farmersCache.get(farmerId);
    if (!template) return null;

    // Update usage stats
    const stats = this.statsCache.get(farmerId);
    if (stats) {
      stats.totalUses++;
      stats.lastUsed = new Date();
    }

    return {
      template,
      customizedYaml: template.yaml_content || ''
    };
  }

  /**
   * Get health status of the FarmersService
   * Useful for diagnostics and monitoring
   */
  async getHealthStatus() {
    await this.ensureInitialized();

    const status = {
      isInitialized: this.isInitialized,
      initializationAttempts: this.initializationAttempts,
      maxAttempts: this.maxInitializationAttempts,
      hasError: this.initializationError !== null,
      error: this.initializationError ? {
        message: this.initializationError.message,
        stack: this.initializationError.stack
      } : null,
      loadedFarmers: this.farmersCache.size,
      loadedProfiles: this.profilesCache.size,
      loadedStats: this.statsCache.size,
      templatesPath: this.templatesPath,
      farmerIds: Array.from(this.farmersCache.keys()),
      pathExists: false
    };

    // Check if path exists
    try {
      await fs.access(this.templatesPath);
      status.pathExists = true;
    } catch (error) {
      status.pathExists = false;
    }

    return status;
  }

  /**
   * Force re-initialization of the service
   * Useful for recovering from errors
   */
  async forceReinitialization(): Promise<void> {
    console.log('[FarmersService] 🔄 Force re-initialization requested');
    this.farmersCache.clear();
    this.profilesCache.clear();
    this.statsCache.clear();
    this.initializationAttempts = 0;
    this.isInitialized = false;
    this.initializationError = null;

    this.initializationPromise = this.initializeWithRetry();
    await this.initializationPromise;
  }
}

// Export singleton instance
export const farmersService = new FarmersService();
