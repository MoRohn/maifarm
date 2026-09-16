/**
 * Mock FarmersService for Jest tests
 * Avoids import.meta.url ESM compatibility issues
 */

export class FarmersService {
  private farmersCache = new Map();
  private profilesCache = new Map();
  private statsCache = new Map();

  async initialize(): Promise<void> {
    // Mock initialization
  }

  async waitForInitialization(): Promise<void> {
    // Mock wait
  }

  async getAllFarmers(): Promise<any[]> {
    return [];
  }

  async getFarmerById(id: string): Promise<any | null> {
    return null;
  }

  async getFarmersByCategory(category: string): Promise<any[]> {
    return [];
  }

  async getFarmerProfile(id: string): Promise<any | null> {
    return null;
  }

  async updateFarmerProfile(id: string, updates: any): Promise<void> {
    // Mock update
  }

  async getFarmerStats(id: string): Promise<any | null> {
    return null;
  }

  async recordFarmerUsage(id: string, sessionData: any): Promise<void> {
    // Mock record
  }

  getCategories(): string[] {
    return ['development', 'research', 'creative', 'operations'];
  }

  isInitialized(): boolean {
    return true;
  }
}

export const farmersService = new FarmersService();
export default farmersService;
