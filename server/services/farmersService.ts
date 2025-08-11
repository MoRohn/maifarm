import fs from 'fs/promises';
import path from 'path';
import yaml from 'yaml';
import { v4 as uuidv4 } from 'uuid';
import { FarmerTemplate, FarmerProfile, FarmerStats, FarmerCategory } from '../../src/types/farmers';

export class FarmersService {
  private farmersCache: Map<string, FarmerTemplate> = new Map();
  private profilesCache: Map<string, FarmerProfile> = new Map();
  private statsCache: Map<string, FarmerStats> = new Map();
  private templatesPath: string;
  private initializationPromise: Promise<void>;

  constructor() {
    this.templatesPath = path.join(process.cwd(), 'server', 'templates', 'farmers');
    this.initializationPromise = this.initializeTemplates();
  }

  private async ensureInitialized(): Promise<void> {
    await this.initializationPromise;
  }

  private async initializeTemplates() {
    try {
      // Create templates directory if it doesn't exist
      await fs.mkdir(this.templatesPath, { recursive: true });
      
      // Load all YAML templates
      await this.loadTemplates();
      
      // Generate profiles for each template
      this.generateProfiles();
      
      // Initialize stats
      this.initializeStats();
    } catch (error) {
      console.error('Failed to initialize farmers templates:', error);
    }
  }

  private async loadTemplates() {
    try {
      const files = await fs.readdir(this.templatesPath);
      const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

      for (const file of yamlFiles) {
        const filePath = path.join(this.templatesPath, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const yamlData = yaml.parse(content);
        
        const id = path.basename(file, path.extname(file));
        const template: FarmerTemplate = {
          id,
          name: yamlData.name || id,
          title: yamlData.title || this.generateTitle(yamlData.name),
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
      }
    } catch (error) {
      console.error('Error loading templates:', error);
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
    
    if (purpose === 'startup' || name.includes('startup') || name.includes('founder')) {
      return 'startup';
    } else if (purpose === 'development' || name.includes('code') || name.includes('dev')) {
      return 'technical';
    } else if (purpose === 'creative' || name.includes('design') || name.includes('creative')) {
      return 'creative';
    } else if (purpose === 'research' || name.includes('research') || name.includes('analysis')) {
      return 'research';
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
      skills: template.agents[0]?.capabilities?.map((cap, i) => ({
        name: cap,
        level: 75 + Math.floor(Math.random() * 20),
        category: template.category
      })) || [],
      achievements: [],
      quotes: [`"Excellence in ${template.category} is my passion."`],
      mood: 'focused',
      specialty_badges: [],
      fun_facts: [`Specializes in ${template.category} with ${template.metadata.num_agents || 1} agents`]
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
    await this.ensureInitialized();
    return Array.from(this.farmersCache.values());
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
        categories.set(cat, {
          id: cat,
          name: info.name,
          description: info.description,
          icon: info.icon,
          color: info.color,
          farmerCount: 0
        });
      }
      const category = categories.get(cat)!;
      category.farmerCount++;
    }

    return Array.from(categories.values());
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
}

// Export singleton instance
export const farmersService = new FarmersService();